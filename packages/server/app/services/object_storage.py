"""Object storage (MinIO / S3-compatible) for book covers.

Covers are stored as public-readable objects so the frontend ``<img>`` can
load them directly — ``book.cover_url`` holds the public URL. All operations
are best-effort: failures are logged and return ``None`` so a storage hiccup
never blocks a book upload (the cover simply falls back to the generated
gradient placeholder).
"""

import asyncio
import json
import logging
from io import BytesIO
from uuid import UUID

from app.config import get_settings

logger = logging.getLogger('read-pal')

# Module-level cache so the (thread-safe) Minio client and bucket setup run
# at most once per process.
_client = None
_bucket_ready = False


def _get_client():
    """Lazily build and cache a Minio client (import kept lazy so the optional
    ``minio`` dependency is only required when object storage is used)."""
    global _client
    if _client is not None:
        return _client
    from minio import Minio

    s = get_settings()
    _client = Minio(
        s.oss_endpoint,
        access_key=s.oss_access_key,
        secret_key=s.oss_secret_key,
        secure=s.oss_secure,
    )
    return _client


def _ensure_bucket(client) -> None:
    """Create the bucket once (if missing) and apply a public-read policy for
    the ``covers/`` prefix so cover URLs work without auth/presigning."""
    global _bucket_ready
    if _bucket_ready:
        return

    bucket = get_settings().oss_bucket
    try:
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)
    except Exception as exc:
        # Likely a race where another worker created it concurrently — safe to
        # continue and just set the policy below.
        logger.debug('object_storage.bucket_create_skipped err=%s', str(exc)[:160])

    policy = {
        'Version': '2012-10-17',
        'Statement': [{
            'Effect': 'Allow',
            'Principal': {'AWS': ['*']},
            'Action': ['s3:GetObject'],
            'Resource': [f'arn:aws:s3:::{bucket}/covers/*'],
        }],
    }
    client.set_bucket_policy(bucket, json.dumps(policy))
    _bucket_ready = True


def _upload_cover_sync(book_id: UUID, data: bytes, ext: str, mime: str) -> str | None:
    """Synchronous cover upload — returns the public URL or None on failure."""
    s = get_settings()
    if not s.oss_endpoint:
        return None
    try:
        client = _get_client()
        _ensure_bucket(client)
        key = f'covers/{book_id}.{ext}'
        client.put_object(
            s.oss_bucket, key, BytesIO(data), len(data), content_type=mime,
        )
        return f'{s.oss_public_base_url.rstrip("/")}/{key}'
    except Exception as exc:
        logger.warning(
            'object_storage.cover_upload_failed book=%s err=%s',
            book_id, str(exc)[:200],
        )
        return None


async def upload_cover(book_id: UUID, data: bytes, ext: str, mime: str) -> str | None:
    """Upload a cover image to object storage.

    Returns the object's public URL, or ``None`` if storage is unconfigured or
    the upload failed (caller falls back to the placeholder cover).
    """
    if not get_settings().oss_enabled:
        return None
    return await asyncio.to_thread(_upload_cover_sync, book_id, data, ext, mime)
