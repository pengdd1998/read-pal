"""Recommendations routes — deterministic book recommendations.

Scores a curated pool against the user's reading history (authors, genres/tags)
and returns the top 5 matches.  No LLM calls.
"""

from collections import Counter
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.models.book import Book

router = APIRouter(prefix='/api/v1/recommendations', tags=['recommendations'])

# Curated recommendation pool — classic & popular books across genres
_BOOK_POOL: list[dict] = [
    {'title': '1984', 'author': 'George Orwell', 'genre': 'dystopian', 'reason': 'A timeless exploration of surveillance and freedom'},
    {'title': 'Pride and Prejudice', 'author': 'Jane Austen', 'genre': 'romance', 'reason': 'Masterful social commentary wrapped in a love story'},
    {'title': 'The Great Gatsby', 'author': 'F. Scott Fitzgerald', 'genre': 'classic', 'reason': 'A vivid portrait of the American Dream'},
    {'title': 'To Kill a Mockingbird', 'author': 'Harper Lee', 'genre': 'classic', 'reason': 'Powerful narrative on justice and moral growth'},
    {'title': 'Brave New World', 'author': 'Aldous Huxley', 'genre': 'dystopian', 'reason': 'Prescient vision of a pleasure-driven society'},
    {'title': 'The Catcher in the Rye', 'author': 'J.D. Salinger', 'genre': 'coming-of-age', 'reason': 'An iconic story of teenage alienation'},
    {'title': 'Jane Eyre', 'author': 'Charlotte Brontë', 'genre': 'gothic', 'reason': 'A groundbreaking feminist bildungsroman'},
    {'title': 'Wuthering Heights', 'author': 'Emily Brontë', 'genre': 'gothic', 'reason': 'Dark, passionate tale of obsessive love'},
    {'title': 'Dune', 'author': 'Frank Herbert', 'genre': 'sci-fi', 'reason': 'Epic world-building with political depth'},
    {'title': 'The Hobbit', 'author': 'J.R.R. Tolkien', 'genre': 'fantasy', 'reason': 'The beloved precursor to The Lord of the Rings'},
    {'title': 'Fahrenheit 451', 'author': 'Ray Bradbury', 'genre': 'dystopian', 'reason': 'A stirring defense of literature and free thought'},
    {'title': 'Crime and Punishment', 'author': 'Fyodor Dostoevsky', 'genre': 'psychological', 'reason': 'Deep psychological study of guilt and redemption'},
    {'title': 'The Alchemist', 'author': 'Paulo Coelho', 'genre': 'philosophical', 'reason': 'An inspiring fable about following your dreams'},
    {'title': 'Sapiens', 'author': 'Yuval Noah Harari', 'genre': 'non-fiction', 'reason': 'A sweeping history of humankind'},
    {'title': 'Educated', 'author': 'Tara Westover', 'genre': 'memoir', 'reason': 'A remarkable memoir about the power of education'},
    {'title': 'The Road', 'author': 'Cormac McCarthy', 'genre': 'post-apocalyptic', 'reason': 'A haunting meditation on love and survival'},
    {'title': 'Never Let Me Go', 'author': 'Kazuo Ishiguro', 'genre': 'literary', 'reason': 'Quietly devastating exploration of what makes us human'},
    {'title': 'The Handmaid\'s Tale', 'author': 'Margaret Atwood', 'genre': 'dystopian', 'reason': 'A chilling vision of authoritarian control over women'},
    {'title': 'One Hundred Years of Solitude', 'author': 'Gabriel García Márquez', 'genre': 'magical-realism', 'reason': 'The pinnacle of magical realist storytelling'},
    {'title': 'The Name of the Wind', 'author': 'Patrick Rothfuss', 'genre': 'fantasy', 'reason': 'Beautifully written epic fantasy'},
    {'title': 'Neuromancer', 'author': 'William Gibson', 'genre': 'sci-fi', 'reason': 'The novel that defined the cyberpunk genre'},
    {'title': 'Beloved', 'author': 'Toni Morrison', 'genre': 'literary', 'reason': 'A profound meditation on the legacy of slavery'},
    {'title': 'Thinking, Fast and Slow', 'author': 'Daniel Kahneman', 'genre': 'non-fiction', 'reason': 'Essential reading on how we make decisions'},
    {'title': 'The Bell Jar', 'author': 'Sylvia Plath', 'genre': 'literary', 'reason': 'A raw, semi-autobiographical account of mental illness'},
    {'title': 'Frankenstein', 'author': 'Mary Shelley', 'genre': 'gothic', 'reason': 'The original science fiction novel exploring creation'},
    {'title': 'Foundation', 'author': 'Isaac Asimov', 'genre': 'sci-fi', 'reason': 'Grand-scale science fiction about the fall of civilizations'},
    {'title': 'The Left Hand of Darkness', 'author': 'Ursula K. Le Guin', 'genre': 'sci-fi', 'reason': 'A groundbreaking exploration of gender and society'},
    {'title': 'Meditations', 'author': 'Marcus Aurelius', 'genre': 'philosophy', 'reason': 'Timeless Stoic wisdom for everyday life'},
    {'title': 'The Brothers Karamazov', 'author': 'Fyodor Dostoevsky', 'genre': 'philosophical', 'reason': 'A towering novel of faith, doubt, and morality'},
    {'title': 'A Brief History of Time', 'author': 'Stephen Hawking', 'genre': 'non-fiction', 'reason': 'An accessible guide to the universe\'s biggest questions'},
]

# Default recommendations for users with no reading history
_STARTER_RECS: list[dict] = [
    {'title': 'The Great Gatsby', 'author': 'F. Scott Fitzgerald', 'genre': 'classic', 'reason': 'Start with a timeless American classic'},
    {'title': '1984', 'author': 'George Orwell', 'genre': 'dystopian', 'reason': 'Essential reading for understanding modern society'},
    {'title': 'Sapiens', 'author': 'Yuval Noah Harari', 'genre': 'non-fiction', 'reason': 'A fascinating overview of human history'},
    {'title': 'The Alchemist', 'author': 'Paulo Coelho', 'genre': 'philosophical', 'reason': 'An inspiring short read to begin your journey'},
    {'title': 'The Hobbit', 'author': 'J.R.R. Tolkien', 'genre': 'fantasy', 'reason': 'A delightful adventure for all ages'},
]


def _score_book(
    candidate: dict,
    user_authors: Counter[str],
    user_genres: Counter[str],
    read_titles: set[str],
) -> float:
    """Score a candidate book against user preferences. Returns 0 if already read."""
    title_lower = candidate['title'].lower()
    if title_lower in read_titles or any(
        title_lower == t.lower() for t in read_titles
    ):
        return 0.0

    score = 0.1  # baseline
    genre = candidate['genre'].lower()
    author = candidate['author'].lower()

    # Genre overlap (weighted most)
    for g, count in user_genres.items():
        if genre in g.lower() or g.lower() in genre:
            score += 0.3 * min(count, 3)
            break

    # Author overlap
    for a, count in user_authors.items():
        if author in a.lower() or a.lower() in author:
            score += 0.4 * min(count, 2)
            break

    return min(score, 1.0)


@router.get('/')
async def list_recommendations(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return book recommendations based on user reading history."""
    user_id = UUID(current_user['id'])

    # Fetch all user books (completed + reading)
    book_rows = (await db.execute(
        select(Book).where(Book.user_id == user_id)
    )).scalars().all()

    # Build user profile
    user_authors: Counter[str] = Counter()
    user_genres: Counter[str] = Counter()
    read_titles: set[str] = set()

    for book in book_rows:
        read_titles.add(book.title.lower())
        user_authors[book.author.lower()] += 1
        for tag in (book.tags or []):
            user_genres[tag.lower()] += 1

    # No history — return starter picks
    if not book_rows:
        recommendations = [
            {**r, 'relevance': round(0.7 + i * 0.05, 2)}
            for i, r in enumerate(_STARTER_RECS)
        ]
        return {'success': True, 'data': {'recommendations': recommendations}}

    # Score and rank candidates
    scored = [
        (cand, _score_book(cand, user_authors, user_genres, read_titles))
        for cand in _BOOK_POOL
    ]
    scored.sort(key=lambda x: x[1], reverse=True)

    top = [
        {**cand, 'relevance': round(max(score, 0.1), 2)}
        for cand, score in scored[:5]
        if score > 0
    ]

    # Pad with highest-scoring remaining if fewer than 5
    if len(top) < 5:
        seen = {(r['title'], r['author']) for r in top}
        for cand, score in scored:
            if (cand['title'], cand['author']) not in seen:
                top.append({**cand, 'relevance': round(max(score, 0.1), 2)})
                seen.add((cand['title'], cand['author']))
            if len(top) >= 5:
                break

    return {'success': True, 'data': {'recommendations': top}}
