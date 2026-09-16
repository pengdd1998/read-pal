"""Gate self-test: check_token_budget_model must flag every TokenBudget
construction lacking a model= keyword — the bare default silently estimates
against the GLM window on non-GLM providers (AGENTS.md Never rule #3)."""

from pathlib import Path

from scripts.check_token_budget_model import _check_file


def _violations(tmp_path: Path, source: str) -> list[tuple[int, str]]:
    f = tmp_path / 'sample_service.py'
    f.write_text(source, encoding='utf-8')
    return _check_file(f)


def test_bare_constructor_flagged(tmp_path):
    out = _violations(tmp_path, "budget = TokenBudget()\n")
    assert len(out) == 1 and 'model=' in out[0][1]


def test_kwargs_without_model_flagged(tmp_path):
    out = _violations(tmp_path, "budget = TokenBudget(response_reserve=100)\n")
    assert len(out) == 1


def test_model_kwarg_passes(tmp_path):
    out = _violations(
        tmp_path,
        "budget = TokenBudget(model=get_settings().default_model)\n",
    )
    assert out == []


def test_model_kwarg_with_extras_passes(tmp_path):
    out = _violations(
        tmp_path,
        "budget = TokenBudget(model='mimo-v2.5', response_reserve=4_000)\n",
    )
    assert out == []


def test_unrelated_call_ignored(tmp_path):
    out = _violations(tmp_path, "x = OtherBudget(model='a')\ny = TokenBudgetArg()\n")
    assert out == []
