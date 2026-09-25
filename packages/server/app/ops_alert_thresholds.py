"""Pure-function threshold checks for ops/alerting/check.py (E5.1).

GAP A2: the four alert thresholds existed only as inline SQL + arithmetic
inside _rollup_threshold_signals — CI ran check.py but never tested the
threshold math. These pure functions take the same numeric tuples the
SQL produces and return (name, severity, ok, note) signals, making the
logic unit-testable with injected samples.
"""

from __future__ import annotations

# Signal tuple shape: (name, severity, ok, note)
Signal = tuple[str, str, bool, str]


def check_cost_doubling(recent_7d: float, prior_7d: float) -> Signal:
    """Cost ≥2× the prior 7-day window (floor $1 avoids 0.01→0.03 noise)."""
    if prior_7d >= 1.0 and recent_7d >= 2 * prior_7d:
        return ('llm_cost_doubling', 'P2', False,
                f'${recent_7d} last 7d vs ${prior_7d} prior (≥2×)')
    return ('llm_cost_doubling', 'P2', True,
            f'${recent_7d} vs ${prior_7d} (7d)')


def check_ratelimit_jump(
    calls_24h: int, ratelimit_24h: int,
    calls_7d: int, ratelimit_7d: int,
) -> Signal:
    """rate_limit share jump >20pp with ≥30 calls (24h vs 7d baseline)."""
    share24 = ratelimit_24h / calls_24h if calls_24h else 0.0
    share7 = ratelimit_7d / calls_7d if calls_7d else 0.0
    if calls_24h >= 30 and share24 - share7 > 0.20:
        return ('llm_ratelimit_jump', 'P2', False,
                f'rate_limit share {share24:.0%} (24h) vs {share7:.0%} baseline (+{share24 - share7:.0%})')
    return ('llm_ratelimit_jump', 'P2', True,
            f'{share24:.0%} (24h) vs {share7:.0%} (7d base)')


def check_label_success_drop(
    label_stats: list[tuple[str, int, int, int, int]],
) -> Signal:
    """Per-label success rate drop ≥5pp with ≥30 calls in both windows.

    label_stats: [(label, calls_24h, successes_24h, calls_7d, successes_7d)]
    """
    drops: list[str] = []
    for label, c24, s24, c7, s7 in label_stats:
        if c24 < 30 or c7 < 30:
            continue
        r24 = s24 / c24 if c24 else 1.0
        r7 = s7 / c7 if c7 else 1.0
        if r24 < r7 - 0.05:
            drops.append(f'{label} {r24:.0%} vs {r7:.0%}')
    return ('llm_label_success_drop', 'P2', not drops,
            '; '.join(drops) if drops else 'all labels within −5pp')
