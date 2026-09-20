# read-pal 备份方案与 Runbook（GAP 方案 C2 · 2026-09-20）

> **强制条款（v1.1 评审定稿）：备份禁止写入本机 MinIO。** VPS 上
> MinIO/PG/Redis 同机同 compose（`shared-minio-data` 共享卷）——整机
> 丢失 = 数据与备份同灭。目标必须异机：腾讯云 COS **跨区桶**。
> 没演练过"异机取回"的备份不算备份（首跑演练纳入验收）。

## 数据分级

| 数据 | 可丢等级 | 策略 |
|---|---|---|
| Postgres（books/users/chat_messages/annotations/llm_call_traces/rollup） | 不可丢 | pg_dump 每日全量，7 日 + 4 周保留 |
| Redis（memory-book checkpoints / 缓存 / 限流计数） | 可丢（可重建/可再生） | RDB 快照随每日备份带走，**不单独立保留策略**——恢复优先级最低，丢了重生成 |
| MinIO（书源文件/封面） | 中（书源可重传，封面可重生成） | 本期不做对象级备份（卷大）；书籍内容已随 PG chunk 化，重传封面可再生。Beta 后按量评估 |

## 环境变量（VPS `/home/ubuntu/projects/read-pal/.env` 或专用 `/etc/readpal-backup.env`）

```
COS_BUCKET=readpal-backup-ap       # 跨区桶（如建在广州区、源在硅谷/上海则必须异地）
COS_REGION=ap-guangzhou
COS_ENDPOINT=cos.ap-guangzhou.myqcloud.com
COS_AK=***                         # 子账号仅授权该桶读写
COS_SK=***
BACKUP_DIR=/var/lib/readpal-backup # VPS 本地暂存（上传成功即删，非保留地）
PG_CONTAINER=infra-postgres
REDIS_CONTAINER=infra-redis
```

## 每日备份（cron 03:17 低峰）

```bash
# crontab -u ubuntu
17 3 * * * /home/ubuntu/projects/read-pal/ops/backup/backup.sh >> /var/log/readpal-backup.log 2>&1
```

`backup.sh` 行为：pg_dump（`infra-postgres` 容器内 `-Fc` 自定义格式）→
zstd 压缩 → 上传 `s3://$COS_BUCKET/daily/YYYY-MM-DD/`；周日凌晨的转存
`weekly/YYYY-WW/`。上传校验（ETag/size 对账）成功后删本地暂存。
**桶侧生命周期**：`daily/` 前缀保留 7 天、`weekly/` 前缀保留 28 天
（COS 控制台配置，不依赖脚本清理）。Redis `BGSAVE` 后 `docker cp`
RDB 同批上传（`redis/` 前缀，跟随 daily 生命周期）。

上传走 `docker run --rm amazon/aws-cli`（S3 兼容端点指向 COS）——
零宿主安装，复用既有 docker；密钥经 `-e` 注入，不落命令行历史。

## 月度恢复演练（`restore-drill.sh`，首跑纳入 Beta 验收）

必须在**非生产库**上演练全链：从 COS 取回最新 weekly → 容器外
`pg_restore` 进 scratch 库（`readpal_drill`，容器内建/删）→ 断言：
用户数 > 0、books 数与生产同数量级、抽查表行数、迁移头版本一致
（`alembic_version`）。任何一步红 = 演练失败，备份视为不存在。
演练产出记录到 `docs/testing/materials/execution-record.csv`。

## 回滚语义

- 单表误删：pg_restore `-t` 选表进 scratch → 导出 SQL → 生产执行（人工审）。
- 整库灾难：新 VPS 起 infra → 恢复最新 weekly → `alembic upgrade head`
  补齐差量（dump 落后于生产的 schema 变更由迁移补）。

## 已知边界

- RPO = 24h（每日全量）；Beta 后按需评估 WAL 归档（PITR）。
- MinIO 书源不备份（见分级表）；书籍正文已 chunk 化在 PG 内受保护。
- 演练用 scratch 库与生产同容器实例——资源竞争低峰可接受。
