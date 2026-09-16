/** Extract code blocks from raw HTML chapter content for technical context. */
export function extractCodeBlocks(html: string, maxChars = 2000): string {
  if (!html) return '';
  const blocks: string[] = [];
  let totalChars = 0;
  const preRegex = /<pre[^>]*>(?:<code[^>]*?(?:class="language-(\w+)")?[^>]*>)?([\s\S]*?)(?:<\/code>)?<\/pre>/gi;
  let match;
  while ((match = preRegex.exec(html)) !== null && totalChars < maxChars) {
    const lang = match[1] || 'code';
    const code = match[2]
      .replace(/<\/?[^>]+(>|$)/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .trim();
    if (code) {
      const block = `[${lang}]\n${code}`;
      if (totalChars + block.length <= maxChars) {
        blocks.push(block);
        totalChars += block.length;
      }
    }
  }
  return blocks.join('\n\n');
}
