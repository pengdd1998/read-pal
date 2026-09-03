"""Boundary intent gate — fixed canned responses for boundary requests.

User adjudication of the 2026-09-02 boundary run: every LLM answer DID
respect the limits, but (a) tone was mechanical and (b) refusal wording
varied turn to turn. For explicit out-of-bounds REQUESTS the LLM doesn't
need to improvise — a small set of intent-typed canned responses is
stable, cheap, and instant. Detection is deliberately conservative:
patterns require an explicit request shape, so ordinary book discussion
(「这章谁死了？」) never trips. False negatives fall through to the LLM,
which already handles boundaries correctly.
"""

import re

import structlog

logger = structlog.get_logger('read-pal.companion')

# Intent types (extensible registry — keep each entry's patterns tight).
BOUNDARY_INTENTS: tuple[str, ...] = ('cross_user', 'cross_book', 'off_platform')

_PATTERNS: dict[str, list[re.Pattern[str]]] = {
    # Asking to SEE another user's private data. Patterns cover both word
    # orders (verb-first 「给我看看其他用户的笔记」 and object-first
    # 「其他用户的笔记能看吗」); plain opinion chat ("别的读者怎么评价")
    # never matches because an explicit access verb must be present.
    'cross_user': [
        re.compile(
            r'(给我看?看?|让我看?看?|帮我(看|查|找)|能(看|访问|查)|可以看到|能看到|显示|获取|拿到|发我|打开|导出)'
            r'.{0,10}(其他用户|别人|其他人的?|另一个用户|其他读者|别的用户)'
            r'(的)?(书架|图书馆|书单|笔记|划线|标注|批注|读书笔记|聊天记录|会话|数据|账号)'),
        re.compile(
            r'(其他用户|别人|其他人的?|另一个用户|其他读者|别的用户)'
            r'(的)?(书架|图书馆|书单|笔记|划线|标注|批注|读书笔记|聊天记录|会话|数据|账号)'
            r'.{0,12}(给我看?|让我看?|能看|能访问|能查|显示|获取|拿到|发我|打开|导出)'),
        re.compile(
            r'(show|view|access|reveal|open|export|give me|let me (see|view)|can you (see|access|view))'
            r'.{0,25}(other (users?|people|readers?)|someone else)(\'s)? '
            r'(books?|notes?|annotations?|highlights?|chats?|conversations?|data|shelf|library|account)', re.I),
        re.compile(
            r"(other (users?|people|readers?)|someone else)['s]? "
            r'(books?|notes?|annotations?|highlights?|chats?|conversations?|data|shelf|library|account)'
            r'.{0,20}(show|let me (see|view)|give me|access|reveal|open|export)', re.I),
    ],
    # Reproducing/downloading whole content of a book the user isn't
    # reading (current-book lookups are legitimate — the reader shows it).
    'cross_book': [
        re.compile(
            r'(《[^》]{1,40}》|另一本书|别的书|其他书|别的作品)'
            r'(的)?(全文|原文|完整版|完整内容|整章|章节内容|电子书|txt|epub|pdf)'
            r'.{0,15}(发给我|给我|发我|复制|粘贴|下载|发过来)'),
        re.compile(
            r'(发给我|发我|复制|粘贴|下载|帮我(找|搜|下载|搞到|发))'
            r'.{0,12}(《[^》]{1,40}》|另一本书|别的书|其他书)(的)?(全文|原文|完整版|完整内容|整章|章节内容|电子书|txt|epub|pdf)'),
        re.compile(
            r'(帮我|替我)?(找|搜|下载|搞到|发我).{0,8}(电子书|epub|txt|pdf|全本资源|网盘)'),
        re.compile(
            r'(send|give|paste|copy|share).{0,20}(full text|complete text|entire chapter|whole book|whole text)', re.I),
        re.compile(
            r'(full text|complete text|entire chapter|whole book|whole text)'
            r'.{0,20}(send|give|paste|copy|share it)', re.I),
        re.compile(r'(download|find|get).{0,12}(ebook|epub|pdf|txt|pirated|free copy)', re.I),
    ],
    # Requests needing live internet/platform capabilities we don't have.
    'off_platform': [
        re.compile(
            r'(上网|联网|浏览网页|打开网站|访问网页|搜索网络|网上搜|帮我(在网上)?搜'
            r'|查一下天气|今天.{0,4}天气|天气预报|实时.{0,4}(新闻|股价|汇率|比赛)'
            r'|最新.{0,2}(新闻|消息|资讯)|现在几点|今天的日期)'),
        re.compile(
            r'(browse|internet|web ?search|google it|search the web|look ?it ?up online'
            r'|weather (today|now|forecast|outside)|latest news|real.?time'
            r'|current (stock|news|score)|what time is it)', re.I),
    ],
}

BOUNDARY_RESPONSES: dict[str, dict[str, str]] = {
    'cross_user': {
        'zh': (
            '这个问题我得拦一下——每位读者的书、笔记和聊天都是 TA 自己的，'
            '我看不到也绝不会带出来。这是底线，问得再巧也一样～\n\n'
            '不过你自己的书房我能聊的可多了：想看看你最近的划线，'
            '还是继续聊《{title}》里这段？'
        ),
        'en': (
            'I have to stop you there — every reader\'s books, notes, and chats '
            'are theirs alone. I can\'t see them and won\'t share them, no '
            'matter how the question is phrased.\n\n'
            'But YOUR bookshelf is fair game! Want to revisit your recent '
            'highlights, or keep talking about this part of "{title}"?'
        ),
    },
    'cross_book': {
        'zh': (
            '哈哈，我是个「一间书房」的伙伴——只读得进你正在读的这本和书架上'
            '你已经放进来的书，没法凭空搬来别的书全文给你。\n\n'
            '如果你想把《{title}》之外的书也一起读，把它上传到书架就行；'
            '想先了解它的话，说说你为什么被它吸引？'
        ),
        'en': (
            'Ha — I\'m a one-bookshelf kind of friend: I only know the books '
            'you\'ve actually added, so I can\'t reproduce another book\'s '
            'full text out of thin air.\n\n'
            'If you want to read it alongside "{title}", just upload it to '
            'your shelf. Or tell me what drew you to it and we\'ll talk!'
        ),
    },
    'off_platform': {
        'zh': (
            '我住在你这本书里，不联网、也看不到外面的世界——天气、新闻、'
            '实时行情这些我真帮不上，硬答就是编故事了。\n\n'
            '但书里的世界我熟呀：要不要聊聊书里这个话题？'
            '或者你说说外面的事，我们从阅读的角度聊聊它？'
        ),
        'en': (
            'I live inside your library — no internet, no outside world. '
            'Weather, news, live scores… I genuinely can\'t check those, and '
            'guessing would just be making things up.\n\n'
            'But the world inside books I know well. Want to explore this '
            'theme in "{title}"? Or tell me what\'s happening out there and '
            'we\'ll look at it through a reading lens?'
        ),
    },
}


def detect_boundary_intent(text: str | None) -> str | None:
    """Intent key for an explicit out-of-bounds request, else None."""
    if not text:
        return None
    for intent in BOUNDARY_INTENTS:
        for pat in _PATTERNS[intent]:
            if pat.search(text):
                logger.warning('companion.boundary_intent_detected', intent=intent)
                return intent
    return None


def boundary_response(intent: str, lang: str, book_title: str = '') -> str:
    """Canned reply for a boundary intent ('{title}' substituted when known)."""
    by_lang = BOUNDARY_RESPONSES.get(intent) or BOUNDARY_RESPONSES['off_platform']
    text = by_lang.get(lang) or by_lang['en']
    fallback = '这本书' if lang == 'zh' else 'this book'
    return text.replace('{title}', book_title or fallback)
