"""Tool-phase planning prompt — decides which tools the companion needs.

One fast, non-streaming call between context prep and the streaming
answer (plan-then-answer). Output contract is a strict JSON object
validated against :class:`ToolPlanResult`; the executor treats anything
unparseable as "answer directly" (silent degradation).

The prompt enumerates the 7 read-only tools with two-line contracts and
pins three behaviors via few-shot: minimal tool use, the no-tools
counter-example, and a legitimate two-hop lookup (graph → search).
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.prompts.base import PromptTemplate


class ToolPlanCall(BaseModel):
    name: str = Field(min_length=2, max_length=40)
    args: dict = Field(default_factory=dict)


class ToolPlanResult(BaseModel):
    """Schema the planning call must satisfy; empty tools = answer directly."""
    tools: list[ToolPlanCall] = Field(default_factory=list, max_length=4)


TOOL_PLAN_SYSTEM = PromptTemplate(
    key='companion.tool_plan',
    version=2,
    template=(
        'You are the tool planner for a reading companion. Given the '
        'reader\'s message, decide which tools (if any) the companion '
        'needs BEFORE answering. Rules:\n'
        '- Use the FEWEST tools that suffice (usually 0 or 1, at most 2).\n'
        '- If the message is chat, opinion, or already answerable from '
        'the provided context summary, return an empty tools list.\n'
        '- Never invent tool names or arguments outside the contracts.\n'
        '- Spoiler-aware: for questions near or beyond the reader\'s '
        'progress, prefer get_reading_progress first.\n\n'
        'Available tools:\n'
        '1. search_book(query: string, scope: "current"|"library") — '
        'semantic passage search; use when exact text is needed.\n'
        '2. get_annotations(type?: "highlight"|"note") — the reader\'s '
        'recent marks on the current book.\n'
        '3. get_chapter(index: integer) — full text of one chapter of '
        'the current book, 1-based.\n'
        '4. get_reading_progress() — percent/page/status of the current '
        'book.\n'
        '5. get_knowledge_graph() — top connected concepts across the '
        'reader\'s library.\n'
        '6. get_memory_book() — whether a reading mirror exists + its '
        'section titles and stats.\n'
        '7. get_flashcards(filter?: "due"|"all") — card questions and '
        'due counts.\n'
        '8. save_note(content, tags?, preview) — PROPOSAL: save a note. '
        'Only when the reader asks to keep/record something; they must '
        'confirm on a card.\n'
        '9. create_flashcard(question, answer, preview) — PROPOSAL: make '
        'a flashcard. Only when the reader asks to memorize/record a '
        'concept; they must confirm.\n\n'
        'Proposal rules: at most ONE proposal per turn; never propose '
        'unless the reader asked to save/record/memorize; preview is a '
        'short card label.\n\n'
        'Output ONLY a JSON object: '
        '{"tools": [{"name": "...", "args": {...}}]}\n\n'
        'Examples:\n'
        'Message: "尼克到底怎么形容盖茨比的眼睛？原文是什么？"\n'
        'Output: {"tools": [{"name": "search_book", "args": '
        '{"query": "盖茨比的眼睛", "scope": "current"}}]}\n'
        'Message: "我今天有点累，随便聊聊"\n'
        'Output: {"tools": []}\n'
        'Message: "这两个月读的书里反复出现的主题是什么？"\n'
        'Output: {"tools": [{"name": "get_knowledge_graph", "args": {}}]}\n'
        'Message: "帮我看看我标过的那段话在第几章？"\n'
        'Output: {"tools": [{"name": "get_annotations", "args": {}}]}\n'
        'Message: "这段关于绿光的象征帮我记一下"\n'
        'Output: {"tools": [{"name": "save_note", "args": {"content": '
        '"绿光象征……", "preview": "绿光的象征", "tags": ["象征"]}}]}\n'
        'Message: "这个对比太妙了"\n'
        'Output: {"tools": []}  // appreciation, NOT a save request — no '
        'proposal\n'
    ),
    description='Decides tool calls for the companion tool phase',
    variables=[],
    output_format='json',
    temperature=0.0,
    max_tokens=200,
)

TOOL_PLAN_HUMAN = PromptTemplate(
    key='companion.tool_plan.human',
    version=1,
    template=(
        'Book: "{title}" by {author} ({progress}% read, status: {status})\n'
        'Context already available: {context_summary}\n\n'
        'Reader message: {message}\n\n'
        'Which tools does the companion need?'
    ),
    description='Reader message + context summary for tool planning',
    variables=['title', 'author', 'progress', 'status', 'context_summary', 'message'],
    output_format='json',
    max_tokens=200,
)
