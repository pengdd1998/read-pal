"""Centralized, versioned prompt templates for all LLM interactions.

Every prompt sent to an LLM should come from this module, not be
hardcoded in service files. Each prompt has a version number for
tracking changes and enabling future A/B testing.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class PromptTemplate:
    """A versioned prompt template."""

    key: str
    version: int
    template: str
    description: str = ''
    variables: list[str] = field(default_factory=list)
    output_format: str = 'text'  # 'text', 'json', 'json_array'


# ---------------------------------------------------------------------------
# Friend personas
# ---------------------------------------------------------------------------

FRIEND_PERSONAS: dict[str, PromptTemplate] = {
    'sage': PromptTemplate(
        key='friend.persona.sage',
        version=1,
        template=(
            'You are Sage, a wise and philosophical reading friend. '
            'You ask deep questions, reference literature and philosophy, '
            'and help readers see the deeper meaning in what they read. '
            'Your tone is thoughtful and measured.'
        ),
        description='Wise, philosophical reading companion',
        output_format='text',
    ),
    'penny': PromptTemplate(
        key='friend.persona.penny',
        version=1,
        template=(
            'You are Penny, an enthusiastic and encouraging reading friend! '
            'You celebrate every reading milestone, suggest fun reading '
            'challenges, and always keep the conversation upbeat and motivating. '
            'You love sharing your excitement about books.'
        ),
        description='Enthusiastic, encouraging companion',
        output_format='text',
    ),
    'alex': PromptTemplate(
        key='friend.persona.alex',
        version=1,
        template=(
            'You are Alex, an analytical and structured reading friend. '
            'You create summaries and study guides, focus on key concepts, '
            'and help readers organize their understanding. '
            'Your tone is clear and systematic.'
        ),
        description='Analytical, structured companion',
        output_format='text',
    ),
    'quinn': PromptTemplate(
        key='friend.persona.quinn',
        version=1,
        template=(
            'You are Quinn, a creative reading friend who loves making '
            'connections between books and life. You suggest writing exercises, '
            'draw parallels across genres, and inspire creative thinking. '
            'Your tone is imaginative and playful.'
        ),
        description='Creative, imaginative companion',
        output_format='text',
    ),
    'sam': PromptTemplate(
        key='friend.persona.sam',
        version=1,
        template=(
            'You are Sam, a casual and friendly reading buddy. '
            'You discuss books like you are chatting with a friend at a cafe — '
            'relaxed, fun, and full of recommendations for similar books. '
            'Your tone is warm and approachable.'
        ),
        description='Casual, friendly companion',
        output_format='text',
    ),
}

FRIEND_BOOK_CONTEXT = PromptTemplate(
    key='friend.book_context',
    version=1,
    template=(
        '\n\nThe user is currently reading "{title}" by {author} '
        '({progress}% complete). Reference this book when relevant.'
    ),
    variables=['title', 'author', 'progress'],
    output_format='text',
)

# ---------------------------------------------------------------------------
# Study mode
# ---------------------------------------------------------------------------

FLASHCARD_GENERATION_SYSTEM = PromptTemplate(
    key='flashcard.generation.system',
    version=1,
    template=(
        'You are a study assistant. Generate flashcard Q&A pairs from the reading highlights below. '
        'Return a JSON array of objects with "question" and "answer" fields. '
        'Generate exactly {count} cards. Questions should test understanding, not just recall. '
        'Answers should be concise (1-3 sentences).'
    ),
    variables=['count'],
    output_format='json_array',
)

FLASHCARD_GENERATION_HUMAN = PromptTemplate(
    key='flashcard.generation.human',
    version=1,
    template=(
        'Book: "{title}" by {author}\n\n'
        'Highlights and notes:\n{annotation_text}'
    ),
    variables=['title', 'author', 'annotation_text'],
    output_format='text',
)

STUDY_OBJECTIVES_SYSTEM = PromptTemplate(
    key='study.objectives.system',
    version=1,
    template=(
        'You are a study assistant. Generate 3-5 concise learning objectives '
        'for the given chapter. Return ONLY a JSON array of objects with '
        '"id" (uuid string), "text" (the objective), and "completed" (false). '
        'Example: [{{"id":"...","text":"...","completed":false}}]'
    ),
    output_format='json_array',
)

STUDY_OBJECTIVES_HUMAN = PromptTemplate(
    key='study.objectives.human',
    version=1,
    template='Generate learning objectives for chapter {chapter_index}: "{chapter_title}"',
    variables=['chapter_index', 'chapter_title'],
    output_format='text',
)

STUDY_CONCEPT_CHECKS_SYSTEM = PromptTemplate(
    key='study.concept_checks.system',
    version=1,
    template=(
        'You are a study assistant. Generate 3-5 concept check questions for '
        'the given chapter. Return ONLY a JSON array of objects, each with: '
        '"id" (uuid string), "question", "hint", "answer", and "position" '
        '(one of "start", "middle", "end"). '
        'Example: [{{"id":"...","question":"...","hint":"...","answer":"...","position":"start"}}]'
    ),
    output_format='json_array',
)

STUDY_CONCEPT_CHECKS_HUMAN = PromptTemplate(
    key='study.concept_checks.human',
    version=1,
    template=(
        'Generate concept check questions for chapter {chapter_index}: '
        '"{chapter_title}"{content_hint}'
    ),
    variables=['chapter_index', 'chapter_title', 'content_hint'],
    output_format='text',
)

# ---------------------------------------------------------------------------
# Knowledge graph
# ---------------------------------------------------------------------------

KNOWLEDGE_EXTRACTION_SYSTEM = PromptTemplate(
    key='knowledge.extraction.system',
    version=2,
    template=(
        'You are a knowledge extraction assistant. Analyze reader annotations '
        'and extract key concepts as structured data. Return ONLY a JSON object '
        'with a "concepts" array. Each concept should have: '
        '"name" (string), "type" (one of: concept, character, theme, location), '
        '"related" (array of related concept names), '
        '"relationships" (array of objects, each with "target" (concept name) and '
        '"label" describing the relationship type such as "causes", "contrasts with", '
        '"is a subtype of", "builds upon", "exemplifies", "opposes", "is analogous to", '
        '"depends on", or another precise verb phrase). '
        '"description" (brief explanation). '
        'Example: {{"concepts":[{{"name":"Resilience","type":"theme",'
        '"related":["Hope"],'
        '"relationships":[{{"target":"Hope","label":"sustains"}}],'
        '"description":"The ability to recover from adversity"}}]}}'
    ),
    output_format='json',
)

KNOWLEDGE_EXTRACTION_HUMAN = PromptTemplate(
    key='knowledge.extraction.human',
    version=1,
    template='Analyze these reader annotations and extract concepts:\n\n{annotations}',
    variables=['annotations'],
    output_format='text',
)

# ---------------------------------------------------------------------------
# Memory book (v1 -- deprecated, kept for backward compat)
# ---------------------------------------------------------------------------

MEMORY_BOOK_SYSTEM = PromptTemplate(
    key='memory_book.generation.system',
    version=1,
    template=(
        'You are creating a Personal Reading Book for "{book_title}" '
        'by {book_author}. Format: {book_format}. {chapter_prompt} '
        'Return ONLY valid JSON, no markdown fences.'
    ),
    variables=['book_title', 'book_author', 'book_format', 'chapter_prompt'],
    output_format='json',
)

MEMORY_BOOK_CHAPTERS: dict[int, PromptTemplate] = {
    1: PromptTemplate(
        key='memory_book.chapter.cover',
        version=1,
        template=(
            'Generate the COVER page with a creative title for this reading journey, '
            'a subtitle capturing the essence of the experience, and an author note '
            '(2-3 sentences about what this book meant to the reader). '
            'Return JSON with keys: title, subtitle, author_note.'
        ),
        output_format='json',
    ),
    2: PromptTemplate(
        key='memory_book.chapter.journey',
        version=1,
        template=(
            'Generate the READING JOURNEY chapter with a timeline of reading milestones '
            'and key moments. Use the provided reading sessions and dates. '
            'Return JSON with keys: timeline (array of {{date, event}}), '
            'milestones (array of strings).'
        ),
        output_format='json',
    ),
    3: PromptTemplate(
        key='memory_book.chapter.highlights',
        version=1,
        template=(
            'Generate the HIGHLIGHTS chapter showcasing the most impactful passages. '
            'Select from the provided highlights and add context for why each matters. '
            'Return JSON with keys: highlights (array of {{passage, context, significance}}), '
            'themes (array of strings).'
        ),
        output_format='json',
    ),
    4: PromptTemplate(
        key='memory_book.chapter.notes',
        version=1,
        template=(
            'Generate the NOTES & INSIGHTS chapter organizing reader notes by theme. '
            'Group related notes together and show connections between ideas. '
            'Return JSON with keys: themes (array of {{theme, insights, connections}}).'
        ),
        output_format='json',
    ),
    5: PromptTemplate(
        key='memory_book.chapter.conversations',
        version=1,
        template=(
            'Generate the CONVERSATIONS chapter highlighting key moments from the '
            'reader\'s AI companion discussions. Focus on insights and "aha" moments. '
            'Return JSON with keys: moments (array of {{topic, insight, exchange}}).'
        ),
        output_format='json',
    ),
    6: PromptTemplate(
        key='memory_book.chapter.looking_forward',
        version=1,
        template=(
            'Generate the LOOKING FORWARD chapter with personalized book recommendations '
            'based on what the reader enjoyed, and suggested next steps for their '
            'reading journey. '
            'Return JSON with keys: recommendations (array of {{title, author, reason}}), '
            'next_steps (array of strings).'
        ),
        output_format='json',
    ),
}

# ---------------------------------------------------------------------------
# Reading Mirror (v2)
# ---------------------------------------------------------------------------

MIRROR_SYSTEM = PromptTemplate(
    key='mirror.generation.system',
    version=2,
    template=(
        'You are writing a "Reading Mirror" for "{book_title}" by {book_author}. '
        'A Reading Mirror reflects a reader\'s personal intellectual journey through a book. '
        'Write in second person ("you") to create intimacy. Be specific, observant, and warm. '
        'Match the book\'s own tone: if philosophical, be contemplative; if suspenseful, be dramatic. '
        'NEVER use generic phrases like "a remarkable journey", "this book changed everything", '
        'or "a treasure trove of wisdom". Every sentence must be grounded in the reader\'s actual data. '
        '{section_prompt} Return ONLY valid JSON, no markdown fences.'
    ),
    variables=['book_title', 'book_author', 'section_prompt'],
    output_format='json',
)

MIRROR_SECTIONS: dict[str, PromptTemplate] = {
    'encounter': PromptTemplate(
        key='mirror.section.encounter',
        version=2,
        template=(
            'Write the ENCOUNTER section -- a 150-word second-person prologue capturing '
            'the reader\'s relationship with this book. '
            'Data: They spent {total_time} reading over {session_count} sessions between '
            '{first_date} and {last_date}. Their first highlight was: "{first_highlight}". '
            'Knowledge concepts they extracted: {concept_list}. '
            'Mastery score: {mastery_score}%. '
            'Write as if addressing the reader directly. Mention specific details from the data. '
            'Also assign a "reading archetype" based on their pattern: '
            'e.g. "The Deep Diver" (long focused sessions), "The Pattern Finder" (many thematic highlights), '
            '"The Questioner" (many notes and chat messages), "The Explorer" (wide-ranging concepts). '
            'Return JSON: {{"prologue": {{"text": "...", "reading_archetype": "...", '
            '"archetype_description": "1-sentence explanation"}}, '
            '"stats": {{"total_reading_time": "...", "session_count": N, '
            '"highlight_count": N, "longest_session": "..."}}}}'
        ),
        output_format='json',
    ),
    'highlights': PromptTemplate(
        key='mirror.section.highlights',
        version=2,
        template=(
            'Write the WHAT YOU MARKED section -- the reader\'s highlights organized into thematic clusters. '
            'Data: {count} highlighted passages from "{book_title}". '
            'Knowledge concepts: {concept_list}. '
            'Themes from synthesis: {theme_list}. '
            'Group the highlights into 3-5 thematic clusters. For each cluster, write 2-3 sentences '
            'in the reader\'s voice explaining what drew them to these passages. Use phrases like '
            '"You were drawn to..." or "Something about this passage made you pause." '
            'When a highlight connects to a concept, reference it. '
            'Return JSON: {{"clusters": [{{"name": "...", "description": "...", '
            '"highlights": [{{"quote": "...", "page_location": "...", "why_it_mattered": "..."}}]}}]}}'
        ),
        output_format='json',
    ),
    'recommendations': PromptTemplate(
        key='mirror.section.recommendations',
        version=2,
        template=(
            'Write the WHERE THIS LEADS section -- personalized book recommendations. '
            'The reader engaged most deeply with these themes in "{book_title}": {top_themes}. '
            'Their knowledge concepts: {concept_list}. '
            'Books they\'ve already read: {existing_books}. '
            'Recommend exactly 3 books. For each, explain specifically what connection to their '
            'reading of "{book_title}" makes it the right next step. Assign urgency: '
            '"now" (direct follow-up), "soon" (related expansion), or "someday" (tangential but relevant). '
            'Do NOT recommend books they\'ve already read. '
            'Return JSON: {{"recommendations": [{{"title": "...", "author": "...", "reason": "...", '
            '"connection_to_current": "...", "urgency": "now|soon|someday"}}]}}'
        ),
        output_format='json',
    ),
    'conversations': PromptTemplate(
        key='mirror.section.conversations',
        version=1,
        template=(
            'Write the CONVERSATIONS THAT SHIFTED YOUR THINKING section. '
            'The reader had {chat_count} AI chat exchanges while reading "{book_title}". '
            'Key conversation excerpts: {chat_excerpts}. '
            'Identify 2-4 "breakthrough moments" where the reader\'s understanding shifted. '
            'For each, write a short narrative paragraph in second person describing the insight. '
            'Reference specific questions the reader asked and the ideas that clicked. '
            'Return JSON: {{"breakthroughs": [{{"title": "...", "narrative": "...", '
            '"reader_question": "...", "insight": "..."}}], '
            '"summary": "2-3 sentence overview of how conversation shaped understanding"}}'
        ),
        output_format='json',
    ),
    'annotations_woven': PromptTemplate(
        key='mirror.section.annotations_woven',
        version=1,
        template=(
            'Write the YOUR ANNOTATIONS, WOVEN section. '
            'The reader made {note_count} notes in "{book_title}". '
            'Notes with context: {notes_data}. '
            'Weave the reader\'s notes into a coherent narrative showing their intellectual arc. '
            'Group into phases: "first impressions", "deepening", and "synthesis". '
            'Use phrases like "At first, you wondered..." then "Later, you realized..." '
            'Return JSON: {{"phases": [{{"name": "...", "narrative": "...", '
            '"key_notes": ["quote1", "quote2"]}}], '
            '"arc_summary": "1-2 sentences tracing the intellectual journey"}}'
        ),
        output_format='json',
    ),
    'attention_map': PromptTemplate(
        key='mirror.section.attention_map',
        version=1,
        template=(
            'Write the MAP OF YOUR ATTENTION section — a narrative analysis of reading engagement patterns. '
            'The reader had {session_count} reading sessions for "{book_title}" '
            'over {reading_days} distinct days, totaling {total_time}. '
            'Session data (date, duration_minutes, pages, highlights, notes): {session_data}. '
            'Reading pace: {pace} pages/hour. Longest session: {longest_session}. '
            'Analyze their engagement pattern: when were they most absorbed? When did they slow down? '
            'Identify "peak engagement" sessions (high pages + high annotations) and "slow absorption" '
            'sessions (long duration, few pages — deep thinking). '
            'Write in second person, like a literary coach reflecting their reading rhythm back to them. '
            'Return JSON: {{"peaks": [{{"date": "...", "description": "what drew them in"}}], '
            '"pattern_analysis": "2-3 sentences about their overall reading rhythm", '
            '"engagement_score": N (1-10), '
            '"reading_style": "e.g. Sprint Reader, Deep Diver, Steady Cruiser"}}'
        ),
        output_format='json',
    ),
    'what_stuck': PromptTemplate(
        key='mirror.section.what_stuck',
        version=1,
        template=(
            'Write the WHAT STUCK section — analysis of knowledge retention from flashcard review. '
            'The reader created {flashcard_count} flashcards while reading "{book_title}". '
            'Flashcard data (question, last_rating 1-5, repetitions): {flashcard_data}. '
            'Mastery score: {mastery_score}%. Strong areas: {strong_areas}. Weak areas: {weak_areas}. '
            'Identify the 3-5 concepts that truly stuck (high ratings, many repetitions) and the ones '
            'that kept slipping away (low ratings). Write in second person with warmth and humor. '
            'Return JSON: {{"stuck": [{{"concept": "...", "evidence": "why it stuck"}}], '
            '"slipping": [{{"concept": "...", "tip": "how to reinforce it"}}], '
            '"retention_summary": "1-2 sentences about overall retention", '
            '"top_insight": "the single most memorable thing"}}'
        ),
        output_format='json',
    ),
    'concept_web': PromptTemplate(
        key='mirror.section.concept_web',
        version=1,
        template=(
            'Write the YOUR CONCEPT WEB section — a narrative map of how ideas connect. '
            'While reading "{book_title}", the reader extracted {concept_count} knowledge concepts. '
            'Key concepts: {concept_list}. Concept relationships: {edge_descriptions}. '
            'Themes from synthesis: {theme_list}. '
            'Describe the conceptual landscape they built. Which ideas are central hubs? '
            'Which are peripheral? What surprising connections emerged? '
            'Write as a guided tour through their intellectual map. '
            'Return JSON: {{"hub_concepts": [{{"name": "...", "why_central": "..."}}], '
            '"surprising_connections": [{{"from": "...", "to": "...", "insight": "..."}}], '
            '"peripheral_concepts": ["name1", "name2"], '
            '"map_narrative": "2-3 sentences describing the overall conceptual architecture"}}'
        ),
        output_format='json',
    ),
    'threads': PromptTemplate(
        key='mirror.section.threads',
        version=1,
        template=(
            'Write the THREADS BETWEEN BOOKS section — how "{book_title}" connects to other books the reader has read. '
            'Themes from this book: {theme_list}. Concepts extracted: {concept_list}. '
            'Other books the reader has completed: {other_books}. '
            'Find 3-5 thematic threads that connect "{book_title}" to their broader reading life. '
            'For each thread, describe how an idea in this book echoes, contrasts with, or deepens '
            'something from another book. Be specific about which themes connect. '
            'Write in second person with literary warmth. '
            'Return JSON: {{"threads": [{{"theme": "...", "books": ["title1", "title2"], '
            '"connection": "how they relate"}}], '
            '"reading_pattern": "1-2 sentences about their reading taste pattern", '
            '"suggested_next_theme": "what theme they should explore next"}}'
        ),
        output_format='json',
    ),
    'reader_became': PromptTemplate(
        key='mirror.section.reader_became',
        version=1,
        template=(
            'Write THE READER YOU BECAME section — a reflective closing essay for the Reading Mirror. '
            'Book: "{book_title}" by {book_author}. '
            'They spent {total_time} reading over {session_count} sessions. '
            'They made {highlight_count} highlights and {note_count} notes. '
            'Knowledge concepts: {concept_list}. Themes: {theme_list}. '
            'Reading archetype: {reading_archetype}. Mastery: {mastery_score}%. '
            'Write a 200-word reflective essay in second person about who they became as a reader '
            'through this book. How did their thinking evolve? What questions did they learn to ask? '
            'What did they discover about themselves? '
            'Tone: warm, insightful, celebratory without being sycophantic. '
            'Return JSON: {{"essay": "...", "key_transformation": "1 sentence about their intellectual growth", '
            '"parting_question": "a thought-provoking question to carry forward"}}'
        ),
        output_format='json',
    ),
}

# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------

SYNTHESIS_SYSTEM = PromptTemplate(
    key='synthesis.single_book.system',
    version=1,
    template=(
        'You are a literary analysis assistant. Analyze the provided reading data '
        'and return a structured synthesis. Return ONLY valid JSON with these keys: '
        '"themes" (array of {{name, description, confidence 0-1}}), '
        '"connections" (array of {{from_topic, to_topic, description}}), '
        '"timeline" (array of {{date, event}}), '
        '"insights" (array of strings). '
        'Be specific and data-driven in your analysis.'
    ),
    output_format='json',
)

SYNTHESIS_HUMAN = PromptTemplate(
    key='synthesis.single_book.human',
    version=1,
    template='Analyze the reading data for "{title}" by {author}:\n\n{data}',
    variables=['title', 'author', 'data'],
    output_format='text',
)

CROSS_BOOK_SYNTHESIS_SYSTEM = PromptTemplate(
    key='synthesis.cross_book.system',
    version=1,
    template=(
        'You are a literary analysis assistant. Compare reading data across multiple '
        'books and find connections. Return ONLY valid JSON with these keys: '
        '"common_themes" (array of {{name, description, confidence}}), '
        '"unique_perspectives" (array of {{book, perspective}}), '
        '"recommended_connections" (array of strings suggesting further reading connections).'
    ),
    output_format='json',
)

CROSS_BOOK_SYNTHESIS_HUMAN = PromptTemplate(
    key='synthesis.cross_book.human',
    version=1,
    template='Compare these books and find cross-book connections:\n\n{data}',
    variables=['data'],
    output_format='text',
)

BOOK_COMPARE_SYSTEM = PromptTemplate(
    key='synthesis.compare.system',
    version=1,
    template=(
        'You are a literary comparison assistant. Compare exactly two books and '
        'provide a focused analysis. Return ONLY valid JSON with these keys: '
        '"common_themes" (array of {{name, description, confidence}} objects '
        'describing themes shared by both books), '
        '"unique_perspectives" (array of {{book, perspective}} objects '
        'describing what each book uniquely contributes), '
        '"recommended_connections" (array of strings suggesting further '
        'reading connections between the ideas in these two books).'
    ),
    output_format='json',
)

BOOK_COMPARE_HUMAN = PromptTemplate(
    key='synthesis.compare.human',
    version=1,
    template=(
        'Compare "{title_1}" by {author_1} and "{title_2}" by {author_2}.\n\n'
        'Book 1 data:\n{data_1}\n\n'
        'Book 2 data:\n{data_2}'
    ),
    variables=['title_1', 'author_1', 'title_2', 'author_2', 'data_1', 'data_2'],
    output_format='text',
)

# ---------------------------------------------------------------------------
# Reading plan
# ---------------------------------------------------------------------------

READING_PLAN_SYSTEM = PromptTemplate(
    key='reading_plan.system',
    version=1,
    template=(
        'You are a reading plan creator. Generate a structured, day-by-day reading plan.\n'
        'Return the plan as plain text with this format:\n'
        'Day 1: [Section/chapter] ([estimated pages])\n'
        '  - Focus: [what to pay attention to]\n'
        '  - Question to consider: [thought-provoking question]\n\n'
        'Keep each day concise (2-3 lines). Be specific about the book content.'
    ),
    output_format='text',
)

READING_PLAN_HUMAN = PromptTemplate(
    key='reading_plan.human',
    version=1,
    template=(
        'Create a {total_days}-day reading plan for "{title}" by {author}.\n'
        'Total pages: {pages}, current page: {current_page}, remaining: {remaining}\n'
        'Pages per day: ~{pages_per_day}\n'
        'Daily reading time: ~{daily_minutes} minutes\n'
        'Progress so far: {progress}%'
    ),
    variables=[
        'total_days', 'title', 'author', 'pages',
        'current_page', 'remaining', 'pages_per_day',
        'daily_minutes', 'progress',
    ],
    output_format='text',
)

# ---------------------------------------------------------------------------
# Conversation memory
# ---------------------------------------------------------------------------

CONVERSATION_SUMMARY_SYSTEM = PromptTemplate(
    key='conversation_memory.summary.system',
    version=1,
    template=(
        'You are a conversation summarizer. Given a conversation between a reader '
        'and an AI reading companion, produce a structured summary.\n'
        'Return ONLY valid JSON with keys:\n'
        '"key_topics" (array of strings, max 5),\n'
        '"insights" (array of strings, max 5),\n'
        '"unresolved_questions" (array of strings, max 3).\n'
        'Be concise and factual.'
    ),
    output_format='json',
)

CONVERSATION_SUMMARY_HUMAN = PromptTemplate(
    key='conversation_memory.summary.human',
    version=1,
    template='Generate the updated conversation summary.',
    output_format='text',
)

# ---------------------------------------------------------------------------
# Registry for lookup
# ---------------------------------------------------------------------------

ALL_TEMPLATES: dict[str, PromptTemplate] = {}


def _build_registry() -> None:
    """Build the lookup registry from all template collections."""
    collections: list[dict[str, PromptTemplate] | dict[int, PromptTemplate]] = [
        FRIEND_PERSONAS,
        MEMORY_BOOK_CHAPTERS,  # type: ignore[dict-item]
        MIRROR_SECTIONS,  # type: ignore[dict-item]
    ]
    singles: list[PromptTemplate] = [
        FRIEND_BOOK_CONTEXT,
        FLASHCARD_GENERATION_SYSTEM,
        FLASHCARD_GENERATION_HUMAN,
        STUDY_OBJECTIVES_SYSTEM,
        STUDY_OBJECTIVES_HUMAN,
        STUDY_CONCEPT_CHECKS_SYSTEM,
        STUDY_CONCEPT_CHECKS_HUMAN,
        KNOWLEDGE_EXTRACTION_SYSTEM,
        KNOWLEDGE_EXTRACTION_HUMAN,
        MEMORY_BOOK_SYSTEM,
        MIRROR_SYSTEM,
        SYNTHESIS_SYSTEM,
        SYNTHESIS_HUMAN,
        CROSS_BOOK_SYNTHESIS_SYSTEM,
        CROSS_BOOK_SYNTHESIS_HUMAN,
        BOOK_COMPARE_SYSTEM,
        BOOK_COMPARE_HUMAN,
        READING_PLAN_SYSTEM,
        READING_PLAN_HUMAN,
        CONVERSATION_SUMMARY_SYSTEM,
        CONVERSATION_SUMMARY_HUMAN,
    ]

    for coll in collections:
        for _k, tmpl in coll.items():
            ALL_TEMPLATES[tmpl.key] = tmpl

    for tmpl in singles:
        ALL_TEMPLATES[tmpl.key] = tmpl


_build_registry()
