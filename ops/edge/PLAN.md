# 单一 Caddy 边缘（edge-caddy）落地方案 — read-pal 迁移

> 决策（2026-09-17）：放弃 edge-nginx 两层方案（已废弃删除），收敛为
> **单一 Caddy 容器反代 VPS 全部项目**；同日进一步确认 **caddy 并入
> /srv/infra 平台层**（与 PostgreSQL/Redis/MinIO 同一 compose project
> `infra`，原独立 /srv/edge compose 方案撤销——中立化后"anynote CD 顺带
> 收敛全站边缘"的反对前提消失，残余权衡与运行纪律见
> [ops/infra/PLAN.md](../infra/PLAN.md) §3）。技术依据：域名易变史 +
> 备案期 IP 回退只有 Caddy 原生自动化；what-to-eat 已验证单层模式；上游
> 按连接拨号自愈免去 nginx 的 DNS 技巧；终态少一个组件、一跳、双 gzip 空转。
>
> 本文档 = read-pal 迁移执行方案（A0/B/C/D）。**平台规则与多项目接入手册
> 在 [README.md](README.md)**——三不变式、片段模板、CD 钩子契约都以
> README 为准，本文不重复。平台容器的 canonical 配置
> （四服务 compose + Caddyfile 骨架）与平台运维方案在
> [ops/infra/](../infra/)。

- 状态：方案定稿，未实施
- 数据面容器零影响（caddy 与数据面同 compose，但收养/并入均 per-service
  操作，数据面三服务 config hash 不变、零重建）；what-to-eat 需两次小改动
  （A0 网络、A 后清理）
- 替代并废弃：`ops/edge-nginx/`（已删除）；独立 `/srv/edge` compose
  （被"并入 /srv/infra"取代）

## 决策记录（2026-09-17）

1. **Caddy 并入 shared-infra**：评估初版结论是"不并入"，核心依据为
   anynote CD（cd.yml:204）每次部署 `docker compose -f infra/docker-compose.yml
   up -d` 收敛该文件——并入后全站边缘生命周期随另一项目部署节奏起落，
   复刻"边缘被单一项目拥有"问题（今天 Caddy 挂在 what-to-eat 名下）。
   **同日撤回**：用户决策 infra 中立化（手动触发）后此前提消失；残余权衡
   （裸 down 爆炸半径 = 数据面+路由面；语义混杂）以运行纪律接受（禁裸
   down、per-service 操作、文件内分区注释，见 ops/infra/PLAN.md §3）。
   最终：**并入，compose 项目名保持 `infra`**——数据面零重建收养依赖
   容器标签（project=infra）匹配，更名（如 platform）需整体重建一次。
2. **shared-infra 中立化**：公共基础服务变动少，配置从 anynote 仓库独立
   至 `/srv/infra` 手动管理，与 caddy 并入合并为单一平台方案
   [ops/infra/PLAN.md](../infra/PLAN.md)（第一部分数据面收养 = 本方案
   阶段 A 的前置）。

## 0. 现状锚点（2026-09-17 SSH 实测）

| 事实 | 位置/值 |
| --- | --- |
| Caddy 容器 | `what-to-eat-edge-1`（caddy:2），属 compose project `what-to-eat`，服务名 `edge`（/srv/what-to-eat/docker-compose.yml:56），0.0.0.0:80/443/443udp |
| Caddyfile | /srv/what-to-eat/deploy/Caddyfile（单文件 bind-mount）；三站点：chishenma.top（含 /api/admin 403，`reverse_proxy api:8000`）、read.chishenma.top 与 IP 站点（哑转发 172.17.0.1:8090）；read-pal 接入系手改宿主文件完成（.bak-readpal 为证） |
| 证书卷 | 命名卷 `what-to-eat_caddy-data` / `what-to-eat_caddy-config` |
| read-pal nginx | compose 内服务，0.0.0.0:8090，bind-mount docker/nginx.conf，部署 rebuild 后 `docker compose restart nginx`（deploy.yml:238-243） |
| 应用读 X-Real-IP | packages/server/app/utils/request_identity.py:37（**Caddy 默认不传，片段必须 header_up 显式回传**） |
| FRONTEND_URL | .env 已是 `https://read.chishenma.top`（免改） |
| CORS_ORIGINS | .env 含 `http://175.178.66.207:8090`（阶段 C 清理该行，其余保留） |
| infra 容器名 DNS | DB_HOST=infra-postgres、REDIS_URL=redis://infra-redis:6379（/covers/ 直连 infra-minio:9000 同模式成立） |
| 部署健康检查 | deploy.yml check_health 打 `http://localhost:8090/...`（阶段 C 换 --resolve https） |

## 阶段 A0 — 网络预备（无边缘变更，read-pal + what-to-eat 各一个小改动）

1. VPS 一次性：`docker network create edge-net`（同时是 infra 数据面收养
   的前置——canonical compose 顶层声明它 external；见
   [ops/infra/PLAN.md](../infra/PLAN.md) 第一部分 ②）
2. read-pal PR（compose 改动）：
   ```yaml
   api:
     networks:
       default: {}
       shared-infra: {}
       edge-net: { aliases: [readpal-api] }
   web:
     networks:
       default: {}
       edge-net: { aliases: [readpal-web] }
   networks:
     shared-infra: { external: true }
     edge-net: { external: true }
   ```
   部署副作用：compose 变更触发 REBUILD_API → 现有逻辑自动 restart nginx
   （静态 DNS 自愈）——当次部署有一次秒级边缘抖动，属预期。
3. what-to-eat（由该项目组/agent 执行，改动同型）：api 服务加
   `edge-net: { aliases: [wt-api] }`；其容器重建，what-to-eat 短暂闪断一次。
   完成前不得进入阶段 A（chishenma.top 上游将改为 wt-api 别名）。

验收：`docker network inspect edge-net` 三组别名齐全；两项目功能正常。

## 阶段 A — Caddy 并入 /srv/infra（边缘容器归位）

前置：[ops/infra/PLAN.md](../infra/PLAN.md) 第一部分（数据面收养）已验收；
A0 已完成（wt-api 可解析）。配置语义不变，唯一差异 = chishenma.top 上游
`api:8000` → `wt-api:8000`（网络搬家所致）。

```bash
# 1) 边缘文件落位（骨架 canonical: ops/infra/files/Caddyfile——阶段 B 才用;
#    本阶段先原样迁移现配置）
cd /srv/infra && mkdir -p sites caddy-data caddy-config
cp /srv/what-to-eat/deploy/Caddyfile /srv/infra/Caddyfile
#    编辑 /srv/infra/Caddyfile: api:8000 → wt-api:8000
# 2) 证书/运行数据迁移（不重签, 避开 ACME 延迟与限额）
docker run --rm -v what-to-eat_caddy-data:/from -v /srv/infra/caddy-data:/to \
  alpine sh -c 'cp -a /from/. /to/'
docker run --rm -v what-to-eat_caddy-config:/from -v /srv/infra/caddy-config:/to \
  alpine sh -c 'cp -a /from/. /to/'
# 3) 割接（秒级窗口, 80/443 换容器; 先停旧再起新, 避免端口冲突）
cd /srv/what-to-eat && docker compose stop edge
cd /srv/infra && docker compose up -d caddy     # 仅创建 caddy, 数据面三容器不动
```

验收（三站点逐项）：
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://chishenma.top/            # 200
curl -s -o /dev/null -w '%{http_code}\n' https://read.chishenma.top/en     # 200
curl -sk -o /dev/null -w '%{http_code}\n' https://175.178.66.207/en        # 200（IP 自签, -k）
curl -s -o /dev/null -w '%{http_code}\n' https://chishenma.top/api/admin/x # 403（策略随迁）
docker logs edge-caddy 2>&1 | grep -ci 'certificate obtained'              # 0（未重签）
docker ps --format '{{.Names}} {{.RunningFor}}' | grep infra-              # 数据面 StartedAt 不变
```

观察 48h 后清理：what-to-eat compose 删除 `edge` 服务定义与两个 caddy 卷
声明（该项目组执行）；`/srv/what-to-eat/deploy/Caddyfile*` 归档。

回退：`cd /srv/infra && docker compose stop caddy` → `cd /srv/what-to-eat
&& docker compose up -d edge`（证书数据仍在其命名卷，完整回得去）。

## 阶段 B — 骨架/片段拆分 + read-pal CD 钩子（行为不变的结构改造）

1. `/srv/infra/Caddyfile` 换成骨架（canonical `ops/infra/files/Caddyfile`
   ：default_sni + import），`docker compose up -d caddy`（挂载点变化重建
   caddy 容器，秒级窗口，数据面不动）。
2. 片段落位（**过渡形态，仍是哑转发**）：
   - 仓库新增 `docker/edge.caddy`：
     ```caddyfile
     # read-pal edge fragment — 过渡形态（阶段 C 改为最终路由）
     read.chishenma.top, 175.178.66.207 {
         encode gzip
         reverse_proxy 172.17.0.1:8090
     }
     ```
   - 首次人工落位：`cp docker/edge.caddy /srv/infra/sites/readpal.caddy`；
     what-to-eat 块由平台组存为 `/srv/infra/sites/wte.caddy`（宿主过渡，
     阶段 D 移交其仓库）。
   - `docker exec edge-caddy caddy validate --config /etc/caddy/Caddyfile &&
     docker exec edge-caddy caddy reload --config /etc/caddy/Caddyfile`
3. deploy.yml（步骤 2 flag 区 + 步骤 5）：
   ```bash
   EDGE_FRAG_CHANGED=false
   echo "$CHANGED" | grep -qE '^docker/edge\.caddy$' && EDGE_FRAG_CHANGED=true
   # ...步骤 5:
   if [ "$EDGE_FRAG_CHANGED" = true ]; then
     echo ">>> Edge fragment changed — converge + atomic reload..."
     cp docker/edge.caddy /srv/infra/sites/readpal.caddy
     docker exec edge-caddy caddy validate --config /etc/caddy/Caddyfile
     docker exec edge-caddy caddy reload --config /etc/caddy/Caddyfile
   fi
   ```
   （nginx restart 块此阶段保留——nginx 仍在链路上。）

验收：改一行片段触发部署，日志出现 validate+reload 且新配置生效；三站点
行为不变。回退：revert PR（CD 钩子会把旧片段拷回去）或人工 cp 回旧内容。

## 阶段 C — read-pal 路由移植 + nginx 下线（核心割接）

### C-1 最终片段（仓库 `docker/edge.caddy` 全文）

```caddyfile
# read-pal edge fragment — 最终形态。规则见 ops/edge/README.md 三不变式。
# 两地址：正式域名 + 备案期 IP 直连回退（行为一致）。
read.chishenma.top, 175.178.66.207 {
	encode gzip

	# EPUB/PDF 上传
	request_body {
		max_size 50MB
	}

	# 安全响应头（与 web 的 next.config.js headers() 双写——收紧 CSP 两处同改）
	header {
		X-Frame-Options DENY
		X-Content-Type-Options nosniff
		X-XSS-Protection "1; mode=block"
		Referrer-Policy strict-origin-when-cross-origin
		Permissions-Policy "camera=(), microphone=(), geolocation=()"
		Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
		Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://open.bigmodel.cn; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';"
	}

	# API v1 直通。SSE：立即 flush、体流无读超时（对齐 nginx buffering off/300s）
	# （handle 块按书写顺序匹配, 更具体的 @apiv1 必须在前）
	@apiv1 path /api/v1/*
	handle @apiv1 {
		reverse_proxy readpal-api:8000 {
			header_up X-Real-IP {remote_host}
			flush_interval -1
			transport http {
				response_header_timeout 300s
			}
		}
	}

	# API（无版本前缀）→ /api/v1/*（前端历史兼容；dev/prod 分叉之债另案）
	handle /api/* {
		uri strip_prefix /api
		rewrite * /api/v1{path}
		reverse_proxy readpal-api:8000 {
			header_up X-Real-IP {remote_host}
			flush_interval -1
			transport http {
				response_header_timeout 300s
			}
		}
	}

	# 封面 — MinIO 内网直读（消除原公网 IP 硬编码, ops-security 存量 finding）
	handle /covers/* {
		uri strip_prefix /covers
		rewrite * /read-pal/covers{path}
		header Cache-Control "public, max-age=604800"
		reverse_proxy infra-minio:9000
	}

	# 前端 — Next.js standalone
	reverse_proxy readpal-web:3000
}
```

### C-2 影子验证（割接前, 生产无感）

```bash
# 新片段先落位（不会影响生产: 边缘只在被 reload 时读新配置）
cp docker/edge.caddy /srv/infra/sites/readpal.caddy
# 影子 Caddy：同 sites 目录、独立全局（关自动 HTTPS、监听 8080）
cat > /tmp/Caddyfile.shadow <<'EOF'
{
	auto_https off
	http_port 8080
}
import /srv/infra/sites/*.caddy
EOF
docker run -d --rm --name edge-shadow -p 127.0.0.1:8080:8080 \
  --network edge-net \
  -v /tmp/Caddyfile.shadow:/etc/caddy/Caddyfile:ro \
  -v /srv/infra/sites:/etc/caddy/sites:ro caddy:2
# docker run 不支持可靠的多 --network（实测 VPS 29.1.3: conflicting
# options 报错）——第二个网络起容器后补挂
docker network connect shared-infra edge-shadow
# 验证（Host 分流到新路由; web 走 readpal-web 别名, API 走 readpal-api）
curl -s -H 'Host: read.chishenma.top' -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/api/v1/health   # 200
curl -s -H 'Host: read.chishenma.top' -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/en              # 200
curl -s -H 'Host: read.chishenma.top' -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/api/auth/me     # 401（v1-less 重写后到达 v1）
curl -s -H 'Host: read.chishenma.top' -D - -o /dev/null http://127.0.0.1:8080/en | grep -i content-security-policy
curl -s -H 'Host: read.chishenma.top' -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:8080/covers/<真实封面路径>"  # 200
docker rm -f edge-shadow
```
注意：影子期生产边缘仍在跑旧哑转发——`/srv/infra/sites/readpal.caddy` 的
新内容只在下一步 reload 时生效。外加一次真实 companion 流式对话验证 SSE。

### C-3 割接 PR（一次部署完成）

1. `docker/edge.caddy` = C-1 最终片段。
2. `docker-compose.yml` 删除 nginx 服务；删除 `docker/nginx.conf`。
3. deploy.yml：
   - 删除 nginx restart 块；**EDGE_FRAG 钩子整体上移到 `docker compose
     up -d` 之前**（顺序即正确性——割接零窗口的关键，评审修订 2026-09-17）：
     ① 拷贝+validate+reload：流量先切到别名直连（readpal-api/web 自 A0
     起就存在，不依赖 nginx；nginx 仍存活但瞬间无流量）；
     ② `up -d --remove-orphans`：移除 nginx（已无流量走 8090，零感知。
     删除 nginx 服务不改变 api/web 的 config hash——它们的重建只由镜像
     更新驱动，与常规部署一致，Caddy 按连接拨号自动跟上新 IP）；
     ③ 健康检查（--resolve 形式，打边缘新路由）。
     validate 意外失败时部署在 up 之前中止——旧链路（哑转发+nginx）完好
     无损，线上零影响（严格优于 up→reload 顺序：后者在 up 与 reload 之间
     有全站 502 窗口，且 validate 失败时窗口无限期）。
   - `check_health` 与 `rollback` 的 URL 换为新目标，curl 加
     `--resolve read.chishenma.top:443:127.0.0.1`：
     `https://read.chishenma.top/api/v1/health`、`https://read.chishenma.top/en`
     （真 ACME 证书, 无需 -k）。
   - `rollback()` 在 `up -d` 后追加片段回收敛（checkout 已随回滚重置。
     顺序与主流程相反是**刻意的**——回滚方向需 nginx 先就位再 reload 回
     哑转发，同 C-5 原理）：
     ```bash
     cp docker/edge.caddy /srv/infra/sites/readpal.caddy \
       && docker exec edge-caddy caddy validate --config /etc/caddy/Caddyfile \
       && docker exec edge-caddy caddy reload --config /etc/caddy/Caddyfile || true
     ```
   - dry_run 描述 "no nginx restart" → "no edge reload"。
4. VPS `.env`：CORS_ORIGINS 删除 `http://175.178.66.207:8090`（其余保留）。
5. GitHub secret `ALERT_EXTERNAL_URL` → `https://read.chishenma.top/api/v1/health`。
6. README.md:17,38,120 demo 链接 `http://175.178.66.207:8090` →
   `https://read.chishenma.top`。
7. docker/RESTORE.md §2 "Leave nginx running" 措辞改为 edge-caddy
   （恢复期边缘持续 502 属正确行为, 无需操作）。

### C-4 验收

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://read.chishenma.top/api/v1/health   # 200
curl -s -o /dev/null -w '%{http_code}\n' https://read.chishenma.top/en              # 200
curl -s -o /dev/null -w '%{http_code}\n' https://read.chishenma.top/api/auth/me     # 401（v1-less 重写存活）
curl -s -D - -o /dev/null https://read.chishenma.top/en | grep -i content-security-policy # CSP 在
curl -s -o /dev/null -w '%{http_code}\n' "https://read.chishenma.top/covers/<真实封面路径>"          # 200
curl -sk -o /dev/null -w '%{http_code}\n' https://175.178.66.207/en                 # 200（IP 回退存活）
curl -m 5 http://175.178.66.207:8090/ && echo UNEXPECTED || echo "8090 已关闭(预期)"
docker ps --format '{{.Names}}' | grep -c nginx                                     # 0
```
仓库内 playwright e2e（生产入口）全绿；手动触发 alert workflow（site_up +
containers_healthy 绿——edge-caddy 有 healthcheck, 已被纳入）；24h 观察
`docker logs edge-caddy` 无 upstream 错误。

X-Real-IP 生效验证（复审修订：它是发给上游的**请求**头，响应头里永远没有，
不要在响应里 grep）：外部请求任一 API 后查 api 侧结构化日志，确认 client IP
为真实公网 IP 而非边缘容器 IP——若 header 丢失，
`request_identity.py:37` 会回退到 socket peer（= caddy 容器 172.x），
限流键将坍缩为单桶。

### C-5 回退（revert 即可, 双向零窗口）

revert 割接 PR → push 触发部署。revert 恢复的是割接**前**的 deploy.yml 文本
（EDGE_FRAG 钩子在 `up -d` 之后的阶段 B 顺序）——恰好是回退方向需要的顺序：
① `up -d`：重建 nginx（绑 8090；此刻边缘仍在跑新片段，流量走别名，不受
影响）；② 钩子把 revert 后的哑转发片段（172.17.0.1:8090）拷回并 reload
（此时 nginx 已就位）；③ 健康检查回到 localhost:8090 形式通过。无需人工
顺序约束——**割接与回退各自使用适合自身方向的顺序，且都由 PR 文本自动
携带**（割接 PR 把钩子上移，revert 自动还原为下置）。

### C-6 — infra 公网端口收紧（C-4 验收后的立即动作；提权自"独立工作项"）

现状是全 VPS 最高危暴露：PG 35551 **trust 认证**、Redis 35552 **无密码**、
MinIO 9000/9001 **minioadmin 默认凭据**，全部 0.0.0.0 直出。

C-4 完成即具备执行条件（/covers/ 内网化使 9000 的浏览器消费方清零）。
消费方事实（2026-09-17 实测）：

- anynote：`MINIO_ENDPOINT=minio:9000`、`DATABASE_URL=...@postgres:5432`、
  `REDIS_URL=redis://redis:6379`——全部容器 DNS/别名（infra-postgres 在
  shared-infra 上带别名 `postgres`），**不消费公网端口**；
- read-pal：`DB_HOST=infra-postgres` / `REDIS_URL=redis://infra-redis` 容器
  DNS；`/covers/` C 后走 shared-infra；
- 宿主 `docker/backup.sh`：`pg_dump -h infra-postgres`——**宿主 /etc/hosts
  无该条目，此路径当前根本无法解析**（RESTORE.md §6 自认 cron 未接线，
  从未真正跑通）——收紧时顺手修正，而非被收紧破坏；
- 开发机直连：唯一残余公网消费方（人工）→ SSH 隧道替代。

动作（平台组，按 ops/infra runbook 走 per-service）：

1. `/srv/infra/docker-compose.yml` 三个服务端口绑定改**回环**（不直接删除
   ——宿主工具经 127.0.0.1 保留可用）：
   `"127.0.0.1:35551:5432"`、`"127.0.0.1:35552:6379"`、
   `"127.0.0.1:9000:9000"`、`"127.0.0.1:9001:9001"`；
2. `docker compose up -d postgres redis minio`（三容器各一次重建，秒级；
   提前通告 read-pal 与 anynote）。**与收养零重建不冲突**：收养发生在先
   且要求 canonical 与现场一致，本步是收养后的显式变更，完成后**回写
   canonical**；
3. 验收：两项目健康；`nc -z -w3 175.178.66.207 35551`（及 35552/9000/
   9001）全部不通；宿主 `psql -h 127.0.0.1 -p 35551 -U readpal` 通；
4. read-pal 侧小 PR：`docker/backup.sh` 与 `docker/RESTORE.md` 的 DB 连接
   改 `127.0.0.1:35551`（修正从未跑通的解析断链）；
5. 开发机替代：`ssh -L 35551:127.0.0.1:35551 tencent-cloud`（Redis/MinIO
   同型）。

## 阶段 D — 模板化推广

1. what-to-eat：把 `/srv/infra/sites/wte.caddy` 移交其仓库（其 CD 加收敛
   钩子, 按平台 README 五步）。
2. anynote（compose project `any-note`）：评估收编——需域名与意愿确认；
   收编即关闭其 `0.0.0.0:36661` 直出。
3. infra 公网端口收紧：**已提权为 C-6**（C-4 验收后立即执行，回环绑定；
   消费方实测清单与 backup.sh 修正项见 C-6，不再是独立后置项）。
4. 平台 README 的别名登记表随接入滚动更新。

## 风险登记（Caddy 路线版）

| 风险 | 等级 | 缓解 |
| --- | --- | --- |
| what-to-eat 协调（A0 网络 + A 停旧 edge + 事后清理 compose） | 高 | 三处改动全部有确切 YAML/命令（本文）; 其无自动 CD（scripts 全手工, 实测）, 窗口好约; 阶段 A 回退路径保留其命名卷 |
| 证书卷迁移失败/丢失 | 中 | `cp -a` 迁移 + 验收断言"未重签"; 最坏自签/重签（LE 限额内, 3 张证书）, 不丢域名 |
| X-Real-IP 语义丢失（应用依赖, request_identity.py:37） | 已规避 | 片段显式 `header_up X-Real-IP {remote_host}`（Caddy 默认不传, 与 nginx 关键差异） |
| 割接时序（C-3 顺序） | 已消解 | 反转为 reload→up→check（评审修订 09-17）: 割接与 revert/rollback 双向零窗口——各方向用适合自身的顺序, 由 PR 文本自动携带; validate 失败时旧链路完好, 部署中止零线上影响 |
| infra 公网端口暴露（trust-auth PG 35551 / 无密码 Redis 35552 / 默认凭据 MinIO 9000-9001, 均 0.0.0.0） | 高（现状存量） | 提权为 C-6 立即项: 回环绑定（非直接关闭）保留宿主/隧道访问; 服务消费方实测全部走容器 DNS/别名; 顺带修正 backup.sh 从未跑通的解析断链 |
| Caddy handle 匹配顺序/重写细节 | 中 | 片段内注释钉死 @apiv1 在前; 影子四件套 + e2e 前置验证 |
| 8090 消费方残留 | 中 | C-3 第 4-6 项清单化（CORS/secret/README/书签）; FRONTEND_URL 已是域名（实测免改） |
| 裸 down 爆炸半径 = 数据面+路由面（并入的残余代价） | 低中 | 平台纪律: 永远 per-service 操作, 禁裸 down（ops/infra/PLAN.md §3）; 平台操作全部低频手动 |
| compose 项目名漂移（更名即破坏数据面零重建收养） | 低 | canonical 钉死 `name: infra` + 决策记录 1 + compose 头注三重提示 |
| 边缘单点 | 低中 | healthcheck + unless-stopped + check.py containers_healthy 自动覆盖 |
| Caddy 语法熟悉度 | 低 | 片段模板 + 常用对照表已入平台 README; RESTORE.md 同步改写 |

## 与废弃方案（edge-nginx）的资产继承

保留有效：三不变式（平移至平台 README）、割接"单次部署内闭合"时序原则、
rollback 片段回收敛、8090 公网关闭目标。作废：nginx.conf 重写（resolver/
变量 upstream/别名——Caddy 按连接拨号天然自愈）、8090 双绑定、edge-nginx
compose 及其"新项目接入需重建边缘"的代价（片段拷贝 + reload, 零重建）。
后续演变：独立 /srv/edge compose 方案（本文件早版）被"caddy 并入 /srv/infra"
取代——独立方案的"down 只伤一平面"保护由运行纪律（禁裸 down）承接。
