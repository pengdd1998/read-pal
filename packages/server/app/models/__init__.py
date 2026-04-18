"""Database models — import all models so they register with Base.metadata."""

from app.models.user import User
from app.models.book import Book
from app.models.annotation import Annotation
from app.models.reading_session import ReadingSession
from app.models.document import Document
from app.models.memory_book import MemoryBook
from app.models.chat_message import ChatMessage
from app.models.flashcard import Flashcard
from app.models.friend import FriendConversation, FriendRelationship
from app.models.collection import Collection
from app.models.notification import Notification
from app.models.shared_export import SharedExport
from app.models.intervention_feedback import InterventionFeedback
from app.models.book_club import BookClub, BookClubMember, ClubDiscussion
from app.models.api_key import ApiKey
from app.models.webhook import Webhook, WebhookDeliveryLog

__all__ = [
    'User',
    'Book',
    'Annotation',
    'ReadingSession',
    'Document',
    'MemoryBook',
    'ChatMessage',
    'Flashcard',
    'FriendConversation',
    'FriendRelationship',
    'Collection',
    'Notification',
    'SharedExport',
    'InterventionFeedback',
    'BookClub',
    'BookClubMember',
    'ClubDiscussion',
    'ApiKey',
    'Webhook',
    'WebhookDeliveryLog',
]
