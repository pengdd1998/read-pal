/**
 * Recommendations Routes
 *
 * Suggests next books based on reading history, genres, and topics.
 */

import { Router } from 'express';
import { Op } from 'sequelize';
import { Book, Annotation } from '../models';
import { AuthRequest, authenticate } from '../middleware/auth';

const router: Router = Router();

// ---------------------------------------------------------------------------
// Genre extraction helpers
// ---------------------------------------------------------------------------

const GENRE_KEYWORDS: Record<string, string[]> = {
  'Science Fiction': ['sci-fi', 'science fiction', 'space', 'future', 'dystopia', 'cyberpunk', 'AI', 'robot', 'alien', 'galaxy'],
  'Fantasy': ['fantasy', 'magic', 'wizard', 'dragon', 'mythical', 'quest', 'sorcery', 'elf', 'dwarf'],
  'Self-Help': ['self-help', 'productivity', 'habits', 'motivation', 'mindset', 'success', 'growth', 'discipline'],
  'Psychology': ['psychology', 'behavior', 'cognitive', 'thinking', 'brain', 'mental', 'emotion', 'consciousness'],
  'Philosophy': ['philosophy', 'ethics', 'wisdom', 'existence', 'truth', 'meaning', 'stoicism', 'logic'],
  'History': ['history', 'war', 'civilization', 'ancient', 'empire', 'revolution', 'century', 'dynasty'],
  'Business': ['business', 'startup', 'entrepreneur', 'management', 'leadership', 'strategy', 'economics', 'finance'],
  'Science': ['science', 'physics', 'biology', 'chemistry', 'mathematics', 'evolution', 'quantum', 'nature'],
  'Technology': ['technology', 'programming', 'software', 'computer', 'data', 'algorithm', 'digital', 'code'],
  'Literature': ['literature', 'classic', 'novel', 'fiction', 'poetry', 'literary', 'prose'],
  'Biography': ['biography', 'memoir', 'autobiography', 'life story', 'journey', 'personal'],
};

function extractGenres(text: string): string[] {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  for (const [genre, keywords] of Object.entries(GENRE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      matched.push(genre);
    }
  }
  return matched;
}

// ---------------------------------------------------------------------------
// Recommendation templates
// ---------------------------------------------------------------------------

const RECOMMENDATION_TEMPLATES: Record<string, Array<{ title: string; author: string; reason: string }>> = {
  'Science Fiction': [
    { title: 'Project Hail Mary', author: 'Andy Weir', reason: 'A thrilling space survival story with real science' },
    { title: 'The Left Hand of Darkness', author: 'Ursula K. Le Guin', reason: 'A masterpiece of sociological science fiction' },
    { title: 'Dune', author: 'Frank Herbert', reason: 'The greatest science fiction novel ever written' },
  ],
  'Fantasy': [
    { title: 'The Name of the Wind', author: 'Patrick Rothfuss', reason: 'Beautiful prose meets epic fantasy' },
    { title: 'The Hobbit', author: 'J.R.R. Tolkien', reason: 'The classic that started modern fantasy' },
    { title: 'A Wizard of Earthsea', author: 'Ursula K. Le Guin', reason: 'A coming-of-age story in a rich magical world' },
  ],
  'Self-Help': [
    { title: 'Atomic Habits', author: 'James Clear', reason: 'The definitive guide to building better habits' },
    { title: 'Deep Work', author: 'Cal Newport', reason: 'Master focused work in a distracted world' },
    { title: 'The 7 Habits of Highly Effective People', author: 'Stephen Covey', reason: 'Timeless principles for personal effectiveness' },
  ],
  'Psychology': [
    { title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', reason: 'Understanding the two systems that drive how we think' },
    { title: 'Influence', author: 'Robert Cialdini', reason: 'The psychology of why people say yes' },
    { title: 'The Power of Habit', author: 'Charles Duhigg', reason: 'How habits work and how to change them' },
  ],
  'Philosophy': [
    { title: 'Meditations', author: 'Marcus Aurelius', reason: 'Timeless stoic wisdom from a Roman emperor' },
    { title: 'Man\'s Search for Meaning', author: 'Viktor Frankl', reason: 'Finding purpose in the darkest circumstances' },
    { title: 'Sophie\'s World', author: 'Jostein Gaarder', reason: 'A novel introduction to the history of philosophy' },
  ],
  'History': [
    { title: 'Sapiens', author: 'Yuval Noah Harari', reason: 'A brief history of humankind that changes how you see the world' },
    { title: 'Guns, Germs, and Steel', author: 'Jared Diamond', reason: 'Why some civilizations thrived and others didn\'t' },
    { title: 'The Silk Roads', author: 'Peter Frankopan', reason: 'A fresh perspective on world history from the East' },
  ],
  'Business': [
    { title: 'The Lean Startup', author: 'Eric Ries', reason: 'The modern approach to building successful businesses' },
    { title: 'Zero to One', author: 'Peter Thiel', reason: 'How to build the future, not just copy it' },
    { title: 'Good to Great', author: 'Jim Collins', reason: 'Why some companies make the leap and others don\'t' },
  ],
  'Science': [
    { title: 'A Short History of Nearly Everything', author: 'Bill Bryson', reason: 'Science made accessible and entertaining' },
    { title: 'The Gene', author: 'Siddhartha Mukherjee', reason: 'An intimate history of the gene' },
    { title: 'Cosmos', author: 'Carl Sagan', reason: 'A journey through the universe with a master storyteller' },
  ],
  'Technology': [
    { title: 'The Pragmatic Programmer', author: 'David Thomas & Andrew Hunt', reason: 'Essential reading for any developer' },
    { title: 'Designing Data-Intensive Applications', author: 'Martin Kleppmann', reason: 'Understanding modern data systems' },
    { title: 'The Mythical Man-Month', author: 'Frederick Brooks', reason: 'Timeless insights on software engineering' },
  ],
  'Literature': [
    { title: 'One Hundred Years of Solitude', author: 'Gabriel Garcia Marquez', reason: 'A magical realist masterpiece' },
    { title: 'To Kill a Mockingbird', author: 'Harper Lee', reason: 'A powerful story of justice and empathy' },
    { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', reason: 'The quintessential American novel' },
  ],
  'Biography': [
    { title: 'Steve Jobs', author: 'Walter Isaacson', reason: 'The definitive biography of Apple\'s co-founder' },
    { title: 'Long Walk to Freedom', author: 'Nelson Mandela', reason: 'An extraordinary story of resilience and leadership' },
    { title: 'Educated', author: 'Tara Westover', reason: 'A memoir about the transformative power of education' },
  ],
};

// Default recommendations for users with no history
const DEFAULT_RECOMMENDATIONS = [
  { title: 'Sapiens', author: 'Yuval Noah Harari', genre: 'History', reason: 'A fascinating overview of human history' },
  { title: 'Atomic Habits', author: 'James Clear', genre: 'Self-Help', reason: 'Build better habits, one small change at a time' },
  { title: 'Project Hail Mary', author: 'Andy Weir', genre: 'Science Fiction', reason: 'An exciting space adventure you won\'t put down' },
  { title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', genre: 'Psychology', reason: 'Understand how your mind really works' },
  { title: 'Meditations', author: 'Marcus Aurelius', genre: 'Philosophy', reason: 'Ancient wisdom that remains profoundly relevant' },
];

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/recommendations
 * Get personalized book recommendations based on reading history
 */
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Get user's books
    const books = await Book.findAll({
      where: { userId },
      attributes: ['id', 'title', 'author', 'tags', 'status', 'progress'],
      order: [['lastReadAt', 'DESC NULLS LAST']],
      limit: 20,
    });

    // Get user's annotations to understand interests
    const annotations = await Annotation.findAll({
      where: { userId, type: { [Op.in]: ['highlight', 'note'] } },
      attributes: ['content'],
      limit: 50,
      raw: true,
    });

    // Extract genres from books
    const userGenres = new Set<string>();
    for (const book of books) {
      const bookData = book.get({ plain: true }) as Record<string, any>;
      // Extract genres from title + tags
      const textSource = `${bookData.title} ${bookData.author} ${(bookData.tags || []).join(' ')}`;
      const extracted = extractGenres(textSource);
      extracted.forEach((g) => userGenres.add(g));
    }

    // Extract genres from annotations
    for (const ann of annotations) {
      const extracted = extractGenres(ann.content);
      extracted.forEach((g) => userGenres.add(g));
    }

    // Build recommendations
    const userTitles = new Set(books.map((b) => b.title));
    const recommendations: Array<{
      title: string;
      author: string;
      genre: string;
      reason: string;
      relevance: number;
    }> = [];

    if (userGenres.size > 0) {
      // Recommend based on detected genres
      for (const genre of userGenres) {
        const templates = RECOMMENDATION_TEMPLATES[genre] || [];
        for (const book of templates) {
          if (!userTitles.has(book.title) && !recommendations.some((r) => r.title === book.title)) {
            recommendations.push({
              ...book,
              genre,
              relevance: 0.9 - (recommendations.length * 0.1),
            });
          }
        }
      }
    }

    // Fill with defaults if not enough recommendations
    if (recommendations.length < 3) {
      for (const book of DEFAULT_RECOMMENDATIONS) {
        if (!userTitles.has(book.title) && !recommendations.some((r) => r.title === book.title)) {
          recommendations.push({
            ...book,
            relevance: 0.5,
          });
        }
      }
    }

    // Sort by relevance and limit
    recommendations.sort((a, b) => b.relevance - a.relevance);
    const finalRecs = recommendations.slice(0, 6);

    // Get reading stats for context
    const completedCount = books.filter((b) => b.status === 'completed').length;
    const readingCount = books.filter((b) => b.status === 'reading').length;

    res.json({
      success: true,
      data: {
        recommendations: finalRecs,
        detectedGenres: Array.from(userGenres).slice(0, 10),
        context: {
          booksCompleted: completedCount,
          booksReading: readingCount,
          basedOn: userGenres.size > 0 ? 'reading_history' : 'general_popularity',
        },
      },
    });
  } catch (error) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({
      success: false,
      error: { code: 'RECOMMENDATIONS_ERROR', message: 'Failed to generate recommendations' },
    });
  }
});

export default router;
