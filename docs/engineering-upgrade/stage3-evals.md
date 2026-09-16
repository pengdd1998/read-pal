# 阶段 3（B3）：评测体系搭建

## 缺口 → 改动对照

| 体检缺口 | 改动 | 文件 |
|---|---|---|
| `compare_to_baseline` 有实现未接线（唯一调用方是它自己的单测） | `run_all()` 接入基线 diff：REGRESSION 使退出码 1（CI 阻断） | `eval_runner.py:207-236` |
| 基线 15/22 条陈旧、metadata `seed_run: true` | 刷新至全量 36 条（22 golden + 14 回归套件），note 记录原因 | `regression_baseline.json` |
| 重新基线无受控入口 | `--update-baseline --baseline-note "<why>"` CLI（有意变更专用） | `eval_runner.py` CLI |
| L1 断言仅包含/禁词 | `equals`（精确匹配）+ `regex`（形状锚定）断言 | `assertions.py:54-69` |
| golden 条目无"防什么回归"标注 | 22 条全部注入 `guards` 标注（封闭词表：format/schema/injection/sanitizer/budget），测试强制全覆盖 | `golden_dataset.py:66-115` |
| L2 LLM-as-judge 为零 | `judges.py`：版本化 rubric（PromptTemplate 纪律，v1，variables 声明）+ 反谄媚条款 + 逐条对账式打分程序 + `--judge` 接入 live eval + 独立 CLI | `app/eval/judges.py`、`live_runner.py`、`eval_runner.py` |
| L3 人工抽检为零 | 抽检 SOP（分层抽样 + 检查单 + 结论处理） | `ops/observability/manual-review-sop.md` |

## 分层金字塔现状（改造后）

| 层 | 判分 | 运行时机 | 状态 |
|---|---|---|---|
| L0 | schema/类型/必填/禁词 | PR（prompt-eval.yml + ci.yml 双跑） | ✅ 原有 |
| L1 | contains/not_contains + **equals/regex**（新） | PR 阻断 | ✅ 补齐 |
| L1.5 | **REGRESSION 基线门禁**（新接线） | PR 阻断（mock eval 任一回归即 exit 1） | ✅ 新增 |
| L2 | judge rubric 1-5 锚点 + 反谄媚 | 显式 `--judge`（live，~1K token/条，资金护栏下默认关） | ✅ 新增 |
| L3 | 人工抽检 SOP | 每周/发版前 | ✅ 新增（SOP 落地） |

## golden set 纪律对照

- ≥20 条 ✅（22 条，mock_data 22 个 last-verified 交叉验证）
- 判分标准与期望成对 ✅（expected_output 契约 + 新增 guards 标注）
- 来源标注：现状只有 3 条自由文本 description + 代码注释线索（CC-3、LA-*）——
  **未逐条补来源**：历史条目的真实日志来源已不可考，编造来源违反工作流
  "禁止匿名编造"红线。处置：guards 标注 + 测试强制未来条目自带上溯信息；
  新增条目按 badcase-triage-runbook 带 case 编号。
- 含 PII 的原始日志入库：无（mock 数据为构造样本）

## 验证

- `tests/test_eval_baseline_gate.py`：回归阻断 / 干净通过 / NEW 不阻断 /
  equals·regex·guards·judge 共 12 项全绿
- `uv run python -m app.eval.eval_runner`：36/36 passed，0 regressions，exit 0
- 判分可复现：mock 模式确定性输出（同输入两次运行判分一致）
