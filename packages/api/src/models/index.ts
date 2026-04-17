/**
 * Models Export and Associations
 */

import { sequelize } from '../db';
import { User } from './User';
import { Book } from './Book';
import { Annotation } from './Annotation';
import { ReadingSession } from './ReadingSession';
import { Document } from './Document';
import { MemoryBook } from './MemoryBook';
import { ChatMessage } from './ChatMessage';
import { InterventionFeedback } from './InterventionFeedback';
import { FriendConversation, FriendRelationship } from './FriendConversation';
import { Flashcard } from './Flashcard';
import { Collection } from './Collection';
import { SharedExport } from './SharedExport';
import { Notification } from './Notification';
import { BookClub, BookClubMember, ClubDiscussion } from './BookClub';
import { ApiKey } from './ApiKey';

// Define associations
User.hasMany(Book, { foreignKey: 'userId', as: 'books' });
Book.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Annotation, { foreignKey: 'userId', as: 'annotations' });
Annotation.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Book.hasMany(Annotation, { foreignKey: 'bookId', as: 'annotations' });
Annotation.belongsTo(Book, { foreignKey: 'bookId', as: 'book' });

User.hasMany(ReadingSession, { foreignKey: 'userId', as: 'readingSessions' });
ReadingSession.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Book.hasMany(ReadingSession, { foreignKey: 'bookId', as: 'readingSessions' });
ReadingSession.belongsTo(Book, { foreignKey: 'bookId', as: 'book' });

User.hasMany(MemoryBook, { foreignKey: 'userId', as: 'memoryBooks' });
MemoryBook.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Book.hasOne(MemoryBook, { foreignKey: 'bookId', as: 'memoryBook' });
MemoryBook.belongsTo(Book, { foreignKey: 'bookId', as: 'book' });

User.hasMany(ChatMessage, { foreignKey: 'userId', as: 'chatMessages' });
ChatMessage.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Book.hasMany(ChatMessage, { foreignKey: 'bookId', as: 'chatMessages' });
ChatMessage.belongsTo(Book, { foreignKey: 'bookId', as: 'book' });

User.hasMany(InterventionFeedback, { foreignKey: 'userId', as: 'interventionFeedback' });
InterventionFeedback.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(FriendConversation, { foreignKey: 'userId', as: 'friendConversations' });
FriendConversation.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasOne(FriendRelationship, { foreignKey: 'userId', as: 'friendRelationship' });
FriendRelationship.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Flashcard, { foreignKey: 'userId', as: 'flashcards' });
Flashcard.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Book.hasMany(Flashcard, { foreignKey: 'bookId', as: 'flashcards' });
Flashcard.belongsTo(Book, { foreignKey: 'bookId', as: 'book' });

User.hasMany(Collection, { foreignKey: 'userId', as: 'collections' });
Collection.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(SharedExport, { foreignKey: 'userId', as: 'sharedExports' });
SharedExport.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Book.hasMany(SharedExport, { foreignKey: 'bookId', as: 'sharedExports' });
SharedExport.belongsTo(Book, { foreignKey: 'bookId', as: 'book' });

User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// BookClub associations
User.hasMany(BookClub, { foreignKey: 'createdBy', as: 'createdClubs' });
BookClub.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

User.belongsToMany(BookClub, { through: BookClubMember, foreignKey: 'userId', otherKey: 'clubId', as: 'joinedClubs' });
BookClub.belongsToMany(User, { through: BookClubMember, foreignKey: 'clubId', otherKey: 'userId', as: 'memberUsers' });

BookClub.hasMany(BookClubMember, { foreignKey: 'clubId', as: 'clubMembers' });
BookClubMember.belongsTo(BookClub, { foreignKey: 'clubId', as: 'club' });
BookClubMember.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// ClubDiscussion associations
BookClub.hasMany(ClubDiscussion, { foreignKey: 'clubId', as: 'discussions' });
ClubDiscussion.belongsTo(BookClub, { foreignKey: 'clubId', as: 'club' });
ClubDiscussion.belongsTo(User, { foreignKey: 'userId', as: 'author' });

// ApiKey associations
User.hasMany(ApiKey, { foreignKey: 'userId', as: 'apiKeys' });
ApiKey.belongsTo(User, { foreignKey: 'userId', as: 'user' });

export { User, Book, Annotation, ReadingSession, Document, MemoryBook, ChatMessage, InterventionFeedback, FriendConversation, FriendRelationship, Flashcard, Collection, SharedExport, Notification, BookClub, BookClubMember, ClubDiscussion, ApiKey };
export type { Chapter } from './Document';
export type { MemoryBookMoment, MemoryBookInsight, MemoryBookStats, PersonalBookSection } from './MemoryBook';
export { sequelize };
