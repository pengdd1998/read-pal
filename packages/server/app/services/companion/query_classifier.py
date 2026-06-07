"""Query classification and refinement for RAG-enriched companion chat."""

import re
from typing import Literal

# Skip patterns: greetings, thanks, short filler
_SKIP_PATTERNS = re.compile(
    r'^(hi|hello|hey|bye|goodbye|ok|okay|thanks|thank you|thx|'
    r'你好|嗨|再见|谢谢|晚安|早上好|晚安|嗯|好|好的|对|是|yes|no|nope|sure|cool|great|got it|明白|知道|懂了'
    r')[\s!.?~]*$',
    re.IGNORECASE,
)

# Content-indicating patterns: question words and literary terms
_CONTENT_PATTERNS = re.compile(
    r'(?:'
    # Question words
    r'why|how|what|who|when|where|which|whether|explain|describe|analyze|compare|discuss|'
    r'meaning|significance|difference|relationship|'
    # Chinese question words
    r'为什么|怎么|什么|谁|哪|哪里|何时|如何|为何|解释|分析|比较|讨论|'
    r'含义|意义|区别|关系|主题|角色|情节|隐喻|象征|'
    # Literary terms
    r'character|theme|plot|metaphor|symbolism|motif|narrative|protagonist|setting|'
    r'conflict|resolution|foreshadow|irony|tone|mood|perspective|chapter|passage|quote|quotation|'
    # Reading position references
    r'at this point|so far|up to here|read so far|到这里|目前|到现在|读到这里'
    r')',
    re.IGNORECASE,
)

# Conversational filler to strip from queries
_FILLER_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in (
        r'^can you (?:please )?tell me (?:about )?',
        r'^please explain ',
        r'^i want to know (?:about )?',
        r'^i(?:\'m| am) (?:curious|wondering) (?:about )?',
        r'^could you (?:please )?(?:explain|describe|tell me) ',
        r'^what (?:do you think|is your opinion) (?:about|on) ',
        r'^我想知道',
        r'^请解释(一下)?',
        r'^能(不能)?告诉我',
        r'^你能(不能)?(告诉|解释)',
        r'^帮忙(解释|说明|分析)',
    )
]


def classify_query(
    message: str,
    history: list[str],
) -> Literal['content', 'general', 'skip']:
    """Classify a user message to decide RAG search strategy.

    Returns:
        'skip' — greetings, thanks, filler; no RAG needed
        'content' — book-content discussion; full RAG search
        'general' — chitchat; light RAG search
    """
    stripped = message.strip()
    if _SKIP_PATTERNS.match(stripped):
        return 'skip'
    if _CONTENT_PATTERNS.search(stripped):
        return 'content'
    if len(stripped) < 5:
        return 'skip'
    return 'general'


def refine_rag_query(message: str, history: list[str]) -> str:
    """Strip conversational filler to produce a better RAG search query.

    Falls back to the original message if refinement degrades quality.
    """
    refined = message.strip()
    for pattern in _FILLER_PATTERNS:
        refined = pattern.sub('', refined).strip()

    # If refinement stripped too much, use original
    if len(refined) < 3:
        return message.strip()

    return refined
