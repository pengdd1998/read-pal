"""Named constants for database query limits.

Centralizes magic numbers so they're discoverable and adjustable in one place.
"""

# Annotation queries
ANNOTATION_FETCH_LIMIT = 50

# Chat / conversation history
CHAT_HISTORY_DEFAULT_LIMIT = 50
CONVERSATION_MEMORY_LIMIT = 200

# Recommendations
RECOMMENDATION_FETCH_LIMIT = 200

# Reading book / mirror
READING_BOOK_FETCH_LIMIT = 50

# Share queries
SHARE_QUERY_LIMIT = 100

# Data collection for memory book generation
DATA_COLLECTION_ANNOTATION_LIMIT = 500
DATA_COLLECTION_CHAT_LIMIT = 200
DATA_COLLECTION_SESSION_LIMIT = 100
DATA_COLLECTION_FLASHCARD_LIMIT = 30

# Flashcards / challenges
CHALLENGE_MIN_DUE = 10

# Email
SMTP_TIMEOUT_SECONDS = 10
