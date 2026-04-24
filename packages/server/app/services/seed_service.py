"""Seed service — auto-seed sample data for new users."""

from __future__ import annotations

import json
import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation, AnnotationType
from app.models.book import Book, BookFileType, BookStatus
from app.models.document import Document

logger = logging.getLogger('read-pal.seed')

# Real excerpts from The Great Gatsby (public domain in many jurisdictions)
GATSBY_CHAPTERS = [
    {
        'id': 'ch-1',
        'title': 'Chapter 1',
        'content': (
            '<p>In my younger and more vulnerable years my father gave me some advice '
            "that I've been turning over in my mind ever since.</p>"
            '<p>"Whenever you feel like criticizing anyone," he told me, "just remember '
            'that all the people in this world haven\'t had the advantages that you\'ve had."</p>'
            '<p>He didn\'t say any more, but we\'ve always been unusually communicative in a '
            'reserved way, and I understood that he meant a great deal more than that. In '
            'consequence, I\'m inclined to reserve all judgments, a habit that has opened up '
            'many curious natures to me and also made me the victim of not a few veteran bores.</p>'
            '<p>There was music from my neighbor\'s house through the summer nights. In his '
            'blue gardens men and girls came and went like moths among the whisperings and '
            'the champagne and the stars.</p>'
            '<p>I decided to call to him. Miss Baker had mentioned him at dinner, and that '
            'would do for an introduction. But I didn\'t call to him, for he gave a sudden '
            'intimation that he was content to be alone — he stretched out his arms toward '
            'the dark water in a curious way, and, far as I was from him, I could have sworn '
            'he was trembling. Involuntarily I glanced seaward — and distinguished nothing '
            'except a single green light, minute and far way, that might have been the end '
            'of a dock.</p>'
        ),
    },
    {
        'id': 'ch-2',
        'title': 'Chapter 2 — The Valley of Ashes',
        'content': (
            '<p>About half way between West Egg and New York the motor road hastily joins '
            'the railroad and runs beside it for a quarter of a mile, so as to shrink away '
            'from a certain desolate area of land. This is a valley of ashes — a fantastic '
            'farm where ashes grow like wheat into ridges and hills and grotesque gardens; '
            'where ashes take the forms of houses and chimneys and rising smoke and, finally, '
            'with a transcendent effort, of men who move dimly and already crumbling through '
            'the powdery air.</p>'
            '<p>The eyes of Doctor T. J. Eckleburg are blue and gigantic — their retinas are '
            'one yard high. They look out of no face, but, instead, from a pair of enormous '
            'yellow spectacles which pass over a non-existent nose.</p>'
            '<p>I was within and without, simultaneously enchanted and repelled by the '
            'inexhaustible variety of life.</p>'
        ),
    },
    {
        'id': 'ch-3',
        'title': 'Chapter 3 — Gatsby\'s Parties',
        'content': (
            '<p>There was music from my neighbor\'s house through the summer nights. In his '
            'blue gardens men and girls came and went like moths among the whisperings and '
            'the champagne and the stars.</p>'
            '<p>Every Friday five crates of oranges and lemons arrived from a fruiterer in '
            'New York — every Monday these same oranges and lemons left his back door in a '
            'pyramid of pulpless halves.</p>'
            '<p>I believe that on the first night I went to Gatsby\'s house I was one of the '
            'few guests who had actually been invited. People were not invited — they went '
            'there. They got into automobiles which bore them out to Long Island, and somehow '
            'they ended up at Gatsby\'s door.</p>'
            '<p>He smiled understandingly — much more than understandingly. It was one of those '
            'rare smiles with a quality of eternal reassurance in it, that you may come across '
            'four or five times in life.</p>'
        ),
    },
    {
        'id': 'ch-4',
        'title': 'Chapter 4 — Gatsby\'s Past',
        'content': (
            '<p>On Sunday morning while church bells rang in the villages alongshore, the world '
            'and its mistress returned to Gatsby\'s house and twinkled hilariously on his lawn.</p>'
            '<p>"I\'ll tell you God\'s truth." His right hand suddenly ordered divine retribution '
            'to stand by. "I am the son of some wealthy people in the Middle West — all dead now. '
            'I was brought up in America but educated at Oxford, because all my ancestors have '
            'been educated there for many years. It is a family tradition."</p>'
            '<p>He looked at me sideways — and I knew why Jordan Baker had believed he was lying. '
            'He hurried the phrase "educated at Oxford," or swallowed it, or choked on it as '
            'though it had bothered him before. And with this doubt, his whole statement fell '
            'to pieces, and I wondered if there wasn\'t something a little sinister about him, '
            'after all.</p>'
        ),
    },
    {
        'id': 'ch-5',
        'title': 'Chapter 9 — The Green Light',
        'content': (
            '<p>Gatsby believed in the green light, the orgastic future that year by year recedes '
            'before us. It eluded us then, but that\'s no matter — to-morrow we will run faster, '
            'stretch out our arms farther. . . . And one fine morning —</p>'
            '<p>So we beat on, boats against the current, borne back ceaselessly into the past.</p>'
            '<p>Most of the big shore places were closed now and there were hardly any lights '
            'except the shadowy, moving glow of a ferryboat across the Sound. And as the moon '
            'rose higher the inessential houses began to melt away until gradually I became aware '
            'of the old island here that flowered once for Dutch sailors\' eyes — a fresh, green '
            'breast of the new world.</p>'
        ),
    },
]


async def seed_sample_data(db: AsyncSession, user_id: UUID) -> Book:
    """Create a sample book with annotations so new users see content immediately."""
    sample = Book(
        user_id=user_id,
        title='The Great Gatsby',
        author='F. Scott Fitzgerald',
        file_type=BookFileType.epub,
        file_size=2048,
        total_pages=180,
        current_page=0,
        status=BookStatus.reading,
        progress=5,
        tags=['sample', 'classic', 'fiction'],
        metadata_={
            'year': 1925,
            'publisher': "Charles Scribner's Sons",
            'isbn': '978-0-7432-7356-5',
            'genre': 'Fiction',
            'language': 'English',
        },
    )
    db.add(sample)
    await db.flush()

    # Create a Document with actual chapter content
    full_content = '\n'.join(ch['content'] for ch in GATSBY_CHAPTERS)
    doc = Document(
        book_id=sample.id,
        user_id=user_id,
        content=full_content,
        chapters=GATSBY_CHAPTERS,
    )
    db.add(doc)

    sample_annotations = [
        Annotation(
            user_id=user_id, book_id=sample.id,
            type=AnnotationType.highlight,
            content='In my younger and more vulnerable years my father gave me some advice '
                    "that I've been turning over in my mind ever since.",
            location={'pageIndex': 0, 'chapter': 1, 'position': 0, 'selection': {'start': 0, 'end': 87}},
            note='Famous opening lines — sets the tone for Nick as unreliable narrator',
            tags=['opening', 'narrator', 'key-quote'],
            color='yellow',
        ),
        Annotation(
            user_id=user_id, book_id=sample.id,
            type=AnnotationType.highlight,
            content='a single green light, minute and far way, that might have been the end of a dock',
            location={'pageIndex': 0, 'chapter': 1, 'position': 0, 'selection': {'start': 600, 'end': 670}},
            note='The green light — first mention. Symbolizes Gatsby\'s longing for Daisy.',
            tags=['symbolism', 'green-light', 'daisy'],
            color='green',
        ),
        Annotation(
            user_id=user_id, book_id=sample.id,
            type=AnnotationType.highlight,
            content='This is a valley of ashes — a fantastic farm where ashes grow like wheat',
            location={'pageIndex': 1, 'chapter': 2, 'position': 0, 'selection': {'start': 130, 'end': 195}},
            note='Valley of Ashes represents the moral decay hidden behind the facade of wealth',
            tags=['symbolism', 'decay', 'setting'],
            color='yellow',
        ),
        Annotation(
            user_id=user_id, book_id=sample.id,
            type=AnnotationType.note,
            content='The eyes of Doctor T.J. Eckleburg watch over the Valley of Ashes — '
                    'God watching moral decay?',
            location={'pageIndex': 1, 'chapter': 2, 'position': 0, 'selection': {'start': 300, 'end': 380}},
            tags=['symbolism', 'morality', 'eyes'],
        ),
        Annotation(
            user_id=user_id, book_id=sample.id,
            type=AnnotationType.highlight,
            content='I was within and without, simultaneously enchanted and repelled by the '
                    'inexhaustible variety of life.',
            location={'pageIndex': 1, 'chapter': 2, 'position': 0, 'selection': {'start': 450, 'end': 537}},
            note="Nick's ambivalence — he is both participant and observer",
            tags=['narrator', 'duality', 'key-quote'],
            color='yellow',
        ),
        Annotation(
            user_id=user_id, book_id=sample.id,
            type=AnnotationType.note,
            content="Gatsby's parties represent the excess and emptiness of the Jazz Age. "
                    'Everyone comes but nobody truly knows him.',
            location={'pageIndex': 2, 'chapter': 3, 'position': 0, 'selection': {'start': 0, 'end': 95}},
            tags=['theme', 'jazz-age', 'character'],
        ),
        Annotation(
            user_id=user_id, book_id=sample.id,
            type=AnnotationType.highlight,
            content='It was one of those rare smiles with a quality of eternal reassurance in it',
            location={'pageIndex': 2, 'chapter': 3, 'position': 0, 'selection': {'start': 400, 'end': 470}},
            note='Gatsby\'s magnetic charisma — what draws people to him despite the mystery',
            tags=['character', 'gatsby', 'charisma'],
            color='amber',
        ),
        Annotation(
            user_id=user_id, book_id=sample.id,
            type=AnnotationType.highlight,
            content='Gatsby believed in the green light, the orgastic future that year by year recedes before us.',
            location={'pageIndex': 4, 'chapter': 9, 'position': 0, 'selection': {'start': 0, 'end': 80}},
            note='The green light symbolizes the American Dream — always out of reach',
            tags=['symbolism', 'american-dream', 'ending'],
            color='green',
        ),
        Annotation(
            user_id=user_id, book_id=sample.id,
            type=AnnotationType.highlight,
            content='So we beat on, boats against the current, borne back ceaselessly into the past.',
            location={'pageIndex': 4, 'chapter': 9, 'position': 0, 'selection': {'start': 130, 'end': 204}},
            note='Final line — we are all chasing dreams that pull us backward',
            tags=['ending', 'time', 'key-quote'],
            color='orange',
        ),
        Annotation(
            user_id=user_id, book_id=sample.id,
            type=AnnotationType.bookmark,
            content='Chapter 4: Gatsby tells Nick about his past',
            location={'pageIndex': 3, 'chapter': 4, 'position': 0, 'selection': {'start': 0, 'end': 40}},
        ),
    ]
    db.add_all(sample_annotations)

    # Pre-populate knowledge graph cache so the graph page shows data immediately
    await _seed_graph_cache(user_id, sample.id)

    return sample


# ---------------------------------------------------------------------------
# Pre-built Great Gatsby concepts (avoids needing an LLM call at first load)
# ---------------------------------------------------------------------------

GATSBY_CONCEPTS = [
    {'name': 'The Green Light', 'type': 'symbol', 'related': ['American Dream', 'Gatsby', 'Daisy Buchanan', 'Hope']},
    {'name': 'American Dream', 'type': 'theme', 'related': ['The Green Light', 'Wealth', 'Gatsby', 'Social Class']},
    {'name': 'Gatsby', 'type': 'character', 'related': ['The Green Light', 'Daisy Buchanan', 'Wealth', 'Jay Gatsby']},
    {'name': 'Daisy Buchanan', 'type': 'character', 'related': ['Gatsby', 'The Green Light', 'Tom Buchanan', 'Love']},
    {'name': 'Nick Carraway', 'type': 'character', 'related': ['Gatsby', 'Daisy Buchanan', 'Narrator', 'Moral Decay']},
    {'name': 'Tom Buchanan', 'type': 'character', 'related': ['Daisy Buchanan', 'Wealth', 'Moral Decay', 'Social Class']},
    {'name': 'Valley of Ashes', 'type': 'setting', 'related': ['Moral Decay', 'Doctor T.J. Eckleburg', 'Social Class']},
    {'name': 'Doctor T.J. Eckleburg', 'type': 'symbol', 'related': ['Valley of Ashes', 'Moral Decay', 'God']},
    {'name': 'Moral Decay', 'type': 'theme', 'related': ['Valley of Ashes', 'Tom Buchanan', 'Jazz Age', 'Doctor T.J. Eckleburg']},
    {'name': 'Wealth', 'type': 'theme', 'related': ['Gatsby', 'Tom Buchanan', 'American Dream', 'Social Class']},
    {'name': 'Social Class', 'type': 'theme', 'related': ['Wealth', 'Tom Buchanan', 'Valley of Ashes', 'American Dream']},
    {'name': 'Jazz Age', 'type': 'theme', 'related': ['Moral Decay', 'Gatsby', 'Wealth', 'Excess']},
    {'name': 'Hope', 'type': 'theme', 'related': ['The Green Light', 'American Dream', 'Gatsby']},
    {'name': 'Love', 'type': 'theme', 'related': ['Gatsby', 'Daisy Buchanan', 'The Green Light']},
    {'name': 'Narrator', 'type': 'concept', 'related': ['Nick Carraway', 'Unreliable Narrator', 'Perspective']},
    {'name': 'Unreliable Narrator', 'type': 'concept', 'related': ['Nick Carraway', 'Narrator', 'Perspective']},
    {'name': 'Perspective', 'type': 'concept', 'related': ['Nick Carraway', 'Unreliable Narrator', 'Duality']},
    {'name': 'Duality', 'type': 'concept', 'related': ['Nick Carraway', 'Perspective', 'Moral Decay']},
    {'name': 'Excess', 'type': 'theme', 'related': ['Jazz Age', 'Wealth', 'Gatsby']},
    {'name': 'Time', 'type': 'theme', 'related': ['Gatsby', 'The Green Light', 'American Dream', 'Past']},
    {'name': 'Past', 'type': 'theme', 'related': ['Time', 'Gatsby', 'Daisy Buchanan']},
    {'name': 'Jay Gatsby', 'type': 'character', 'related': ['Gatsby', 'American Dream', 'Wealth', 'The Green Light']},
    {'name': 'God', 'type': 'concept', 'related': ['Doctor T.J. Eckleburg', 'Moral Decay', 'Valley of Ashes']},
]


async def _seed_graph_cache(user_id: UUID, book_id: UUID) -> None:
    """Write pre-built Gatsby graph data into Redis so the knowledge page renders immediately."""
    try:
        from app.core.redis import get_redis
        from app.services.knowledge_service import GRAPH_CACHE_PREFIX, GRAPH_CACHE_TTL

        # Build GraphData-compatible dict from pre-defined concepts
        nodes = []
        edges: list[dict] = []
        seen_edges: set[tuple[str, str]] = set()

        for concept in GATSBY_CONCEPTS:
            name = concept['name']
            nodes.append({
                'id': name,
                'label': name,
                'type': concept['type'],
                'size': 1,
                'metadata': {'bookId': str(book_id)},
            })
            for related in concept.get('related', []):
                edge_key = tuple(sorted([name, related]))
                if edge_key not in seen_edges:
                    seen_edges.add(edge_key)
                    edges.append({
                        'source': name,
                        'target': related,
                        'label': 'related',
                        'weight': 1.0,
                    })

        graph_data = {
            'nodes': nodes,
            'edges': edges,
        }

        cache_key = f'{GRAPH_CACHE_PREFIX}{user_id}:{book_id}'
        r = get_redis()
        await r.setex(cache_key, GRAPH_CACHE_TTL, json.dumps(graph_data))
        logger.info('Seeded knowledge graph cache for book %s (%d nodes, %d edges)', book_id, len(nodes), len(edges))
    except Exception:
        logger.warning('Failed to seed knowledge graph cache', exc_info=True)
