"""L2 LLM-as-judge rubric + scorer (engineering-upgrade B3).

Closes the missing L2 layer of the eval pyramid: L0 (schema/shape) and L1
(golden regression) are machine-judged in CI; this module judges the
qualities machines can't assert — usefulness, factuality against the
expectation, format adherence — with a versioned rubric prompt managed
under the same ``PromptTemplate`` discipline as production prompts.

Anti-sycophancy is built into the rubric (score anchors, no length bonus,
"verify each expectation requirement before scoring" — the CoV accounting
discipline) because judges that hand out 5s are worse than no judge.

Runs ONLY when explicitly invoked (``--judge`` on live eval, or the CLI
below) — each judgment is a real LLM call costing ~1K tokens per entry.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from typing import Any

from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field

from app.prompts.base import PromptTemplate
from app.services.llm import safe_llm_invoke

logger = logging.getLogger('read-pal.eval.judge')

JUDGE_RUBRIC = PromptTemplate(
    key='eval/judge_rubric',
    version=1,
    variables=['task', 'expectation', 'output'],
    output_format='json',
    temperature=0.0,
    template=(
        'You are a strict quality judge for LLM outputs. You will receive a '
        'task description, the expectation contract the output must satisfy, '
        'and the output itself. Judge ONLY against the contract — not against '
        'what a perfect answer would contain.\n'
        '\n'
        'Procedure (follow in order, no skipping):\n'
        '1. Enumerate every requirement stated in the expectation contract.\n'
        '2. For each requirement, check the output and record whether it is '
        'met, partially met, or violated. Cite the exact output fragment as '
        'evidence.\n'
        '3. Only then assign a score.\n'
        '\n'
        'Score anchors:\n'
        '1 = requirement(s) outright violated: missing required fields, '
        'wrong format, or content ignoring the task.\n'
        '2 = core intent attempted but multiple requirements unmet.\n'
        '3 = most requirements met; noticeable gaps (vague where specificity '
        'was required, minor format deviations).\n'
        '4 = all requirements met; only cosmetic imperfections.\n'
        '5 = all requirements met AND the output is precise, complete, and '
        'faithful to the task context.\n'
        '\n'
        'Anti-sycophancy rules (violating these invalidates your judgment):\n'
        '- Anchor the score to the requirement checklist from step 1-2, not '
        'to overall impression.\n'
        '- Do NOT reward length, confidence, fluency, or formatting polish.\n'
        '- Do NOT infer unstated requirements; judge only what the contract '
        'says.\n'
        '- If the output is empty, truncated, or refuses the task, the score '
        'is 1 regardless of politeness.\n'
        '\n'
        'Task:\n{task}\n'
        '\n'
        'Expectation contract:\n{expectation}\n'
        '\n'
        'Output to judge:\n{output}\n'
        '\n'
        'Respond as JSON: {{"score": <1-5>, "rationale": "<requirement-by-'
        'requirement verdict with evidence>", "issues": ["<unmet requirement '
        'descriptions>"]}}'
    ),
)


class JudgeScore(BaseModel):
    """Structured judgment — schema-enforced by safe_llm_invoke."""

    score: int = Field(ge=1, le=5)
    rationale: str = Field(min_length=1)
    issues: list[str] = Field(default_factory=list)


async def judge_output(
    *,
    task: str,
    expectation: str,
    output: str,
) -> JudgeScore | None:
    """Judge one output against one expectation contract.

    Returns None on LLM/parse failure (judge unavailability must never
    crash an eval run — it degrades to "unscored", reported separately).
    """
    rendered = JUDGE_RUBRIC.template.format(
        task=task[:2000],
        expectation=expectation[:2000],
        output=output[:4000],
    )
    parsed = await safe_llm_invoke(
        [HumanMessage(content=rendered)],
        fallback=None,
        log_label='eval/judge',
        schema_class=JudgeScore,
        use_cache=False,  # judgments must reflect the rubric, not a stale cache entry
        template=JUDGE_RUBRIC,
        feature='eval',
    )
    if isinstance(parsed, dict):
        try:
            return JudgeScore.model_validate(parsed)
        except (ValueError, TypeError):
            logger.warning('judge output failed schema: %s', str(parsed)[:200])
            return None
    if isinstance(parsed, JudgeScore):
        return parsed
    return None


def _expectation_text(golden: dict[str, Any]) -> str:
    return json.dumps(golden.get('expected_output', {}), ensure_ascii=False)


async def score_live_reports(reports: list[Any]) -> list[tuple[str, JudgeScore | None]]:
    """Score every non-skipped live-eval report with the judge.

    ``reports`` items need ``name``, ``passed``, ``skipped`` and (ideally)
    ``output_text`` attributes — ``app.eval.live_runner.LiveEvalReport``
    satisfies this. Entries without captured output are scored None.
    """
    from app.eval.golden_dataset import ALL_GOLDEN

    goldens = {f"{g['service']}/{g['action']}": g for g in ALL_GOLDEN}
    scored: list[tuple[str, JudgeScore | None]] = []
    for report in reports:
        if getattr(report, 'skipped', False):
            continue
        output_text = getattr(report, 'output_text', '')
        golden = goldens.get(report.name)
        if not output_text or golden is None:
            scored.append((report.name, None))
            continue
        score = await judge_output(
            task=f"{report.name} — golden input: "
                 f"{json.dumps(golden.get('input', {}), ensure_ascii=False)[:1500]}",
            expectation=_expectation_text(golden),
            output=output_text,
        )
        scored.append((report.name, score))
    return scored


def print_judge_report(scored: list[tuple[str, JudgeScore | None]]) -> None:
    judged = [s for _, s in scored if s is not None]
    print(f'\n{"=" * 60}')
    print(f'LLM-AS-JUDGE (L2): {len(judged)}/{len(scored)} scored')
    print(f'{"=" * 60}')
    for name, score in scored:
        if score is None:
            print(f'  UNSCORED {name}')
            continue
        print(f'  {score.score}/5 {name} — {score.rationale[:120]}')
        for issue in score.issues[:3]:
            print(f'      issue: {issue[:120]}')
    if judged:
        avg = sum(s.score for s in judged) / len(judged)
        below = [n for n, s in scored if s and s.score <= 2]
        print(f'\n  avg score: {avg:.2f}   entries scoring <=2: {len(below)}')
        if below:
            print(f'  {"⚠ entries at/below anchor 2: " + ", ".join(below)}')


def main(input_path: str) -> int:
    """CLI: judge entries from a JSONL file of {name, task, expectation, output}."""
    entries = []
    with open(input_path, encoding='utf-8') as fh:
        for line in fh:
            line = line.strip()
            if line:
                entries.append(json.loads(line))
    if not entries:
        print(f'No entries in {input_path}')
        return 2

    async def _run() -> list[tuple[str, JudgeScore | None]]:
        out = []
        for entry in entries:
            score = await judge_output(
                task=entry['task'],
                expectation=entry['expectation'],
                output=entry['output'],
            )
            out.append((entry.get('name', 'unnamed'), score))
        return out

    scored = asyncio.run(_run())
    print_judge_report(scored)
    return 0


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(prog='app.eval.judges')
    parser.add_argument('--input', required=True, help='JSONL file of entries to judge')
    args = parser.parse_args()
    sys.exit(main(args.input))
