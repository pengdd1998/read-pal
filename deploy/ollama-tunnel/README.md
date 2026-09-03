# Prod embedding via SSH reverse tunnel to Mac Ollama (bge-m3)

The VPS cannot host Ollama (3.7GB RAM / disk limits), but book_chunks is
a 100% bge-m3 vector space — the QUERY side must embed with the same
model or cosine similarity is garbage. A reverse tunnel exposes the
owner's Mac Ollama to the VPS on the compose network gateway.

## Setup (done 2026-09-03)

1. **VPS sshd** (`/etc/ssh/sshd_config`, backup at `sshd_config.bak-tunnel`):
   `GatewayPorts clientspecified` — lets the tunnel bind a non-loopback
   address (the docker bridge gateway) so containers can reach it.
   Not exposed publicly (cloud security group doesn't open 11434).

2. **Mac launchd** (`~/Library/LaunchAgents/com.readpal.ollama-tunnel.plist`,
   template in this directory): `ssh -N -R 172.19.0.1:11434:localhost:11434`
   with ServerAlive keepalives, KeepAlive=true (auto-reconnects).

3. **VPS `.env`**:
   `EMBEDDING_BASE_URL=http://172.19.0.1:11434/v1`, `EMBEDDING_MODEL=bge-m3`,
   `EMBEDDING_API_KEY=` (empty — auth header falls back to the GLM key,
   which Ollama ignores).

4. `docker compose up -d --force-recreate api` (compose does not detect
   .env-only changes on plain `up -d`).

## Degradation contract

Mac offline → prod embedding calls fail → semantic search returns []
→ RAG degrades to keyword-only (graceful, same as pre-tunnel). Nothing
crashes. Verify with:
`docker logs read-pal-api-1 | grep "Embedding batch success"`

## Notes

- The compose network gateway IP (172.19.0.1) is stable while the
  network exists; if it ever changes, update the plist bind address and
  the VPS .env together.
- GLM embedding-3 is the settings-level fallback and stays quota-dead;
  do NOT remove the tunnel without re-embedding the library (query and
  stored vectors must always use the same model).
