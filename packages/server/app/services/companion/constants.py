"""Constants for the companion service."""

HISTORY_LIMIT = 20
ANNOTATION_LIMIT = 10
STREAM_FLUSH_SIZE = 5  # Check every N tokens for streaming safety

# B1: throttling interval for request.is_disconnected() probes during a
# stream. Starlette's disconnect probe is a syscall (socket recv); running
# it every chunk would dominate flame graphs at typical ~50ms/chunk rates.
# 4 chunks ≈ 200ms between probes — fast enough to stop billing within a
# single chunk, rare enough to not show up in perf traces.
DISCONNECT_CHECK_EVERY_N_CHUNKS = 4

# Safety keywords for logging (not blocking)
_SAFETY_KEYWORDS = ['suicide', 'self-harm', 'kill myself']
