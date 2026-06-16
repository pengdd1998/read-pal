"""read-pal backend application package.

Runs first on `import app.*` — used to pin the process timezone to UTC before
any asyncpg datetime encoding happens.

Why: asyncpg encodes naive datetimes (e.g. ``utcnow()``) by applying the host
process's local timezone before sending to a ``timestamptz`` column. On a +08
host that silently shifts every explicit UTC timestamp 8h — session
``ended_at``/``updated_at``, flashcard ``next_review_at``, etc. Aware
datetimes are unaffected; only naive ones drift. Pinning the process TZ to
UTC makes that ``astimezone()`` step a no-op so naive UTC values store
correctly, with no changes to ``utcnow()`` or the timestamp arithmetic that
reads columns back as naive.
"""

import os
import time as _time

os.environ.setdefault('TZ', 'UTC')
_time.tzset()
