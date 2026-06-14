"""Tests for pure helpers in app/services/_session_helpers.py."""

from datetime import datetime, timedelta, timezone

from app.models.reading_session import ReadingSession
from app.schemas.reading_session import HeartbeatRequest, SessionUpdate
from app.services._session_helpers import (
    MAX_SESSION_SECONDS,
    STALE_IDLE_GRACE_SECONDS,
    apply_update_fields,
    clamp_client_duration,
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


def test_finalize_duration_caps_idle_session_to_grace():
    """A session with no recent heartbeat is capped to the grace window, not wall-clock.

    Pre-fix this test asserted a MAX_SESSION_SECONDS (2h) cap. With the
    idle-tab fix, the cap is tightened to STALE_IDLE_GRACE_SECONDS (5 min)
    when updated_at is absent — an idle session shouldn't accrue even 2h.
    The absolute MAX_SESSION_SECONDS cap is still enforced by
    clamp_client_duration for the client-reported path.
    """
    started = datetime.now(tz=timezone.utc) - timedelta(seconds=86400)
    session = ReadingSession(started_at=started, duration=None)
    finalize_session_duration(session, datetime.now(tz=timezone.utc))
    assert session.duration == STALE_IDLE_GRACE_SECONDS


def test_finalize_duration_skips_without_started_at():
    session = ReadingSession(started_at=None, duration=None)
    finalize_session_duration(session, datetime.now(tz=timezone.utc))
    assert session.duration is None


def test_finalize_duration_caps_idle_tab_to_grace_window():
    """Last heartbeat was hours ago — duration must be capped to grace, not wall-clock.

    Reproduces the end_session idle-tab inflation bug: a session started
    4 hours ago whose last heartbeat was 4 hours ago (idle the whole time)
    would accrue 4h of duration pre-fix. Now it should be capped to
    STALE_IDLE_GRACE_SECONDS (5 min).
    """
    started = datetime.now(tz=timezone.utc) - timedelta(hours=4)
    session = ReadingSession(started_at=started, updated_at=started, duration=None)
    finalize_session_duration(session, datetime.now(tz=timezone.utc))
    assert session.duration == STALE_IDLE_GRACE_SECONDS


def test_finalize_duration_uses_recent_heartbeat_when_present():
    """Stale heartbeat caps duration to grace, below the absolute MAX cap."""
    # Started 30min ago, last heartbeat 20min ago (idle 20min).
    # Without idle-cap: raw = 30min = 1800s (< MAX 7200s).
    # With idle-cap: effective_end = last_hb + 5min = 15min after start = 900s.
    started = datetime.now(tz=timezone.utc) - timedelta(minutes=30)
    last_heartbeat = datetime.now(tz=timezone.utc) - timedelta(minutes=20)
    session = ReadingSession(started_at=started, updated_at=last_heartbeat, duration=None)
    finalize_session_duration(session, datetime.now(tz=timezone.utc))
    # 15 min in seconds
    assert session.duration == 900


# ---------------------------------------------------------------------------
# clamp_client_duration
# ---------------------------------------------------------------------------


def test_clamp_client_duration_caps_idle_tab():
    """A client-reported duration of 4h on an idle tab gets clamped to grace."""
    started = datetime.now(tz=timezone.utc) - timedelta(hours=4)
    session = ReadingSession(started_at=started, updated_at=started)
    clamped = clamp_client_duration(session, 14400, datetime.now(tz=timezone.utc))
    assert clamped == STALE_IDLE_GRACE_SECONDS


def test_clamp_client_duration_respects_max_session_seconds():
    """Even active sessions can't exceed the absolute 2h cap."""
    started = datetime.now(tz=timezone.utc) - timedelta(minutes=10)
    session = ReadingSession(started_at=started, updated_at=datetime.now(tz=timezone.utc))
    # Client claims 3h reading
    clamped = clamp_client_duration(session, 10800, datetime.now(tz=timezone.utc))
    # Wall is 600s, MAX is 7200s — wall wins
    assert clamped == 600


def test_clamp_client_duration_uses_smaller_of_reported_and_wall():
    """Client-reported duration below wall-clock is honored."""
    started = datetime.now(tz=timezone.utc) - timedelta(minutes=10)
    recent = datetime.now(tz=timezone.utc) - timedelta(seconds=30)
    session = ReadingSession(started_at=started, updated_at=recent)
    clamped = clamp_client_duration(session, 120, datetime.now(tz=timezone.utc))
    # Wall is 600+300=900s; reported 120s — reported wins
    assert clamped == 120


def test_clamp_client_duration_without_started_at_only_caps_max():
    session = ReadingSession(started_at=None)
    clamped = clamp_client_duration(session, 99999, datetime.now(tz=timezone.utc))
    assert clamped == MAX_SESSION_SECONDS


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
