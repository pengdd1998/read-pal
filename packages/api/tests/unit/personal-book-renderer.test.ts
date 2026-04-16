/**
 * Personal Book Renderer — Unit Tests
 *
 * Tests the HTML rendering pipeline for the Personal Reading Book feature.
 */

import { renderPersonalBook } from '../../src/services/PersonalBookRenderer';
import type { EnrichedPersonalBook } from '../../src/services/PersonalBookEnricher';

// Minimal enriched data fixture
function makeEnrichedBook(overrides?: Partial<EnrichedPersonalBook>): EnrichedPersonalBook {
  return {
    cover: {
      subtitle: "A Reader's Journey Through Testing",
      readingTimeFormatted: '3 hours across 5 sessions',
    },
    journey: {
      milestones: [
        { label: 'Started reading', date: '2026-01-01T00:00:00Z' },
        { label: 'Reached 50%', date: '2026-01-05T00:00:00Z', detail: 'Halfway there!' },
        { label: 'Completed', date: '2026-01-10T00:00:00Z' },
      ],
      paceComment: 'Steady pace, about 2 chapters per session.',
    },
    highlights: {
      themes: [
        {
          name: 'Core Concepts',
          description: 'Key definitions and foundational ideas',
          highlightIds: ['abc12345'],
          highlights: [
            { content: 'The fundamental theorem states that every action has a reaction.' },
            { content: 'Note the distinction between classical and modern approaches.', note: 'Important for exam!' },
          ],
        },
      ],
    },
    notes: {
      notes: [
        { chapterIndex: 0, content: 'Opening paragraph was powerful.', note: 'Reminds me of a quote from...', tags: ['philosophy', 'opening'] },
      ],
      emotionalTrajectory: 'Started curious, became increasingly engaged.',
      tagCloud: { philosophy: 3, science: 2, opening: 1 },
    },
    conversations: {
      conversations: [
        {
          userMessage: 'What does the author mean by "the unexamined life"?',
          assistantMessage: 'The phrase comes from Socrates. It means a life without self-reflection lacks meaning.',
          context: '',
          why: '',
        },
      ],
    },
    synthesis: {
      insights: [
        { theme: 'Self-reflection', description: 'The reader engaged deeply with themes of self-knowledge.' },
      ],
      connections: [
        { title: 'Meditations', author: 'Marcus Aurelius', connection: 'Similar emphasis on daily self-examination.' },
      ],
      recommendations: ['Meditations by Marcus Aurelius', 'Man\'s Search for Meaning by Viktor Frankl'],
      unresolvedQuestions: [
        { question: 'How does the author reconcile free will with determinism?', context: 'Chapter 3' },
      ],
      reflectionPrompt: 'What is one belief you held before reading this book that has changed?',
    },
    ...overrides,
  };
}

describe('renderPersonalBook', () => {
  it('produces valid HTML document', () => {
    const { html } = renderPersonalBook(
      'Test Book',
      'Test Author',
      null,
      'Test Reader',
      makeEnrichedBook(),
    );

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');
  });

  it('includes book title and author in the cover', () => {
    const { html } = renderPersonalBook(
      'The Great Gatsby',
      'F. Scott Fitzgerald',
      null,
      'John Doe',
      makeEnrichedBook(),
    );

    expect(html).toContain('The Great Gatsby');
    expect(html).toContain('F. Scott Fitzgerald');
    expect(html).toContain('John Doe');
    expect(html).toContain('Personal Reading Book');
  });

  it('includes cover image when provided', () => {
    const { html } = renderPersonalBook(
      'Test Book',
      'Test Author',
      'https://example.com/cover.jpg',
      'Reader',
      makeEnrichedBook(),
    );

    expect(html).toContain('<img src="https://example.com/cover.jpg"');
  });

  it('renders all 7 sections (cover + 6 chapters)', () => {
    const { sections } = renderPersonalBook(
      'Test Book',
      'Test Author',
      null,
      'Reader',
      makeEnrichedBook(),
    );

    expect(sections).toHaveLength(7);
    expect(sections[0].type).toBe('cover');
    expect(sections[1].type).toBe('journey');
    expect(sections[2].type).toBe('highlights');
    expect(sections[3].type).toBe('notes');
    expect(sections[4].type).toBe('conversations');
    expect(sections[5].type).toBe('insights');
    expect(sections[6].type).toBe('forward');
  });

  it('renders actual highlight content, not just IDs', () => {
    const { html } = renderPersonalBook(
      'Test Book',
      'Test Author',
      null,
      'Reader',
      makeEnrichedBook(),
    );

    expect(html).toContain('The fundamental theorem states');
    expect(html).toContain('Important for exam!');
    // Should NOT show raw IDs
    expect(html).not.toContain('Ref: abc12345');
  });

  it('renders milestones with timeline', () => {
    const { html } = renderPersonalBook(
      'Test Book',
      'Test Author',
      null,
      'Reader',
      makeEnrichedBook(),
    );

    expect(html).toContain('Started reading');
    expect(html).toContain('Reached 50%');
    expect(html).toContain('Halfway there!');
    expect(html).toContain('milestone-dot');
  });

  it('renders tag cloud from notes', () => {
    const { html } = renderPersonalBook(
      'Test Book',
      'Test Author',
      null,
      'Reader',
      makeEnrichedBook(),
    );

    expect(html).toContain('#philosophy');
    expect(html).toContain('#science');
    expect(html).toContain('#opening');
  });

  it('renders conversations as dialogue', () => {
    const { html } = renderPersonalBook(
      'Test Book',
      'Test Author',
      null,
      'Reader',
      makeEnrichedBook(),
    );

    expect(html).toContain('the unexamined life');
    expect(html).toContain('Socrates');
    expect(html).toContain('user-msg');
    expect(html).toContain('ai-msg');
  });

  it('renders reflection prompt', () => {
    const { html } = renderPersonalBook(
      'Test Book',
      'Test Author',
      null,
      'Reader',
      makeEnrichedBook(),
    );

    expect(html).toContain('What is one belief you held');
    expect(html).toContain('reflection-prompt');
  });

  it('includes print-ready CSS', () => {
    const { html } = renderPersonalBook(
      'Test Book',
      'Test Author',
      null,
      'Reader',
      makeEnrichedBook(),
    );

    expect(html).toContain('@media print');
    expect(html).toContain('page-break-before');
    expect(html).toContain('page-break-inside: avoid');
  });

  it('includes footer with generation branding', () => {
    const { html } = renderPersonalBook(
      'Test Book',
      'Test Author',
      null,
      'Reader',
      makeEnrichedBook(),
    );

    expect(html).toContain('book-footer');
    expect(html).toContain('read-pal');
  });

  it('escapes HTML in user content to prevent XSS', () => {
    const xssData = makeEnrichedBook({
      notes: {
        notes: [
          { chapterIndex: 0, content: '<script>alert("xss")</script>', note: '"><img src=x onerror=alert(1)>', tags: [] },
        ],
        emotionalTrajectory: '',
        tagCloud: {},
      },
    });

    const { html } = renderPersonalBook(
      'Test <b>Book</b>',
      'Author',
      null,
      'Reader',
      xssData,
    );

    // Title should be escaped
    expect(html).not.toContain('<b>Book</b>');
    expect(html).toContain('&lt;b&gt;Book&lt;/b&gt;');
    // Script should be escaped
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('handles empty data gracefully', () => {
    const emptyData = makeEnrichedBook({
      journey: { milestones: [], paceComment: '' },
      highlights: { themes: [] },
      notes: { notes: [], emotionalTrajectory: '', tagCloud: {} },
      conversations: { conversations: [] },
      synthesis: {
        insights: [],
        connections: [],
        recommendations: [],
        unresolvedQuestions: [],
        reflectionPrompt: 'What did you learn?',
      },
    });

    const { html, sections } = renderPersonalBook(
      'Empty Book',
      'Author',
      null,
      'Reader',
      emptyData,
    );

    expect(sections).toHaveLength(7);
    expect(html).toContain('No highlights recorded');
    expect(html).toContain('No notes recorded');
    expect(html).toContain('No conversations recorded');
    expect(html).toContain('What did you learn?');
  });
});
