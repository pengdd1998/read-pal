/**
 * InterventionService
 *
 * Analyzes reading behavior and determines if a proactive intervention
 * is needed. Designed to feel like a helpful reading companion, not an
 * intrusive notification system.
 */

import { ReadingSession } from '../models';

export interface ReadingContext {
  userId: string;
  bookId: string;
  currentPage: number;
  totalPages: number;
  wordsPerMinute?: number;
  timeOnPage?: number; // seconds
  reReadCount?: number;
  highlightCount: number;
  sessionDuration: number; // total seconds this session
}

export interface Intervention {
  type: 'confusion_detected' | 'chapter_end' | 'pace_coaching' | 'break_suggestion' | 'celebration';
  priority: 'low' | 'medium' | 'high';
  message: string;
  trigger: string;
  metadata?: Record<string, unknown>;
}

/**
 * Analyze reading behavior and determine if an intervention is needed.
 */
export class InterventionService {

  /**
   * Check if the reader seems confused based on behavior signals.
   * Triggers: multiple re-reads, very slow reading, long pause, many highlights on same page
   */
  static detectConfusion(ctx: ReadingContext): Intervention | null {
    const signals: string[] = [];

    // Re-reading the same content
    if ((ctx.reReadCount || 0) >= 3) {
      signals.push('multiple_re_reads');
    }

    // Very slow reading (under 100 WPM suggests struggle)
    if (ctx.wordsPerMinute && ctx.wordsPerMinute < 100 && ctx.sessionDuration > 120) {
      signals.push('slow_reading');
    }

    // Long pause on same page (>5 minutes without advancing)
    if ((ctx.timeOnPage || 0) > 300) {
      signals.push('long_pause');
    }

    if (signals.length >= 1) {
      return {
        type: 'confusion_detected',
        priority: signals.length >= 2 ? 'high' : 'medium',
        message: this.getConfusionMessage(signals),
        trigger: signals.join(','),
        metadata: { signals, page: ctx.currentPage },
      };
    }

    return null;
  }

  /**
   * Check if the reader has reached the end of a chapter/section.
   * Triggered when progress reaches chapter boundaries.
   */
  static detectChapterEnd(ctx: ReadingContext, chapterPages: number[]): Intervention | null {
    const page = ctx.currentPage;

    for (const endPage of chapterPages) {
      if (page === endPage || page === endPage - 1) {
        return {
          type: 'chapter_end',
          priority: 'low',
          message: this.getChapterEndMessage(ctx),
          trigger: `page_${page}_near_chapter_end_${endPage}`,
          metadata: { page, chapterEnd: endPage },
        };
      }
    }

    return null;
  }

  /**
   * Provide reading pace coaching based on session data.
   */
  static analyzePace(ctx: ReadingContext): Intervention | null {
    // Only coach after significant reading time (>10 min)
    if (ctx.sessionDuration < 600) return null;

    const pagesPerMinute = ctx.currentPage / (ctx.sessionDuration / 60);

    // Fast reader - suggest deeper engagement
    if (pagesPerMinute > 2 && ctx.highlightCount < 2) {
      return {
        type: 'pace_coaching',
        priority: 'low',
        message: "You're flying through this! Consider slowing down to highlight key passages or jot notes. Deep reading often beats speed reading.",
        trigger: 'fast_pace_low_highlights',
        metadata: { pagesPerMinute: pagesPerMinute.toFixed(2) },
      };
    }

    // Very slow reader - suggest a break
    if (pagesPerMinute < 0.3 && ctx.sessionDuration > 1800) {
      return {
        type: 'break_suggestion',
        priority: 'medium',
        message: "You've been at this for a while. A short break can help with retention. Your brain consolidates what you've read during rest.",
        trigger: 'slow_pace_long_session',
        metadata: { sessionMinutes: Math.round(ctx.sessionDuration / 60) },
      };
    }

    return null;
  }

  /**
   * Celebrate reading milestones.
   */
  static detectMilestone(ctx: ReadingContext): Intervention | null {
    const progress = ctx.totalPages > 0 ? (ctx.currentPage / ctx.totalPages) * 100 : 0;

    if (progress >= 100) {
      return {
        type: 'celebration',
        priority: 'high',
        message: `Amazing! You finished the book! You read ${ctx.totalPages} pages in this session. Time to pick your next adventure.`,
        trigger: 'book_completed',
        metadata: { totalPages: ctx.totalPages },
      };
    }

    if (progress >= 50 && progress < 52) {
      return {
        type: 'celebration',
        priority: 'low',
        message: "Halfway there! You've made great progress. The best parts might still be ahead.",
        trigger: 'halfway_mark',
        metadata: { progress: Math.round(progress) },
      };
    }

    // First page milestone
    if (ctx.currentPage === 1 && ctx.sessionDuration < 60) {
      return {
        type: 'celebration',
        priority: 'low',
        message: "Welcome to this book! I'm here whenever you want to discuss anything.",
        trigger: 'reading_started',
      };
    }

    return null;
  }

  /**
   * Run all intervention checks and return the highest priority one.
   */
  static async evaluate(ctx: ReadingContext, chapterPages?: number[]): Promise<Intervention | null> {
    const interventions: Intervention[] = [];

    // Check all intervention types
    const confusion = this.detectConfusion(ctx);
    if (confusion) interventions.push(confusion);

    if (chapterPages) {
      const chapterEnd = this.detectChapterEnd(ctx, chapterPages);
      if (chapterEnd) interventions.push(chapterEnd);
    }

    const pace = this.analyzePace(ctx);
    if (pace) interventions.push(pace);

    const milestone = this.detectMilestone(ctx);
    if (milestone) interventions.push(milestone);

    // Return highest priority
    if (interventions.length === 0) return null;

    const priorityOrder = { high: 0, medium: 1, low: 2 };
    interventions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return interventions[0];
  }

  private static getConfusionMessage(signals: string[]): string {
    const messages = [
      "Having trouble with this part? I can explain it in simpler terms or connect it to something you already know.",
      "This section seems challenging. Want me to break it down, or shall we try a different angle?",
      "Looks like you're spending extra time here. This is often where the deepest learning happens. Need any help?",
    ];
    return messages[Math.min(signals.length - 1, messages.length - 1)];
  }

  private static getChapterEndMessage(ctx: ReadingContext): string {
    const messages = [
      "End of a section! Before moving on, what was the most interesting idea from what you just read?",
      "Great progress! Take a moment to reflect - what stuck with you from this part?",
      "Chapter boundary ahead. A quick reflection now helps lock in what you've learned. Any thoughts?",
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }
}
