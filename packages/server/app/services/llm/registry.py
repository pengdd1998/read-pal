"""Provider registry — multi-provider routing, per-provider circuit breakers."""

from __future__ import annotations

import random
import time
from dataclasses import dataclass, field

import structlog
from langchain_openai import ChatOpenAI

from app.config import ProviderConfig, get_settings
from app.services.llm.circuit_breaker import CircuitBreaker

logger = structlog.get_logger('read-pal.llm')

_RPM_WINDOW_SECONDS = 60.0
# TPM uses the same 60s window as RPM so the two caps reset together —
# otherwise a provider could be "RPM-available" but "TPM-saturated" with
# different reset points, producing confusing routing flapping.
_TPM_WINDOW_SECONDS = 60.0


@dataclass
class ProviderState:
    """Runtime state for a single LLM provider."""

    config: ProviderConfig
    circuit: CircuitBreaker = field(default_factory=CircuitBreaker)
    pool: dict[tuple[str, float], ChatOpenAI] = field(default_factory=dict)
    call_count: int = 0
    window_start: float = 0.0
    avg_latency_ms: float = 0.0
    # B2: TPM counter — distinct from call_count because a 500-token and a
    # 80K-token request both count as 1 against RPM but consume wildly
    # different provider capacity. Tracked always (for dashboards); only
    # enforced when Settings.tpm_enforced=True.
    token_count: int = 0
    token_window_start: float = 0.0

    def _reset_window_if_needed(self) -> None:
        now = time.monotonic()
        if now - self.window_start >= _RPM_WINDOW_SECONDS:
            self.window_start = now
            self.call_count = 0

    def rpm_available(self) -> bool:
        if self.config.max_rpm <= 0:
            return True
        self._reset_window_if_needed()
        return self.call_count < self.config.max_rpm

    def increment_rpm(self) -> None:
        self._reset_window_if_needed()
        self.call_count += 1

    def _reset_token_window_if_needed(self) -> None:
        now = time.monotonic()
        if self.token_window_start == 0.0 or now - self.token_window_start >= _TPM_WINDOW_SECONDS:
            self.token_window_start = now
            self.token_count = 0

    def tpm_available(self, estimated: int = 0) -> bool:
        """Return True if the provider has TPM headroom for ``estimated`` tokens.

        ``estimated`` is the pre-charge estimate (chars/4 + reserved output).
        Callers passing 0 just check whether the current window has any
        headroom at all — used by ``_available_providers`` filtering, where
        "at cap" means "no room even for a tiny request".
        """
        if self.config.max_tpm <= 0:
            return True
        self._reset_token_window_if_needed()
        # Strict less-than: at-cap means no headroom. With <=, a provider
        # sitting at exactly the cap would appear "available" forever and
        # routing would never fall through to the next provider.
        return self.token_count + estimated < self.config.max_tpm

    def increment_tpm(self, tokens: int) -> None:
        """Account ``tokens`` against this provider's TPM window.

        ``tokens`` may be negative to refund a pre-charge (when a call
        failed without consuming vendor tokens) or to true-up the
        difference between pre-charge and actual usage.
        """
        if tokens == 0:
            return
        self._reset_token_window_if_needed()
        # Clamp at 0 — a refund larger than current window count shouldn't
        # make the counter negative (would imply we're crediting tokens
        # that were never counted in this window).
        self.token_count = max(0, self.token_count + tokens)

    def tpm_window_remaining_seconds(self) -> float:
        """Seconds until the TPM window resets — for Retry-After headers."""
        if self.token_window_start == 0.0:
            return _TPM_WINDOW_SECONDS
        elapsed = time.monotonic() - self.token_window_start
        return max(0.0, _TPM_WINDOW_SECONDS - elapsed)

    def update_latency(self, latency_ms: int, success: bool) -> None:
        alpha = 0.3
        if self.avg_latency_ms == 0:
            self.avg_latency_ms = float(latency_ms)
        else:
            target = float(latency_ms) if success else self.avg_latency_ms * 1.5
            self.avg_latency_ms = alpha * target + (1 - alpha) * self.avg_latency_ms


class ProviderRegistry:
    """Routes requests across multiple LLM providers."""

    def __init__(self) -> None:
        self._providers: dict[str, ProviderState] = {}
        self._rr_index: int = 0
        self._initialized: bool = False

    def initialize(self) -> None:
        """Build provider states from current settings."""
        settings = get_settings()
        configs = settings.provider_configs
        new_providers: dict[str, ProviderState] = {}
        for cfg in configs:
            if cfg.name in self._providers:
                # Preserve existing state (circuit, latency) on hot reload
                existing = self._providers[cfg.name]
                existing.config = cfg
                new_providers[cfg.name] = existing
            else:
                new_providers[cfg.name] = ProviderState(config=cfg)
        self._providers = new_providers
        self._initialized = True
        logger.info(
            'registry_initialized',
            providers=list(self._providers.keys()),
        )

    def _ensure_initialized(self) -> None:
        if not self._initialized:
            self.initialize()

    def get_provider(self, feature: str | None = None) -> ProviderState | None:
        """Select the best available provider for the given feature."""
        self._ensure_initialized()
        settings = get_settings()
        available = self._available_providers()
        if not available:
            logger.warning('registry_no_providers_available', feature=feature)
            # Last resort: return first provider regardless of state
            states = list(self._providers.values())
            return states[0] if states else None

        # Feature-based routing
        if feature:
            routing = settings.feature_routing
            strategy = routing.get(feature)
            if strategy == 'cheapest':
                return min(available, key=lambda s: s.config.cost_weight)
            if strategy == 'best':
                return min(available, key=lambda s: s.config.priority)
            if strategy == 'fastest':
                return min(available, key=lambda s: s.avg_latency_ms or float('inf'))
            # Strategy could also be a specific provider name
            if strategy in self._providers:
                target = self._providers[strategy]
                if target in available:
                    return target

        # Default: weighted round-robin by priority (lower priority = more weight)
        total_weight = sum(1.0 / s.config.priority for s in available)
        pick = random.random() * total_weight
        cumulative = 0.0
        for state in available:
            cumulative += 1.0 / state.config.priority
            if pick <= cumulative:
                return state
        return available[-1]

    def get_provider_by_name(self, name: str) -> ProviderState | None:
        self._ensure_initialized()
        return self._providers.get(name)

    def all_providers(self) -> list[ProviderState]:
        self._ensure_initialized()
        return list(self._providers.values())

    def record_latency(self, name: str, latency_ms: int, success: bool) -> None:
        state = self._providers.get(name)
        if state:
            state.update_latency(latency_ms, success)

    def _available_providers(self) -> list[ProviderState]:
        """Filter providers: circuit not open, RPM not exceeded, no probe in flight.

        P1.2: a HALF_OPEN provider with probe in flight is excluded so
        callers cascade to the next provider. Without this exclusion,
        ``next_provider_after`` could return a probe-locked provider,
        ``allow_request()`` would reject it, and the recursive cascade in
        ``_try_next_provider`` would cycle through every provider forever
        (since each appears "available" by ``is_open`` but rejects on probe).

        B2: when ``tpm_enforced`` is on, providers at their TPM cap are
        also excluded — the request would 429 at the vendor and waste a
        fallback slot.
        """
        settings = get_settings()
        tpm_enforced = settings.tpm_enforced
        result: list[ProviderState] = []
        for state in self._providers.values():
            if state.circuit.is_open:
                continue
            if state.circuit.is_probe_in_flight:
                continue
            if not state.rpm_available():
                continue
            if tpm_enforced and not state.tpm_available():
                continue
            result.append(state)
        # Sort by priority for deterministic fallback ordering
        result.sort(key=lambda s: s.config.priority)
        return result

    def next_provider_after(self, name: str) -> ProviderState | None:
        """Get the next available provider after the given one (for fallback)."""
        available = self._available_providers()
        names = [s.config.name for s in available]
        if name in names:
            idx = names.index(name)
            if idx + 1 < len(available):
                return available[idx + 1]
        # If named provider not in available list, return first available
        return available[0] if available else None


# Singleton
_registry: ProviderRegistry | None = None


def get_registry() -> ProviderRegistry:
    global _registry
    if _registry is None:
        _registry = ProviderRegistry()
        _registry.initialize()
    return _registry


def reset_registry() -> None:
    """Clear registry singleton — for testing."""
    global _registry
    _registry = None
