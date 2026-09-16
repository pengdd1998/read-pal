"""Flat-module freeze for app/services/ (AGENTS.md M2.2 rule).

New features must land as sub-packages with ``__init__.py`` as the single
public API — the flat-module era produced 12 dual-homed features and a
dozen re-export shims before this rule existed. The gate enforces the
ratchet: the baseline below lists every flat module allowed today; adding
a NEW flat ``.py`` module under app/services/ fails CI. Removing modules
from the baseline is always allowed (and encouraged).
"""

from __future__ import annotations

import sys
from pathlib import Path

# Flat modules allowed to exist (2026-09-16 snapshot, post M2.2).
# Remove entries as they graduate into packages.
BASELINE: frozenset[str] = frozenset({
    '__init__.py',
    '_seed_data.py',
    'account_service.py',
    'annotation_service.py',
    'book_service.py',
    'challenge_service.py',
    'chat_service.py',
    'collection_service.py',
    'conversation_memory.py',
    'discovery_service.py',
    'email_service.py',
    'export_service.py',
    'feedback_service.py',
    'friend_persona.py',
    'friend_service.py',
    'llm_log_service.py',
    'mood_service.py',
    'notification_service.py',
    'object_storage.py',
    'password_reset_service.py',
    'reading_book_service.py',
    'recommendation_service.py',
    'seed_service.py',
    'settings_service.py',
    'share_service.py',
    'text_helpers.py',
    'upload_content_store.py',
    'upload_service.py',
    'upload_stream.py',
    'webhook_service.py',
})


def main(root: str = 'app/services/') -> int:
    root_path = Path(root)
    if not root_path.exists():
        print(f'ERROR: root {root} does not exist')
        return 2

    flat = {p.name for p in root_path.glob('*.py')}
    offenders = sorted(flat - BASELINE)
    if offenders:
        print('New flat module(s) under app/services/ — new features must be')
        print('sub-packages (public API via __init__.py):')
        for name in offenders:
            print(f'  {name}')
        print('Either move the code into a package or (if truly a one-off')
        print('helper, not a feature) add it to the baseline with justification.')
        return 1

    print(f'OK: no new flat modules under {root} (baseline {len(BASELINE)} entries).')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else 'app/services/'))
