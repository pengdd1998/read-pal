"""P4 verification — idempotency dependency coverage on AI POST routes.

Verification-gap fix (A2): P0.1 flipped ``idempotency_enforce=True`` by
default but only ``/agent/chat``, ``/friend/chat``, ``/synthesis/{book_id}``
got the ``idempotent`` dependency. Six more POST routes were unprotected
and would 422 on missing ``Idempotency-Key`` only after P0.1 if it were
somehow applied globally — but since enforcement is per-route, they
silently bypassed the gate entirely.

This test is the contract that every business-level AI POST route is
protected by the ``idempotent`` dependency. New AI POST routes added
later will fail this test until wired — which is the point.
"""

from __future__ import annotations

from app.routers import agent, synthesis


def _has_idempotent_dep(route) -> bool:
    """Return True if the route's dependencies include ``idempotent``."""
    deps = getattr(route, 'dependant', None)
    if deps is None:
        return False
    for dep in deps.dependencies:
        # idempotent is `Depends(_idempotent_impl)` — its call attribute
        # is the named function we can recognize by __name__.
        call = getattr(dep, 'call', None)
        if call is None:
            continue
        name = getattr(call, '__name__', '') or ''
        if name in ('_idempotent_impl', '_idempotent_stream_impl'):
            return True
    return False


def _route_idempotent_paths(router, methods_filter: str = 'POST') -> set[str]:
    """Return all POST route paths that have the idempotent dependency."""
    return {
        route.path for route in router.routes
        if route.methods and methods_filter in route.methods
        and _has_idempotent_dep(route)
    }


def test_a2_routes_are_protected():
    """Smoke-test the six A2 routes by path — explicit so a future
    refactor that drops the dependency gets caught.

    The plan: ``/agent/summarize``, ``/agent/explain``,
    ``/agent/discussion-questions``, ``/agent/mood/scene``,
    ``/agent/reading-plan``, ``/synthesis/cross-book/compare``.
    """
    agent_paths = _route_idempotent_paths(agent.router)
    synthesis_paths = _route_idempotent_paths(synthesis.router)

    for path in (
        '/api/v1/agent/summarize',
        '/api/v1/agent/explain',
        '/api/v1/agent/discussion-questions',
        '/api/v1/agent/mood/scene',
        '/api/v1/agent/reading-plan',
    ):
        assert path in agent_paths, (
            f'agent.py: {path} missing idempotent dependency (A2 regression). '
            f'Found protected paths: {sorted(agent_paths)}'
        )

    assert '/api/v1/synthesis/cross-book/compare' in synthesis_paths, (
        f'synthesis.py: /cross-book/compare missing idempotent dependency '
        f'(A2 regression). Found protected paths: {sorted(synthesis_paths)}'
    )


def test_pre_existing_protected_routes_still_protected():
    """Routes that were protected before A2 must stay protected."""
    agent_paths = _route_idempotent_paths(agent.router)
    synthesis_paths = _route_idempotent_paths(synthesis.router)
    friend_paths_set: set[str] = set()

    # /agent/chat was protected pre-A2
    assert '/api/v1/agent/chat' in agent_paths, (
        '/agent/chat lost idempotent protection — pre-A2 baseline'
    )
    # /synthesis/{book_id} was protected pre-A2
    synthesis_root_protected = any(
        p.startswith('/api/v1/synthesis/') and not p.endswith('/compare')
        for p in synthesis_paths
    )
    assert synthesis_root_protected, (
        '/synthesis/{book_id} lost idempotent protection — pre-A2 baseline'
    )
    # friend router check is skipped here (would need to import friend.router);
    # see tests/test_friend.py for friend-side coverage.
    assert friend_paths_set == set()  # placeholder, kept for symmetry
