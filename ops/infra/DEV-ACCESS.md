# 开发机访问手册（PG / Redis / MinIO）

> 适用：C-6 公网收紧（127.0.0.1 回环绑定）生效后，开发机上的数据库管理
> 工具（DBeaver / HexHub / Another Redis DeskManager 等）与 MinIO 控制台
> 的访问方式。公网直连被拒（connection refused）是**设计行为**，不是故障。
>
> 2026-09-18 实测状态：三服务 healthy、本机全通、四端口仅监听 127.0.0.1。

## 原理

C-6 把 infra 端口从 `0.0.0.0` 收紧为 `127.0.0.1`（PG 曾是 trust 认证 +
公网直出 = 任何人可免密连生产库）。回环绑定意味着**只有 VPS 本机进程和
经 SSH 进入的转发**可达——SSH 隧道是设计好的开发机替代路径，安全性由
SSH 密钥承载。

## 一次性配置（写进 ~/.ssh/config，专用隧道别名）

⚠ 用**专用别名**（如 `tencent-tunnel`），不要把 LocalForward 挂在主别名
`tencent-cloud` 下——否则隧道常驻时，任何普通 `ssh tencent-cloud` 交互
会话都会因端口已被占用而启动失败（ExitOnForwardFailure 时直接退出）。

```
Host tencent-tunnel
  HostName 175.178.66.207
  User ubuntu
  IdentityFile ~/.ssh/tencent_ubuntu_key
  ServerAliveInterval 30
  ServerAliveCountMax 3
  ExitOnForwardFailure yes
  LocalForward 35551 127.0.0.1:35551   # PostgreSQL
  LocalForward 35552 127.0.0.1:35552   # Redis
  LocalForward 9000  127.0.0.1:9000    # MinIO S3 API
  LocalForward 9001  127.0.0.1:9001    # MinIO 控制台
```

起隧道：`ssh -f -N tencent-tunnel`（-f 后台、-N 只转发不开 shell）。
停止：`pkill -f 'ssh -f -N tencent-tunnel'` 或 kill 监听进程。断网/重启后
重跑起隧道命令即可。

临时一次性（不写 config）：

```bash
ssh -N -L 35551:127.0.0.1:35551 -L 35552:127.0.0.1:35552 \
       -L 9000:127.0.0.1:9000 -L 9001:127.0.0.1:9001 tencent-cloud
```

## 工具连接参数（隧道起好后，全部连 localhost）

| 目标 | 参数 |
| --- | --- |
| PostgreSQL（read-pal 库） | `localhost:35551`，db `readpal`，user `readpal`，密码**留空**（trust 认证，隧道即边界） |
| PostgreSQL（anynote 库） | 同上，database 换 `anynote` |
| Redis | `localhost:35552`，无密码 |
| MinIO 控制台 | 浏览器 `http://localhost:9001`（minioadmin/minioadmin） |
| MinIO S3 API | `http://localhost:9000` |

## 已知坑

- **本地 9000 端口冲突**（macOS 的 php-fpm、Portainer 常占）：`lsof -i :9000`
  先查；冲突则换本地端口映射 `-L 19000:127.0.0.1:9000`，客户端连
  `localhost:19000`。
- DBeaver/工具的连接配置从此**固定指向 localhost**，换网络环境无需改动；
  变的只是隧道是否在线。
- 隧道断开工具会报同样的 connection refused——先 `ssh -N tencent-cloud`。

## 长期替代（可选）：Tailscale 直连

多机/多网络的日常重度使用推荐。核心决策：**端口回 0.0.0.0 + 腾讯云安全组
封公网入站（B2-a），不要用"回环 + 追加 100.x 绑定"（B2-b）**——B2-b 下
docker 绑定要求 100.x 在容器启动时已存在，VPS 重启时 tailscaled 异步分配
地址晚于 docker 会让数据面容器起不来；用 systemd 强行排序则 tailscale 掉
线会升级为全站 docker 不可用。B2-a 下 tailnet 流量走 WireGuard 到达
tailscale0（目的地址 100.x，0.0.0.0 监听自然接收，不经过云安全组），公网
则被安全组拦截。

落地：① tailscale.com 注册（免费版够用），后台生成 auth key；② VPS
`curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up
--auth-key=... --hostname=vps-readpal`，后台**关闭该节点 key expiry**（默认
90 天过期即静默掉网）；③ compose 四端口回 0.0.0.0 + `up -d postgres redis
minio`（秒级重建，通告两项目）+ **腾讯云安全组删除 35551/35552/9000/9001
公网入站放行**（C-6 前公网可达的根源即这些规则）+ 回写 canonical；④ 开发
机 `brew install tailscale && tailscale up`，工具直连 `100.x.y.z` 四端口，
SSH 隧道保留作冗余备用路径；⑤ 可选强化：Tailscale ACL 仅放行自己的设备、
MagicDNS、SSH 也走 tailnet 后安全组收紧 22。

注意事项：国内控制面可达，节点间通常 UDP 直连，退化为 DERP 中继时延迟
~50-100ms（DB 工具够用）；安全控制点从"宿主回环绑定"变为"安全组 +
tailnet 准入"（层数不减，但少一层主机侧防护——用 ACL 补偿）；采纳后本
手册与 edge PLAN C-6 的端口叙事需同步更新。

## 不做什么

- 不要把端口绑定改回 `0.0.0.0` "图省事"——那会重新打开 trust-auth PG +
  无密码 Redis + 默认凭据 MinIO 的公网暴露（C-6 关闭前的现存最高危洞）。
  真有直连刚需，先补齐真实凭据（pg scram / requirepass / MinIO 强密钥）
  + 安全组 IP 白名单，再评估。
