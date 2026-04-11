import { validationResult, ValidationChain } from 'express-validator';
import { type Request, type Response, type NextFunction } from 'express';

/**
 * Validation middleware using express-validator chains.
 * Usage: validate([body('email').isEmail(), body('name').trim().isLength({ min: 1 })])
 */
export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    await Promise.all(validations.map(v => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: errors.array(),
        },
      });
    }
    return next();
  };
};

/**
 * Custom rule-based validation middleware.
 * Provides a declarative way to define validation rules without express-validator chains.
 */

interface ValidationRule {
  type: 'required' | 'email' | 'minLength' | 'maxLength' | 'in' | 'isInt';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value?: any;
  message: string;
}

interface ValidationDefinition {
  field: string;
  rules: ValidationRule[];
}

interface ValidationError {
  field: string;
  message: string;
}

export function customValidate(validations: ValidationDefinition[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: ValidationError[] = [];

    for (const { field, rules } of validations) {
      const value = req.body[field] ?? req.params[field] ?? req.query[field];

      for (const rule of rules) {
        if (
          rule.type === 'required' &&
          (!value || (typeof value === 'string' && !value.trim()))
        ) {
          errors.push({
            field,
            message: rule.message || `${field} is required`,
          });
        }
        if (
          rule.type === 'email' &&
          value &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))
        ) {
          errors.push({
            field,
            message: rule.message || 'Invalid email format',
          });
        }
        if (
          rule.type === 'minLength' &&
          value &&
          String(value).length < (rule.value || 0)
        ) {
          errors.push({
            field,
            message:
              rule.message ||
              `${field} must be at least ${rule.value} characters`,
          });
        }
        if (
          rule.type === 'maxLength' &&
          value &&
          String(value).length > (rule.value || Infinity)
        ) {
          errors.push({
            field,
            message:
              rule.message ||
              `${field} must be at most ${rule.value} characters`,
          });
        }
        if (
          rule.type === 'in' &&
          value &&
          !rule.value?.includes(value)
        ) {
          errors.push({
            field,
            message:
              rule.message ||
              `${field} must be one of: ${rule.value?.join(', ')}`,
          });
        }
        if (
          rule.type === 'isInt' &&
          value &&
          !Number.isInteger(Number(value))
        ) {
          errors.push({
            field,
            message: rule.message || `${field} must be an integer`,
          });
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: errors,
        },
      });
    }

    next();
  };
}
