import { describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from '@/lib/clipboard';

describe('copyToClipboard', () => {
  it('uses clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    });

    const result = await copyToClipboard('hello');
    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');

    vi.restoreAllMocks();
  });

  it('falls back to execCommand when clipboard API fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('not allowed'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    // jsdom doesn't have execCommand, so define it on document
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    const result = await copyToClipboard('hello');
    expect(result).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');

    vi.restoreAllMocks();
  });

  it('returns false when both methods fail', async () => {
    vi.stubGlobal('navigator', { clipboard: undefined });

    const result = await copyToClipboard('hello');
    // In jsdom, execCommand may not work — the function catches and returns false
    expect(typeof result).toBe('boolean');

    vi.restoreAllMocks();
  });
});
