"""Paragraph-aware text chunking for RAG retrieval."""


def _split_long_paragraph(paragraph: str, chunk_size: int) -> list[str]:
    """Split a single oversized paragraph on sentence boundaries."""
    if len(paragraph) <= chunk_size:
        return [paragraph]
    sub_chunks: list[str] = []
    start = 0
    while start < len(paragraph):
        end = start + chunk_size
        if end >= len(paragraph):
            sub_chunks.append(paragraph[start:])
            break
        candidate = paragraph[start:end]
        split_pos = -1
        for sep in ['. ', '。', '！', '？', '！', '\n', '；', ', ']:
            pos = candidate.rfind(sep)
            if pos > chunk_size * 0.4:
                split_pos = pos + len(sep)
                break
        if split_pos == -1:
            split_pos = chunk_size
        sub_chunks.append(paragraph[start:start + split_pos])
        start += split_pos
    return sub_chunks


def _chunk_text(text: str, chunk_size: int = 2000, overlap: int = 256) -> list[str]:
    """Split text into paragraph-aware chunks for RAG retrieval.

    Strategy:
    1. Split on ``\\n\\n`` paragraph boundaries
    2. Re-split oversized paragraphs on sentence boundaries
    3. Merge short paragraphs into semantic groups up to *chunk_size*
    4. Carry tail overlap between adjacent groups
    """
    if not text:
        return []
    if len(text) <= chunk_size:
        return [text]

    # Step 1: split into paragraphs
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
    if not paragraphs:
        return [text] if text.strip() else []

    # Step 2: re-split oversized paragraphs
    expanded: list[str] = []
    for p in paragraphs:
        if len(p) <= chunk_size:
            expanded.append(p)
        else:
            expanded.extend(_split_long_paragraph(p, chunk_size))

    # Step 3: merge short paragraphs into semantic groups
    groups: list[str] = []
    current_group: list[str] = []
    current_len = 0

    for p in expanded:
        sep_len = 2 if current_group else 0  # '\n\n' join
        added_len = sep_len + len(p)
        if current_len + added_len > chunk_size and current_group:
            groups.append('\n\n'.join(current_group))
            # Overlap: carry tail of completed group
            tail = groups[-1][-overlap:] if overlap > 0 and len(groups[-1]) > overlap else ''
            current_group = [tail] if tail else []
            current_len = len(tail)
        current_group.append(p)
        current_len += (2 if len(current_group) > 1 else 0) + len(p)

    if current_group:
        groups.append('\n\n'.join(current_group))

    return [g.strip() for g in groups if len(g.strip()) > 50]
