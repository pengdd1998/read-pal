"""Sample data templates for auto-seeding new users.

Contains chapter content, annotation templates, and knowledge-graph concepts
for The Great Gatsby.  Separated from ``seed_service.py`` to keep each module
under 300 lines.
"""

from __future__ import annotations

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

# Each tuple: (type, content, location, note, tags, color)
# ``note`` and ``color`` may be None.
_ANNOTATION_TEMPLATES: list[tuple[str, str, dict, str | None, list[str], str | None]] = [
    (
        'highlight',
        'In my younger and more vulnerable years my father gave me some advice '
        "that I've been turning over in my mind ever since.",
        {'pageIndex': 0, 'chapter': 1, 'position': 0, 'selection': {'start': 0, 'end': 87}},
        'Famous opening lines — sets the tone for Nick as unreliable narrator',
        ['opening', 'narrator', 'key-quote'],
        'yellow',
    ),
    (
        'highlight',
        'a single green light, minute and far way, that might have been the end of a dock',
        {'pageIndex': 0, 'chapter': 1, 'position': 0, 'selection': {'start': 600, 'end': 670}},
        "The green light — first mention. Symbolizes Gatsby's longing for Daisy.",
        ['symbolism', 'green-light', 'daisy'],
        'green',
    ),
    (
        'highlight',
        'This is a valley of ashes — a fantastic farm where ashes grow like wheat',
        {'pageIndex': 1, 'chapter': 2, 'position': 0, 'selection': {'start': 130, 'end': 195}},
        'Valley of Ashes represents the moral decay hidden behind the facade of wealth',
        ['symbolism', 'decay', 'setting'],
        'yellow',
    ),
    (
        'note',
        'The eyes of Doctor T.J. Eckleburg watch over the Valley of Ashes — '
        'God watching moral decay?',
        {'pageIndex': 1, 'chapter': 2, 'position': 0, 'selection': {'start': 300, 'end': 380}},
        None,
        ['symbolism', 'morality', 'eyes'],
        None,
    ),
    (
        'highlight',
        'I was within and without, simultaneously enchanted and repelled by the '
        'inexhaustible variety of life.',
        {'pageIndex': 1, 'chapter': 2, 'position': 0, 'selection': {'start': 450, 'end': 537}},
        "Nick's ambivalence — he is both participant and observer",
        ['narrator', 'duality', 'key-quote'],
        'yellow',
    ),
    (
        'note',
        "Gatsby's parties represent the excess and emptiness of the Jazz Age. "
        'Everyone comes but nobody truly knows him.',
        {'pageIndex': 2, 'chapter': 3, 'position': 0, 'selection': {'start': 0, 'end': 95}},
        None,
        ['theme', 'jazz-age', 'character'],
        None,
    ),
    (
        'highlight',
        'It was one of those rare smiles with a quality of eternal reassurance in it',
        {'pageIndex': 2, 'chapter': 3, 'position': 0, 'selection': {'start': 400, 'end': 470}},
        "Gatsby's magnetic charisma — what draws people to him despite the mystery",
        ['character', 'gatsby', 'charisma'],
        'amber',
    ),
    (
        'highlight',
        'Gatsby believed in the green light, the orgastic future that year by year recedes before us.',
        {'pageIndex': 4, 'chapter': 9, 'position': 0, 'selection': {'start': 0, 'end': 80}},
        'The green light symbolizes the American Dream — always out of reach',
        ['symbolism', 'american-dream', 'ending'],
        'green',
    ),
    (
        'highlight',
        'So we beat on, boats against the current, borne back ceaselessly into the past.',
        {'pageIndex': 4, 'chapter': 9, 'position': 0, 'selection': {'start': 130, 'end': 204}},
        'Final line — we are all chasing dreams that pull us backward',
        ['ending', 'time', 'key-quote'],
        'orange',
    ),
    (
        'bookmark',
        'Chapter 4: Gatsby tells Nick about his past',
        {'pageIndex': 3, 'chapter': 4, 'position': 0, 'selection': {'start': 0, 'end': 40}},
        None,
        [],
        None,
    ),
]
