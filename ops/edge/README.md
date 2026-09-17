# VPS 公共边缘（edge-caddy）接入手册

> 面向在 175.178.66.207 这台 VPS 上部署项目的**所有项目组及其开发 agent**。
> 单一 Caddy 容器（`edge-caddy`）反代全 VPS 项目：TLS 证书自动签续、
> 每项目一个路由片段、HTTP/3 默认开启。
>
> 本手册 canonical 版本在 read-pal 仓库 `ops/edge/README.md`（平台
> caretaker），现场拷贝 `/srv/infra/README.md`。冲突时以仓库版为准。

## 架构一页图

```
Client → edge-caddy（/srv/infra 平台层, 0.0.0.0:80/443/443udp, 唯一公网入口）
           ├─ Caddyfile 骨架: 全局选项 + import sites/*.caddy
           ├─ sites/<project>.caddy ← 各项目 CD 从各自仓库拷贝（只读挂载）
           └─ 按 Host 分流 → edge-net 上的 <project>-<service> 别名 → 各项目容器
```

- 边缘容器 `edge-caddy` 属平台层 `/srv/infra/`（与 PostgreSQL/Redis/MinIO
  同一 compose project `infra`），**平台组（read-pal 仓库 ops/）维护，
  项目组只读**；平台运维纪律（per-service 操作、禁裸 down）见
  `ops/infra/PLAN.md`。
- 项目侧需要的全部东西：edge-net 别名 + 仓库内一个片段文件 + CD 里一个
  收敛钩子。不需要证书配置、不需要公开端口、不需要动 `/srv/infra`。

## 三条硬性不变式（违反即全站风险）

1. **片段归仓库**：你的路由配置只存在于你仓库的片段文件（建议
   `docker/edge.caddy`），由你的 CD 拷贝到 `/srv/infra/sites/<project>.caddy`。
   **永远不要手改 `/srv/infra/sites/` 下的文件**——下次部署会静默覆盖，且
   手改内容无版本、无评审。
2. **validate + reload，永不 restart**：配置变更只允许
   `caddy validate` 通过后 `caddy reload`（原子、优雅、不掐连接）。坏片段
   会被拒、旧配置继续服务（你的最坏结果是"没生效"，不是全站下线）。
   `docker restart edge-caddy` 仅平台组在维护窗口可用。
3. **上游只用 edge-net 别名**：`reverse_proxy <project>-<service>:<port>`。
   Caddy 按连接拨号解析，容器重建换 IP 自动自愈——不要写容器 ID、宿主
   IP、docker0 网关地址。

## 接入步骤（项目组 checklist）

前置：一个指向本 VPS 的域名（子域即可；国内访问需已备案域名，否则走
IP 直连方案需与平台组确认）；服务是 HTTP(s)（TCP 服务不收编，见"边界"）。

**第 1 步 — 注册别名（全局唯一，先到先得）**

向平台组确认后，在接入 PR 里登记到下表（防撞名）：

| 别名 | 项目 | 容器 |
| --- | --- | --- |
| readpal-api / readpal-web | read-pal | api / web |
| wt-api | what-to-eat | api |

**第 2 步 — 项目 compose 加入 edge-net 并声明别名**

```yaml
services:
  api:                      # 你的对外服务（可多个, 各自加别名）
    networks:
      default: {}
      edge-net:
        aliases: [<project>-api]      # 与登记表一致

networks:
  edge-net:
    external: true
```

加网络 = 容器重建，安排一次计划内发布。**被反代的服务不要再发布公网
端口**（确需宿主访问则绑 `127.0.0.1:`）。

**第 3 步 — 仓库内写片段 `docker/edge.caddy`**

模板（只允许 site 块；多域名/多服务就在文件里写多个 site 块）：

```caddyfile
# <project> edge fragment — 只写 site 块, 全局选项归骨架（不变式见 README）
<project>.chishenma.top {
	encode gzip

	# API — 流式接口（SSE/长轮询）用 flush_interval -1；后端读 X-Real-IP 则显式回传
	handle /api/* {
		reverse_proxy <project>-api:8000 {
			header_up X-Real-IP {remote_host}
			flush_interval -1
		}
	}

	# 前端
	reverse_proxy <project>-web:3000
}
```

常用对照：上传限制 `request_body { max_size 50MB }`；安全响应头
`header { X-Frame-Options DENY ... }`；路径重写
`uri strip_prefix /xxx` + `rewrite * /yyy{path}`；缓存头
`header Cache-Control "public, max-age=604800"`。

**第 4 步 — DNS**

域名 A 记录指向 VPS IP。证书由 Caddy 在 reload 后自动签发（ACME，
首个请求可能延迟数秒，curl 重试即可）。无需任何证书配置。

**第 5 步 — CD 收敛钩子（片段变更时执行；read-pal 的 deploy.yml 已内置）**

```bash
cp docker/edge.caddy /srv/infra/sites/<project>.caddy
docker exec edge-caddy caddy validate --config /etc/caddy/Caddyfile \
  && docker exec edge-caddy caddy reload --config /etc/caddy/Caddyfile
```

validate 失败要让部署**报错退出**（别吞）——边缘仍在跑你的旧配置，但
失败必须可见。首次接入此命令需人工执行一次（见平台组的迁移 PLAN）。

**第 6 步 — 验证**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://<project>.chishenma.top/<健康路径>   # 200
curl -s -D - -o /dev/null https://<project>.chishenma.top/ | head -20                 # 路由与 header 符合片段
docker exec edge-caddy caddy validate --config /etc/caddy/Caddyfile && echo OK        # 组装后配置有效
```

外加该项目自己的 e2e（对生产入口）。

## 禁止事项（每条都有对应的真实事故模式）

- ❌ 手改 `/srv/infra/` 下任何平台文件（`sites/*`、`Caddyfile`、`docker-compose.yml`、`init-db.sh`）
- ❌ 对 `/srv/infra` 执行任何 docker compose 操作（up/down/restart，含仅针对 caddy 的——平台组专属，见运维纪律）
- ❌ 片段里写全局选项块、其他项目的别名、或引用其他项目片段
- ❌ 给被反代的服务发布 `0.0.0.0` 端口（绕过边缘 = 绕过 TLS/header/审计）
- ❌ 在片段外（宿主 iptables、其它代理层）做第二套路由

## 故障排查

| 症状 | 排查顺序 |
| --- | --- |
| reload 报错 | 错误信息指向的片段行号；修复后重跑钩子。期间旧配置仍在服务 |
| 502 Bad Gateway | ① `docker exec edge-caddy wget -qO- http://<alias>:<port>/` 别名是否可达 → ② 项目容器是否 healthy → ③ 片段端口/路径是否写对 |
| 证书告警 | DNS 是否指向本 VPS；`docker logs edge-caddy --tail 50`（ACME 挑战失败会写明原因） |
| 我的路由没生效 | `docker exec edge-caddy caddy list-modules`/对比 `/srv/infra/sites/<project>.caddy` 与仓库文件是否一致（CD 是否跑了钩子） |
| 边缘容器 unhealthy | 平台组警报（check.py `containers_healthy`）会自动触发；项目组无需自建边缘监控 |

## 平台边界

- **平台层 = `/srv/infra` 单一 compose project（数据面 PostgreSQL/Redis/
  MinIO + 边缘 edge-caddy）**，平台组手动管理、不随任何项目 CD 收敛。
  项目消费基础服务仍是老模式：compose 里加入 `shared-infra` external 网络
  即可。平台运维纪律（per-service 操作、禁裸 down）与变更流程见
  `ops/infra/PLAN.md`。
- **收编范围**：HTTP(S) 站点。裸 TCP（数据库、Redis、gRPC 非 HTTP）不进
  反代——它们走各自网络安全策略（infra 公网端口收紧是独立工作项）。
- **骨架 vs 片段**：全局选项（default_sni、admin、http_port）只在骨架；
  项目策略只在片段。中间地带（如全站默认 header）由平台组评审后入骨架。
- **变更窗口**：`/srv/infra` 的 caddy 服务定义/骨架变更（重建边缘容器，
  秒级全站抖动）只由平台组在低峰执行并提前通告；项目片段 reload 无需窗口。
- **升级路径**：平台件继续增多时，`/srv/infra` 可迁独立 ops 仓库（或再
  分层）；接入契约（网络 + 片段）不变。⚠ compose 项目名 `infra` 不可随意
  更名——数据面容器的零重建收养依赖标签匹配。
