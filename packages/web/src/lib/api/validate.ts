/**
 * Runtime response-shape validation at the API boundary.
 *
 * The client's `get<T>`/`post<T>` return `ApiResponse<T>` where `T` is a
 * blind cast — a backend shape change surfaces downstream as undefined
 * fields crashing deep inside render (the Round-189 content_hash chat-loss
 * class). Callers that pass a zod schema get a loud, diagnosable failure
 * instead: the mismatch is logged with the exact field paths and the
 * envelope degrades to `{ success: false, error: { code: API_CONTRACT_MISMATCH } }`,
 * which existing error UI already renders.
 *
 * Schemas live in `./schemas`. Keep them lenient on fields the UI doesn't
 * depend on (`passthrough` by default in zod) and strict on the ones it
 * dereferences.
 */

import type { ZodType } from 'zod';
import type { ApiResponse } from '@read-pal/shared';
import { warn } from '../logger';

export const API_CONTRACT_MISMATCH = 'API_CONTRACT_MISMATCH';

/**
 * Validate `data` against `schema`. Returns the failure envelope when the
 * shape doesn't match (never throws — the get() contract is "returns
 * { success: false } for errors"), and logs the offending paths so the
 * drift is debuggable from a single console line.
 */
export function validateData<T>(
  url: string,
  data: T | undefined,
  schema: ZodType<T>,
): ApiResponse<T> {
  const parsed = schema.safeParse(data);
  if (parsed.success) {
    return { success: true, data: parsed.data };
  }
  const paths = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  warn(`api contract violation: ${url}`, paths.join(' | '));
  return {
    success: false,
    error: {
      code: API_CONTRACT_MISMATCH,
      message: `Unexpected response shape from ${url}`,
      details: paths,
    },
  };
}
