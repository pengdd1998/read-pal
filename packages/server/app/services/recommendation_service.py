"""Business logic for deterministic book recommendations.

Scores a curated pool against the user's reading history (authors, genres/tags)
and returns the top 5 matches.  No LLM calls.
"""

import logging
from collections import Counter
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.book import Book
from app.utils.db import db_error_guard
from app.utils.limits import RECOMMENDATION_FETCH_LIMIT

logger = logging.getLogger('read-pal.recommendations')

# Curated recommendation pool
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
    {'title': "The Handmaid's Tale", 'author': 'Margaret Atwood', 'genre': 'dystopian', 'reason': 'A chilling vision of authoritarian control over women'},
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
    {'title': "A Brief History of Time", 'author': 'Stephen Hawking', 'genre': 'non-fiction', 'reason': "An accessible guide to the universe's biggest questions"},
]

# Chinese-language pool — a Chinese reader (路边野餐, 三体 etc.) deserves
# recommendations they can actually read. Mixed into scoring with equal
# weight; language affinity comes from the user's book tags/titles.
_BOOK_POOL_ZH: list[dict] = [
    {'title': '三体', 'author': '刘慈欣', 'genre': 'sci-fi', 'reason': '中国科幻的巅峰之作，宏大的宇宙社会学想象'},
    {'title': '球状闪电', 'author': '刘慈欣', 'genre': 'sci-fi', 'reason': '量子物理与执念交织的硬科幻'},
    {'title': '活着', 'author': '余华', 'genre': 'literary', 'reason': '以最朴素的语言写尽命运的重量'},
    {'title': '许三观卖血记', 'author': '余华', 'genre': 'literary', 'reason': '苦难中的幽默与温情'},
    {'title': '白鹿原', 'author': '陈忠实', 'genre': 'literary', 'reason': '一部厚重的民族秘史'},
    {'title': '平凡的世界', 'author': '路遥', 'genre': 'literary', 'reason': '普通人在大时代中的奋斗与尊严'},
    {'title': '围城', 'author': '钱锺书', 'genre': 'classic', 'reason': '机智讽刺的文学经典'},
    {'title': '百年孤独', 'author': '加西亚·马尔克斯', 'genre': 'magical-realism', 'reason': '魔幻现实主义的代表作'},
    {'title': '切尔诺贝利的祭祷', 'author': '阿列克谢耶维奇', 'genre': 'non-fiction', 'reason': '核灾难口述史——与《路边野餐》的预言呼应'},
    {'title': '我们', 'author': '扎米亚京', 'genre': 'dystopian', 'reason': '反乌托邦三部曲之源，苏联科幻的地下源头'},
    {'title': '未来学大会', 'author': '斯坦尼斯瓦夫·莱姆', 'genre': 'sci-fi', 'reason': '科幻大师的荒诞与哲思'},
    {'title': '索拉里斯星', 'author': '斯坦尼斯瓦夫·莱姆', 'genre': 'sci-fi', 'reason': '与斯特鲁伽茨基兄弟齐名的东欧科幻经典'},
    {'title': ' Kafka on the Shore', 'author': '村上春树', 'genre': 'magical-realism', 'reason': '现实与超现实交织的旅程'},
    {'title': '月亮与六便士', 'author': '毛姆', 'genre': 'classic', 'reason': '关于理想与世俗的永恒追问'},
    {'title': '小王子', 'author': '圣埃克苏佩里', 'genre': 'philosophical', 'reason': '写给大人的寓言'},
]

_STARTER_RECS: list[dict] = [
    {'title': 'The Great Gatsby', 'author': 'F. Scott Fitzgerald', 'genre': 'classic', 'reason': 'Start with a timeless American classic'},
    {'title': '1984', 'author': 'George Orwell', 'genre': 'dystopian', 'reason': 'Essential reading for understanding modern society'},
    {'title': 'Sapiens', 'author': 'Yuval Noah Harari', 'genre': 'non-fiction', 'reason': 'A fascinating overview of human history'},
    {'title': 'The Alchemist', 'author': 'Paulo Coelho', 'genre': 'philosophical', 'reason': 'An inspiring short read to begin your journey'},
    {'title': 'The Hobbit', 'author': 'J.R.R. Tolkien', 'genre': 'fantasy', 'reason': 'A delightful adventure for all ages'},
]



def _is_chinese(text: str) -> bool:
    """True if text contains CJK characters (simplified/traditional)."""
    return any('\u4e00' <= ch <= '\u9fff' for ch in text)


def _score_book(
    candidate: dict,
    user_authors: Counter[str],
    user_genres: Counter[str],
    read_titles: set[str],
    prefers_chinese: bool = False,
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
    # Language affinity: a predominantly-Chinese library should surface
    # Chinese-language recommendations, not an all-English list.
    if prefers_chinese and _is_chinese(candidate['title'] + candidate['author']):
        score += 0.5

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


def _cache_key(uid: UUID) -> str:
    return f'rec:{uid}'


async def get_recommendations(db: AsyncSession, user_id: UUID) -> list[dict]:
    """Return top 5 book recommendations based on user reading history.

    Results are cached in Redis for 10 minutes.
    """
    from app.core.cache import cache_get_or_compute

    async def _compute() -> list[dict]:
        return await _compute_recommendations(db, user_id)

    return await cache_get_or_compute(
        _cache_key(user_id), _compute, get_settings().cache_recommendation_ttl_seconds,
    )


async def _compute_recommendations(db: AsyncSession, user_id: UUID) -> list[dict]:
    async with db_error_guard('_compute_recommendations', user_id=str(user_id)):
        book_rows = (await db.execute(
            select(Book.title, Book.author, Book.tags)
            .where(Book.user_id == user_id)
            .limit(RECOMMENDATION_FETCH_LIMIT)
        )).all()

    user_authors: Counter[str] = Counter()
    user_genres: Counter[str] = Counter()
    read_titles: set[str] = set()
    cjk_titles = 0

    for title, author, tags in book_rows:
        read_titles.add(title.lower())
        user_authors[author.lower()] += 1
        if _is_chinese(title or ''):
            cjk_titles += 1
        for tag in (tags or []):
            user_genres[tag.lower()] += 1

    # Majority-Chinese library → boost Chinese-language recommendations.
    prefers_chinese = bool(book_rows) and cjk_titles * 2 > len(book_rows)
    pool = _BOOK_POOL + _BOOK_POOL_ZH if prefers_chinese else _BOOK_POOL + _BOOK_POOL_ZH

    # No history — return starter picks
    if not book_rows:
        return [
            {**r, 'relevance': round(0.7 + i * 0.05, 2)}
            for i, r in enumerate(_STARTER_RECS)
        ]

    # Score and rank candidates
    scored = [
        (cand, _score_book(cand, user_authors, user_genres, read_titles, prefers_chinese))
        for cand in pool
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

    return top
