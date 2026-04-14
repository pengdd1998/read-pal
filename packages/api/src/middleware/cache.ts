import { type Request, type Response, type NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Generate ETag from response body and send 304 if unchanged.
 * Must be registered AFTER the route handler (as a response wrapper).
 */
export function etag(maxAgeSeconds = 0) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Intercept res.json to add ETag support
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      const bodyStr = JSON.stringify(body);
      const hash = crypto.createHash('md5').update(bodyStr).digest('hex');
      const etagValue = `"${hash}"`;

      res.set('ETag', etagValue);
      if (maxAgeSeconds > 0) {
        res.set('Cache-Control', `private, max-age=${maxAgeSeconds}`);
      }

      // Check If-None-Match
      const clientEtag = req.headers['if-none-match'];
      if (clientEtag === etagValue) {
        return res.status(304).end();
      }

      return originalJson(body);
    };
    next();
  };
}
