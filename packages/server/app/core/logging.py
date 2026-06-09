"""Structured logging setup — structlog with stdlib backend."""

import logging
import sys

import structlog
from structlog.stdlib import ProcessorFormatter

_NOISY_LOGGERS = ('httpx', 'httpcore', 'urllib3', 'charset_normalizer')


def _build_shared_processors() -> list[structlog.types.Processor]:
    """Return the list of shared structlog processors."""
    return [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt='iso'),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
        structlog.processors.format_exc_info,
    ]


def _choose_renderer(json_output: bool) -> structlog.types.Processor:
    """Select console or JSON renderer based on output mode."""
    if json_output:
        return structlog.processors.JSONRenderer()
    return structlog.dev.ConsoleRenderer(colors=True)


def _build_handler(
    shared_processors: list[structlog.types.Processor],
    renderer: structlog.types.Processor,
) -> logging.StreamHandler:
    """Create a stdlib handler wired through ProcessorFormatter."""
    formatter = ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
        foreign_pre_chain=shared_processors,
    )
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(formatter)
    return handler


def _configure_root_logger(handler: logging.StreamHandler) -> None:
    """Set up the root logger to use the structlog handler at WARNING."""
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.WARNING)


def _configure_app_logger(
    handler: logging.StreamHandler,
    numeric_level: int,
) -> None:
    """Set up the read-pal namespace logger at the requested level."""
    app_logger = logging.getLogger('read-pal')
    app_logger.handlers.clear()
    app_logger.addHandler(handler)
    app_logger.setLevel(numeric_level)
    app_logger.propagate = False


def setup_logging(*, level: str = 'INFO', json_output: bool = False) -> None:
    """Configure structlog with stdlib as output backend.

    Args:
        level: Log level string (DEBUG, INFO, WARNING, ERROR).
        json_output: Use JSON renderer when True (for production).
    """
    numeric_level = getattr(logging, level.upper(), logging.INFO)
    shared_processors = _build_shared_processors()
    renderer = _choose_renderer(json_output)

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    handler = _build_handler(shared_processors, renderer)
    _configure_root_logger(handler)
    _configure_app_logger(handler, numeric_level)

    for name in _NOISY_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)
