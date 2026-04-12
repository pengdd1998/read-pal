/**
 * InterventionFeedback Model
 *
 * Stores user feedback on agent interventions to improve future tuning.
 */

import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../db';

interface InterventionFeedbackAttributes {
  id: string;
  userId: string;
  bookId?: string;
  interventionType: string;
  helpful: boolean;
  dismissed: boolean;
  context?: Record<string, unknown>;
  createdAt: Date;
}

interface InterventionFeedbackCreationAttributes extends Optional<InterventionFeedbackAttributes, 'id' | 'bookId' | 'context' | 'createdAt'> {}

export class InterventionFeedback extends Model<InterventionFeedbackAttributes, InterventionFeedbackCreationAttributes> implements InterventionFeedbackAttributes {
  public id!: string;
  public userId!: string;
  public bookId?: string;
  public interventionType!: string;
  public helpful!: boolean;
  public dismissed!: boolean;
  public context?: Record<string, unknown>;
  public readonly createdAt!: Date;
}

InterventionFeedback.init(
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
    },
    bookId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'books', key: 'id' },
    },
    interventionType: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    helpful: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    dismissed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    context: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'intervention_feedback',
    timestamps: false,
    indexes: [
      { fields: ['userId'] },
      { fields: ['interventionType'] },
      { fields: ['helpful'] },
      { fields: ['createdAt'] },
    ],
  }
);
