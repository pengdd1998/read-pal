/**
 * Personal Book Renderer
 *
 * Assembles enriched Personal Reading Book data into a styled HTML document.
 * The design is book-like: serif fonts, warm amber/cream palette matching
 * read-pal's aesthetic, print-ready CSS.
 */

import { generateId } from '@read-pal/shared';
import type {
  EnrichedPersonalBook,
  EnrichedCover,
  EnrichedJourney,
  EnrichedHighlights,
  EnrichedNotes,
  EnrichedConversations,
  EnrichedSynthesis,
  ThemeCluster,
  CuratedConversation,
  ReadingMilestone,
} from './PersonalBookEnricher';
import type { PersonalBookSection } from '../models/MemoryBook';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function renderPersonalBook(
  bookTitle: string,
  bookAuthor: string,
  coverUrl: string | null,
  readerName: string,
  enriched: EnrichedPersonalBook,
): { html: string; sections: PersonalBookSection[] } {
  const sections: PersonalBookSection[] = [];

  sections.push(renderCover(bookTitle, bookAuthor, coverUrl, readerName, enriched.cover));
  sections.push(renderJourney(enriched.journey));
  sections.push(renderHighlights(enriched.highlights));
  sections.push(renderNotes(bookTitle, enriched.notes));
  sections.push(renderConversations(enriched.conversations));
  sections.push(renderSynthesis(enriched.synthesis));
  sections.push(renderForward(enriched.synthesis));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(bookTitle)} — Personal Reading Book</title>
<style>${STYLES}</style>
</head>
<body>
<div class="book">
${sections.map((s) => s.content).join('\n')}
</div>
</body>
</html>`;

  return { html, sections };
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderCover(
  bookTitle: string,
  bookAuthor: string,
  coverUrl: string | null,
  readerName: string,
  cover: EnrichedCover,
): PersonalBookSection {
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  return {
    id: generateId(),
    title: '',
    type: 'cover',
    content: `
<section class="cover">
  <div class="cover-inner">
    ${coverUrl ? `<img src="${esc(coverUrl)}" alt="Cover" class="cover-image" />` : ''}
    <h1 class="cover-title">${esc(bookTitle)}</h1>
    <p class="cover-author">by ${esc(bookAuthor)}</p>
    <div class="cover-divider"></div>
    <p class="cover-subtitle">${esc(cover.subtitle)}</p>
    <p class="cover-reader">Read by ${esc(readerName)}</p>
    <p class="cover-meta">${esc(cover.readingTimeFormatted)} — ${now}</p>
  </div>
</section>`,
    data: { bookTitle, bookAuthor, readerName },
  };
}

function renderJourney(journey: EnrichedJourney): PersonalBookSection {
  const milestonesHtml = journey.milestones.map((m) => `
    <div class="milestone">
      <div class="milestone-dot"></div>
      <div class="milestone-content">
        <p class="milestone-label">${esc(m.label)}</p>
        <p class="milestone-date">${formatDate(m.date)}</p>
        ${m.detail ? `<p class="milestone-detail">${esc(m.detail)}</p>` : ''}
      </div>
    </div>`).join('');

  return {
    id: generateId(),
    title: 'Your Reading Journey',
    type: 'journey',
    content: `
<section class="chapter">
  <h2 class="chapter-title">Chapter 1: Your Reading Journey</h2>
  ${journey.paceComment ? `<p class="chapter-intro">${esc(journey.paceComment)}</p>` : ''}
  <div class="timeline">
    ${milestonesHtml || '<p class="empty">No reading sessions recorded.</p>'}
  </div>
</section>`,
    data: { milestones: journey.milestones },
  };
}

function renderHighlights(highlights: EnrichedHighlights): PersonalBookSection {
  const themesHtml = highlights.themes.map((theme) => `
    <div class="theme-cluster">
      <h3 class="theme-name">${esc(theme.name)}</h3>
      <p class="theme-desc">${esc(theme.description)}</p>
      <div class="theme-highlights">
        ${(theme.highlightIds || []).map((id) =>
          `<blockquote class="highlight-ref" data-id="${esc(id)}">Ref: ${esc(id)}</blockquote>`
        ).join('')}
      </div>
    </div>`).join('');

  return {
    id: generateId(),
    title: 'What Caught Your Eye',
    type: 'highlights',
    content: `
<section class="chapter">
  <h2 class="chapter-title">Chapter 2: What Caught Your Eye</h2>
  <p class="chapter-intro">The passages that made you pause, think, and highlight.</p>
  ${themesHtml || '<p class="empty">No highlights recorded.</p>'}
</section>`,
    data: { themes: highlights.themes },
  };
}

function renderNotes(bookTitle: string, notes: EnrichedNotes): PersonalBookSection {
  const tagCloudHtml = Object.entries(notes.tagCloud)
    .sort(([, a], [, b]) => b - a)
    .map(([tag, count]) => `<span class="tag" data-count="${count}">#${esc(tag)}</span>`)
    .join(' ');

  const notesHtml = notes.notes.map((n) => `
    <div class="note-entry">
      <span class="note-chapter">Chapter ${n.chapterIndex + 1}</span>
      ${n.content ? `<blockquote class="note-quote">${esc(n.content)}</blockquote>` : ''}
      <p class="note-text">${esc(n.note)}</p>
      ${n.tags.length > 0 ? `<div class="note-tags">${n.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join(' ')}</div>` : ''}
    </div>`).join('');

  return {
    id: generateId(),
    title: 'Your Voice',
    type: 'notes',
    content: `
<section class="chapter">
  <h2 class="chapter-title">Chapter 3: Your Voice</h2>
  ${notes.emotionalTrajectory ? `<p class="chapter-intro">${esc(notes.emotionalTrajectory)}</p>` : ''}
  ${Object.keys(notes.tagCloud).length > 0 ? `<div class="tag-cloud">${tagCloudHtml}</div>` : ''}
  ${notesHtml || '<p class="empty">No notes recorded.</p>'}
</section>`,
    data: { notes: notes.notes, tagCloud: notes.tagCloud },
  };
}

function renderConversations(conversations: EnrichedConversations): PersonalBookSection {
  const convosHtml = conversations.conversations.map((c) => `
    <div class="conversation">
      <div class="msg user-msg">
        <span class="msg-role">You</span>
        <p>${esc(c.userMessage)}</p>
      </div>
      <div class="msg ai-msg">
        <span class="msg-role">AI Companion</span>
        <p>${esc(c.assistantMessage)}</p>
      </div>
    </div>`).join('');

  return {
    id: generateId(),
    title: 'Conversations',
    type: 'conversations',
    content: `
<section class="chapter">
  <h2 class="chapter-title">Chapter 4: Conversations with Your AI Companion</h2>
  <p class="chapter-intro">The most meaningful exchanges from your reading conversations.</p>
  ${convosHtml || '<p class="empty">No conversations recorded.</p>'}
</section>`,
    data: { count: conversations.conversations.length },
  };
}

function renderSynthesis(synthesis: EnrichedSynthesis): PersonalBookSection {
  const insightsHtml = synthesis.insights.map((i) => `
    <div class="insight">
      <h3 class="insight-theme">${esc(i.theme)}</h3>
      <p>${esc(i.description)}</p>
    </div>`).join('');

  const connectionsHtml = synthesis.connections.map((c) => `
    <div class="connection">
      <span class="connection-book">${esc(c.title)} by ${esc(c.author)}</span>
      <p>${esc(c.connection)}</p>
    </div>`).join('');

  return {
    id: generateId(),
    title: 'What You Discovered',
    type: 'insights',
    content: `
<section class="chapter">
  <h2 class="chapter-title">Chapter 5: What You Discovered</h2>
  <div class="insights">
    ${insightsHtml || '<p class="empty">Keep reading and highlighting to discover insights.</p>'}
  </div>
  ${connectionsHtml ? `<h3 class="sub-title">Connections Across Your Library</h3><div class="connections">${connectionsHtml}</div>` : ''}
</section>`,
    data: { insights: synthesis.insights, connections: synthesis.connections },
  };
}

function renderForward(synthesis: EnrichedSynthesis): PersonalBookSection {
  const recsHtml = synthesis.recommendations.map((r) => `<li>${esc(r)}</li>`).join('');
  const questionsHtml = synthesis.unresolvedQuestions.map((q) => `
    <div class="question">
      <p class="question-text">${esc(q.question)}</p>
      ${q.context ? `<p class="question-context">${esc(q.context)}</p>` : ''}
    </div>`).join('');

  return {
    id: generateId(),
    title: 'Looking Forward',
    type: 'forward',
    content: `
<section class="chapter">
  <h2 class="chapter-title">Chapter 6: Looking Forward</h2>
  ${synthesis.recommendations.length > 0 ? `
    <h3 class="sub-title">Recommended Next Reads</h3>
    <ul class="recommendations">${recsHtml}</ul>
  ` : ''}
  ${questionsHtml ? `
    <h3 class="sub-title">Unresolved Questions</h3>
    <div class="questions">${questionsHtml}</div>
  ` : ''}
  <div class="reflection">
    <h3 class="sub-title">A Moment of Reflection</h3>
    <blockquote class="reflection-prompt">${esc(synthesis.reflectionPrompt)}</blockquote>
  </div>
</section>`,
    data: { recommendations: synthesis.recommendations },
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// CSS Styles
// ---------------------------------------------------------------------------

const STYLES = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: Georgia, 'Times New Roman', serif;
  background: #faf7f2;
  color: #2c2416;
  line-height: 1.7;
  padding: 2rem;
}

.book { max-width: 700px; margin: 0 auto; }

/* Cover */
.cover {
  text-align: center;
  padding: 4rem 2rem;
  margin-bottom: 3rem;
  border-bottom: 2px solid #d4a574;
}
.cover-image { max-width: 200px; border-radius: 8px; margin-bottom: 1.5rem; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
.cover-title { font-size: 2.2rem; font-weight: 700; color: #1a1208; margin-bottom: 0.3rem; }
.cover-author { font-size: 1.1rem; color: #6b5b3e; font-style: italic; }
.cover-divider { width: 60px; height: 2px; background: #d4a574; margin: 1.5rem auto; }
.cover-subtitle { font-size: 1.3rem; color: #8b6914; font-style: italic; margin-bottom: 1rem; }
.cover-reader { font-size: 1rem; color: #4a3f2f; }
.cover-meta { font-size: 0.85rem; color: #9b8b6e; margin-top: 0.5rem; }

/* Chapters */
.chapter { padding: 2rem 0; border-bottom: 1px solid #e8dcc8; }
.chapter:last-child { border-bottom: none; }
.chapter-title { font-size: 1.5rem; color: #5a3e1b; margin-bottom: 1rem; }
.chapter-intro { font-size: 0.95rem; color: #7a6b52; font-style: italic; margin-bottom: 1.5rem; }
.sub-title { font-size: 1.1rem; color: #6b5b3e; margin: 1.5rem 0 0.75rem; }

/* Timeline */
.timeline { padding-left: 1.5rem; border-left: 2px solid #d4a574; }
.milestone { position: relative; padding: 0.5rem 0 1.5rem 1.5rem; }
.milestone-dot {
  position: absolute; left: -8px; top: 8px;
  width: 14px; height: 14px; border-radius: 50%;
  background: #d4a574; border: 2px solid #faf7f2;
}
.milestone-label { font-weight: 600; color: #2c2416; }
.milestone-date { font-size: 0.85rem; color: #9b8b6e; }
.milestone-detail { font-size: 0.9rem; color: #6b5b3e; margin-top: 0.25rem; }

/* Themes */
.theme-cluster { margin-bottom: 2rem; }
.theme-name { font-size: 1.1rem; color: #5a3e1b; margin-bottom: 0.3rem; }
.theme-desc { font-size: 0.9rem; color: #7a6b52; font-style: italic; margin-bottom: 0.75rem; }
.theme-highlights { padding-left: 1rem; }
.highlight-ref {
  font-size: 0.95rem; color: #4a3f2f;
  border-left: 3px solid #d4a574; padding: 0.5rem 1rem;
  margin-bottom: 0.5rem; background: #f5ede0; border-radius: 0 4px 4px 0;
}

/* Notes */
.tag-cloud { margin-bottom: 1.5rem; line-height: 2; }
.tag {
  display: inline-block; padding: 2px 8px; margin: 2px;
  background: #f0e4cc; border-radius: 12px; font-size: 0.8rem; color: #6b5b3e;
}
.note-entry { margin-bottom: 1.5rem; padding: 1rem; background: #f5ede0; border-radius: 6px; }
.note-chapter { font-size: 0.8rem; color: #9b8b6e; text-transform: uppercase; letter-spacing: 0.05em; }
.note-quote { font-size: 0.9rem; color: #6b5b3e; margin: 0.5rem 0; border-left: 2px solid #d4a574; padding-left: 0.75rem; }
.note-text { font-size: 0.95rem; color: #2c2416; margin-top: 0.5rem; }
.note-tags { margin-top: 0.5rem; }

/* Conversations */
.conversation { margin-bottom: 1.5rem; }
.msg { padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 0.25rem; }
.user-msg { background: #e8f0e8; }
.ai-msg { background: #f0ede0; }
.msg-role { font-size: 0.75rem; font-weight: 600; color: #9b8b6e; text-transform: uppercase; display: block; margin-bottom: 0.25rem; }
.msg p { font-size: 0.95rem; }

/* Insights */
.insight { margin-bottom: 1.5rem; padding: 1rem; background: #faf5ec; border-radius: 6px; border-left: 3px solid #d4a574; }
.insight-theme { font-size: 1rem; color: #5a3e1b; }
.connection { margin-bottom: 1rem; }
.connection-book { font-weight: 600; color: #5a3e1b; }

/* Forward */
.recommendations { padding-left: 1.5rem; margin-bottom: 1.5rem; }
.recommendations li { margin-bottom: 0.5rem; font-size: 0.95rem; }
.question { margin-bottom: 1rem; padding: 0.75rem; background: #faf5ec; border-radius: 6px; }
.question-text { font-weight: 600; color: #2c2416; }
.question-context { font-size: 0.85rem; color: #7a6b52; margin-top: 0.25rem; }
.reflection { margin-top: 2rem; padding: 1.5rem; background: #f0e4cc; border-radius: 8px; text-align: center; }
.reflection-prompt { font-size: 1.1rem; font-style: italic; color: #5a3e1b; border: none; padding: 0; }

.empty { font-size: 0.95rem; color: #9b8b6e; font-style: italic; padding: 2rem 0; text-align: center; }

/* Print */
@media print {
  body { background: white; padding: 0; }
  .book { max-width: 100%; }
  .chapter { page-break-inside: avoid; }
}
`;
