#!/usr/bin/env python3
"""Production simulation test — exercises all API endpoints against a live deployment.

Usage:
  python scripts/sim-test.py [--base-url http://175.178.66.207]
"""

import argparse
import sys
import time
from dataclasses import dataclass, field

import httpx

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
DEFAULT_BASE = 'http://175.178.66.207'
TIMEOUT = 60.0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@dataclass
class Result:
    ok: int = 0
    fail: int = 0
    skip: int = 0
    errors: list[str] = field(default_factory=list)


def pp(method: str, path: str, status: int) -> str:
    icon = '✅' if status < 400 else '❌'
    return f'  {icon} {method:>6} {path} → {status}'


def auth_header(token: str) -> dict:
    return {'Authorization': f'Bearer {token}'}


def check(r: Result, label: str, res: httpx.Response, expect: tuple = (200,)):
    if res.status_code in expect:
        r.ok += 1
    else:
        r.fail += 1
        r.errors.append(f'{label}: {res.status_code} {res.text[:200]}')


def safe(fn, *args, **kwargs):
    """Run a test function, catch timeouts and errors."""
    try:
        fn(*args, **kwargs)
    except (httpx.ReadTimeout, httpx.ConnectTimeout) as e:
        print(f'  ⏱  TIMEOUT: {e}')
        return False
    except Exception as e:
        print(f'  💥 ERROR: {e}')
        return False
    return True


# ---------------------------------------------------------------------------
# Test suites
# ---------------------------------------------------------------------------

def test_health(c: httpx.Client, r: Result):
    print('\n── Health ──')
    res = c.get('/api/v1/health')
    print(pp('GET', '/api/v1/health', res.status_code))
    check(r, 'health', res)


def test_auth(c: httpx.Client, r: Result) -> str:
    print('\n── Auth ──')
    email = f'simtest_{int(time.time())}@test.com'
    pwd = 'SimTest123!'

    # register
    res = c.post('/api/v1/auth/register', json={
        'email': email, 'password': pwd, 'name': 'Sim Test',
        'confirmPassword': pwd,
    })
    print(pp('POST', '/auth/register', res.status_code))
    if res.status_code not in (200, 201):
        r.fail += 1
        r.errors.append(f'register: {res.status_code} {res.text[:200]}')
        return ''
    r.ok += 1

    token = res.json().get('data', {}).get('token', '')

    # me
    res = c.get('/api/v1/auth/me', headers=auth_header(token))
    print(pp('GET', '/auth/me', res.status_code))
    check(r, 'auth/me', res)

    # profile update (account router uses /auth prefix)
    res = c.patch('/api/v1/auth/me', json={'name': 'Sim Updated'}, headers=auth_header(token))
    print(pp('PATCH', '/auth/me (profile)', res.status_code))
    check(r, 'account/me', res)

    return token


def test_books(c: httpx.Client, r: Result, token: str) -> str:
    print('\n── Books ──')
    h = auth_header(token)
    book_id = ''

    # create
    res = c.post('/api/v1/books/', json={
        'title': 'The Great Gatsby', 'author': 'F. Scott Fitzgerald',
        'file_type': 'epub', 'file_size': 1024000, 'total_pages': 180,
    }, headers=h)
    print(pp('POST', '/books/', res.status_code))
    if res.status_code in (200, 201):
        book_id = res.json().get('data', {}).get('id', '')
        r.ok += 1
    else:
        r.fail += 1
        r.errors.append(f'create book: {res.status_code} {res.text[:200]}')

    # list
    res = c.get('/api/v1/books/', headers=h)
    print(pp('GET', '/books/', res.status_code))
    check(r, 'books list', res)

    # stats
    res = c.get('/api/v1/books/stats', headers=h)
    print(pp('GET', '/books/stats', res.status_code))
    check(r, 'books stats', res)

    if book_id:
        res = c.get(f'/api/v1/books/{book_id}', headers=h)
        print(pp('GET', f'/books/{book_id}', res.status_code))
        check(r, 'book get', res)

        res = c.patch(f'/api/v1/books/{book_id}', json={'current_page': 50}, headers=h)
        print(pp('PATCH', f'/books/{book_id}', res.status_code))
        check(r, 'book update', res)

        res = c.put(f'/api/v1/books/{book_id}/tags', json={'tags': ['classic', 'fiction']}, headers=h)
        print(pp('PUT', f'/books/{book_id}/tags', res.status_code))
        check(r, 'book tags', res)
    else:
        r.skip += 3

    # seed-sample
    res = c.post('/api/v1/books/seed-sample', headers=h)
    print(pp('POST', '/books/seed-sample', res.status_code))
    check(r, 'seed-sample', res, (200, 201))

    return book_id


def test_annotations(c: httpx.Client, r: Result, token: str, book_id: str):
    print('\n── Annotations ──')
    h = auth_header(token)
    ann_id = ''

    if book_id:
        # highlight
        res = c.post('/api/v1/annotations/', json={
            'book_id': book_id, 'type': 'highlight',
            'location': {'page': 180, 'chapter': 'Chapter 9'},
            'content': 'So we beat on, boats against the current...',
            'color': '#FFD700',
        }, headers=h)
        print(pp('POST', '/annotations/ (highlight)', res.status_code))
        if res.status_code in (200, 201):
            ann_id = res.json().get('data', {}).get('id', '')
            r.ok += 1
        else:
            r.fail += 1
            r.errors.append(f'annotation create: {res.status_code} {res.text[:200]}')

        # note
        res = c.post('/api/v1/annotations/', json={
            'book_id': book_id, 'type': 'note',
            'location': {'page': 42, 'chapter': 'Chapter 3'},
            'content': 'The green light symbolism',
            'note': 'Represents Gatsby\'s hopes and dreams',
        }, headers=h)
        print(pp('POST', '/annotations/ (note)', res.status_code))
        check(r, 'annotation note', res, (200, 201))
    else:
        r.skip += 2

    # list
    res = c.get('/api/v1/annotations/', headers=h)
    print(pp('GET', '/annotations/', res.status_code))
    check(r, 'annotations list', res)

    if book_id:
        res = c.get(f'/api/v1/annotations/search?q=beat&book_id={book_id}', headers=h)
        print(pp('GET', '/annotations/search', res.status_code))
        check(r, 'annotations search', res)

        res = c.get('/api/v1/annotations/tags', headers=h)
        print(pp('GET', '/annotations/tags', res.status_code))
        check(r, 'annotations tags', res)

        res = c.get(f'/api/v1/annotations/stats/chapters?book_id={book_id}', headers=h)
        print(pp('GET', '/annotations/stats/chapters', res.status_code))
        check(r, 'annotations chapter stats', res)
    else:
        r.skip += 3

    if ann_id:
        res = c.get(f'/api/v1/annotations/{ann_id}', headers=h)
        print(pp('GET', f'/annotations/{ann_id}', res.status_code))
        check(r, 'annotation get', res)

        res = c.patch(f'/api/v1/annotations/{ann_id}', json={'color': '#00FF00'}, headers=h)
        print(pp('PATCH', f'/annotations/{ann_id}', res.status_code))
        check(r, 'annotation update', res)

        res = c.delete(f'/api/v1/annotations/{ann_id}', headers=h)
        print(pp('DELETE', f'/annotations/{ann_id}', res.status_code))
        check(r, 'annotation delete', res, (200, 204))
    else:
        r.skip += 3


def test_reading_sessions(c: httpx.Client, r: Result, token: str, book_id: str):
    print('\n── Reading Sessions ──')
    h = auth_header(token)
    session_id = ''

    if book_id:
        res = c.post('/api/v1/reading-sessions/start', json={'book_id': book_id}, headers=h)
        print(pp('POST', '/reading-sessions/start', res.status_code))
        if res.status_code in (200, 201):
            session_id = res.json().get('data', {}).get('id', '')
            r.ok += 1
        else:
            r.fail += 1
            r.errors.append(f'session start: {res.status_code} {res.text[:200]}')
    else:
        r.skip += 1

    # list
    res = c.get('/api/v1/reading-sessions/', headers=h)
    print(pp('GET', '/reading-sessions/', res.status_code))
    check(r, 'sessions list', res)

    # active (requires book_id)
    if book_id:
        res = c.get(f'/api/v1/reading-sessions/active?book_id={book_id}', headers=h)
        print(pp('GET', '/reading-sessions/active', res.status_code))
        check(r, 'sessions active', res, (200, 404))
    else:
        r.skip += 1

    # stats
    res = c.get('/api/v1/reading-sessions/stats', headers=h)
    print(pp('GET', '/reading-sessions/stats', res.status_code))
    check(r, 'sessions stats', res)

    if session_id:
        res = c.get(f'/api/v1/reading-sessions/{session_id}', headers=h)
        print(pp('GET', f'/reading-sessions/{session_id}', res.status_code))
        check(r, 'session get', res)

        res = c.patch(f'/api/v1/reading-sessions/{session_id}/heartbeat', headers=h)
        print(pp('PATCH', f'/reading-sessions/{session_id}/heartbeat', res.status_code))
        check(r, 'session heartbeat', res)

        res = c.post(f'/api/v1/reading-sessions/{session_id}/end', json={'end_page': 100}, headers=h)
        print(pp('POST', f'/reading-sessions/{session_id}/end', res.status_code))
        check(r, 'session end', res)
    else:
        r.skip += 3

    if book_id:
        res = c.get(f'/api/v1/reading-sessions/book/{book_id}/log', headers=h)
        print(pp('GET', f'/reading-sessions/book/{book_id}/log', res.status_code))
        check(r, 'session book log', res)
    else:
        r.skip += 1


def test_collections(c: httpx.Client, r: Result, token: str, book_id: str):
    print('\n── Collections ──')
    h = auth_header(token)
    coll_id = ''

    # create
    res = c.post('/api/v1/collections/', json={'name': 'My Favorites', 'description': 'Test'}, headers=h)
    print(pp('POST', '/collections/', res.status_code))
    if res.status_code in (200, 201):
        coll_id = res.json().get('data', {}).get('id', '')
        r.ok += 1
    else:
        r.fail += 1

    # list
    res = c.get('/api/v1/collections/', headers=h)
    print(pp('GET', '/collections/', res.status_code))
    check(r, 'collections list', res)

    if coll_id:
        res = c.get(f'/api/v1/collections/{coll_id}', headers=h)
        print(pp('GET', f'/collections/{coll_id}', res.status_code))
        check(r, 'collection get', res)

        res = c.patch(f'/api/v1/collections/{coll_id}', json={'name': 'Updated'}, headers=h)
        print(pp('PATCH', f'/collections/{coll_id}', res.status_code))
        check(r, 'collection update', res)

        res = c.get(f'/api/v1/collections/{coll_id}/books', headers=h)
        print(pp('GET', f'/collections/{coll_id}/books', res.status_code))
        check(r, 'collection books', res)

        if book_id:
            # add book to collection (using the add endpoint with book_id in body)
            res = c.post(f'/api/v1/collections/{coll_id}/books/{book_id}', headers=h)
            print(pp('POST', f'/collections/{coll_id}/books/{book_id}', res.status_code))
            check(r, 'collection add book', res, (200, 201))

            res = c.delete(f'/api/v1/collections/{coll_id}/books/{book_id}', headers=h)
            print(pp('DELETE', f'/collections/{coll_id}/books/{book_id}', res.status_code))
            check(r, 'collection remove book', res, (200, 204))
        else:
            r.skip += 2

        res = c.delete(f'/api/v1/collections/{coll_id}', headers=h)
        print(pp('DELETE', f'/collections/{coll_id}', res.status_code))
        check(r, 'collection delete', res, (200, 204))
    else:
        r.skip += 6


def test_flashcards(c: httpx.Client, r: Result, token: str, book_id: str):
    print('\n── Flashcards ──')
    h = auth_header(token)
    card_id = ''

    res = c.get('/api/v1/flashcards/', headers=h)
    print(pp('GET', '/flashcards/', res.status_code))
    check(r, 'flashcards list', res)

    res = c.get('/api/v1/flashcards/decks', headers=h)
    print(pp('GET', '/flashcards/decks', res.status_code))
    check(r, 'flashcards decks', res)

    res = c.get('/api/v1/flashcards/due', headers=h)
    print(pp('GET', '/flashcards/due', res.status_code))
    check(r, 'flashcards due', res)

    if book_id:
        res = c.post('/api/v1/flashcards/', json={
            'book_id': book_id, 'question': 'Who wrote Gatsby?', 'answer': 'F. Scott Fitzgerald',
        }, headers=h)
        print(pp('POST', '/flashcards/', res.status_code))
        if res.status_code in (200, 201):
            card_id = res.json().get('data', {}).get('id', '')
            r.ok += 1
        else:
            r.fail += 1
            r.errors.append(f'flashcard create: {res.status_code} {res.text[:200]}')
    else:
        r.skip += 1

    if card_id:
        res = c.post(f'/api/v1/flashcards/{card_id}/review', json={'rating': 4}, headers=h)
        print(pp('POST', f'/flashcards/{card_id}/review', res.status_code))
        check(r, 'flashcard review', res)
    else:
        r.skip += 1

    res = c.get('/api/v1/flashcards/review', headers=h)
    print(pp('GET', '/flashcards/review', res.status_code))
    check(r, 'flashcards review queue', res)


def test_stats(c: httpx.Client, r: Result, token: str):
    print('\n── Stats ──')
    h = auth_header(token)
    for ep in ['/dashboard', '/reading-calendar', '/reading-speed', '/reading-speed/by-book']:
        res = c.get(f'/api/v1/stats{ep}', headers=h)
        print(pp('GET', f'/stats{ep}', res.status_code))
        check(r, f'stats{ep}', res)


def test_settings(c: httpx.Client, r: Result, token: str):
    print('\n── Settings ──')
    h = auth_header(token)

    res = c.get('/api/v1/settings/', headers=h)
    print(pp('GET', '/settings/', res.status_code))
    check(r, 'settings get', res)

    res = c.patch('/api/v1/settings/', json={'theme': 'dark', 'daily_reading_goal': 30}, headers=h)
    print(pp('PATCH', '/settings/', res.status_code))
    check(r, 'settings update', res)

    res = c.get('/api/v1/settings/reading-goals', headers=h)
    print(pp('GET', '/settings/reading-goals', res.status_code))
    check(r, 'settings reading-goals', res)


def test_discovery(c: httpx.Client, r: Result, token: str):
    print('\n── Discovery ──')
    h = auth_header(token)

    res = c.get('/api/v1/discovery/search?query=gatsby', headers=h)
    print(pp('GET', '/discovery/search', res.status_code))
    check(r, 'discovery search', res)

    res = c.get('/api/v1/discovery/free-books', headers=h)
    print(pp('GET', '/discovery/free-books', res.status_code))
    check(r, 'discovery free-books', res)


def test_notifications(c: httpx.Client, r: Result, token: str):
    print('\n── Notifications ──')
    h = auth_header(token)

    res = c.get('/api/v1/notifications/', headers=h)
    print(pp('GET', '/notifications/', res.status_code))
    check(r, 'notifications list', res)

    res = c.get('/api/v1/notifications/unread-count', headers=h)
    print(pp('GET', '/notifications/unread-count', res.status_code))
    check(r, 'notifications unread', res)

    res = c.post('/api/v1/notifications/mark-all-read', headers=h)
    print(pp('POST', '/notifications/mark-all-read', res.status_code))
    check(r, 'notifications mark-read', res)


def test_knowledge(c: httpx.Client, r: Result, token: str, book_id: str):
    print('\n── Knowledge Graph ──')
    h = auth_header(token)

    safe(c.get, '/api/v1/knowledge/themes', headers=h, timeout=30.0)
    if safe.__wrapped__ if hasattr(safe, '__wrapped__') else True:
        try:
            res = c.get('/api/v1/knowledge/themes', timeout=30.0, headers=h)
            print(pp('GET', '/knowledge/themes', res.status_code))
            check(r, 'knowledge themes', res)
        except Exception as e:
            print(f'  ⏱  /knowledge/themes → TIMEOUT/ERROR')
            r.fail += 1
            r.errors.append(f'knowledge themes: {e}')

    for ep in ['/api/v1/knowledge/graph', f'/api/v1/knowledge/graph/{book_id}' if book_id else None, f'/api/v1/knowledge/concepts/{book_id}' if book_id else None, f'/api/v1/knowledge/search?q=test&book_id={book_id}' if book_id else None]:
        if ep is None:
            r.skip += 1
            continue
        label = ep.split('/api/v1')[1]
        try:
            res = c.get(ep, timeout=30.0, headers=h)
            print(pp('GET', label, res.status_code))
            check(r, f'knowledge{label}', res)
        except Exception as e:
            print(f'  ⏱  {label} → TIMEOUT/ERROR')
            r.fail += 1
            r.errors.append(f'knowledge{label}: {e}')


def test_recommendations(c: httpx.Client, r: Result, token: str):
    print('\n── Recommendations ──')
    h = auth_header(token)

    res = c.get('/api/v1/recommendations/', headers=h)
    print(pp('GET', '/recommendations/', res.status_code))
    check(r, 'recommendations', res)


def test_challenges(c: httpx.Client, r: Result, token: str):
    print('\n── Challenges ──')
    h = auth_header(token)

    res = c.get('/api/v1/challenges/', headers=h)
    print(pp('GET', '/challenges/', res.status_code))
    check(r, 'challenges', res)


def test_book_clubs(c: httpx.Client, r: Result, token: str, book_id: str):
    print('\n── Book Clubs ──')
    h = auth_header(token)
    club_id = ''

    res = c.post('/api/v1/book-clubs/', json={
        'name': 'Test Club', 'description': 'Sim test club',
        'book_id': book_id, 'max_members': 10,
    }, headers=h)
    print(pp('POST', '/book-clubs/', res.status_code))
    if res.status_code in (200, 201):
        club_id = res.json().get('data', {}).get('id', '')
        r.ok += 1
    else:
        r.fail += 1
        r.errors.append(f'book-club create: {res.status_code} {res.text[:200]}')

    res = c.get('/api/v1/book-clubs/discover', headers=h)
    print(pp('GET', '/book-clubs/discover', res.status_code))
    check(r, 'clubs discover', res)

    res = c.get('/api/v1/book-clubs/', headers=h)
    print(pp('GET', '/book-clubs/', res.status_code))
    check(r, 'clubs list', res)

    if club_id:
        for ep, method, expect in [
            (f'/book-clubs/{club_id}', 'GET', (200,)),
            (f'/book-clubs/{club_id}/members', 'GET', (200,)),
            (f'/book-clubs/{club_id}/progress', 'GET', (200,)),
            (f'/book-clubs/{club_id}/discussions', 'GET', (200,)),
        ]:
            res = c.get(f'/api/v1{ep}', headers=h)
            print(pp('GET', ep, res.status_code))
            check(r, ep, res, expect)

        # create discussion
        res = c.post(f'/api/v1/book-clubs/{club_id}/discussions', json={
            'title': 'Test Discussion', 'content': 'What do you think?',
        }, headers=h)
        print(pp('POST', f'/book-clubs/{club_id}/discussions', res.status_code))
        check(r, 'club discussion create', res, (200, 201))

        # update
        res = c.patch(f'/api/v1/book-clubs/{club_id}', json={'description': 'Updated'}, headers=h)
        print(pp('PATCH', f'/book-clubs/{club_id}', res.status_code))
        check(r, 'club update', res)

        # leave (creator can't leave — accept 400)
        res = c.post(f'/api/v1/book-clubs/{club_id}/leave', headers=h)
        print(pp('POST', f'/book-clubs/{club_id}/leave', res.status_code))
        check(r, 'club leave', res, (200, 400))
    else:
        r.skip += 7


def test_webhooks(c: httpx.Client, r: Result, token: str):
    print('\n── Webhooks ──')
    h = auth_header(token)
    wh_id = ''

    res = c.get('/api/v1/webhooks/events', headers=h)
    print(pp('GET', '/webhooks/events', res.status_code))
    check(r, 'webhook events', res)

    res = c.post('/api/v1/webhooks/', json={
        'url': 'https://httpbin.org/post', 'events': ['book.started', 'annotation.created'],
    }, headers=h)
    print(pp('POST', '/webhooks/', res.status_code))
    if res.status_code in (200, 201):
        wh_id = res.json().get('data', {}).get('id', '')
        r.ok += 1
    else:
        r.fail += 1
        r.errors.append(f'webhook create: {res.status_code} {res.text[:200]}')

    res = c.get('/api/v1/webhooks/', headers=h)
    print(pp('GET', '/webhooks/', res.status_code))
    check(r, 'webhooks list', res)

    if wh_id:
        res = c.patch(f'/api/v1/webhooks/{wh_id}', json={'events': ['book.started', 'annotation.created']}, headers=h)
        print(pp('PATCH', f'/webhooks/{wh_id}', res.status_code))
        check(r, 'webhook update', res)

        res = c.get(f'/api/v1/webhooks/{wh_id}/deliveries', headers=h)
        print(pp('GET', f'/webhooks/{wh_id}/deliveries', res.status_code))
        check(r, 'webhook deliveries', res)

        res = c.post(f'/api/v1/webhooks/{wh_id}/test', headers=h)
        print(pp('POST', f'/webhooks/{wh_id}/test', res.status_code))
        check(r, 'webhook test', res)

        res = c.delete(f'/api/v1/webhooks/{wh_id}', headers=h)
        print(pp('DELETE', f'/webhooks/{wh_id}', res.status_code))
        check(r, 'webhook delete', res, (200, 204))
    else:
        r.skip += 4


def test_share(c: httpx.Client, r: Result, token: str, book_id: str):
    print('\n── Share ──')
    h = auth_header(token)

    if book_id:
        res = c.post('/api/v1/share/', json={'book_id': book_id, 'type': 'annotation', 'format': 'image', 'title': 'My Reading Highlights'}, headers=h)
        print(pp('POST', '/share/', res.status_code))
        check(r, 'share create', res, (200, 201))

        res = c.get('/api/v1/share/reading-card', headers=h)
        print(pp('GET', '/share/reading-card', res.status_code))
        check(r, 'share reading-card', res)
    else:
        r.skip += 2

    res = c.get('/api/v1/share/', headers=h)
    print(pp('GET', '/share/', res.status_code))
    check(r, 'share list', res)


def test_api_keys(c: httpx.Client, r: Result, token: str):
    print('\n── API Keys ──')
    h = auth_header(token)
    key_id = ''

    res = c.post('/api/v1/api-keys/', json={'name': 'Sim Test Key'}, headers=h)
    print(pp('POST', '/api-keys/', res.status_code))
    if res.status_code in (200, 201):
        key_id = res.json().get('data', {}).get('id', '')
        r.ok += 1
    else:
        r.fail += 1

    res = c.get('/api/v1/api-keys/', headers=h)
    print(pp('GET', '/api-keys/', res.status_code))
    check(r, 'api-keys list', res)

    if key_id:
        res = c.delete(f'/api/v1/api-keys/{key_id}', headers=h)
        print(pp('DELETE', f'/api-keys/{key_id}', res.status_code))
        check(r, 'api-key delete', res, (200, 204))
    else:
        r.skip += 1


def test_interventions(c: httpx.Client, r: Result, token: str):
    print('\n── Interventions ──')
    h = auth_header(token)

    res = c.post('/api/v1/interventions/check', json={'trigger': 'reading_pause'}, headers=h)
    print(pp('POST', '/interventions/check', res.status_code))
    check(r, 'interventions check', res)


def test_study_mode(c: httpx.Client, r: Result, token: str, book_id: str):
    print('\n── Study Mode ──')
    h = auth_header(token)

    if book_id:
        res = c.get(f'/api/v1/study-mode/mastery/{book_id}', headers=h)
        print(pp('GET', f'/study-mode/mastery/{book_id}', res.status_code))
        check(r, 'study-mode mastery', res)
    else:
        r.skip += 1


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description='Production simulation test')
    parser.add_argument('--base-url', default=DEFAULT_BASE)
    args = parser.parse_args()

    base = args.base_url.rstrip('/')
    r = Result()

    print(f'=== read-pal Production Simulation ===')
    print(f'Target: {base}')
    print(f'Time:   {time.strftime("%Y-%m-%d %H:%M:%S")}')

    with httpx.Client(base_url=base, timeout=TIMEOUT, follow_redirects=True) as c:
        test_health(c, r)
        token = test_auth(c, r)

        if not token:
            print('\n❌ FATAL: No auth token — aborting.')
            print_summary(r)
            sys.exit(1)

        book_id = test_books(c, r, token)
        test_annotations(c, r, token, book_id)
        test_reading_sessions(c, r, token, book_id)
        test_collections(c, r, token, book_id)
        test_flashcards(c, r, token, book_id)
        test_stats(c, r, token)
        test_settings(c, r, token)
        test_discovery(c, r, token)
        test_notifications(c, r, token)
        test_knowledge(c, r, token, book_id)
        test_recommendations(c, r, token)
        test_challenges(c, r, token)
        test_book_clubs(c, r, token, book_id)
        test_webhooks(c, r, token)
        test_share(c, r, token, book_id)
        test_api_keys(c, r, token)
        test_interventions(c, r, token)
        test_study_mode(c, r, token, book_id)

        # logout at the very end (token no longer needed)
        res = c.post('/api/v1/auth/logout', headers=auth_header(token))
        print(f'\n── Logout ──')
        print(pp('POST', '/auth/logout', res.status_code))
        check(r, 'logout', res, (200, 201, 204))

    print_summary(r)


def print_summary(r: Result):
    total = r.ok + r.fail + r.skip
    print(f'\n{"="*50}')
    print(f'  RESULTS: {r.ok} passed, {r.fail} failed, {r.skip} skipped ({total} total)')
    pct = (r.ok / total * 100) if total else 0
    print(f'  Pass rate: {pct:.1f}%')
    if r.errors:
        print(f'\n  Errors:')
        for e in r.errors[:20]:
            print(f'    - {e}')
    print(f'{"="*50}')
    sys.exit(1 if r.fail > 0 else 0)


if __name__ == '__main__':
    main()
