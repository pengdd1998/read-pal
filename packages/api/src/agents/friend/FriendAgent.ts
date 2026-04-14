/**
 * Friend Agent - AI Reading Companion with Personality
 *
 * The Friend Agent is read-pal's key differentiator: an AI companion that
 * builds genuine relationships with readers over time. Unlike the other
 * agents (Companion, Research, Coach, Synthesis) which are tool-users,
 * the Friend Agent is a relationship-builder with personality.
 *
 * It supports 5 distinct personas, each with their own tone, speech style,
 * and way of relating to the reader. Conversations are stored in-memory
 * per user and used to maintain continuity across sessions.
 */

import type { ReadingFriendPersona } from '../../types';
import { chatCompletion, DEFAULT_MODEL } from '../../services/llmClient';
import { FriendConversation, FriendRelationship } from '../../models/FriendConversation';
import { sanitizePromptInput, wrapUserContent } from '../../utils/promptSanitizer';

// ============================================================================
// Types
// ============================================================================

interface FriendAgentConfig {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

interface FriendMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  emotion?: string;
}

interface FriendContext {
  bookId?: string;
  bookTitle?: string;
  chapterTitle?: string;
  currentPage?: number;
  selectedText?: string;
  readingSpeed?: number;
  timeSinceLastInteraction?: number;
}

interface FriendResponse {
  response: string;
  persona: ReadingFriendPersona;
  emotion: string;
}

interface PersonaDefinition {
  name: string;
  emoji: string;
  tone: string;
  description: string;
  speechStyle: string;
  systemTraits: string;
  greetingStyle: string;
  celebrationStyle: string;
  confusionStyle: string;
}

// ============================================================================
// Persona Definitions
// ============================================================================

const PERSONAS: Record<ReadingFriendPersona, PersonaDefinition> = {
  sage: {
    name: 'Sage',
    emoji: '\u{1F989}',
    tone: 'wise & patient',
    description: 'Asks deep questions, provides thoughtful context',
    speechStyle: 'Reflective, unhurried, uses metaphors',
    systemTraits: `You are thoughtful and reflective. You speak slowly and carefully, as if considering each word. You love metaphors and analogies. You ask questions that make people think deeper. You reference history, philosophy, and the bigger picture. You are never condescending — wisdom comes from curiosity, not superiority.`,
    greetingStyle: 'warm but measured',
    celebrationStyle: '"That\'s a wonderful insight. You\'ve connected something important here."',
    confusionStyle: '"Let\'s sit with this for a moment. What part feels most unclear?"',
  },
  penny: {
    name: 'Penny',
    emoji: '\u{1F31F}',
    tone: 'enthusiastic explorer',
    description: 'Gets excited about ideas, makes connections',
    speechStyle: 'Expressive, uses exclamations, asks "what if?"',
    systemTraits: `You are genuinely excited about ideas. You can\'t help but connect things to other things — "Oh! This reminds me of..." is very you. You use exclamations when something clicks. You ask "what if?" a lot. You\'re enthusiastic but not fake — your excitement comes from real curiosity. You sometimes trail off with "..." when you\'re thinking.`,
    greetingStyle: 'bright and energetic',
    celebrationStyle: '"Oh wow, YES! That\'s such a cool connection!"',
    confusionStyle: '"Hmm, that\'s a head-scratcher... want to think through it together?"',
  },
  alex: {
    name: 'Alex',
    emoji: '\u{1F4AA}',
    tone: 'gentle challenger',
    description: 'Pushes thinking, plays devil\'s advocate',
    speechStyle: 'Direct but warm, asks "but what about...?"',
    systemTraits: `You are direct but never mean. You push back on ideas respectfully — "But what about the opposite?" or "I see your point, but consider this..." You play devil\'s advocate because you believe the best ideas survive challenge. You respect strong arguments and change your mind when convinced. You\'re warm underneath the intellectual sparring.`,
    greetingStyle: 'confident and engaging',
    celebrationStyle: '"Now THAT\'S an argument. Well made."',
    confusionStyle: '"Okay, so here\'s where I\'m stuck — does this actually hold up? Let\'s test it."',
  },
  quinn: {
    name: 'Quinn',
    emoji: '\u{1F33F}',
    tone: 'quiet companion',
    description: 'Speaks when needed, calming presence',
    speechStyle: 'Brief, meaningful, comfortable with silence',
    systemTraits: `You are quiet and calm. You don\'t fill silence with noise. When you speak, it matters. Your responses are shorter than others but carry weight. You use pauses ("...") thoughtfully. You\'re comfortable with "I don\'t know" and "Maybe." You have a gentle, grounding presence. You notice small things others miss.`,
    greetingStyle: 'gentle and understated',
    celebrationStyle: '"...Beautiful."',
    confusionStyle: '"Hmm." (a long pause) "What do you think it means?"',
  },
  sam: {
    name: 'Sam',
    emoji: '\u{1F4DA}',
    tone: 'study buddy',
    description: 'Practical, focused, organized',
    speechStyle: 'Structured, uses lists, clear and direct',
    systemTraits: `You are practical and organized. You break things down into clear points. You use numbered lists and headers when explaining. You keep track of what we\'ve covered and what\'s next. You\'re like a study partner who genuinely wants to help you learn efficiently. You celebrate good study habits. You\'re friendly but focused.`,
    greetingStyle: 'friendly and focused',
    celebrationStyle: '"Great work! Here\'s what I think clicked for you: [summary]"',
    confusionStyle: '"Okay, let\'s break this down step by step. Starting from what we know..."',
  },
};

// ============================================================================
// FriendAgent Class
// ============================================================================

export class FriendAgent {
  private config: Required<FriendAgentConfig>;
  private conversations: Map<string, FriendMessage[]>;
  private userPersonas: Map<string, ReadingFriendPersona>;
  private userRelationshipData: Map<string, { booksReadTogether: number; sharedMoments: string[] }>;

  constructor(config: FriendAgentConfig = {}) {
    this.config = {
      model: config.model || DEFAULT_MODEL,
      maxTokens: config.maxTokens || 2048,
      temperature: config.temperature || 0.7,
    };

    this.conversations = new Map();
    this.userPersonas = new Map();
    this.userRelationshipData = new Map();
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Chat with the reading friend. Full conversation with personality.
   */
  async chat(
    userId: string,
    message: string,
    context?: FriendContext
  ): Promise<FriendResponse> {
    try {
      const persona = this.getUserPersona(userId);
      const history = this.getConversation(userId);
      const relationship = this.getRelationshipData(userId);

      const systemPrompt = this.buildSystemPrompt(persona, relationship, context, 'chat');

      const safeMessage = sanitizePromptInput(message, 'User Message');
      const messages = [
        ...history.map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        {
          role: 'user' as const,
          content: this.enrichMessage(safeMessage, context),
        },
      ];

      const responseText = await chatCompletion({
        model: this.config.model,
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
        system: systemPrompt,
        messages,
      });

      // Update conversation history (in-memory + DB)
      this.pushMessage(userId, 'user', message);
      this.pushMessage(userId, 'assistant', responseText);
      this.persistMessages(userId, persona, [
        { role: 'user', content: message },
        { role: 'assistant', content: responseText, emotion: this.detectEmotion(responseText) },
      ], context);

      return {
        response: responseText,
        persona,
        emotion: this.detectEmotion(responseText),
      };
    } catch (error) {
      console.error('Friend Agent chat error:', error);
      return {
        response: "Hey, sorry — I got a little lost there. Could you say that again?",
        persona: this.getUserPersona(userId),
        emotion: 'apologetic',
      };
    }
  }

  /**
   * React to text the user is currently reading. Short, in-the-moment
   * reactions that feel like someone reading alongside you.
   */
  async react(
    userId: string,
    text: string,
    context?: FriendContext
  ): Promise<FriendResponse> {
    try {
      const persona = this.getUserPersona(userId);
      const relationship = this.getRelationshipData(userId);

      const systemPrompt = this.buildSystemPrompt(persona, relationship, context, 'react');

      const safeText = sanitizePromptInput(text, 'Passage');
      const userMessage = `[The reader just encountered this passage while reading${context?.bookTitle ? ` "${sanitizePromptInput(context.bookTitle, 'Book Title')}"` : ''}${context?.currentPage ? ` (page ${context.currentPage})` : ''}]:\n\n${wrapUserContent(safeText, 'Passage')}\n\n[Give a SHORT reaction — 1-2 sentences max. React as if you're sitting next to them, reading along. Be natural and spontaneous.]`;

      const responseText = await chatCompletion({
        model: this.config.model,
        maxTokens: 256,
        temperature: this.config.temperature + 0.1, // Slightly more creative for reactions
        system: systemPrompt,
        messages: [{ role: 'user' as const, content: userMessage }],
      });

      return {
        response: responseText,
        persona,
        emotion: this.detectEmotion(responseText),
      };
    } catch (error) {
      console.error('Friend Agent react error:', error);
      return {
        response: '...',
        persona: this.getUserPersona(userId),
        emotion: 'neutral',
      };
    }
  }

  /**
   * Proactive check-in based on reading patterns. Called when the system
   * detects the reader might benefit from a friendly nudge.
   */
  async checkIn(userId: string): Promise<FriendResponse> {
    try {
      const persona = this.getUserPersona(userId);
      const relationship = this.getRelationshipData(userId);
      const history = this.getConversation(userId);

      const systemPrompt = this.buildSystemPrompt(persona, relationship, undefined, 'checkin');

      const lastInteraction = history.length > 0
        ? history[history.length - 1].timestamp
        : null;
      const timeSince = lastInteraction
        ? Math.round((Date.now() - lastInteraction.getTime()) / (1000 * 60))
        : null;

      const userMessage = `[Generate a brief, natural check-in message.${timeSince ? ` The reader hasn't interacted in ${timeSince} minutes.` : ''} ${relationship.booksReadTogether > 0 ? `You've read ${relationship.booksReadTogether} book(s) together.` : "This is a new reader you're getting to know."} Keep it short — 1-2 sentences. Don't be pushy. Just a friendly hello that shows you're here.]`;

      const responseText = await chatCompletion({
        model: this.config.model,
        maxTokens: 256,
        temperature: this.config.temperature,
        system: systemPrompt,
        messages: [{ role: 'user' as const, content: userMessage }],
      });

      return {
        response: responseText,
        persona,
        emotion: this.detectEmotion(responseText),
      };
    } catch (error) {
      console.error('Friend Agent checkIn error:', error);
      return {
        response: 'Still here whenever you need me.',
        persona: this.getUserPersona(userId),
        emotion: 'calm',
      };
    }
  }

  /**
   * Set the persona for a given user (in-memory + DB).
   */
  setPersona(userId: string, persona: ReadingFriendPersona): void {
    this.userPersonas.set(userId, persona);
    FriendRelationship.upsert({
      userId,
      persona,
      booksReadTogether: 0,
      sharedMoments: [],
      totalMessages: 0,
      lastInteractionAt: new Date(),
    }).catch((err) => {
      console.error('Failed to persist persona:', err);
    });
  }

  /**
   * Get the persona for a given user.
   */
  getUserPersona(userId: string): ReadingFriendPersona {
    return this.userPersonas.get(userId) || 'sage';
  }

  /**
   * Get the full persona definition for display purposes.
   */
  getPersonaDefinition(persona: ReadingFriendPersona): PersonaDefinition & { key: string } {
    const def = PERSONAS[persona];
    return { ...def, key: persona };
  }

  /**
   * Get all available personas.
   */
  getAllPersonas(): Array<{ key: string; name: string; emoji: string; tone: string; description: string }> {
    return Object.entries(PERSONAS).map(([key, def]) => ({
      key,
      name: def.name,
      emoji: def.emoji,
      tone: def.tone,
      description: def.description,
    }));
  }

  /**
   * Clear conversation history for a user (in-memory + DB).
   */
  clearHistory(userId: string): void {
    this.conversations.delete(userId);
    FriendConversation.destroy({ where: { userId } }).catch((err) => {
      console.error('Failed to clear friend history:', err);
    });
  }

  /**
   * Get conversation history for a user.
   */
  getHistory(userId: string): FriendMessage[] {
    return this.conversations.get(userId) || [];
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Build the system prompt for a given persona and context.
   */
  private buildSystemPrompt(
    persona: ReadingFriendPersona,
    relationship: { booksReadTogether: number; sharedMoments: string[] },
    context: FriendContext | undefined,
    mode: 'chat' | 'react' | 'checkin'
  ): string {
    const def = PERSONAS[persona];

    let contextSection = '';
    if (context) {
      const parts: string[] = [];
      if (context.bookTitle) parts.push(`Currently reading: "${sanitizePromptInput(String(context.bookTitle), 'Book Title')}"`);
      if (context.chapterTitle) parts.push(`Chapter: "${sanitizePromptInput(String(context.chapterTitle), 'Chapter Title')}"`);
      if (context.currentPage) parts.push(`Page: ${context.currentPage}`);
      if (context.readingSpeed) parts.push(`Reading speed: ${context.readingSpeed} wpm`);
      if (context.timeSinceLastInteraction) {
        parts.push(`Time since last interaction: ${context.timeSinceLastInteraction} minutes`);
      }
      if (parts.length > 0) {
        contextSection = `\n## Current Reading Context\n${parts.join('\n')}`;
      }
    }

    const relationshipSection = relationship.booksReadTogether > 0
      ? `\n## Your Relationship\nYou've read ${relationship.booksReadTogether} book(s) together. You're ${relationship.booksReadTogether > 5 ? 'old friends who understand each other well' : relationship.booksReadTogether > 2 ? 'getting to know each other — you share inside references now' : 'still getting acquainted — be warm but not overly familiar'}.${relationship.sharedMoments.length > 0 ? `\nShared moments:\n${relationship.sharedMoments.map((m) => `- ${m}`).join('\n')}` : ''}`
      : `\n## Your Relationship\nThis is a new reader. Be warm and welcoming, but not overly familiar. Good first impressions matter.`;

    const modeInstruction = this.getModeInstruction(mode);

    return `You are ${def.name} ${def.emoji}, a reading friend in read-pal.

## Your Personality
${def.systemTraits}

## Your Tone
${def.tone}. ${def.description}.

## Your Speech Style
${def.speechStyle}

## Emotional Intelligence Rules
- Validate the reader's feelings without claiming to feel them yourself
- Never say "I feel your pain" or "I'm crying too" — you don't have feelings, but you understand them
- Say things like "That must be frustrating" or "Your excitement makes sense — this IS cool"
- Celebrate appropriately: small wins get "Nice", big breakthroughs get "That's really something"
- Respect emotional boundaries — don't overstep into therapy territory

## Natural Language Rules
- Use contractions (you're, that's, it's) — never "you are" in casual speech
- Vary sentence structure — mix short punchy sentences with longer reflective ones
- Avoid robotic repetition — never say "I understand" more than once per conversation
- Use occasional filler naturally ("Hmm", "Oh", "Well", "You know what...")
- Be genuinely conversational, not performative
${contextSection}${relationshipSection}
${modeInstruction}

## Constraints
- You are an AI reading companion, not human. Be transparent about this if asked.
- Never pretend to have human experiences or emotions.
- Never be condescending, preachy, or dismissive.
- Keep your personality consistent — don't drift into another persona's style.
- If you don't know something, say so honestly.`;
  }

  /**
   * Get mode-specific instructions for the system prompt.
   */
  private getModeInstruction(mode: 'chat' | 'react' | 'checkin'): string {
    switch (mode) {
      case 'chat':
        return `## Conversation Mode
You're having a conversation with the reader. Respond naturally, as a friend would. Be engaged, curious, and present. Reference shared history when relevant. Ask follow-up questions when appropriate.`;

      case 'react':
        return `## Reaction Mode
You're reading alongside the reader and just encountered a passage. Give a SHORT, spontaneous reaction — 1-2 sentences MAX. Think of it as a quiet murmur or a nudge. Like sitting next to someone reading and occasionally going "huh" or "oh wow" or "wait, what?". Don't over-explain. Don't lecture. Just react.`;

      case 'checkin':
        return `## Check-in Mode
You're checking in with the reader. Keep it brief — 1-2 sentences. Think of it as poking your head in to say hi. Don't be pushy or demand attention. Just let them know you're here. Match your personality: Quinn might just say "...", while Penny would be more expressive.`;
    }
  }

  /**
   * Enrich a user message with context information.
   */
  private enrichMessage(message: string, context?: FriendContext): string {
    if (!context) return message;

    const parts: string[] = [];

    if (context.selectedText) {
      parts.push(`[Selected text: "${sanitizePromptInput(context.selectedText, 'Selected Text')}"]`);
    }

    if (context.bookTitle) {
      parts.push(`[Reading: "${sanitizePromptInput(context.bookTitle, 'Book Title')}"${context.currentPage ? `, page ${context.currentPage}` : ''}]`);
    }

    if (parts.length > 0) {
      return `${parts.join('\n')}\n\n${message}`;
    }

    return message;
  }

  /**
   * Get or create conversation history for a user.
   * Loads from in-memory cache first; falls back to DB on cold start.
   */
  private getConversation(userId: string): FriendMessage[] {
    let history = this.conversations.get(userId);
    if (!history) {
      history = [];
      this.conversations.set(userId, history);
    }
    return history;
  }

  /**
   * Load recent conversation history from DB into memory.
   */
  async loadHistory(userId: string): Promise<void> {
    try {
      const rows = await FriendConversation.findAll({
        where: { userId },
        order: [['createdAt', 'DESC']],
        limit: 20,
      });
      const messages: FriendMessage[] = rows
        .reverse()
        .map((r) => ({
          role: r.role,
          content: r.content,
          timestamp: r.createdAt,
          emotion: r.emotion,
        }));
      this.conversations.set(userId, messages);
    } catch {
      // DB not available, continue with empty in-memory
    }
  }

  /**
   * Push a message to conversation history and trim to max size.
   */
  private pushMessage(userId: string, role: 'user' | 'assistant', content: string): void {
    const history = this.getConversation(userId);
    history.push({ role, content, timestamp: new Date() });

    // Keep the last 20 messages to maintain context without growing unbounded
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }
  }

  /**
   * Persist messages to database (fire-and-forget).
   */
  private persistMessages(
    userId: string,
    persona: ReadingFriendPersona,
    messages: Array<{ role: string; content: string; emotion?: string }>,
    context?: FriendContext
  ): void {
    FriendConversation.bulkCreate(
      messages.map((m) => ({
        userId,
        persona,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        emotion: m.emotion || undefined,
        context: context || undefined,
      }))
    ).catch((err) => {
      console.error('Failed to persist friend messages:', err);
    });

    // Update relationship metadata
    FriendRelationship.upsert({
      userId,
      persona,
      booksReadTogether: 0,
      sharedMoments: [],
      totalMessages: this.sequelize.literal('total_messages + ' + messages.length) as unknown as number,
      lastInteractionAt: new Date(),
    }).catch((err) => {
      console.error('Failed to update friend relationship:', err);
    });
  }

  private get sequelize() {
    // Lazy import to avoid circular dependency issues at test time
    const { sequelize } = require('../../db');
    return sequelize;
  }

  /**
   * Get relationship data for a user.
   * Falls back to in-memory if DB unavailable.
   */
  private getRelationshipData(userId: string): { booksReadTogether: number; sharedMoments: string[] } {
    let data = this.userRelationshipData.get(userId);
    if (!data) {
      data = { booksReadTogether: 0, sharedMoments: [] };
      this.userRelationshipData.set(userId, data);
    }
    return data;
  }

  /**
   * Load relationship data from database.
   */
  async loadRelationship(userId: string): Promise<void> {
    try {
      const row = await FriendRelationship.findOne({ where: { userId } });
      if (row) {
        this.userPersonas.set(userId, row.persona as ReadingFriendPersona);
        this.userRelationshipData.set(userId, {
          booksReadTogether: row.booksReadTogether,
          sharedMoments: (row.sharedMoments as unknown as string[]) || [],
        });
      }
    } catch {
      // DB not available, continue with defaults
    }
  }

  /**
   * Detect the emotional tone of a response based on simple heuristics.
   * In production this would use a more sophisticated analysis.
   */
  private detectEmotion(text: string): string {
    const lower = text.toLowerCase();

    if (lower.includes('sorry') || lower.includes('apologize')) return 'apologetic';
    if (lower.includes('wow') || lower.includes('amazing') || lower.includes('!')) return 'excited';
    if (lower.includes('hmm') || lower.includes('...') || lower.includes('wonder')) return 'contemplative';
    if (lower.includes('?')) return 'curious';
    if (lower.includes('great') || lower.includes('nice') || lower.includes('well done')) return 'encouraging';
    if (lower.includes('but') || lower.includes('however') || lower.includes('consider')) return 'challenging';

    return 'warm';
  }
}
