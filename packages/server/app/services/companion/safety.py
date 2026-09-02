"""Safety checks and streaming log persistence for companion."""

import structlog
from uuid import UUID

from app.services.companion.constants import _SAFETY_KEYWORDS

logger = structlog.get_logger('read-pal.companion')


def persist_stream_log(
    *,
    request_id: str,
    model: str,
    latency_ms: int,
    success: bool,
    error_message: str | None = None,
    user_id: UUID | None = None,
    book_id: UUID | None = None,
    ttft_ms: int | None = None,
) -> None:
    """Persist streaming LLM call to database (fire-and-forget).

    ``ttft_ms`` is stored in the ``extra`` JSONB column (LLMLog has no
    dedicated column for it). Queryable via ``extra->>'ttft_ms'``.
    """
    try:
        from app.services.llm_log_service import fire_and_forget_log
        # Build extra dict — only include keys with values to avoid cluttering the JSON.
        extra: dict = {}
        if ttft_ms is not None:
            extra['ttft_ms'] = ttft_ms
        fire_and_forget_log(
            request_id=request_id,
            model=model,
            label='companion.stream',
            latency_ms=latency_ms,
            success=success,
            error_message=error_message,
            user_id=str(user_id) if user_id else None,
            book_id=str(book_id) if book_id else None,
            extra=extra or None,
        )
    except (ValueError, RuntimeError, ConnectionError) as exc:
        logger.warning('companion.safety.observability_log_failed', error=str(exc)[:200])


def quick_safety_check(text: str | None) -> bool:
    """Check if text is non-empty. Logs safety keywords but does not block."""
    if not text:
        return False
    lower = text.lower()
    for kw in _SAFETY_KEYWORDS:
        if kw in lower:
            logger.warning('companion.safety_keyword_detected', keyword=kw)
    return True


# First-person crisis signals ONLY. Deliberately narrow: broad words like
# 死/kill/suicide appear constantly in legitimate book discussion ("这章谁
# 被杀了？"), and hijacking those questions would make the companion useless.
# These phrases are the ones a reader in distress actually types about
# themselves.
_CRISIS_PHRASES: tuple[str, ...] = (
    # zh
    '不想活', '活不下去', '想死', '想自杀', '要自杀', '自杀的方法',
    '结束自己的生命', '结束生命', '自残', '伤害自己', '想消失', '没有我更好',
    # en
    'kill myself', 'killing myself', 'want to die', 'end my life',
    'ending my life', 'hurt myself', 'hurting myself', 'self-harm',
    'self harm', 'no reason to live', 'better off without me',
    "don't want to live", 'not want to live',
)

_CRISIS_RESPONSES: dict[str, str] = {
    'zh': (
        '听到你说这些，我很在意你。你现在承受的痛苦是真实的，但它不会一直'
        '是这样——请让能够立刻陪着你的人知道你的状态：\n\n'
        '- 希望24热线：**400-161-9995**\n'
        '- 北京心理危机研究与干预中心：**010-82951332**\n'
        '- 青少年心理热线：**12355**\n'
        '- 紧急情况请直接拨打 **120**\n\n'
        '如果你愿意，我们可以留在这里——聊聊这本书，或者任何你想说的话。'
        '我在。'
    ),
    'en': (
        "I'm really glad you told me this, and I care about how you're doing "
        'right now. The pain you are carrying is real, and you should not '
        'have to carry it alone — please reach out to someone who can be '
        'with you immediately:\n\n'
        '- 988 Suicide & Crisis Lifeline (US): call or text **988**\n'
        '- Crisis Text Line: text **HOME** to **741741**\n'
        '- Outside the US, find your local hotline at **findahelpline.com**\n'
        '- If you are in immediate danger, call your local emergency number\n\n'
        "If you'd like, we can stay right here — talk about the book, or "
        "anything at all. I'm listening."
    ),
}


def detect_crisis(text: str | None) -> bool:
    """True when the USER's message contains a first-person crisis signal.

    Input-side gate only: on a hit the companion replies with a fixed,
    warm crisis-response template instead of an LLM answer (see
    streaming._stream_via_provider). Conservative by design — false
    negatives are acceptable, false positives would hijack normal book
    discussion.
    """
    if not text:
        return False
    lower = text.lower()
    for phrase in _CRISIS_PHRASES:
        if phrase in lower:
            logger.warning('companion.crisis_signal_detected')
            return True
    return False


def crisis_response(lang: str) -> str:
    """Fixed caring response for crisis signals (lang falls back to en)."""
    return _CRISIS_RESPONSES.get(lang) or _CRISIS_RESPONSES['en']
