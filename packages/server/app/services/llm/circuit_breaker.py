"""Circuit breaker — protects against cascading LLM failures."""

from __future__ import annotations

import asyncio
import enum
import time
from collections import deque
from datetime import datetime, UTC
from typing import Any

import structlog

from app.config import get_settings

logger = structlog.get_logger('read-pal.llm')

# P-A (monitoring upgrade): ring buffer of state transitions — the
# structlog lines are ephemeral; ops needs "when did the breaker open"
# survivably in-process. Bounded to keep the snapshot response small.
_TRANSITION_HISTORY: deque[dict[str, Any]] = deque(maxlen=50)


def recent_transitions() -> list[dict[str, Any]]:
    """Newest-last transition history (process-local)."""
    return list(_TRANSITION_HISTORY)


def _record_transition(name: str, old: CircuitState, new: CircuitState) -> None:
    if old == new:
        return
    _TRANSITION_HISTORY.append({
        'provider': name or '(unnamed)',
        'from': old.value,
        'to': new.value,
        'ts': datetime.now(UTC).isoformat(timespec='seconds'),
    })


class CircuitState(enum.Enum):
    """Circuit breaker states."""
    CLOSED = 'closed'
    OPEN = 'open'
    HALF_OPEN = 'half_open'


class CircuitBreaker:
    """Simple async-safe circuit breaker — no external dependencies."""

    def __init__(self, name: str = '') -> None:
        self.name = name
        self.state = CircuitState.CLOSED
        self._failures = 0
        self._opened_at: float = 0.0
        self._probe_in_progress = False
        self._lock = asyncio.Lock()

    async def allow_request(self) -> bool:
        """Return True if a request is allowed to proceed."""
        async with self._lock:
            if self.state == CircuitState.CLOSED:
                return True
            if self.state == CircuitState.OPEN:
                settings = get_settings()
                elapsed = time.monotonic() - self._opened_at
                if elapsed >= settings.circuit_reset_timeout_seconds:
                    old, self.state = self.state, CircuitState.HALF_OPEN
                    self._probe_in_progress = True
                    _record_transition(self.name, old, self.state)
                    logger.info('circuit_breaker_half_open')
                    return True
                return False
            # HALF_OPEN — allow single probe only
            if self._probe_in_progress:
                return False
            self._probe_in_progress = True
            return True

    async def record_success(self) -> None:
        """Record a successful call and reset failure counter."""
        async with self._lock:
            self._failures = 0
            self._probe_in_progress = False
            if self.state != CircuitState.CLOSED:
                old, self.state = self.state, CircuitState.CLOSED
                _record_transition(self.name, old, self.state)
                logger.info('circuit_breaker_closed')

    async def record_failure(self) -> None:
        """Record a failure; open circuit if threshold is reached."""
        async with self._lock:
            self._failures += 1
            self._probe_in_progress = False
            settings = get_settings()
            if self.state == CircuitState.HALF_OPEN:
                old, self.state = self.state, CircuitState.OPEN
                self._opened_at = time.monotonic()
                _record_transition(self.name, old, self.state)
                logger.warning('circuit_breaker_open_probe_failed')
            elif self._failures >= settings.circuit_failure_threshold:
                old, self.state = self.state, CircuitState.OPEN
                self._opened_at = time.monotonic()
                _record_transition(self.name, old, self.state)
                logger.warning(
                    'circuit_breaker_open',
                    consecutive_failures=self._failures,
                )

    @property
    def is_open(self) -> bool:
        """Whether the circuit is open AND not yet eligible for a recovery probe.

        Returns False once the reset timeout has elapsed, so callers that filter
        on this (provider selection via ``_available_providers``) re-include the
        provider — which lets it be selected and triggers the OPEN→HALF_OPEN
        transition through ``allow_request()``. Without this, an opened provider
        could stay excluded past its reset timeout because selection itself
        never called ``allow_request()`` on it.
        """
        if self.state != CircuitState.OPEN:
            return False
        settings = get_settings()
        return (time.monotonic() - self._opened_at) < settings.circuit_reset_timeout_seconds

    @property
    def is_probe_in_flight(self) -> bool:
        """Whether a HALF_OPEN recovery probe is currently running.

        P1.2: a HALF_OPEN provider with probe in flight is NOT available
        for new requests — ``allow_request()`` will return False. Callers
        that filter providers should exclude these so requests cascade to
        the next provider instead of failing on a probe-locked one.
        """
        return self.state == CircuitState.HALF_OPEN and self._probe_in_progress


# Singleton instance
circuit = CircuitBreaker()
