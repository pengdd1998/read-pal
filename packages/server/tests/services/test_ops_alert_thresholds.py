"""E5.1: pure-function threshold checks — injected sample unit tests."""


from app.ops_alert_thresholds import (
    check_cost_doubling,
    check_label_success_drop,
    check_ratelimit_jump,
)


class TestCostDoubling:
    def test_triggers_at_2x(self):
        sig = check_cost_doubling(recent_7d=20.0, prior_7d=8.0)
        assert sig[2] is False
        assert '2×' in sig[3]

    def test_ok_under_2x(self):
        sig = check_cost_doubling(recent_7d=10.0, prior_7d=8.0)
        assert sig[2] is True

    def test_floor_suppresses_low_cost_noise(self):
        # $0.01 → $0.03 is 3× but below the $1 floor
        sig = check_cost_doubling(recent_7d=0.03, prior_7d=0.01)
        assert sig[2] is True

    def test_zero_prior_ok(self):
        sig = check_cost_doubling(recent_7d=5.0, prior_7d=0.0)
        assert sig[2] is True


class TestRatelimitJump:
    def test_triggers_above_20pp(self):
        # 50% vs 25% = +25pp
        sig = check_ratelimit_jump(calls_24h=100, ratelimit_24h=50,
                                   calls_7d=700, ratelimit_7d=175)
        assert sig[2] is False
        assert '+25%' in sig[3]

    def test_suppressed_under_30_calls(self):
        sig = check_ratelimit_jump(calls_24h=10, ratelimit_24h=10,
                                   calls_7d=700, ratelimit_7d=0)
        assert sig[2] is True

    def test_ok_within_20pp(self):
        sig = check_ratelimit_jump(calls_24h=100, ratelimit_24h=30,
                                   calls_7d=700, ratelimit_7d=175)
        assert sig[2] is True

    def test_zero_calls_handled(self):
        sig = check_ratelimit_jump(calls_24h=0, ratelimit_24h=0,
                                   calls_7d=100, ratelimit_7d=10)
        assert sig[2] is True


class TestLabelSuccessDrop:
    def test_triggers_at_5pp_drop(self):
        stats = [('companion.chat', 100, 80, 100, 95)]  # 80% vs 95% = -15pp
        sig = check_label_success_drop(stats)
        assert sig[2] is False
        assert 'companion.chat' in sig[3]

    def test_suppressed_under_30_calls(self):
        stats = [('rare.label', 10, 0, 100, 95)]
        sig = check_label_success_drop(stats)
        assert sig[2] is True

    def test_ok_within_5pp(self):
        stats = [('companion.chat', 100, 92, 100, 95)]  # -3pp
        sig = check_label_success_drop(stats)
        assert sig[2] is True

    def test_multiple_drops_composed(self):
        stats = [
            ('label_a', 100, 70, 100, 95),
            ('label_b', 50, 30, 50, 48),
            ('label_c', 100, 95, 100, 95),  # ok
        ]
        sig = check_label_success_drop(stats)
        assert sig[2] is False
        assert 'label_a' in sig[3] and 'label_b' in sig[3]
        assert 'label_c' not in sig[3]
