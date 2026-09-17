# 平台层方案（/srv/infra：数据面 + 边缘路由面，手动管理）

> 2026-09-17 决策链（同日三步）：
> ① 公共基础服务变动少 → 从 anynote 仓库独立到 VPS 手动触发，消除
> "read-pal 生产数据面由 anynote CD 收敛"的治理债（cd.yml:203-204 每次部署
> 执行 `docker compose -f infra/docker-compose.yml up -d`）；
> ② 评估 Caddy 并入 shared-infra：中立化前反对（anynote CD 会顺带收敛全站
> 边缘 + 数据面/路由面故障域耦合）；中立化后该前提消失；
> ③ 确认并入 → 平台层 = 单一 compose project **`infra`** @ `/srv/infra`，
> 四服务（postgres / redis / minio / caddy）。
>
> 分工：本方案管**平台容器归位与运维纪律**；read-pal 侧接入迁移（网络
> 预备/骨架拆分/路由移植割接）在 [ops/edge/PLAN.md](../edge/PLAN.md)；
> 多项目接入手册在 [ops/edge/README.md](../edge/README.md)。

## 0. 现状锚点（2026-09-17 SSH 实测）

| 事实 | 值 |
| --- | --- |
| 数据面定义 | anynote 仓库 `infra/docker-compose.yml`（VPS: /home/ubuntu/projects/any-note/infra/，仅两文件：compose + init-db.sh——后者是 postgres 首次初始化的挂载依赖） |
| 数据面 compose project | `infra`（容器标签实测；由文件父目录名派生，目录名恰为 infra → /srv/infra 同名继承 → **零重建收养**） |
| 网络/卷 | `shared-infra` 网络与三卷（read-pal_postgres_data / read-pal_redis_data / shared-minio-data）均**显式命名** → 迁移不产生新网络/新卷 |
| 生效 env | 全部为文件默认值（POSTGRES_PASSWORD=changeme + trust auth、minioadmin/minioadmin）；any-note/.env 不参与插值（compose 从 project 目录读 .env，该目录无）→ **/srv/infra 不需要 .env** |
| anynote CD 触点 | cd.yml:203-204 收敛（本方案移除）；cd.yml:209/217-218 `docker exec infra-postgres`（pg_isready、CREATE DATABASE anynote）——消费者角色、按容器名工作，**独立后不受影响，保留** |
| 边缘现状 | `what-to-eat-edge-1`（caddy:2）属 compose project `what-to-eat`（服务名 `edge`，/srv/what-to-eat），0.0.0.0:80/443/443udp，Caddyfile 单文件 bind-mount，证书命名卷 what-to-eat_caddy-data/config |
| 多租户 | infra-postgres 同时承载 readpal 与 anynote 两个数据库 |

## 1. 第一部分 — 数据面收养（零重建）

**① canonical 已就位**：[files/docker-compose.yml](files/docker-compose.yml)
（四服务完整版，钉死 `name: infra`）。⚠ canonical 的端口绑定刻意保持
0.0.0.0 与现场运行一致——任何"顺手改进"（如提前改回环绑定）都会破坏收养
零重建前提；公网收紧是 edge PLAN 的 C-6 显式步骤，届时变更并回写。

**② VPS 落位（边缘迁移前只落数据面所需文件）**：

```bash
sudo mkdir -p /srv/infra && sudo chown ubuntu:ubuntu /srv/infra
cp <read-pal checkout>/ops/infra/files/docker-compose.yml /srv/infra/
cp /home/ubuntu/projects/any-note/infra/init-db.sh /srv/infra/ && chmod +x /srv/infra/init-db.sh
```

⚠ 前置（无论收养何时执行）：`docker network create edge-net`——canonical
顶层声明了 `edge-net: external: true`（caddy 服务使用）。实测 29.1.3 的
子集 up 不校验未被启动服务使用的 external 网络，但该行为无兼容承诺，
先建网络零成本（复审修订 09-17）。

⚠ compose 文件此时已含 caddy 服务块，但**边缘迁移（第二部分）完成前，
平台 up 一律显式服务名**——caddy 的 80/443 仍归 what-to-eat edge 持有，
裸 `up -d` 会因端口冲突失败（fail-safe，但避免制造混乱）：

```bash
cd /srv/infra && docker compose up -d postgres redis minio
```

（compose 按服务名过滤；caddy 未启动时其 Caddyfile/sites 挂载无需存在。）

**③ 收养验证（预期零重建）**：

```bash
docker ps --format '{{.Names}} {{.Status}}' | grep infra-    # StartedAt 不变 = 未重建
docker inspect infra-postgres --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'
# 应变为 /srv/infra（labels 随本次 up 更新, 容器本体未动）
```

原理：project 名不变（`infra`）+ 文件内容同义 + 生效 env 已实测为默认值
→ compose 按 project+service 标签匹配现存容器，纯元数据更新。若输出意外
出现 `Recreating`：数据在显式命名卷中无损，等其完成并核对两项目健康即可
（低概率分支，建议低峰执行）。

**④ anynote 侧 PR（anynote 项目组执行）**：删除 cd.yml:203-204（收敛行）；
209/217-218 的 `docker exec infra-postgres ...` 保留；仓库 `infra/` 目录
删除或改为指向 /srv/infra 的 README。

**⑤ 验收**：容器零重建（StartedAt 跨 ③ 不变）；read-pal
`https://read.chishenma.top/api/v1/health` 与 anynote
`http://localhost:36661/health`（VPS 上）均 200；下一次 anynote 部署日志
无 infra 收敛行。

**⑥ 回退（零风险）**：revert anynote PR + `rm -rf /srv/infra`——容器全程
未被触碰，回退只是"谁来收敛"的归属切换。

## 2. 第二部分 — caddy 并入（边缘容器归位）

详细步骤、验收与回退在 [ops/edge/PLAN.md](../edge/PLAN.md) 阶段 A
（前置 = 本方案第一部分验收 + edge 阶段 A0 网络预备）。平台侧要点：

- 边缘文件落位 `/srv/infra/{Caddyfile, sites/, caddy-data/, caddy-config/}`
  （骨架 canonical：[files/Caddyfile](files/Caddyfile)；证书卷从
  what-to-eat_caddy-* `cp -a` 迁移，不重签）。
- `docker compose up -d caddy` **仅创建 caddy**——数据面三服务 config hash
  未变，零波及。
- 割接完成后裸 `up -d`（四服务）恢复安全：caddy 无变化时 no-op。

## 3. 运行纪律（手动管理的护栏）

- **永远 per-service 操作**：`docker compose up -d <svc>` / `stop <svc>` /
  `restart <svc>`。**禁止裸 `docker compose down`**——合并后其爆炸半径 =
  数据面 + 路由面全站（独立 /srv/edge 方案"down 只伤一平面"的保护，已
  让渡给本纪律）。
- up 之前想清楚改了哪个服务的定义，就 up 哪个。
- 变更前通告消费项目：数据面 → read-pal、anynote；边缘 compose 级变更 →
  所有接入站点。
- compose 项目名 `infra` **不可更名**（如 platform）——数据面零重建收养
  依赖容器标签匹配，更名需整体重建一次。

## 4. 未来变更 runbook（手动触发，平台组）

| 变更类型 | 流程 |
| --- | --- |
| 数据面（镜像升级/参数调整） | 通告两消费项目 → 改 compose 对应服务（或 `pull`）→ `up -d <svc>` → 两项目健康检查 → **回写 canonical** |
| 边缘-片段级（高频，无需窗口） | 各项目 CD 自行 cp + validate + reload（契约见 ops/edge/README.md，平台组不参与） |
| 边缘-compose 级（低频） | 通告所有接入站点 → 改 caddy 服务定义/骨架 → `up -d caddy`（秒级全站抖动，低峰执行）→ **回写 canonical**（骨架即 files/Caddyfile） |

**回写纪律**：`/srv/infra` 任何现场改动同步回本目录 `files/`——双向单一
真源对，冲突以仓库版为准。

## 5. 关联事项（不在本方案内）

- infra 公网端口收紧（postgres 35551 / redis 35552 / minio 9000-9001 均
  0.0.0.0 直出）：**已提权为 [edge PLAN](../edge/PLAN.md) 的 C-6**（C-4
  验收后立即执行；回环绑定而非直接关闭——宿主工具走 127.0.0.1、开发机走
  SSH 隧道）。消费方已实测：两项目全部走容器 DNS/别名（infra-postgres 在
  shared-infra 带别名 `postgres`，anynote 的 postgres/minio/redis 短名即
  此），公网消费方仅剩人工；宿主 backup.sh 的 `-h infra-postgres` 因
  /etc/hosts 无条目本就无法解析（从未跑通），C-6 顺带修正。
- read-pal 侧迁移全流程：[ops/edge/PLAN.md](../edge/PLAN.md)（A0/B/C/D）。
- 项目接入（shared-infra 消费 / edge 片段）：[ops/edge/README.md](../edge/README.md)。
- 平台件继续增多时，/srv/infra 可迁独立 ops 仓库；接入契约（网络 + 片段）
  不变。
