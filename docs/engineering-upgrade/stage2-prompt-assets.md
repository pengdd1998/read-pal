# 阶段 2（B2）：Prompt 资产化核对与等价性

## 现状结论：迁移已完成，无需搬家

read-pal 的 prompt 资产化在体检时就已达工作流目标态：

- **单一来源**：`app/prompts/` 8 个内容模块、57 个 `PromptTemplate`，
  `templates.py` 全局注册表 docstring 明示 "Every prompt sent to an LLM
  should come from this module"
- **版本化**：57/57 声明 `version=`（100%）；变更记录随 docstring + git
- **变量契约**：`base.py:39` `__post_init__` import 期校验声明/占位符漂移（CI 阻断）
- **双端复制**：不存在——web/mobile 不直连 LLM（取证零命中），单一来源收敛在后端

因此本阶段**无迁移 PR、无等价性验证负担**（搬家不改内容的前提是无搬家）。

## 唯一结构性缺口的处置：i18n prompt 通道

companion 主 system/socratic prompt 存于 `app/translations/{en,zh}.json`，
绕开 PromptTemplate 版本体系。处置方式（不动 prompt 内容——等价性红线）：

- 新增 `tests/test_translation_prompt_pins.py`：4 条字符串的 sha256 内容钉。
  任何措辞变更 → CI 失败 → 必须同 PR 更新 pin + 附变更理由 + mock eval 报告
  （测试 docstring 写明 bump 流程，等价于 PromptTemplate 的 version= 纪律）
- 附带占位符一致性双保险：`{title,author,progress_line,spoiler_block,untrusted_notice}`
  五占位符 en/zh 逐条 parity + 钉内校验（丢失占位符精确报错）
- trace 侧兜底已存在：无 version 的 prompt 走 MD5 hash 作为 `prompt_version`
  （`safe_invoke.py:152`），线上版本可追溯

**未做（升级人工拍板）**：把 i18n prompt 重构成带 version 的结构（如 translations
里加版本键）。这是形态改造而非缺口修复，收益（显式版本号）与风险（i18n 加载链路
改动）比不高，留作候选——若未来 prompt-eval 出现 i18n 漂移事故再启动。

## 等价性验证声明

本阶段唯一涉及 prompt 行为的改动 = 零。`app/prompts/**` 与 `app/translations/**`
内容零变更（git diff 可证）。

## 验证

`tests/test_translation_prompt_pins.py`：10 passed + 2 skipped（en 为参照语言）。
