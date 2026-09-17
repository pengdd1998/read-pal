#!/usr/bin/env python3
"""read-pal alerting checks — runs on a GitHub Actions runner.

External probe covers total-VPS-loss; internal checks SSH into the VPS
(reusing the deploy key). Anti-flap state lives ON THE VPS so it
persists across runs: alert after 2 consecutive failures, 2h cooldown
per signal, resolve notice on recovery.

Stdlib only (urllib/subprocess/json) — no pip installs on the runner.

Env:
  VPS_HOST, VPS_USER, VPS_SSH_KEY (path)   — SSH access
  SERVERCHAN_SENDKEY                        — Server酱 channel
  EXTERNAL_URL (default http://175.178.66.207:8090/api/v1/health)
  DIGEST=1                                  — daily heartbeat mode
"""

from __future__ import annotations

import json
import os
import ssl
import subprocess
import sys
import time
import urllib.request

# No IP/host defaults: a missing env must fail loudly, not silently
# check some default target (empty-env silent-OK trap).
VPS_HOST = os.environ['VPS_HOST']
VPS_USER = os.environ.get('VPS_USER', 'ubuntu')
SSH_KEY = os.environ['VPS_SSH_KEY']
SENDKEY = os.environ.get('SERVERCHAN_SENDKEY', '')
EXTERNAL_URL = os.environ['EXTERNAL_URL']
STATE_PATH = '/var/lib/readpal-alert/state.json'
CONSECUTIVE_TO_ALERT = 2
COOLDOWN_S = 2 * 3600

SSH = ['ssh', '-i', SSH_KEY, '-o', 'StrictHostKeyChecking=accept-new',
       '-o', 'ConnectTimeout=15', f'{VPS_USER}@{VPS_HOST}']


def ssh(cmd: str, timeout: int = 30) -> str:
    r = subprocess.run(SSH + [cmd], capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0 and not (r.stdout or '').strip():
        # Connection-level failure: no stdout at all. It used to parse as
        # "healthy" in every caller (int(x or 0) -> 0, not '' -> True) —
        # the checker went all-green exactly when it could see nothing.
        # Command-level non-zero exits WITH output stay fine: check
        # commands legitimately use grep -c, which exits 1 on zero
        # matches (a healthy count of 0).
        raise RuntimeError(
            f'ssh failed (rc={r.returncode}): {(r.stderr or "").strip()[:200]}'
        )
    return (r.stdout or '').strip()


def http_ok(url: str, timeout: int = 15) -> bool:
    # The live entry is the IP site with a self-signed cert until ICP
    # filing clears (the domain cannot obtain an ACME cert today), so
    # TLS verification is disabled deliberately for these probes.
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        with urllib.request.urlopen(url, timeout=timeout, context=ctx) as resp:
            return resp.status == 200
    except Exception:
        return False


# --- checks: name -> (severity, ok, detail) --------------------------------


def check_signals() -> list[tuple[str, str, bool, str]]:
    out: list[tuple[str, str, bool, str]] = []

    ok = http_ok(EXTERNAL_URL)
    out.append(('site_up', 'P0', ok, 'health endpoint unreachable'))

    disk = ssh("df -P / | awk 'NR==2{gsub(\"%\",\"\");print $5}'")
    d = int(disk or 0)
    out.append(('disk_usage', 'P1', d <= 85, f'{d}% used'))

    unhealthy = ssh(
        "docker ps --filter health=unhealthy --format '{{.Names}}' | paste -sd, -"
    )
    out.append(('containers_healthy', 'P1', not unhealthy,
                f'unhealthy: {unhealthy or "none"}'))

    emb = ssh('curl -s -m 5 http://172.19.0.1:11434/api/tags | head -c1')
    out.append(('embedding_tunnel', 'P1', emb == '{',
                'bge-m3 tunnel (Mac Ollama) unreachable'))

    sql = (
        "SELECT coalesce(round(100.0*sum(case when success then 1 else 0 end)"
        "/nullif(count(*),0)),100), coalesce(percentile_disc(0.95) WITHIN"
        " GROUP (ORDER BY latency_ms),0) FROM llm_call_traces WHERE"
        " created_at > now() - interval '1 hour'"
    )
    llm = ssh(
        'docker exec infra-postgres psql -U readpal -d readpal -tAc '
        + json.dumps(sql)
    )
    try:
        rate, p95 = (int(float(x)) for x in llm.split('|'))
        out.append(('llm_success_rate', 'P2', rate >= 80, f'{rate}% (1h)'))
        out.append(('llm_p95_latency', 'P2', p95 <= 60000, f'p95={p95}ms (1h)'))
    except (ValueError, IndexError):
        out.append(('llm_success_rate', 'P2', True, f'no parse: {llm[:40]!r}'))

    deadline_n = ssh(
        'docker logs read-pal-api-1 --since 1h 2>&1 | grep -c planner_deadline'
    )
    n = int(deadline_n or 0)
    out.append(('planner_deadline_storm', 'P2', n <= 10, f'{n} skips in 1h'))

    guard = ssh(
        "docker exec infra-redis sh -c "
        "\"redis-cli --scan --pattern 'llm:guardrial:*' >/dev/null 2>&1; "
        "redis-cli --scan --pattern 'llm:guardrail:*' | while read k; do redis-cli get $k; done\" "
        '| awk \'{s+=$1} END {print s+0}\''
    )
    g = int(guard or 0)
    out.append(('guardrail_spike', 'P2', g <= 50, f'{g} hits today'))

    return out


# --- state + notify ---------------------------------------------------------


def load_state() -> dict:
    raw = ssh(f'cat {STATE_PATH} 2>/dev/null || echo {{}}')
    try:
        return json.loads(raw or '{}')
    except json.JSONDecodeError:
        return {}


def save_state(state: dict) -> None:
    body = json.dumps(state).replace("'", "'\\''")
    ssh(f'sudo mkdir -p $(dirname {STATE_PATH}) && echo \'{body}\' | sudo tee {STATE_PATH} >/dev/null')


def notify(title: str, desp: str) -> None:
    if not SENDKEY:
        print(f'[dry] {title}: {desp}')
        return
    data = f'title={title}&desp={desp}'.encode()
    req = urllib.request.Request(
        f'https://sctapi.ftqq.com/{SENDKEY}.send', data=data,
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            print('notify:', resp.status, resp.read()[:80])
    except Exception as exc:  # noqa: BLE001 — notify failure must not kill checks
        print('notify FAILED:', exc)


def evaluate(signals: list[tuple[str, str, bool, str]], state: dict) -> None:
    now = time.time()
    for name, sev, ok, detail in signals:
        st = state.setdefault(name, {'fail': 0, 'alerting': False, 'last': 0})
        if ok:
            if st['alerting']:
                notify(f'✅ read-pal 已恢复: {name}', f'信号恢复正常\n\n{detail}')
            st.update(fail=0, alerting=False)
            continue
        st['fail'] += 1
        should = (
            st['fail'] >= CONSECUTIVE_TO_ALERT
            and (not st['alerting'] or now - st['last'] > COOLDOWN_S)
        )
        if should:
            notify(
                f'🚨 read-pal {sev} 告警: {name}',
                f'连续 {st["fail"]} 次失败\n\n{detail}\n\n'
                f'---\nVPS: {VPS_HOST}',
            )
            st.update(alerting=True, last=now)
    save_state(state)


def digest(signals: list[tuple[str, str, bool, str]]) -> None:
    lines = [f'- {n}[{s}]: ' + ('OK' if ok else f'FAIL ({d})')
             for n, s, ok, d in signals]
    notify('📖 read-pal 监控心跳', '每日快照（09:00）\n\n' + '\n'.join(lines))


def main() -> int:
    signals = check_signals()
    for name, sev, ok, detail in signals:
        print(f'{sev} {name}: {"OK" if ok else "FAIL"} {detail}')
    if os.environ.get('DIGEST') == '1':
        digest(signals)
    evaluate(signals, load_state())
    return 0


if __name__ == '__main__':
    sys.exit(main())
