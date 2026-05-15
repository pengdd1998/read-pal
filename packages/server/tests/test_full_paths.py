"""Full-path integration test — exercises all API endpoints with correct routes.

Run manually: python -m tests.test_full_paths (requires live server on localhost:8000)
"""

from __future__ import annotations

import pytest

pytest.skip(allow_module_level=True, reason='Standalone script — requires live server')

import json
import sys
import time

import httpx

BASE = 'http://localhost:8000/api/v1'
client = httpx.Client(timeout=120)  # 120s for LLM calls on rate-limited tiers

results: list[tuple[str, bool, str]] = []


def report(name: str, ok: bool, detail: str = '') -> None:
    status = 'PASS' if ok else 'FAIL'
    results.append((name, ok, detail))
    print(f'  [{status}] {name}' + (f' — {detail}' if detail else ''))


def auth_headers(token: str) -> dict[str, str]:
    return {'Authorization': f'Bearer {token}'}


# ── Phase 1: Auth ──────────────────────────────────────────────────────────

print('\n=== Phase 1: Auth ===')

# Register (with retry for rate limiting)
r = None
for _attempt in range(3):
    r = client.post(f'{BASE}/auth/register', json={
        'email': f'fulltest-{int(time.time())}-{_attempt}@readpal.com',
        'password': 'Test1234!',
        'name': 'Full Test User',
    })
    if r.status_code == 201:
        break
    if r.status_code == 429:
        print(f'  Rate limited, retrying in 3s (attempt {_attempt + 1})...')
        time.sleep(3)
report('auth.register', r.status_code == 201, f'status={r.status_code}')
data = r.json()
token = data.get('data', {}).get('token', '')
user_id = data.get('data', {}).get('user', {}).get('id', '')
email = data.get('data', {}).get('user', {}).get('email', '')

if not token:
    print('\n  FATAL: No auth token obtained (register returned non-201). Skipping remaining tests.')
    print('  This usually means rate limiting or server error. Try again in a minute.\n')
    passed = sum(1 for _, ok, _ in results if ok)
    failed = sum(1 for _, ok, _ in results if not ok)
    print(f'Results: {passed}/{len(results)} passed, {failed} failed\n')
    sys.exit(1)

headers = auth_headers(token)

# Brief pause to let the DB commit finish (get_db commits after yield)
time.sleep(0.5)

# Login
r = client.post(f'{BASE}/auth/login', json={
    'email': email,
    'password': 'Test1234!',
})
report('auth.login', r.status_code == 200, f'status={r.status_code}')
login_data = r.json()
token = login_data.get('data', {}).get('token', token)
headers = auth_headers(token)

# Get profile
r = client.get(f'{BASE}/auth/me', headers=headers)
report('auth.me', r.status_code == 200, f'status={r.status_code}')

# Update profile (PATCH /auth/me, defined in account.py)
r = client.patch(f'{BASE}/auth/me', headers=headers, json={
    'name': 'Updated Test User',
})
report('auth.update_profile', r.status_code == 200, f'status={r.status_code}')

# Change password (current_password, not old_password)
r = client.post(f'{BASE}/auth/change-password', headers=headers, json={
    'current_password': 'Test1234!',
    'new_password': 'Test5678!',
})
report('auth.change_password', r.status_code == 200, f'status={r.status_code}')

# Change back
r = client.post(f'{BASE}/auth/change-password', headers=headers, json={
    'current_password': 'Test5678!',
    'new_password': 'Test1234!',
})
report('auth.change_password_back', r.status_code == 200, f'status={r.status_code}')


# ── Phase 2: Books ─────────────────────────────────────────────────────────

print('\n=== Phase 2: Books ===')

# List books (seeded data)
r = client.get(f'{BASE}/books', headers=headers)
report('books.list', r.status_code == 200, f'status={r.status_code}')
books = r.json().get('data', [])
book_id = books[0]['id'] if books else None
report('books.list_nonempty', len(books) > 0, f'count={len(books)}')

if book_id:
    # Get single book
    r = client.get(f'{BASE}/books/{book_id}', headers=headers)
    report('books.get', r.status_code == 200, f'status={r.status_code}')

    # Update book (PATCH, not PUT)
    r = client.patch(f'{BASE}/books/{book_id}', headers=headers, json={
        'title': 'Updated Book Title',
    })
    report('books.update', r.status_code == 200, f'status={r.status_code}')


# ── Phase 3: Annotations ──────────────────────────────────────────────────

print('\n=== Phase 3: Annotations ===')

if book_id:
    # Create annotation (POST /annotations with book_id in body)
    r = client.post(f'{BASE}/annotations', headers=headers, json={
        'book_id': book_id,
        'type': 'highlight',
        'content': 'Test highlight content',
        'location': {'page': 1, 'chapter': 0},
        'color': '#FF0000',
        'note': 'This is a test note',
        'tags': [],
    })
    report('annotations.create', r.status_code in (200, 201), f'status={r.status_code}')
    ann_data = r.json()
    ann_id = ann_data.get('data', {}).get('id', '')

    # List annotations (GET /annotations?book_id=...)
    r = client.get(f'{BASE}/annotations', headers=headers, params={'book_id': book_id})
    report('annotations.list', r.status_code == 200, f'status={r.status_code}')

    if ann_id:
        # Update annotation (PATCH)
        r = client.patch(f'{BASE}/annotations/{ann_id}', headers=headers, json={
            'note': 'Updated note text',
        })
        report('annotations.update', r.status_code == 200, f'status={r.status_code}')

        # Delete annotation
        r = client.delete(f'{BASE}/annotations/{ann_id}', headers=headers)
        report('annotations.delete', r.status_code in (200, 204), f'status={r.status_code}')


# ── Phase 4: Reading Sessions ──────────────────────────────────────────────

print('\n=== Phase 4: Reading Sessions ===')

if book_id:
    r = client.post(f'{BASE}/sessions', headers=headers, json={
        'book_id': book_id,
        'duration_seconds': 300,
        'pages_read': 5,
    })
    report('sessions.create', r.status_code in (200, 201), f'status={r.status_code}')

    r = client.get(f'{BASE}/sessions', headers=headers, params={'book_id': book_id})
    report('sessions.list', r.status_code == 200, f'status={r.status_code}')


# ── Phase 5: Collections ──────────────────────────────────────────────────

print('\n=== Phase 5: Collections ===')

r = client.post(f'{BASE}/collections', headers=headers, json={
    'name': 'Test Collection',
    'description': 'A test collection',
})
report('collections.create', r.status_code in (200, 201), f'status={r.status_code}')
coll_data = r.json()
coll_id = coll_data.get('data', {}).get('id', '')

r = client.get(f'{BASE}/collections', headers=headers)
report('collections.list', r.status_code == 200, f'status={r.status_code}')

if coll_id:
    r = client.get(f'{BASE}/collections/{coll_id}', headers=headers)
    report('collections.get', r.status_code == 200, f'status={r.status_code}')


# ── Phase 6: AI Features ──────────────────────────────────────────────────

print('\n=== Phase 6: AI Features ===')

# 6a: Companion chat (POST /agent/chat with book_id in body)
if book_id:
    r = client.post(f'{BASE}/agent/chat', headers=headers, json={
        'book_id': book_id,
        'message': 'What is this book about?',
    })
    report('companion.chat', r.status_code == 200, f'status={r.status_code}')

# 6b: Summarize (POST /agent/summarize)
if book_id:
    r = client.post(f'{BASE}/agent/summarize', headers=headers, json={
        'book_id': book_id,
        'chapter_ids': [],
    })
    report('companion.summarize', r.status_code == 200, f'status={r.status_code}')

# 6c: Explain (POST /agent/explain)
if book_id:
    r = client.post(f'{BASE}/agent/explain', headers=headers, json={
        'book_id': book_id,
        'text': 'In my younger and more vulnerable years my father gave me some advice.',
    })
    report('companion.explain', r.status_code == 200, f'status={r.status_code}')

# 6d: Friend chat (valid personas: sage, penny, alex, quinn, sam)
r = client.post(f'{BASE}/friend/chat', headers=headers, json={
    'persona': 'sage',
    'message': 'Tell me about your reading habits.',
})
report('friend.chat', r.status_code == 200, f'status={r.status_code}')

r = client.get(f'{BASE}/friend/relationship', headers=headers)
report('friend.relationship', r.status_code == 200, f'status={r.status_code}')

# 6e: Knowledge graph (GET /knowledge/graph/{id})
if book_id:
    r = client.get(f'{BASE}/knowledge/graph/{book_id}', headers=headers, params={'force_rebuild': 'true'})
    report('knowledge.build_graph', r.status_code == 200, f'status={r.status_code}')

    r = client.get(f'{BASE}/knowledge/graph', headers=headers)
    report('knowledge.get_graph', r.status_code == 200, f'status={r.status_code}')

    r = client.get(f'{BASE}/knowledge/search', headers=headers, params={'q': 'Gatsby', 'book_id': book_id})
    report('knowledge.search', r.status_code == 200, f'status={r.status_code}')

# 6f: Study mode (POST /study-mode/...)
if book_id:
    r = client.post(f'{BASE}/study-mode/objectives', headers=headers, json={
        'book_id': book_id,
        'chapter_title': 'Chapter 1',
        'chapter_index': 0,
    })
    report('study.objectives', r.status_code == 200, f'status={r.status_code}')

    r = client.post(f'{BASE}/study-mode/concept-checks', headers=headers, json={
        'book_id': book_id,
        'chapter_title': 'Chapter 1',
        'chapter_index': 0,
        'chapter_content': 'The Great Gatsby is a novel by F. Scott Fitzgerald.',
    })
    report('study.concept_checks', r.status_code == 200, f'status={r.status_code}')

    r = client.get(f'{BASE}/study-mode/mastery/{book_id}', headers=headers)
    report('study.mastery', r.status_code == 200, f'status={r.status_code}')

# 6g: Synthesis (POST /synthesis/{book_id} — body also needs book_id)
if book_id:
    r = client.post(f'{BASE}/synthesis/{book_id}', headers=headers, json={
        'book_id': book_id,
        'include_highlights': True,
        'include_notes': True,
        'include_conversations': True,
    })
    report('synthesis.single_book', r.status_code == 200, f'status={r.status_code}')

# 6h: Reading plan (POST /agent/reading-plan)
if book_id:
    r = client.post(f'{BASE}/agent/reading-plan', headers=headers, json={
        'book_id': book_id,
        'total_days': 7,
        'daily_minutes': 30,
    })
    report('reading_plan.generate', r.status_code == 200, f'status={r.status_code}')

    r = client.get(f'{BASE}/agent/reading-plan', headers=headers, params={'book_id': book_id})
    report('reading_plan.get_active', r.status_code == 200, f'status={r.status_code}')

    r = client.post(f'{BASE}/agent/reading-plan/advance', headers=headers, json={
        'book_id': book_id,
    })
    report('reading_plan.advance', r.status_code == 200, f'status={r.status_code}')


# ── Phase 7: Memory Book ──────────────────────────────────────────────────

print('\n=== Phase 7: Memory Book ===')

if book_id:
    r = client.post(f'{BASE}/reading-book/generate', headers=headers, json={
        'book_id': book_id,
        'format': 'personal_book',
    })
    report('memory_book.generate', r.status_code == 200, f'status={r.status_code} url=/reading-book/generate book_id={book_id}')

    r = client.get(f'{BASE}/reading-book/{book_id}', headers=headers)
    report('memory_book.get', r.status_code == 200, f'status={r.status_code}')


# ── Phase 8: Flashcards ───────────────────────────────────────────────────

print('\n=== Phase 8: Flashcards ===')

if book_id:
    r = client.get(f'{BASE}/flashcards', headers=headers, params={'book_id': book_id})
    report('flashcards.list', r.status_code == 200, f'status={r.status_code}')

    # Create a flashcard (question/answer, not front/back)
    r = client.post(f'{BASE}/flashcards', headers=headers, json={
        'book_id': book_id,
        'question': 'Who wrote The Great Gatsby?',
        'answer': 'F. Scott Fitzgerald',
    })
    report('flashcards.create', r.status_code in (200, 201), f'status={r.status_code}')
    fc_data = r.json()
    fc_id = fc_data.get('data', {}).get('id', '')

    if fc_id:
        r = client.post(f'{BASE}/flashcards/{fc_id}/review', headers=headers, json={
            'rating': 3,
        })
        report('flashcards.review', r.status_code == 200, f'status={r.status_code}')


# ── Phase 9: Notifications ────────────────────────────────────────────────

print('\n=== Phase 9: Notifications ===')

r = client.get(f'{BASE}/notifications', headers=headers)
report('notifications.list', r.status_code == 200, f'status={r.status_code}')


# ── Phase 10: Stats ───────────────────────────────────────────────────────

print('\n=== Phase 10: Stats ===')

r = client.get(f'{BASE}/stats/dashboard', headers=headers)
report('stats.dashboard', r.status_code == 200, f'status={r.status_code}')

r = client.get(f'{BASE}/stats/reading-calendar', headers=headers)
report('stats.reading_calendar', r.status_code == 200, f'status={r.status_code}')


# ── Phase 11: Export ──────────────────────────────────────────────────────

print('\n=== Phase 11: Export ===')

if book_id:
    # Path-based format: GET /export/{book_id}/{format}
    r = client.get(f'{BASE}/export/{book_id}/csv', headers=headers)
    report('export.annotations_csv', r.status_code == 200, f'status={r.status_code}')

    r = client.get(f'{BASE}/export/{book_id}/bibtex', headers=headers)
    report('export.bibtex', r.status_code == 200, f'status={r.status_code}')

    r = client.get(f'{BASE}/export/{book_id}/html', headers=headers)
    report('export.annotations_html', r.status_code == 200, f'status={r.status_code}')


# ── Phase 12: Book Clubs ──────────────────────────────────────────────────

print('\n=== Phase 12: Book Clubs ===')

r = client.post(f'{BASE}/book-clubs', headers=headers, json={
    'name': 'Test Book Club',
    'description': 'A test club',
})
report('book_clubs.create', r.status_code in (200, 201), f'status={r.status_code}')
club_data = r.json()
club_id = club_data.get('data', {}).get('id', '')

r = client.get(f'{BASE}/book-clubs', headers=headers)
report('book_clubs.list', r.status_code == 200, f'status={r.status_code}')

if club_id:
    r = client.get(f'{BASE}/book-clubs/{club_id}', headers=headers)
    report('book_clubs.get', r.status_code == 200, f'status={r.status_code}')


# ── Phase 13: Webhooks ────────────────────────────────────────────────────

print('\n=== Phase 13: Webhooks ===')

r = client.get(f'{BASE}/webhooks', headers=headers)
report('webhooks.list', r.status_code == 200, f'status={r.status_code}')


# ── Phase 14: API Keys ────────────────────────────────────────────────────

print('\n=== Phase 14: API Keys ===')

r = client.get(f'{BASE}/api-keys', headers=headers)
report('api_keys.list', r.status_code == 200, f'status={r.status_code}')


# ── Phase 15: LLM Logs ────────────────────────────────────────────────────

print('\n=== Phase 15: LLM Logs ===')

r = client.get(f'{BASE}/logs/llm', headers=headers, params={'per_page': 5})
report('logs.llm_list', r.status_code == 200, f'status={r.status_code}')

r = client.get(f'{BASE}/logs/llm/summary', headers=headers, params={'days': 7})
report('logs.llm_summary', r.status_code == 200, f'status={r.status_code}')


# ── Phase 16: Account / Settings ──────────────────────────────────────────

print('\n=== Phase 16: Account / Settings ===')

r = client.get(f'{BASE}/settings', headers=headers)
report('settings.get', r.status_code == 200, f'status={r.status_code}')

# PATCH, not PUT
r = client.patch(f'{BASE}/settings', headers=headers, json={
    'theme': 'dark',
    'readingGoal': 3,
})
report('settings.update', r.status_code == 200, f'status={r.status_code}')


# ── Phase 17: Recommendations ─────────────────────────────────────────────

print('\n=== Phase 17: Recommendations ===')

r = client.get(f'{BASE}/recommendations', headers=headers)
report('recommendations.list', r.status_code == 200, f'status={r.status_code}')


# ── Phase 18: Challenges ──────────────────────────────────────────────────

print('\n=== Phase 18: Challenges ===')

r = client.get(f'{BASE}/challenges', headers=headers)
report('challenges.list', r.status_code == 200, f'status={r.status_code}')


# ── Phase 19: Health ──────────────────────────────────────────────────────

print('\n=== Phase 19: Health ===')

r = client.get(f'{BASE}/health')
report('health.check', r.status_code == 200, f'status={r.status_code}')


# ── Summary ────────────────────────────────────────────────────────────────

print('\n' + '=' * 60)
passed = sum(1 for _, ok, _ in results if ok)
failed = sum(1 for _, ok, _ in results if not ok)
total = len(results)
print(f'Results: {passed}/{total} passed, {failed} failed')

if failed:
    print('\nFailed tests:')
    for name, ok, detail in results:
        if not ok:
            print(f'  FAIL: {name} — {detail}')

print('\n' + '=' * 60)

sys.exit(0 if failed == 0 else 1)
