"""LLM and rule-based concept extraction from annotation texts."""

from __future__ import annotations

import re
from typing import Any
from uuid import UUID

import structlog
from langchain_core.messages import HumanMessage, SystemMessage

from app.prompts import KNOWLEDGE_EXTRACTION_HUMAN, KNOWLEDGE_EXTRACTION_SYSTEM
from app.schemas.llm_outputs import ConceptList
from app.services.llm import safe_llm_invoke
from app.utils.sanitizer import sanitize_annotations
from app.utils.token_budget import TokenBudget

logger = structlog.get_logger('read-pal.knowledge')


async def _extract_concepts_via_llm(
    texts: list[str],
    user_id: UUID | None = None,
    book_id: UUID | None = None,
) -> list[dict[str, Any]]:
    """Use LLM to extract concepts/entities from annotation texts.

    Returns a list of dicts: {name, type, related: [...]}.
    """
    if not texts:
        return []

    combined = '\n---\n'.join(texts[:20])

    # Sanitize input to prevent prompt injection
    combined = sanitize_annotations(combined)

    # Enforce token budget to avoid context window overflow
    budget = TokenBudget()
    combined = budget.add(combined, 'annotations')

    system_prompt = KNOWLEDGE_EXTRACTION_SYSTEM.template
    human_prompt = KNOWLEDGE_EXTRACTION_HUMAN.template.format(annotations=combined)

    result = await safe_llm_invoke(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ],
        fallback=[],
        log_label='Knowledge concept extraction',
        schema_class=ConceptList,
        user_id=str(user_id) if user_id else None,
        book_id=str(book_id) if book_id else None,
    )

    if isinstance(result, list):
        # LLM returned a bare array -- wrap in expected container shape
        return result

    if isinstance(result, dict) and 'concepts' in result:
        # Pydantic-validated ConceptList.model_dump()
        return result['concepts']

    return []


def _extract_concepts_from_keywords(
    texts: list[str],
) -> list[dict[str, Any]]:
    """Rule-based concept extraction fallback when LLM is unavailable.

    Extracts capitalized phrases and key noun patterns from text.
    """
    concepts: dict[str, dict[str, Any]] = {}

    for text in texts:
        # Extract capitalized phrases (potential proper nouns/titles)
        caps = re.findall(r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b', text)
        for phrase in caps:
            name = phrase.strip()
            if name in concepts:
                concepts[name]['size'] = (concepts[name].get('size', 0) or 0) + 1
            else:
                concepts[name] = {'name': name, 'type': 'entity', 'related': [], 'size': 1}

        # Extract quoted terms as key concepts
        quoted = re.findall(r'"([^"]+)"', text)
        for term in quoted:
            if len(term) > 3:
                if term not in concepts:
                    concepts[term] = {'name': term, 'type': 'theme', 'related': [], 'size': 1}
                else:
                    concepts[term]['size'] = (concepts[term].get('size', 0) or 0) + 1

    # Link co-occurring concepts
    concept_list = list(concepts.values())
    for i, c1 in enumerate(concept_list):
        for c2 in concept_list[i + 1:]:
            if c1.get('related') is not None and len(c1['related']) < 5:
                c1['related'].append(c2['name'])
            if c2.get('related') is not None and len(c2['related']) < 5:
                c2['related'].append(c1['name'])

    return concept_list[:30]  # Cap at 30 concepts
