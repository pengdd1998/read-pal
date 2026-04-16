/**
 * Flashcard Model
 *
 * AI-generated flashcards from reading highlights and notes.
 * Uses SM-2 spaced repetition algorithm for review scheduling.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db';

type SM2Rating = 0 | 1 | 2 | 3 | 4 | 5;

interface FlashcardAttributes {
  id: string;
  userId: string;
  bookId: string;
  annotationId?: string;
  question: string;
  answer: string;
  // SM-2 algorithm fields
  easeFactor: number;
  interval: number;
  repetitionCount: number;
  nextReviewAt: Date;
  lastReviewAt?: Date;
  lastRating?: SM2Rating;
  createdAt: Date;
  updatedAt: Date;
}

interface FlashcardCreationAttributes extends Optional<FlashcardAttributes, 'id' | 'annotationId' | 'easeFactor' | 'interval' | 'repetitionCount' | 'nextReviewAt' | 'lastReviewAt' | 'lastRating' | 'createdAt' | 'updatedAt'> {}

export class Flashcard extends Model<FlashcardAttributes, FlashcardCreationAttributes> implements FlashcardAttributes {
  public id!: string;
  public userId!: string;
  public bookId!: string;
  public annotationId?: string;
  public question!: string;
  public answer!: string;
  public easeFactor!: number;
  public interval!: number;
  public repetitionCount!: number;
  public nextReviewAt!: Date;
  public lastReviewAt?: Date;
  public lastRating?: SM2Rating;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Flashcard.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    bookId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'books', key: 'id' },
      onDelete: 'CASCADE',
    },
    annotationId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'annotations', key: 'id' },
      onDelete: 'SET NULL',
    },
    question: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    answer: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    easeFactor: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 2.5,
    },
    interval: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    repetitionCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    nextReviewAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    lastReviewAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastRating: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 0, max: 5 },
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'flashcards',
    timestamps: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['book_id'] },
      { fields: ['user_id', 'next_review_at'] },
      { fields: ['annotation_id'] },
    ],
  }
);

/**
 * SM-2 spaced repetition algorithm.
 * Updates easeFactor, interval, and repetitionCount based on the quality of response.
 *
 * Rating scale:
 * 0 — Complete blackout
 * 1 — Incorrect, but remembered upon seeing the answer
 * 2 — Incorrect, but the answer seemed easy to recall
 * 3 — Correct with serious difficulty
 * 4 — Correct with some hesitation
 * 5 — Perfect response
 */
export function calculateSM2(
  currentEase: number,
  currentInterval: number,
  currentReps: number,
  rating: SM2Rating,
): { easeFactor: number; interval: number; repetitionCount: number } {
  // If rating < 3, reset repetition count
  if (rating < 3) {
    return {
      easeFactor: currentEase,
      interval: 1,
      repetitionCount: 0,
    };
  }

  // Calculate new ease factor
  const newEase = Math.max(
    1.3,
    currentEase + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02)),
  );

  // Calculate new interval
  let newInterval: number;
  const newReps = currentReps + 1;
  if (newReps === 1) {
    newInterval = 1;
  } else if (newReps === 2) {
    newInterval = 6;
  } else {
    newInterval = Math.round(currentInterval * newEase);
  }

  return {
    easeFactor: Math.round(newEase * 100) / 100,
    interval: newInterval,
    repetitionCount: newReps,
  };
}
