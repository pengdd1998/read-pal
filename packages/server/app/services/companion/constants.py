"""Constants for the companion service."""

HISTORY_LIMIT = 20
ANNOTATION_LIMIT = 10
STREAM_FLUSH_SIZE = 5  # Check every N tokens for streaming safety

# Safety keywords for logging (not blocking)
_SAFETY_KEYWORDS = ['suicide', 'self-harm', 'kill myself']
