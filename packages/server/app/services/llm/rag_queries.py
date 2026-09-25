"""G2: RAG observability queries (P-G, 2026-09-25)."""

from __future__ import annotations

import time
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


async def rag_book_health(db: AsyncSession) -> dict[str, Any]:
    """G2a: per-book chunk health — zero-chunk books surface first."""
    from app.models.book import Book
    from app.models.book_chunk import BookChunk

    books = (await db.execute(
        select(Book).where(Book.file_type == 'epub').order_by(Book.created_at.desc()).limit(200),
    )).scalars().all()

    items = []
    for b in books:
        scope = (
            (BookChunk.book_id == b.id) | (BookChunk.content_hash == b.content_hash)
            if b.content_hash
            else BookChunk.book_id == b.id
        )
        chunks = (await db.execute(
            select(func.count(BookChunk.id)).where(scope),
        )).scalar() or 0
        items.append({
            'book_id': str(b.id),
            'title': b.title,
            'content_hash': b.content_hash,
            'chunks': chunks,
            'status': 'zero_chunks' if chunks == 0 else 'ok',
        })

    items.sort(key=lambda x: (x['chunks'] == 0, -x['chunks']))
    zero_count = sum(1 for x in items if x['chunks'] == 0)
    return {'books': items[:100], 'zero_chunk_books': zero_count}


async def rag_replay_search(
    db: AsyncSession,
    *,
    book_id: str,
    query: str,
    top_k: int = 5,
    max_chapter_index: int | None = None,
    content_hash: str | None = None,
) -> dict[str, Any]:
    """G2b: replay one hybrid_chunk_search call (no LLM)."""
    from app.services.rag.search import hybrid_chunk_search

    t0 = time.monotonic()
    results = await hybrid_chunk_search(
        db, UUID(book_id), query,
        top_k=top_k,
        max_chapter_index=int(max_chapter_index) if max_chapter_index is not None else None,
        content_hash=content_hash,
    )
    latency_ms = int((time.monotonic() - t0) * 1000)
    return {
        'results': results,
        'latency_ms': latency_ms,
        'result_count': len(results),
    }


def _preview(text: str | None, n: int = 100) -> str:
    return (text or '')[:n].replace('\n', ' ')


async def rag_full_trace(  # noqa: PLR0915 — 7-stage trace pipeline is inherently long
    db: AsyncSession,
    *,
    book_id: str,
    query: str,
    top_k: int = 5,
    max_chapter_index: int | None = None,
    content_hash: str | None = None,
) -> dict[str, Any]:
    """Full-chain RAG pipeline trace — every stage's inputs and outputs.

    Runs the same pipeline as hybrid_chunk_search but captures
    intermediates at each step: query embedding, semantic SQL + rows,
    keyword SQL + rows + tokens, RRF fusion, chapter coverage, context
    assembly, and LLM prompt preview. Zero LLM calls — the prompt
    preview shows what WOULD be sent, not an actual model response.
    """
    from sqlalchemy import or_, text as sa_text

    from app.models.book_chunk import BookChunk
    from app.services.rag._constants import _tokenize_with_bigrams
    from app.services.rag.embedding import get_query_embedding
    from app.services.rag.rank import chapter_coverage_merge
    from app.services.rag.search import _escape_like
    from app.services.rag.search import (
        _build_embedding_literal,
        _build_search_params,
        _build_search_sql,
        _keyword_score,
        _rows_to_results,
        reciprocal_rank_fuse,
    )

    total_start = time.monotonic()
    stages: list[dict[str, Any]] = []
    uid = UUID(book_id)

    # --- Stage 1: query embedding ---
    t0 = time.monotonic()
    query_emb = await get_query_embedding(query)
    emb_ms = int((time.monotonic() - t0) * 1000)
    stages.append({
        'stage': 'query_embedding',
        'latency_ms': emb_ms,
        'dims': len(query_emb) if query_emb else 0,
        'succeeded': query_emb is not None,
        'vector_preview': f'[{", ".join(f"{x:.4f}" for x in query_emb[:8])}, ...]'
        if query_emb else None,
    })

    # --- Stage 2: semantic search ---
    t0 = time.monotonic()
    semantic: list[dict[str, Any]] = []
    if query_emb:
        emb_literal = _build_embedding_literal(query_emb)
        params, chapter_clause = _build_search_params(
            emb_literal, uid, 50, max_chapter_index, content_hash,
        )
        semantic_sql = _build_search_sql(chapter_clause)
        # Strip the giant embedding literal from display params
        display_params = {
            k: (f'<vector:{len(v)}d>' if k == 'query_emb' else str(v)[:50])
            for k, v in params.items()
        }
        try:
            db.bind.dialect.name  # noqa: B018 — check bind exists
            if db.bind and db.bind.dialect.name == 'postgresql':
                await db.execute(sa_text("SET LOCAL hnsw.iterative_scan = 'strict_order'"))
            result = await db.execute(sa_text(semantic_sql), params)
            rows = result.fetchall()
            semantic = _rows_to_results(rows)
        except Exception:  # noqa: BLE001 — trace must never crash
            semantic = []
        sem_ms = int((time.monotonic() - t0) * 1000)
        stages.append({
            'stage': 'semantic_search',
            'sql': semantic_sql,
            'sql_params': display_params,
            'row_count': len(semantic),
            'latency_ms': sem_ms,
            'results': [
                {'title': r['title'], 'similarity': round(r['similarity'], 4),
                 'content_preview': _preview(r['content'])}
                for r in semantic[:20]
            ],
        })
    else:
        stages.append({
            'stage': 'semantic_search', 'sql': None, 'sql_params': {},
            'row_count': 0, 'latency_ms': 0, 'results': [],
            'note': 'query embedding failed — semantic path skipped',
        })

    # --- Stage 3: keyword search ---
    t0 = time.monotonic()
    tokens = _tokenize_with_bigrams(query)
    prefilter_tokens = sorted(tokens, key=len, reverse=True)[:64]
    keyword: list[dict[str, Any]] = []
    keyword_sql = ''
    scope = [BookChunk.book_id == uid]
    if content_hash:
        scope.append(BookChunk.content_hash == content_hash)
    conditions = [
        or_(*scope),
        BookChunk.content.isnot(None),
        or_(*(
            BookChunk.content.ilike(f'%{_escape_like(t)}%', escape='\\')
            for t in prefilter_tokens
        )),
    ]
    if max_chapter_index is not None:
        conditions.append(BookChunk.chapter_index <= int(max_chapter_index))
    stmt = (
        select(BookChunk)
        .where(*conditions)
        .order_by(BookChunk.chapter_index)
        .limit(200)
    )
    keyword_sql = str(stmt.compile(compile_kwargs={'literal_binds': False}))
    try:
        chunks = (await db.execute(stmt)).scalars().all()
        scored = []
        for c in chunks:
            if not c.content:
                continue
            score = _keyword_score(tokens, c.content)
            if score > 0:
                scored.append((score, c))
        scored.sort(key=lambda x: x[0], reverse=True)
        keyword = [
            {'title': f'Chapter {c.chapter_index + 1}', 'content': c.content,
             'similarity': 0.0, 'score': s}
            for s, c in scored[:50]
        ]
    except Exception:  # noqa: BLE001
        keyword = []
    kw_ms = int((time.monotonic() - t0) * 1000)
    stages.append({
        'stage': 'keyword_search',
        'sql': keyword_sql,
        'tokens': sorted(tokens)[:20],
        'row_count': len(keyword),
        'latency_ms': kw_ms,
        'results': [
            {'title': r['title'], 'score': r.get('score', 0),
             'content_preview': _preview(r['content'])}
            for r in keyword[:20]
        ],
    })

    # --- Stage 4: RRF fusion ---
    t0 = time.monotonic()
    fused = reciprocal_rank_fuse([semantic, keyword], top_k=50)
    rrf_ms = int((time.monotonic() - t0) * 1000)
    stages.append({
        'stage': 'rrf_fusion',
        'semantic_count': len(semantic),
        'keyword_count': len(keyword),
        'fused_count': len(fused),
        'latency_ms': rrf_ms,
        'results': [
            {'title': r['title'],
             'content_preview': _preview(r['content'], 60)}
            for r in fused[:10]
        ],
    })

    # --- Stage 5: chapter coverage merge ---
    t0 = time.monotonic()
    merged = chapter_coverage_merge(fused, top_k=top_k)
    final = merged[:top_k]
    merge_ms = int((time.monotonic() - t0) * 1000)
    import re as _re
    head_chapters = list(dict.fromkeys(
        _re.match(r'\[([^\]]*)\]', c.get('content') or '')
        and _re.match(r'\[([^\]]*)\]', c.get('content') or '').group(1)
        or '?'
        for c in final[:top_k - 1]
    ))
    stages.append({
        'stage': 'chapter_coverage',
        'head_chapters': head_chapters,
        'final_count': len(final),
        'latency_ms': merge_ms,
        'results': [
            {'title': r['title'], 'similarity': round(r.get('similarity', 0), 4),
             'content_preview': _preview(r['content'])}
            for r in final
        ],
    })

    # --- Stage 6: context assembly ---
    t0 = time.monotonic()
    from app.services.rag.context import _format_chunks_as_context
    assembled = _format_chunks_as_context(final, max_chars=5000)
    asm_ms = int((time.monotonic() - t0) * 1000)
    stages.append({
        'stage': 'context_assembly',
        'format': assembled[:2000] if assembled else '',
        'chars': len(assembled),
        'chunk_count': len(final),
        'latency_ms': asm_ms,
    })

    # --- Stage 7: LLM prompt preview ---
    t0 = time.monotonic()
    prompt_head = ''
    rag_section = ''
    try:
        from app.utils.i18n import t as i18n_t
        from app.utils.output_filter import sanitize_user_input
        safe_rag = sanitize_user_input(assembled, max_length=3000, context='rag_context')
        rag_section = i18n_t('companion.rag_context', 'en', context=safe_rag)
        # Reconstruct a minimal system prompt head (the actual template
        # requires a Book object; this preview shows the RAG wrapper)
        prompt_head = (
            'You are the reader\'s companion...\n\n'
            '[memory/annotations sections]\n\n'
            f'{rag_section[:800]}'
        )
    except Exception:  # noqa: BLE001
        pass
    prompt_ms = int((time.monotonic() - t0) * 1000)
    stages.append({
        'stage': 'llm_prompt_preview',
        'system_prompt_head': prompt_head[:500],
        'rag_context': rag_section[:500],
        'total_prompt_chars': len(prompt_head),
        'latency_ms': prompt_ms,
    })

    total_ms = int((time.monotonic() - total_start) * 1000)
    return {
        'query': query,
        'book_id': book_id,
        'top_k': top_k,
        'stages': stages,
        'total_latency_ms': total_ms,
        'final_results': [
            {'title': r['title'], 'similarity': round(r.get('similarity', 0), 4),
             'content': r['content']}
            for r in final
        ],
    }
