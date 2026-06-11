/** Development-only logger — calls are stripped in production builds. */

export function warn(...args: unknown[]): void {
  if (process.env.NODE_ENV === 'development') {
    console.warn(...args);
  }
}
