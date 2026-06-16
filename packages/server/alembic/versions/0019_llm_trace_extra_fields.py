"""add finish_reason, lang, prompt_version to llm_call_traces

Revision ID: 0019
Revises: 0018
Create Date: 2026-06-15 14:00:00.000000

Adds observability fields to ``llm_call_traces``:
- ``finish_reason``: why the LLM stopped (stop, length, content_filter, etc.)
- ``lang``: language code for prompt translations (e.g., 'en', 'zh')
- ``prompt_version``: MD5 hash of prompt template for A/B regression analysis

``finish_reason`` distinguishes complete responses from truncated ones and
content-filter refusals. ``lang`` enables per-language quality metrics.
``prompt_version`` allows correlating LLM outputs with specific prompt versions.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0019'
down_revision: Union[str, None] = '0018'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'llm_call_traces',
        sa.Column('finish_reason', sa.String(50), nullable=True),
    )
    op.add_column(
        'llm_call_traces',
        sa.Column('lang', sa.String(10), nullable=True),
    )
    op.add_column(
        'llm_call_traces',
        sa.Column('prompt_version', sa.String(32), nullable=True),
    )
    op.create_index('ix_llm_traces_finish_reason', 'llm_call_traces', ['finish_reason'])
    op.create_index('ix_llm_traces_lang', 'llm_call_traces', ['lang'])
    op.create_index('ix_llm_traces_prompt_version', 'llm_call_traces', ['prompt_version'])


def downgrade() -> None:
    op.drop_index('ix_llm_traces_prompt_version')
    op.drop_index('ix_llm_traces_lang')
    op.drop_index('ix_llm_traces_finish_reason')
    op.drop_column('llm_call_traces', 'prompt_version')
    op.drop_column('llm_call_traces', 'lang')
    op.drop_column('llm_call_traces', 'finish_reason')
