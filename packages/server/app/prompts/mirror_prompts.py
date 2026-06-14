"""Reading Mirror and Memory Book prompt templates."""

from __future__ import annotations

from app.prompts.base import PromptTemplate

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
            'Mastery: {mastery_score}%. '
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
