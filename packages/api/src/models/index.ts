/**
 * Models Export and Associations
 */

import { sequelize } from '../db';
import { User } from './User';
import { Book } from './Book';
import { Annotation } from './Annotation';
import { ReadingSession } from './ReadingSession';
import { Document } from './Document';

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

export { User, Book, Annotation, ReadingSession, Document };
export { sequelize };

// Sync function for development
export async function syncDatabase(force = false) {
  if (process.env.NODE_ENV === 'production' && force) {
    throw new Error('Cannot force sync in production');
  }
  await sequelize.sync({ force, alter: !force });
}
