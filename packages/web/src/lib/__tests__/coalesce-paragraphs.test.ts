import { describe, expect, it } from 'vitest';
import { coalesceHtml } from '../coalesce-paragraphs';
import { splitChapterIntoPages } from '../chapter-paginator';

describe('coalesceHtml — 上游断段合并（设计评审 P0：giga/ntic 腰斩）', () => {
  it('小写开头且前段非句末 → 合并为一个 <p>', () => {
    const html = '<p>the eyes of Doctor T.J. Eckleburg are blue and giga</p><p>ntic — their retinas are one yard high.</p>';
    const out = coalesceHtml(html);
    expect(out.match(/<p[\s>]/gi)?.length).toBe(1);
    expect(out).toContain('giga ntic');
  });

  it('连续多个碎片链式合并', () => {
    const html = '<p>we drove on toward death through the cooling twi</p><p>light. A street</p><p>lamp and I were...</p>';
    expect(coalesceHtml(html).match(/<p[\s>]/gi)?.length).toBe(1);
  });

  it('前段以句号结尾 → 不合并（合法小写开头，如诗歌/续写）', () => {
    const html = '<p>She sighed. It was over.</p><p>but not for me, she thought.</p>';
    expect(coalesceHtml(html).match(/<p[\s>]/gi)?.length).toBe(2);
  });

  it('大写开头 → 不合并', () => {
    const html = '<p>without pausing</p><p>But she continued anyway.</p>';
    expect(coalesceHtml(html).match(/<p[\s>]/gi)?.length).toBe(2);
  });

  it('中文段落永不合并（无大小写）', () => {
    const html = '<p>黄昏时分，码头上的灯火次第亮</p><p>起，渔船随潮水轻轻摇晃。</p>';
    expect(coalesceHtml(html).match(/<p[\s>]/gi)?.length).toBe(2);
  });

  it('合并时保留内联标记', () => {
    const html = '<p>the valley of ashes and the <em>eyes</em> of Doc</p><p>tor Eckleburg kept vigil.</p>';
    const out = coalesceHtml(html);
    expect(out).toContain('<em>eyes</em>');
    expect(out).toContain('Doc tor');
  });

  it('非 <p> 块（div/h2）不参与合并', () => {
    const html = '<h2>Chapter II</h2><p>half a sent</p><div>ence in a div</div>';
    expect(coalesceHtml(html).match(/<div/gi)?.length).toBe(1);
  });

  it('空与无 <p> 输入原样返回', () => {
    expect(coalesceHtml('')).toBe('');
    expect(coalesceHtml('<div>plain</div>')).toBe('<div>plain</div>');
  });
});

describe('splitChapterIntoPages — 短章节路径同样合并', () => {
  it('短章节（≤maxChars）不因早退而漏合并', () => {
    const html = '<p>short fragment one tw</p><p>o merged fine.</p>';
    const pages = splitChapterIntoPages(html, 4000);
    expect(pages).toHaveLength(1);
    expect(pages[0].html).toContain('one tw o merged');
  });

  it('长章节分页后合并段落不跨页', () => {
    const para = '<p>' + 'lorem ipsum dolor sit amet consectetur '.repeat(4) + 'and giga</p>';
    const frag = '<p>ntic — their retinas are one yard high. ' + 'qui dolorem ipsum '.repeat(80) + '</p>';
    const long = para + frag;
    const pages = splitChapterIntoPages(long, 400);
    const all = pages.map((p) => p.html).join('\n');
    // 合并后 giga 与 ntic 处于同一个 <p>（可能不在同页字符串，但不得再出现独立腰斩 <p>）
    expect(all).toContain('and giga');
    const pCount = (all.match(/<p[\s>]/gi) || []).length;
    expect(pCount).toBe(1);
  });
});
