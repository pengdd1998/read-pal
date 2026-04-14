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
