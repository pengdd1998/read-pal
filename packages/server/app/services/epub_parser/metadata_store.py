"""Context-local metadata stores shared by the EPUB parse paths."""

from __future__ import annotations


def store_metadata(metadata: dict, cover_uri: str | None) -> None:
    """Store metadata via context-local variable for orchestrator."""
    import app.services.epub_parser as pkg

    pkg._set_metadata({**metadata, "cover_data_uri": cover_uri})
