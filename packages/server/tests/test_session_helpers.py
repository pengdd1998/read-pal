"""Tests for pure helpers in app/services/_session_helpers.py."""

from datetime import datetime, timedelta, timezone

from app.models.reading_session import ReadingSession
from app.schemas.reading_session import HeartbeatRequest, SessionUpdate
from app.services._session_helpers import (
    MAX_SESSION_SECONDS,
    apply_update_fields,
    extract_client_fields,
    finalize_session_duration,
    resolve_heartbeat_pages,
)


# ---------------------------------------------------------------------------
# resolve_heartbeat_pages
# ---------------------------------------------------------------------------


def test_resolve_heartbeat_pages_explicit_zero_preserved():
    """scroll_progress=0.0 (top of page) must NOT be dropped via `or`."""
    body = HeartbeatRequest(pages_read=0, scroll_progress=0.0)
    pages, scroll, _ = resolve_heartbeat_pages(body)
    assert pages == 0
    assert scroll == 0.0


def test_resolve_heartbeat_pages_snake_case_preferred():
    """snake_case wins when both are present."""
    body = HeartbeatRequest(pages_read=10, scroll_progress=0.3)
    pages, scroll, _ = resolve_heartbeat_pages(body)
    assert pages == 10
    assert scroll == 0.3


def test_resolve_heartbeat_pages_camel_case_fallback():
    """camelCase alias is used when snake_case is absent."""
    body = HeartbeatRequest(pagesRead=5, scrollProgress=0.5)
    pages, scroll, _ = resolve_heartbeat_pages(body)
    assert pages == 5
    assert scroll == 0.5


def test_resolve_heartbeat_pages_both_absent_returns_none():
    body = HeartbeatRequest()
    pages, scroll, seg = resolve_heartbeat_pages(body)
    assert pages is None
    assert scroll is None
    assert seg is None


def test_resolve_heartbeat_pages_segment_passthrough():
    body = HeartbeatRequest(current_segment=7)
    _, _, seg = resolve_heartbeat_pages(body)
    assert seg == 7


# ---------------------------------------------------------------------------
# finalize_session_duration
# ---------------------------------------------------------------------------


def test_finalize_duration_uses_existing_value_if_set():
    """A pre-set client-reported duration is not overwritten."""
    started = datetime.now(tz=timezone.utc) - timedelta(seconds=600)
    session = ReadingSession(started_at=started, duration=120)
    finalize_session_duration(session, datetime.now(tz=timezone.utc))
    assert session.duration == 120


def test_finalize_duration_caps_at_max_session_seconds():
    """Wall-clock fallback is capped so idle tabs don't inflate durations."""
    started = datetime.now(tz=timezone.utc) - timedelta(seconds=86400)
    session = ReadingSession(started_at=started, duration=None)
    finalize_session_duration(session, datetime.now(tz=timezone.utc))
    assert session.duration == MAX_SESSION_SECONDS


def test_finalize_duration_skips_without_started_at():
    session = ReadingSession(started_at=None, duration=None)
    finalize_session_duration(session, datetime.now(tz=timezone.utc))
    assert session.duration is None


# ---------------------------------------------------------------------------
# extract_client_fields
# ---------------------------------------------------------------------------


def test_extract_client_fields_none_returns_empty():
    update_data, page, scroll, seg = extract_client_fields(None)
    assert update_data == {}
    assert page is None
    assert scroll is None
    assert seg is None


def test_extract_client_fields_unset_excluded():
    """exclude_unset means absent fields don't pollute update_data."""
    data = SessionUpdate(duration=300, scroll_progress=0.5)
    update_data, page, scroll, seg = extract_client_fields(data)
    # duration kept; client-controlled fields extracted
    assert update_data == {'duration': 300}
    assert page is None
    assert scroll == 0.5
    assert seg is None


def test_extract_client_fields_all_present():
    data = SessionUpdate(
        duration=100,
        current_page=5,
        total_pages=300,
        scroll_progress=0.25,
        current_segment=3,
    )
    update_data, page, scroll, seg = extract_client_fields(data)
    assert update_data == {'duration': 100}
    assert page == 5
    assert scroll == 0.25
    assert seg == 3


# ---------------------------------------------------------------------------
# apply_update_fields
# ---------------------------------------------------------------------------


def test_apply_update_fields_skips_is_active():
    session = ReadingSession(is_active=True)
    apply_update_fields(session, {'duration': 50, 'is_active': False})
    assert session.duration == 50
    assert session.is_active is True  # is_active MUST NOT be mutated


def test_apply_update_fields_empty_is_noop():
    session = ReadingSession(duration=10)
    apply_update_fields(session, {})
    assert session.duration == 10
