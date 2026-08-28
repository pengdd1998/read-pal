# --- Builder ---
FROM python:3.12-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:0.11.13 /uv /uvx /usr/local/bin/

WORKDIR /app

# Use Aliyun mirror for faster downloads in China
ENV UV_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/

# Install deps first (cache layer)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

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
