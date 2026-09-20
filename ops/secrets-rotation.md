# 凭据轮换 Runbook（GAP 方案 A3 · 2026-09-20）

> 只轮换、**不重写 git 历史**（rewrite 毁所有 clone；已入历史的密钥视为
> 已泄露，轮换 + secret-scan.yml 门兜底）。
> **前置**：低峰窗口（JWT 轮换 = 所有在线会话失效）；用户新 LLM key 到位
> （GLM/mimo 控制台生成，本 runbook 无法代办）。
> **共享宿主红线**：所有命令钉死本项目 compose 目录
> `/home/ubuntu/projects/read-pal`，禁触 what-to-eat / anynote / /srv/infra。

## 执行序（每步后冒烟：登录→上传→agent→导出）

1. **JWT_SECRET**：`openssl rand -hex 32` → .env → `docker compose up -d api web`
   → 预期：全部在线会话 401（Beta 可接受），重新登录验证。
2. **OPS_KEY**：新值 → .env；`curl -H "X-Ops-Key: 新" /api/v1/stats/llm?hours=1`
   （带登录态）验证；ops 页 sessionStorage 旧 key 失效属预期。
3. **PG**：`ALTER USER readpal WITH PASSWORD '新'`（infra-postgres 内）→
   同步 .env DB_PASSWORD → `up -d api`。注意：PG 密码同时用于备份脚本与
   35551 隧道——同步更新本地 `~/.ssh/config` 隧道用途侧与
   `/etc/readpal-backup.env`。
4. **Redis**：`requirepass`（infra-redis 持久配置或 compose command）→
   .env REDIS_URL 带新密码 → `up -d api`。
5. **MinIO**：控制台/`mc admin user` 新建 AccessKey → 更新 .env → 旧 key 禁用。
6. **LLM keys**：用户新 GLM/mimo key → .env → 一次 research 调用验证
   （llm_call_traces 有成功行）。
7. 全链路冒烟四项 + `/var/lib/readpal-alert/state.json` 无需变（Server酱 key
   在 Actions secrets，GitHub 侧单独轮换）。

## 已完成部分（2026-09-20）

- env 修订：`MAX_EMBEDDING_CALLS` 300→2000（.env 追加，容器级生效，
  入口 health 200 复验）。备份 `.env.bak-20260920`。
- diff 对账：prod .env 与 dev 基准差异已在会话中核对
  （LLM_LOG_ENABLED 双侧 true；EMBEDDING 走 Mac Ollama 隧道一致）。

## 回滚

任一步红：恢复 `.env.bak-20260920` 对应键 → `up -d api web` → 冒烟。
