"""Human-readable summary builder for reading sessions."""

from app.models.reading_session import ReadingSession


def _pluralize(count: int, noun: str) -> str:
    """Return noun with 's' suffix if count != 1."""
    return f'{noun}{"s" if count != 1 else ""}'


def _build_summary_parts(session: ReadingSession) -> list[str]:
    """Build list of human-readable activity descriptions."""
    duration_min = (session.duration or 0) // 60
    pages = session.pages_read or 0
    highlights = session.highlights or 0
    notes = session.notes or 0

    parts = []
    if duration_min > 0:
        parts.append(f'Read for {duration_min} {_pluralize(duration_min, "minute")}')
    if pages > 0:
        parts.append(f'covered {pages} {_pluralize(pages, "page")}')
    if highlights > 0:
        parts.append(f'made {highlights} {_pluralize(highlights, "highlight")}')
    if notes > 0:
        parts.append(f'wrote {notes} {_pluralize(notes, "note")}')
    return parts


def build_session_summary(session: ReadingSession) -> str:
    """Build a human-readable summary of a reading session."""
    parts = _build_summary_parts(session)
    if not parts:
        return 'Session recorded successfully.'
    if len(parts) == 1:
        return parts[0] + '.'
    return 'You ' + ', and '.join([
        ', '.join(parts[:-1]),
        parts[-1],
    ]) + '.'
