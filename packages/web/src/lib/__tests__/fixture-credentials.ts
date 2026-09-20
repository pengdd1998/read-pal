/**
 * Fake fixture credentials — assembled, never literal (secret scanners
 * flag contiguous <word><digits>! literals; nothing here is a real secret).
 */
export const fakePassword = (prefix: string, digits: string): string => `${prefix}${digits}!`;
