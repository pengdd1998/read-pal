import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createMark } from '../annotation-marks';
import type { Annotation } from '@read-pal/shared';

function makeAnnotation(start: number, end: number): Annotation {
  return {
    id: 'ann-1',
    type: 'highlight',
    content: 'irrelevant',
    createdAt: new Date().toISOString(),
    location: { pageIndex: 0, selection: { start, end } },
  } as unknown as Annotation;
}

function setup() {
  const container = document.createElement('div');
  // 跨内联元素的正文段：<p>前文 <em>强调</em> 后文，更多文字。</p>
  const p = document.createElement('p');
  p.append('the eyes are blue and gigantic — their retinas');
  const em = document.createElement('em');
  em.textContent = ' retinas glow';
  p.appendChild(em);
  p.appendChild(document.createTextNode(' in the dusk.'));
  container.appendChild(p);
  document.body.appendChild(container);
  return { container, cleanup: () => container.remove() };
}

describe('createMark — 高亮不得撕开段落（giga/ntic 腰斩修复）', () => {
  beforeEach(() => document.querySelectorAll('.highlight-mark').forEach((m) => m.remove()));

  it('跨 <em> 边界的高亮保持单个 <p>，逐文本节点包裹多个 <mark>', () => {
    const { container, cleanup } = setup();
    // 覆盖 "...gigantic — their retinas" 到 <em> 内 —— 跨元素边界
    const mark = createMark(container, makeAnnotation(20, 49), 'light', new Map(), vi.fn());
    expect(mark).not.toBeNull();
    expect(container.querySelectorAll('p')).toHaveLength(1);
    const marks = container.querySelectorAll('.highlight-mark');
    expect(marks.length).toBeGreaterThanOrEqual(2); // 主 mark + 跨界克隆
    cleanup();
  });

  it('段落文本顺序完整（无字符丢失/重复）', () => {
    const { container, cleanup } = setup();
    createMark(container, makeAnnotation(4, 40), 'light', new Map(), vi.fn());
    const text = container.querySelector('p')!.textContent;
    expect(text).toContain('the eyes are blue and gigantic — their retinas');
    expect(text).toContain(' retinas glow');
    expect(text.endsWith(' in the dusk.')).toBe(true);
    cleanup();
  });

  it('单文本节点内的高亮仍走 surroundContents 快路径（单 mark）', () => {
    const { container, cleanup } = setup();
    createMark(container, makeAnnotation(0, 8), 'light', new Map(), vi.fn());
    expect(container.querySelectorAll('.highlight-mark')).toHaveLength(1);
    expect(container.querySelectorAll('p')).toHaveLength(1);
    cleanup();
  });
});
