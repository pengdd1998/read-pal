# --- Builder ---
FROM python:3.12-slim AS builder

WORKDIR /app

# pip (HTTP/1.1 + OpenSSL) instead of uv for the network fetch: uv crawls
# at ~KB/s from the deploy VPS against every mirror tested (aliyun/tencent/
# pypi direct, single- and multi-connection, rustls and native-tls) while
# pip pulls the same set at MB/s. Diagnosed 2026-10-16 after two stalled
# cold builds. Integrity stays hash-pinned via requirements.lock exported
# from uv.lock — regenerate it whenever uv.lock changes:
#   uv export --frozen --no-dev --no-emit-project -o requirements.lock
COPY requirements.lock ./
RUN python -m venv /app/.venv \
    && /app/.venv/bin/pip install --no-cache-dir --quiet \
       -i https://mirrors.cloud.tencent.com/pypi/simple/ \
       -r requirements.lock

# Copy application code
COPY . .

# --- Runtime ---
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
RUN addgroup --system app && adduser --system --ingroup app app

WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app /app

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

USER app

EXPOSE 8000

# Proxy headers are intentionally NOT enabled here: uvicorn's
# ProxyHeadersMiddleware trusts the LEFTMOST X-Forwarded-For entry, which a
# client can spoof. Client-IP derivation instead happens in
# app/utils/request_identity.py, which trusts only the RIGHTMOST XFF entry
# (the one our nginx appends). Do not add --proxy-headers without reviewing
# that module first.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
