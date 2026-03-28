// ============================================================================
// Base Tool Class
// ============================================================================

/**
 * Abstract base class for all tools
 *
 * Tools are the building blocks that AI agents use to interact with
 * external systems (databases, APIs, file systems, etc.)
 */
export abstract class BaseTool implements ITool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly category: ToolCategory;
  abstract readonly inputSchema: JSONSchema;

  protected readonly timeout: number;
  protected readonly retryable: boolean;
  protected readonly cacheable: boolean;

  constructor(config?: ToolConfig) {
    this.timeout = config?.timeout ?? 30000; // 30 seconds default
    this.retryable = config?.retryable ?? true;
    this.cacheable = config?.cacheable ?? false;
  }

  /**
   * Execute the tool with the given input
   */
  abstract execute(input: unknown, context: ToolContext): Promise<ToolResult>;

  /**
   * Validate input against the schema
   */
  protected validateInput(input: unknown): ValidationResult {
    // Simple validation - in production, use a proper JSON Schema validator
    if (!input || typeof input !== 'object') {
      return {
        valid: false,
        errors: ['Input must be an object']
      };
    }

    // Check required fields
    const required = this.inputSchema.required || [];
    const missing = required.filter(field => !(field in input));

    if (missing.length > 0) {
      return {
        valid: false,
        errors: [`Missing required fields: ${missing.join(', ')}`]
      };
    }

    return { valid: true };
  }

  /**
   * Execute with timeout
   */
  protected async executeWithTimeout<T>(
    fn: () => Promise<T>
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tool execution timeout')), this.timeout)
      )
    ]);
  }

  /**
   * Execute with retry logic
   */
  protected async executeWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries) {
          break;
        }

        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  /**
   * Execute with caching
   */
  protected async executeWithCache<T>(
    cacheKey: string,
    fn: () => Promise<T>,
    context: ToolContext
  ): Promise<T> {
    // Try to get from cache
    const cached = await context.db.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as T;
    }

    // Execute function
    const result = await fn();

    // Store in cache (1 hour TTL)
    await context.db.redis.set(cacheKey, JSON.stringify(result), 3600);

    return result;
  }
}

// ============================================================================
// Tool Types
// ============================================================================

interface ToolConfig {
  timeout?: number;
  retryable?: boolean;
  cacheable?: boolean;
}

interface ValidationResult {
  valid: boolean;
  errors?: string[];
}
