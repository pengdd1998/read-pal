"""RAG observability endpoints (P-G: G2 health + replay + full trace)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.ops_auth import require_ops_key
from app.schemas.common import GenericResponse

router = APIRouter(
    prefix='/api/v1/stats/llm/rag',
    tags=['rag-observability'],
    dependencies=[Depends(require_ops_key)],
)


@router.get('/books', response_model=GenericResponse)
async def rag_book_health(
    db: AsyncSession = Depends(get_db),
) -> GenericResponse:
    """G2a: per-book chunk health — zero-chunk books surface first."""
    from app.services.llm.rag_queries import rag_book_health
    data = await rag_book_health(db)
    return GenericResponse(success=True, data=data)


@router.post('/replay', response_model=GenericResponse)
async def rag_replay(
    body: dict,
    db: AsyncSession = Depends(get_db),
) -> GenericResponse:
    """G2b: replay a single hybrid_chunk_search call (no LLM)."""
    from app.services.llm.rag_queries import rag_replay_search

    query = body.get('query', '')
    if not query:
        raise HTTPException(status_code=422, detail={'code': 'QUERY_REQUIRED', 'message': 'query is required'})

    data = await rag_replay_search(
        db,
        book_id=body.get('book_id', ''),
        query=query,
        top_k=min(int(body.get('top_k', 5)), 20),
        max_chapter_index=body.get('max_chapter_index'),
        content_hash=body.get('content_hash'),
    )
    return GenericResponse(success=True, data=data)


@router.post('/trace', response_model=GenericResponse)
async def rag_trace(
    body: dict,
    db: AsyncSession = Depends(get_db),
) -> GenericResponse:
    """Full-chain RAG pipeline trace: SQL + intermediates + context + prompt preview."""
    from app.services.llm.rag_queries import rag_full_trace

    query = body.get('query', '')
    if not query:
        raise HTTPException(status_code=422, detail={'code': 'QUERY_REQUIRED', 'message': 'query is required'})

    data = await rag_full_trace(
        db,
        book_id=body.get('book_id', ''),
        query=query,
        top_k=min(int(body.get('top_k', 5)), 20),
        max_chapter_index=body.get('max_chapter_index'),
        content_hash=body.get('content_hash'),
    )
    return GenericResponse(success=True, data=data)