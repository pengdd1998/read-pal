"""Image extraction and source rewriting for EPUB files."""

import base64
import html as html_module
import logging
import re
import zipfile
from pathlib import Path

from app.services.epub_parser.constants import (
    IMAGE_MIME_MAP,
    IMG_SRC_RE,
    MAX_IMAGE_SIZE,
)
from app.services.epub_parser.html_helpers import resolve_epub_path

logger = logging.getLogger('read-pal')


def extract_images(
    zf: zipfile.ZipFile,
    manifest: dict[str, dict],
    opf_path: str,
) -> dict[str, str]:
    """Extract images from EPUB and return {zip_path: data_uri} map."""
    image_map: dict[str, str] = {}
    base_dir = Path(opf_path).parent  # unused but kept for clarity

    for iid, info in manifest.items():
        mt = info.get('media_type', '')
        href = info.get('href', '')
        if not mt.startswith('image/') and not any(
            href.endswith(ext) for ext in IMAGE_MIME_MAP
        ):
            continue

        resolved = resolve_epub_path(opf_path, href)
        try:
            zinfo = zf.getinfo(resolved)
        except KeyError:
            continue

        if zinfo.file_size > MAX_IMAGE_SIZE:
            logger.debug('Skipping large image: %s (%d bytes)', resolved, zinfo.file_size)
            continue

        try:
            data = zf.read(resolved)
        except Exception:
            continue

        ext = Path(resolved).suffix.lower()
        mime = mt if mt.startswith('image/') else IMAGE_MIME_MAP.get(ext, 'image/png')
        if ext == '.svg' or 'svg' in mime:
            svg_text = data.decode('utf-8', errors='replace')
            image_map[resolved] = f'data:{mime};utf8,{html_module.escape(svg_text)}'
        else:
            b64 = base64.b64encode(data).decode('ascii')
            image_map[resolved] = f'data:{mime};base64,{b64}'

    return image_map


def rewrite_image_sources(
    html_content: str,
    image_map: dict[str, str],
    base_path: str,
) -> str:
    """Replace relative <img src> with embedded data URIs."""

    def _replace_src(m: re.Match) -> str:
        prefix = m.group(1)
        src = m.group(2)
        suffix = m.group(3)

        # Skip external URLs and data URIs
        if src.startswith(('http://', 'https://', 'data:', '//')):
            return m.group(0)

        clean_src = src.split('#')[0]
        if not clean_src:
            return m.group(0)

        resolved = resolve_epub_path(base_path, clean_src)
        data_uri = image_map.get(resolved)
        if data_uri:
            return f'{prefix}{data_uri}{suffix}'
        return m.group(0)

    return IMG_SRC_RE.sub(_replace_src, html_content)


def extract_cover(
    zf: zipfile.ZipFile,
    manifest: dict[str, dict],
    opf_data: dict,
    opf_path: str,
) -> str | None:
    """Extract cover image as a data URI."""
    cover_id = opf_data.get('cover_id')
    if not cover_id or cover_id not in manifest:
        return None
    info = manifest[cover_id]
    href = info.get('href', '')
    resolved = resolve_epub_path(opf_path, href)
    try:
        zinfo = zf.getinfo(resolved)
    except KeyError:
        return None
    if zinfo.file_size > MAX_IMAGE_SIZE:
        return None
    try:
        data = zf.read(resolved)
    except Exception:
        return None
    ext = Path(resolved).suffix.lower()
    mime = IMAGE_MIME_MAP.get(ext, 'image/jpeg')
    b64 = base64.b64encode(data).decode('ascii')
    return f'data:{mime};base64,{b64}'
