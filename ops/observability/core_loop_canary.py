#!/usr/bin/env python3
"""Core-loop canary — one REAL companion turn through the public API.

Why this exists (P9): the health probe (`/api/v1/health`) was green for 46
review rounds while the product's core loop was degraded — a retired primary
model, a rate-limited sibling, a 15s wait before the first frame. Health
says the process is up; only a real turn says the companion can answer.

What it checks, per run (one question, rotating):
  1. HTTP 200 on the stream endpoint
  2. the ``request_id`` frame arrives within CANARY_FRAME_S
  3. the first answer token arrives within CANARY_TTFT_S
  4. no error frame and neither canned failure text
  5. the answer contains a fact that is in the book (grounding)

Exit code 0 = pass, 1 = fail. Stdlib only — runs on a bare CI runner.

Required env: CANARY_EMAIL, CANARY_PASSWORD, CANARY_BOOK_ID.
Optional env: CANARY_BASE_URL, CANARY_FRAME_S, CANARY_TTFT_S, CANARY_TOTAL_S,
CANARY_QUESTION_INDEX.
"""

from __future__ import annotations

import http.client
import json
import os
import random
import sys
import time
import uuid
from urllib.parse import urlparse

BASE_URL = os.environ.get('CANARY_BASE_URL', 'https://read.chishenma.top').rstrip('/')
FRAME_S = float(os.environ.get('CANARY_FRAME_S', '3.0'))
TTFT_S = float(os.environ.get('CANARY_TTFT_S', '12.0'))
TOTAL_S = float(os.environ.get('CANARY_TOTAL_S', '60.0'))

# (question, a token the grounded answer must contain). Facts are from
# chapter 0 (勒古恩的序) of the canary book, 《路边野餐》.
QUESTIONS = [
    ('勒古恩第一次给《路边野餐》写评论是哪一年？', '1977'),
    ('斯特鲁伽茨基兄弟为什么没有被审查机关镇压？', '意识形态'),
    ('勒古恩把外星人留下的东西比作什么？', '玻璃纸'),
    ('序言里说的造访区是怎么来的？', '外星'),
]
# Canned failure strings in both UI languages (app/translations).
FAILURE_MARKERS = ('AI 服务暂时无法连接', "trouble connecting to my AI service")


def _request(method: str, path: str, body: dict | None = None, token: str | None = None,
             timeout: float = 20.0) -> http.client.HTTPResponse:
    parsed = urlparse(BASE_URL)
    conn_cls = http.client.HTTPSConnection if parsed.scheme == 'https' else http.client.HTTPConnection
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    if path.endswith('/stream'):
        headers['Accept'] = 'text/event-stream'
        headers['Idempotency-Key'] = uuid.uuid4().hex
    conn = conn_cls(parsed.netloc, timeout=timeout)
    conn.request(method, path, body=json.dumps(body).encode() if body is not None else None,
                 headers=headers)
    return conn.getresponse()


def login() -> str:
    resp = _request('POST', '/api/v1/auth/login', {
        'email': os.environ['CANARY_EMAIL'],
        'password': os.environ['CANARY_PASSWORD'],
        'platform': 'web',
    })
    if resp.status != 200:
        raise RuntimeError(f'login failed: HTTP {resp.status} {resp.read()[:120]!r}')
    return json.loads(resp.read())['data']['token']


def companion_turn(token: str, question: str) -> dict:
    """Stream one companion answer; return timings, text and frame kinds."""
    t0 = time.monotonic()
    resp = _request('POST', '/api/v1/agent/chat/stream', {
        'bookId': os.environ['CANARY_BOOK_ID'], 'message': question,
        'persona': 'sage', 'genre': 'fiction',
    }, token=token, timeout=TOTAL_S + 30)
    out = {'status': resp.status, 't_frame': None, 't_first_token': None, 'text': '',
           'answered_by': None, 'fallback': False, 'error_frame': None, 'done': False}
    if resp.status != 200:
        out['body'] = resp.read()[:200].decode(errors='replace')
        return out
    parts: list[str] = []
    while True:
        line = resp.readline()
        if not line:
            break
        line = line.decode(errors='replace').rstrip('\r\n')
        if not line.startswith('data: '):
            continue
        now = time.monotonic() - t0
        if out['t_frame'] is None:
            out['t_frame'] = now
        payload = line[6:].strip()
        if payload == '[DONE]':
            out['done'] = True
            break
        try:
            frame = json.loads(payload)
        except ValueError:
            continue
        kind = frame.get('type') or ('content' if isinstance(frame.get('content'), str) else None)
        if kind == 'content':  # typed frames are control, never body text (GB-11)
            parts.append(frame['content'])
            if out['t_first_token'] is None:
                out['t_first_token'] = now
        elif kind == 'metadata':
            out['fallback'] = bool(frame.get('fallback_used'))
            out['answered_by'] = frame.get('model') or out['answered_by']
        elif frame.get('error'):
            out['error_frame'] = frame['error']
    out['t_total'] = time.monotonic() - t0
    out['text'] = ''.join(parts)
    return out


def run() -> tuple[bool, list[str], dict]:
    failures: list[str] = []
    index_env = os.environ.get('CANARY_QUESTION_INDEX')
    index = int(index_env) if index_env else random.randrange(len(QUESTIONS))
    question, expected = QUESTIONS[index % len(QUESTIONS)]
    turn: dict = {'question': question, 'expected': expected}

    try:
        token = login()
        turn.update(companion_turn(token, question))
    except Exception as exc:  # noqa: BLE001 — any failure is a canary failure
        failures.append(f'exception: {type(exc).__name__}: {str(exc)[:160]}')
        return False, failures, turn

    if turn.get('status') != 200:
        failures.append(f"HTTP {turn.get('status')} {turn.get('body', '')}")
    elif not turn.get('done'):
        failures.append('stream ended without [DONE]')
    if turn.get('error_frame'):
        failures.append(f"error frame: {turn['error_frame']}")
    t_frame = turn.get('t_frame')
    if t_frame is None:
        if not failures:
            failures.append('no SSE frame at all')
    elif t_frame > FRAME_S:
        failures.append(f'first frame {t_frame:.2f}s > {FRAME_S}s')
    t_first = turn.get('t_first_token')
    if t_first is None:
        if not failures:
            failures.append('no answer token')
    elif t_first > TTFT_S:
        failures.append(f'first token {t_first:.2f}s > {TTFT_S}s')
    if turn.get('t_total', 0) > TOTAL_S:
        failures.append(f"turn took {turn['t_total']:.1f}s > {TOTAL_S}s")
    text = turn.get('text') or ''
    if text and any(marker in text for marker in FAILURE_MARKERS):
        failures.append('canned failure text instead of an answer')
    elif text and expected not in text:
        failures.append(f'answer lacks "{expected}" (fact not grounded)')
    return not failures, failures, turn


def main() -> int:
    ok, failures, turn = run()
    timing = (
        f"frame={turn['t_frame']:.2f}s first_token={turn['t_first_token']:.2f}s "
        f"total={turn['t_total']:.1f}s" if turn.get('t_frame') is not None else 'no frame'
    ) if ok else ' '.join(failures)
    model = turn.get('answered_by') or 'primary'
    line = (f"{'PASS' if ok else 'FAIL'} | q={turn['question'][:18]} | {timing} | "
            f"model={model}{' (fallback)' if turn.get('fallback') else ''} | "
            f"len={len(turn.get('text') or '')}")
    print(line)
    print(json.dumps({k: v for k, v in turn.items() if k != 'text'}, ensure_ascii=False))
    print('answer:', (turn.get('text') or '')[:300].replace('\n', ' '))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
