"""H4 (P-H): client-surface classification and attribution.

detect_client classifies from headers (ops-key / mobile UA / else web);
the middleware binds it into the structlog contextvars so both trace
writers (_log_call and the companion streaming settlement) persist it
without call-site changes; metrics expose by_client on the trace path.
"""
import pytest

from app.middleware.request_log import detect_client


def _scope(headers: list[tuple[bytes, bytes]]) -> dict:
    return {'type': 'http', 'headers': headers}


@pytest.mark.parametrize('headers, expected', [
    ([(b'x-ops-key', b'abc')], 'ops'),
    ([(b'user-agent', b'Mozilla/5.0 (Macintosh) Chrome/120')], 'web'),
    ([(b'user-agent', b'MyApp/1.0 Capacitor/5.7 iOS')], 'mobile'),
    ([(b'user-agent', b'readpal-mobile/1.2 android')], 'mobile'),
    ([(b'user-agent', b'read-pal/2.0 expo')], 'mobile'),
    # ops key wins even when a browser UA is present (workbench in a browser)
    ([(b'user-agent', b'Mozilla/5.0 Chrome/120'), (b'x-ops-key', b'k')], 'ops'),
    ([], 'web'),
    ([(b'authorization', b'Bearer x')], 'web'),
])
def test_detect_client(headers, expected):
    assert detect_client(_scope(headers)) == expected


def test_trace_dict_carries_client_from_contextvars():
    import structlog.contextvars

    from app.services.llm.observability._core import _build_trace_dict, _current_client

    structlog.contextvars.bind_contextvars(client='web')
    try:
        assert _current_client() == 'web'
        # _log_call feeds client=_current_client() into the builder; mirror
        # that here to pin the dict contract.
        d = _build_trace_dict(
            request_id='r1', model='m', label='l', latency_ms=1,
            usage={}, cost=0.0, success=True, fallback_used=False,
            error_message=None, provider='glm',
            client=_current_client(),
        )
        assert d['client'] == 'web'
    finally:
        structlog.contextvars.clear_contextvars()

    # non-HTTP context: nullable
    assert _current_client() is None
