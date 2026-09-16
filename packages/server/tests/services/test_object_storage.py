"""Tests for object_storage (MinIO cover upload) and the cover data-URI decoder.

The MinIO client is mocked — these verify the upload_cover logic (bucket
setup, key/URL construction, error handling, disabled-when-unconfigured)
without needing network access to a real MinIO instance.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.services import object_storage
from app.services.upload_service import _decode_cover_data_uri


@pytest.fixture(autouse=True)
def _reset_client_cache():
    # The module caches the Minio client + bucket-readiness; reset between tests.
    object_storage._client = None
    object_storage._bucket_ready = False
    yield
    object_storage._client = None
    object_storage._bucket_ready = False


def _mock_settings(**overrides):
    base = {
        'oss_endpoint': 'minio.example.com:9000',
        'oss_access_key': 'ak',
        'oss_secret_key': 'sk',
        'oss_bucket': 'read-pal',
        'oss_public_base_url': 'https://cdn.example.com/read-pal',
        'oss_secure': True,
        'oss_enabled': True,
    }
    base.update(overrides)
    return MagicMock(**base)


class TestUploadCover:
    def test_returns_public_url_with_correct_key(self):
        client = MagicMock()
        book_id = uuid4()
        with patch.object(object_storage, '_get_client', return_value=client), \
                patch.object(object_storage, 'get_settings', return_value=_mock_settings()):
            url = object_storage._upload_cover_sync(book_id, b'\x89PNG\r\n', 'png', 'image/png')
        client.put_object.assert_called_once()
        kwargs = client.put_object.call_args
        assert kwargs.args[1] == f'covers/{book_id}.png'
        assert kwargs.kwargs['content_type'] == 'image/png'
        assert url == f'https://cdn.example.com/read-pal/covers/{book_id}.png'

    def test_strips_trailing_slash_from_base_url(self):
        client = MagicMock()
        book_id = uuid4()
        settings = _mock_settings(oss_public_base_url='https://cdn.example.com/read-pal/')
        with patch.object(object_storage, '_get_client', return_value=client), \
                patch.object(object_storage, 'get_settings', return_value=settings):
            url = object_storage._upload_cover_sync(book_id, b'data', 'jpg', 'image/jpeg')
        assert url == f'https://cdn.example.com/read-pal/covers/{book_id}.jpg'

    def test_creates_bucket_and_sets_policy_once(self):
        client = MagicMock()
        client.bucket_exists.return_value = False
        with patch.object(object_storage, '_get_client', return_value=client), \
                patch.object(object_storage, 'get_settings', return_value=_mock_settings()):
            object_storage._upload_cover_sync(uuid4(), b'data', 'jpg', 'image/jpeg')
            object_storage._upload_cover_sync(uuid4(), b'data', 'jpg', 'image/jpeg')
        # bucket_exists / make_bucket / set_bucket_policy run only on the first upload
        assert client.bucket_exists.call_count == 1
        client.make_bucket.assert_called_once()
        client.set_bucket_policy.assert_called_once()

    def test_skips_make_bucket_when_bucket_exists(self):
        client = MagicMock()
        client.bucket_exists.return_value = True
        with patch.object(object_storage, '_get_client', return_value=client), \
                patch.object(object_storage, 'get_settings', return_value=_mock_settings()):
            object_storage._upload_cover_sync(uuid4(), b'data', 'jpg', 'image/jpeg')
        client.make_bucket.assert_not_called()

    def test_returns_none_on_put_object_failure(self):
        client = MagicMock()
        client.put_object.side_effect = RuntimeError('network down')
        with patch.object(object_storage, '_get_client', return_value=client), \
                patch.object(object_storage, 'get_settings', return_value=_mock_settings()):
            url = object_storage._upload_cover_sync(uuid4(), b'data', 'jpg', 'image/jpeg')
        assert url is None

    async def test_async_skips_when_storage_disabled(self):
        settings = _mock_settings(oss_enabled=False, oss_endpoint=None)
        with patch.object(object_storage, 'get_settings', return_value=settings):
            url = await object_storage.upload_cover(uuid4(), b'data', 'jpg', 'image/jpeg')
        assert url is None


class TestDecodeCoverDataUri:
    def test_decodes_base64_image(self):
        # "hello" -> base64
        import base64
        b64 = base64.b64encode(b'hello').decode()
        uri = f'data:image/png;base64,{b64}'
        decoded = _decode_cover_data_uri(uri)
        assert decoded is not None
        data, ext, mime = decoded
        assert data == b'hello'
        assert ext == 'png'
        assert mime == 'image/png'

    def test_maps_jpeg_mime_to_jpg_ext(self):
        import base64
        b64 = base64.b64encode(b'x').decode()
        decoded = _decode_cover_data_uri(f'data:image/jpeg;base64,{b64}')
        assert decoded is not None
        assert decoded[1] == 'jpg'
        assert decoded[2] == 'image/jpeg'

    def test_unknown_mime_defaults_to_jpg(self):
        import base64
        b64 = base64.b64encode(b'x').decode()
        decoded = _decode_cover_data_uri(f'data:image/avif;base64,{b64}')
        assert decoded is not None
        assert decoded[1] == 'jpg'

    def test_returns_none_for_non_data_uri(self):
        assert _decode_cover_data_uri('https://example.com/cover.png') is None

    def test_returns_none_for_invalid_base64(self):
        assert _decode_cover_data_uri('data:image/png;base64,@@not valid@@') is None

    def test_returns_none_for_empty(self):
        assert _decode_cover_data_uri('') is None
