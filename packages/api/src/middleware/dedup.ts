import { type Request, type Response, type NextFunction } from 'express';

/**
 * In-flight request deduplication for GET requests.
 * If the same URL + auth token makes a concurrent request while one is already
 * processing, the second caller awaits the first response instead of issuing a
 * duplicate DB query.
 */
const inflight = new Map<string, Promise<unknown>>();

function makeKey(req: Request): string {
  const token = (req.headers.authorization || '').slice(-20);
  return `${req.method}:${req.originalUrl}:${token}`;
}

export function dedup() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only dedup GET requests
    if (req.method !== 'GET') return next();

    const key = makeKey(req);

    // If there's already an in-flight request for this exact URL+token, wait for it
    const existing = inflight.get(key);
    if (existing) {
      // Clone the response once the original finishes
      existing.then((result: unknown) => {
        res.json(result);
      }).catch(() => {
        // Let the original handler deal with errors; fall through
        next();
      });
      return;
    }

    // Intercept res.json to capture the response
    const originalJson = res.json.bind(res);
    const promise = new Promise<unknown>((resolve) => {
      res.json = (body: unknown) => {
        resolve(body);
        inflight.delete(key);
        return originalJson(body);
      };
    });

    inflight.set(key, promise);

    // Safety: clean up if response never calls .json (e.g., .send, .redirect)
    res.on('finish', () => {
      inflight.delete(key);
    });

    next();
  };
}
