import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeTime } from '@/lib/date';

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-19T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Just now" for times less than 1 minute ago', () => {
    expect(formatRelativeTime('2026-04-19T11:59:30Z')).toBe('Just now');
  });

  it('returns minutes ago for times within the last hour', () => {
    expect(formatRelativeTime('2026-04-19T11:50:00Z')).toBe('10m ago');
  });

  it('returns hours ago for times within the last day', () => {
    expect(formatRelativeTime('2026-04-19T10:00:00Z')).toBe('2h ago');
  });

  it('returns days ago for times within the last week', () => {
    expect(formatRelativeTime('2026-04-17T12:00:00Z')).toBe('2d ago');
  });

  it('returns formatted date for times older than 7 days', () => {
    const result = formatRelativeTime('2026-04-01T12:00:00Z');
    expect(result).toContain('Apr');
    expect(result).not.toContain('ago');
  });

  it('returns original string for invalid date', () => {
    expect(formatRelativeTime('not-a-date')).toBe('not-a-date');
  });

  it('handles ISO date strings', () => {
    expect(formatRelativeTime('2026-04-19T11:30:00Z')).toBe('30m ago');
  });
});
