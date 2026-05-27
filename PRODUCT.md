# Product

## Register

product

## Users

Students, researchers, and avid readers who want to retain more from what they read. They range from college students studying textbooks to professionals reviewing research papers to lifelong readers working through their bookshelves. They use read-pal in sustained sessions: reading chapters, annotating passages, chatting with AI personas about content, and reviewing flashcards. Their context is focused, often solo, sometimes late at night. They value depth over speed.

## Product Purpose

read-pal transforms passive reading into active retention. It is an AI-powered reading companion that combines an EPUB/PDF reader with intelligent chat personas, a knowledge graph connecting concepts across books, spaced repetition flashcards (SM-2 algorithm), and personalized memory books. Success means users finish a book and actually remember it weeks later, with their highlights, notes, and flashcards forming a lasting personal knowledge base.

## Brand Personality

Warm, scholarly, companionable. The interface should feel like a well-lit study with a knowledgeable friend sitting across the table. Not a classroom, not a library hall, not a startup office. The AI personas (Sage, Penny, Alex, Quinn, Sam) embody this: they have names and distinct perspectives, not sterile chatbots. Every surface should invite lingering, not rushing.

## Anti-references

- **Generic SaaS dashboards**: cold grays, blue accents, data-heavy layouts with no warmth (Intercom, Zendesk, typical admin panels). read-pal is a reading environment, not a management console.
- **Overly playful / childish gamification**: Duolingo-level stickers, mascots on every screen, celebration animations. Gamification exists (streaks, challenges) but should feel like a personal journal, not a cartoon.

## Design Principles

1. **Comfort in extended use**: Reading sessions last 30-90 minutes. Typography, contrast, spacing, and surface colors must reduce fatigue, never create it. AAA contrast is the floor, not the ceiling.
2. **Companion, not utility**: The AI personas, warm palette, and serif fonts should make the experience feel human. Every interaction should feel like talking to someone who has read the same book, not querying a database.
3. **Scholarly density with clarity**: Respect the user's intelligence. Show enough information to be useful without cluttering. A researcher's annotation panel and a student's flashcard review have different density needs; both should feel considered.
4. **Depth over distraction**: This is a tool for focused reading and reflection. Avoid patterns that pull attention away from content. Notifications, animations, and social features should support the reading flow, not interrupt it.
5. **Consistency across modes**: The reading mode, chat interface, flashcard review, and knowledge graph are distinct workflows but one product. Visual language should adapt to each mode's needs without breaking cohesion.

## Accessibility & Inclusion

WCAG 2.1 AAA target. Extended reading sessions make contrast and readability critical beyond typical AA compliance. Specific considerations:
- Minimum 7:1 contrast ratio for body text in reading mode (AAA requirement)
- Dyslexia-friendly reading options: adjustable line spacing, font alternatives, character spacing
- Reduced motion: all animations must respect `prefers-reduced-motion`
- Color blindness: information never conveyed by color alone (annotations, flashcard states)
- Keyboard navigation throughout the reading experience (page turns, annotation creation, chat)
- Screen reader support for all AI chat content and reading annotations
