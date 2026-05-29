"""EPUB structural parsers: container.xml, OPF manifest/spine, NCX/NAV TOC.

Uses only stdlib xml.etree — no ebooklib dependency.
"""

import xml.etree.ElementTree as ET
import zipfile

from app.services.epub_parser.constants import NS_DC, NS_EPUB, NS_NCX


# ---------------------------------------------------------------------------
# Container.xml → OPF path
# ---------------------------------------------------------------------------

def parse_epub_container(zf: zipfile.ZipFile) -> str | None:
    """Parse META-INF/container.xml to locate the OPF file path."""
    try:
        xml_bytes = zf.read('META-INF/container.xml')
    except KeyError:
        return _scan_for_opf(zf)

    root = ET.fromstring(xml_bytes)
    for rf in root.iter():
        if rf.tag.endswith('rootfile') or rf.tag == 'rootfile':
            mt = rf.get('media-type', '')
            fp = rf.get('full-path', '')
            if 'oebps-package' in mt or fp.endswith('.opf'):
                return fp
    return _scan_for_opf(zf)


def _scan_for_opf(zf: zipfile.ZipFile) -> str | None:
    """Fallback: find OPF file by extension."""
    for name in zf.namelist():
        if name.endswith('.opf') and not name.startswith('__'):
            return name
    return None


# ---------------------------------------------------------------------------
# OPF package document
# ---------------------------------------------------------------------------

def parse_opf(opf_xml: str, opf_path: str) -> dict:
    """Parse OPF package document for manifest, spine, metadata."""
    root = ET.fromstring(opf_xml)

    manifest = _parse_manifest(root)
    spine = _parse_spine(root)
    metadata = _parse_metadata(root)
    cover_id = _detect_cover(root, manifest)
    ncx_href, nav_href = _find_toc_refs(manifest)

    return {
        'manifest': manifest,
        'spine': spine,
        'metadata': metadata,
        'cover_id': cover_id,
        'ncx_href': ncx_href,
        'nav_href': nav_href,
        'opf_path': opf_path,
    }


def _parse_manifest(root: ET.Element) -> dict[str, dict]:
    """Parse OPF manifest: id -> {href, media_type, properties}."""
    manifest: dict[str, dict] = {}
    for item in root.iter():
        tag = item.tag
        if '}' in tag:
            tag = tag.split('}', 1)[1]
        if tag != 'item':
            continue
        item_id = item.get('id', '')
        manifest[item_id] = {
            'href': item.get('href', ''),
            'media_type': item.get('media-type', ''),
            'properties': item.get('properties', ''),
        }
    return manifest


def _parse_spine(root: ET.Element) -> list[str]:
    """Parse OPF spine: ordered list of idrefs."""
    spine: list[str] = []
    for itemref in root.iter():
        tag = itemref.tag
        if '}' in tag:
            tag = tag.split('}', 1)[1]
        if tag == 'itemref':
            idref = itemref.get('idref', '')
            if idref:
                spine.append(idref)
    return spine


def _parse_metadata(root: ET.Element) -> dict:
    """Extract DC metadata from OPF."""
    metadata: dict = {}
    for el in root.iter():
        tag = el.tag
        if '}' in tag:
            ns, local = tag.split('}', 1)
            if ns == '{' + NS_DC:
                text = (el.text or '').strip()
                if not text:
                    continue
                key = 'author' if local == 'creator' else local
                if key == 'year':
                    if len(text) >= 4 and text[:4].isdigit():
                        metadata[key] = int(text[:4])
                else:
                    metadata[key] = text
    return metadata


def _detect_cover(root: ET.Element, manifest: dict[str, dict]) -> str | None:
    """Detect cover image ID from OPF meta elements and manifest properties."""
    # Check <meta name="cover">
    for meta in root.iter():
        tag = meta.tag
        if '}' in tag:
            tag = tag.split('}', 1)[1]
        if tag == 'meta' and meta.get('name') == 'cover':
            return meta.get('content')
    # Check properties="cover-image"
    for iid, info in manifest.items():
        if 'cover-image' in info.get('properties', ''):
            return iid
    # Fallback: item id containing "cover"
    for iid, info in manifest.items():
        if 'cover' in iid.lower() and info['media_type'].startswith('image/'):
            return iid
    return None


def _find_toc_refs(manifest: dict[str, dict]) -> tuple[str | None, str | None]:
    """Find NCX and NAV TOC references in manifest."""
    ncx_href: str | None = None
    nav_href: str | None = None
    for iid, info in manifest.items():
        mt = info['media_type']
        props = info.get('properties', '')
        if mt == 'application/x-dtbncx+xml':
            ncx_href = info['href']
        if 'nav' in props:
            nav_href = info['href']
    return ncx_href, nav_href


# ---------------------------------------------------------------------------
# NCX (EPUB 2) TOC
# ---------------------------------------------------------------------------

def parse_ncx(ncx_xml: str) -> list[tuple[str, str, int]]:
    """Parse NCX (EPUB 2) table of contents."""
    root = ET.fromstring(ncx_xml)
    results: list[tuple[str, str, int]] = []

    def _walk_navpoints(parent: ET.Element, level: int) -> None:
        for el in parent:
            tag = el.tag
            if '}' in tag:
                tag = tag.split('}', 1)[1]
            if tag != 'navPoint':
                continue
            title_el = el.find(f'{{{_NS_NCX}}}navLabel/{{{_NS_NCX}}}text')
            title = (title_el.text or '').strip() if title_el is not None else ''
            content_el = el.find(f'{{{_NS_NCX}}}content')
            src = content_el.get('src', '') if content_el is not None else ''
            src = src.split('#')[0]
            if title:
                results.append((title, src, level))
            _walk_navpoints(el, level + 1)

    nav_map = root.find(f'{{{_NS_NCX}}}navMap')
    if nav_map is None:
        for el in root:
            tag = el.tag.split('}', 1)[-1] if '}' in el.tag else el.tag
            if tag == 'navMap':
                nav_map = el
                break
    if nav_map is not None:
        _walk_navpoints(nav_map, 0)

    return results


# ---------------------------------------------------------------------------
# EPUB 3 NAV TOC
# ---------------------------------------------------------------------------

def parse_nav(nav_xml: str) -> list[tuple[str, str, int]]:
    """Parse EPUB 3 nav document for table of contents."""
    root = ET.fromstring(nav_xml)
    results: list[tuple[str, str, int]] = []

    toc_nav = _find_toc_nav(root)
    if toc_nav is None:
        return results

    # Find first <ol> in the nav
    for el in toc_nav.iter():
        tag = el.tag.split('}', 1)[-1] if '}' in el.tag else el.tag
        if tag == 'ol':
            _walk_ol(el, results, 0)
            break

    return results


def _find_toc_nav(root: ET.Element) -> ET.Element | None:
    """Find the TOC <nav> element in an EPUB 3 nav document."""
    # Check for epub:type="toc"
    for nav in root.iter():
        tag = nav.tag.split('}', 1)[-1] if '}' in nav.tag else nav.tag
        if tag != 'nav':
            continue
        epub_type = nav.get(f'{{{_NS_EPUB}}}type', nav.get('type', ''))
        if epub_type == 'toc':
            return nav
    # Fallback: first <nav> element
    for nav in root.iter():
        tag = nav.tag.split('}', 1)[-1] if '}' in nav.tag else nav.tag
        if tag == 'nav':
            return nav
    return None


def _walk_ol(
    ol_el: ET.Element,
    results: list[tuple[str, str, int]],
    level: int,
) -> None:
    """Recursively walk <ol> elements to extract TOC entries."""
    for child in ol_el:
        tag = child.tag.split('}', 1)[-1] if '}' in child.tag else child.tag
        if tag != 'li':
            continue
        a = None
        for sub in child:
            sub_tag = sub.tag.split('}', 1)[-1] if '}' in sub.tag else sub.tag
            if sub_tag == 'a' or sub_tag == 'span':
                a = sub
                break
        if a is not None and a.text:
            href = a.get('href', '').split('#')[0]
            title = a.text.strip()
            if title:
                results.append((title, href, level))
        # Nested ol
        for sub in child:
            sub_tag = sub.tag.split('}', 1)[-1] if '}' in sub.tag else sub.tag
            if sub_tag == 'ol':
                _walk_ol(sub, results, level + 1)
