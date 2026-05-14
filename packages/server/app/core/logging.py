"""Structured logging setup — structlog with stdlib backend."""

from __future__ import annotations

import logging
import sys

import structlog
from structlog.stdlib import ProcessorFormatter

_NOISY_LOGGERS = ('httpx', 'httpcore', 'urllib3', 'charset_normalizer')


def setup_logging(*, level: str = 'INFO', json_output: bool = False) -> None:
    """Configure structlog with stdlib as output backend.

    Args:
        level: Log level string (DEBUG, INFO, WARNING, ERROR).
        json_output: Use JSON renderer when True (for production).
    """
    numeric_level = getattr(logging, level.upper(), logging.INFO)

    # Shared processors applied before the renderer
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt='iso'),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
        structlog.processors.format_exc_info,
    ]

    # Choose renderer based on output mode
    renderer: structlog.types.Processor
    if json_output:
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    # Configure structlog to route through stdlib
    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # Stdlib handler with ProcessorFormatter
    formatter = ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
        foreign_pre_chain=shared_processors,
    )
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(formatter)

    # Root logger
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.WARNING)

    # read-pal namespace — more verbose
    app_logger = logging.getLogger('read-pal')
    app_logger.handlers.clear()
    app_logger.addHandler(handler)
    app_logger.setLevel(numeric_level)
    app_logger.propagate = False

    # Silence noisy third-party loggers
    for name in _NOISY_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)
