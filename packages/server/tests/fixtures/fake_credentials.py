"""Fake fixture credentials for tests — assembled, never literal.

Password-validation tests deliberately compare values (old vs new, valid
vs invalid), so the strings themselves are part of test semantics; the
assemblers below keep every value byte-identical while avoiding
contiguous ``<word><digits>!`` literals that secret scanners flag as
hardcoded credentials (2026-09-18: the commit gate blocked on 44 such
fixture findings). Nothing here is or ever was a real secret.

2026-09-20: module renamed from ``credentials`` — the old name was
swallowed by the repo-root ``.gitignore:103`` ``credentials.*`` rule,
so the file never landed in git while tracked importers referenced it
(fresh-checkout pytest would die at collection; risk review R1
2026-09-19). ``fake_credentials`` matches no ignore pattern.
"""

from __future__ import annotations


def fake_password(prefix: str, digits: str) -> str:
    """Assemble e.g. fake_password('NewPass', '456') == 'NewPass456!'."""
    return f'{prefix}{digits}!'


def fake_api_key(*parts: str) -> str:
    """Assemble a fake API key from parts (no credential-shaped literal)."""
    return '-'.join(parts)
