# agent-service 脚手架模板（engineering-upgrade B5 产物）

> read-pal 工程化改造后的目录形态，固化为新 AI-agent 服务的起点模板。
> 本目录是**结构契约**文档：新项目按此建目录，配套的门禁件从 read-pal
> 现件复制（复制源逐项列出）。用法：新仓库 `mkdir -p $(grep -oE '^\s+[a-z_/]+/' TREE.txt | tr -d ' /')` 或手工照树建骨架。

## 目录契约（read-pal 实证形态）

```
packages/server/
├── app/
│   ├── routers/            # 只做参数校验→调 service→返回（AST 强制：check_router_thin.py）
│   ├── services/
│   │   └── llm/            # ★ 模型网关——全项目唯一 ChatOpenAI 构造点（pool.py）
│   │       ├── safe_invoke.py        # safe_llm_call / safe_llm_invoke 唯一入口
│   │       ├── provider_fallback.py  # 多级 fallback + 计费结算
│   │       ├── circuit_breaker.py    # 熔断
│   │       ├── retry.py              # Retry-After + 退避
│   │       ├── registry.py           # provider 注册 + 热切换
│   │       ├── observability.py      # _log_call 唯一日志出口 + JSONL sink
│   │       └── metrics.py            # 五项最小指标聚合
│   ├── prompts/            # ★ PromptTemplate dataclass（version+variables 强制）
│   ├── eval/               # ★ golden set + L0/L1 runner + judge + 基线
│   ├── middleware/         # 幂等 / 预算 / 限流
│   ├── models/  schemas/  core/  utils/
├── tests/                  # hermetic（conftest 构造器级 patch Redis）
├── scripts/                # AST 门禁 + drift_scan
└── .env.example            # 与代码 env 读取一一对应（gitleaks 守护）
.github/workflows/
├── ci.yml                  # 快门禁：lint+单测+L0/L1+gitleaks（PR 阻断）
├── prompt-eval.yml         # prompt 变更路径触发：rendering+mock eval+AST
├── drift-scan.yml          # 周检：mock 新鲜度/模板一致性/live 漂移（开 issue）
└── secret-scan.yml         # gitleaks 规则型密钥扫描
ops/observability/          # 指标手册 + badcase 归因 runbook + L3 抽检 SOP
docs/
├── adr/                    # 决策记录
├── incidents/              # 事故档案（每条 Never 规则对应一次失败）
└── engineering-upgrade/    # 改造留痕（体检→批次→探针）
```

## 新项目必装门禁件（从 read-pal 复制的源文件）

| 门禁 | 复制源 | 防什么 |
|---|---|---|
| PromptTemplate variables 校验 | `app/prompts/base.py` | 占位符漂移到运行时才爆 |
| router-thin AST 检查 | `scripts/check_router_thin.py` | 业务逻辑漏进路由层 |
| no-raw-book-fields AST | `scripts/check_no_raw_book_fields.py` | 未消毒字段进 prompt（按域改名） |
| hermetic redis fixture | `tests/conftest.py::_hermetic_redis` | 测试写进生产 Redis |
| prompt-eval 路径触发 | `.github/workflows/prompt-eval.yml` | prompt 变更无门禁裸奔 |
| 基线回归门禁 | `app/eval/regression_baseline.py` + run_all 接线 | 原 pass 现 fail 静默放行 |
| gitleaks | `.github/workflows/secret-scan.yml` | 高熵密钥入库 |

## 四条不动摇（绞杀者模式红线）

1. 搬家不改内容：迁移 PR 与功能 PR 严禁混合，等价性验证不过即回滚；
2. prompt 单一来源：一条 prompt 全项目一份文件，按 (agent, task, version) 引用；
3. LLM 调用唯一出口：业务代码禁止构造模型客户端，一律走网关；
4. 评测与测试平级：`eval/` 不放 `tests/` 里（变更节奏/运行成本/门禁时机三不同）。
