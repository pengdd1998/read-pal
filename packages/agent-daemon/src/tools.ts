/**
 * Tool definitions and executors for the GLM agent loop.
 *
 * Each tool has:
 *  - a JSON-schema definition sent to GLM as a "function"
 *  - a handler that executes the tool locally
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const PROJECT_ROOT = process.env.PROJECT_ROOT || 'REDACTED_LOCAL_PATH';

// ---------------------------------------------------------------------------
// Tool JSON-Schema definitions (OpenAI function-calling format)
// ---------------------------------------------------------------------------

export const toolDefinitions = [
  {
    type: 'function' as const,
    function: {
      name: 'bash',
      description:
        'Execute a bash command in the project directory. Returns stdout and stderr. Use for git, npm, curl, and other shell operations.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The bash command to run',
          },
          timeout: {
            type: 'number',
            description: 'Timeout in milliseconds (default 30000)',
          },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description:
        'Read the contents of a file. Returns the full file content with line numbers.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path from project root',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description:
        'Write content to a file. Creates parent directories if needed. OVERWRITES existing content.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path from project root',
          },
          content: {
            type: 'string',
            description: 'The file content to write',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_file',
      description:
        'Replace a specific string in a file. Use for targeted edits.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path from project root',
          },
          old_string: {
            type: 'string',
            description: 'The exact string to find and replace',
          },
          new_string: {
            type: 'string',
            description: 'The replacement string',
          },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'glob',
      description:
        'Find files matching a glob pattern in the project directory.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description:
              'Glob pattern (e.g. "**/*.ts", "packages/api/src/**/*.ts")',
          },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'grep',
      description:
        'Search file contents for a pattern. Returns matching lines with file paths.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Search pattern (regex supported)',
          },
          path: {
            type: 'string',
            description:
              'Optional relative directory or file to search in',
          },
          include: {
            type: 'string',
            description: 'Optional file glob to include (e.g. "*.ts")',
          },
        },
        required: ['pattern'],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

export interface ToolResult {
  success: boolean;
  output: string;
}

export function executeTool(
  name: string,
  args: Record<string, unknown>,
): ToolResult {
  switch (name) {
    case 'bash':
      return execBash(args.command as string, args.timeout as number | undefined);
    case 'read_file':
      return execReadFile(args.path as string);
    case 'write_file':
      return execWriteFile(args.path as string, args.content as string);
    case 'edit_file':
      return execEditFile(
        args.path as string,
        args.old_string as string,
        args.new_string as string,
      );
    case 'glob':
      return execGlob(args.pattern as string);
    case 'grep':
      return execGrep(
        args.pattern as string,
        args.path as string | undefined,
        args.include as string | undefined,
      );
    default:
      return { success: false, output: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// Implementations
// ---------------------------------------------------------------------------

function execBash(command: string, timeout?: number): ToolResult {
  try {
    const result = execSync(command, {
      cwd: PROJECT_ROOT,
      timeout: timeout ?? 30_000,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024, // 1MB
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, output: result || '(no output)' };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const output = [e.stdout, e.stderr, e.message].filter(Boolean).join('\n');
    return { success: false, output: output || 'Command failed with no output' };
  }
}

function execReadFile(relPath: string): ToolResult {
  try {
    const absPath = resolve(PROJECT_ROOT, relPath);
    const content = readFileSync(absPath, 'utf-8');
    // Add line numbers
    const lines = content.split('\n');
    const numbered = lines.map((l, i) => `${String(i + 1).padStart(4)}\t${l}`).join('\n');
    return { success: true, output: numbered };
  } catch (err: unknown) {
    return { success: false, output: `Failed to read file: ${(err as Error).message}` };
  }
}

function execWriteFile(relPath: string, content: string): ToolResult {
  try {
    const absPath = resolve(PROJECT_ROOT, relPath);
    const dir = dirname(absPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(absPath, content, 'utf-8');
    return { success: true, output: `Wrote ${content.length} bytes to ${relPath}` };
  } catch (err: unknown) {
    return { success: false, output: `Failed to write file: ${(err as Error).message}` };
  }
}

function execEditFile(relPath: string, oldStr: string, newStr: string): ToolResult {
  try {
    const absPath = resolve(PROJECT_ROOT, relPath);
    const content = readFileSync(absPath, 'utf-8');
    if (!content.includes(oldStr)) {
      return { success: false, output: `old_string not found in ${relPath}` };
    }
    const newContent = content.replace(oldStr, newStr);
    writeFileSync(absPath, newContent, 'utf-8');
    return { success: true, output: `Edited ${relPath}` };
  } catch (err: unknown) {
    return { success: false, output: `Failed to edit file: ${(err as Error).message}` };
  }
}

function execGlob(pattern: string): ToolResult {
  try {
    // Use find command as a simple glob replacement
    const result = execSync(`find . -name '${pattern.replace(/'/g, "'\\''")}' -not -path '*/node_modules/*' -not -path '*/.next/*' -not -path '*/.git/*' | head -100`, {
      cwd: PROJECT_ROOT,
      timeout: 10_000,
      encoding: 'utf-8',
      maxBuffer: 256 * 1024,
    });
    if (!result.trim()) {
      return { success: true, output: 'No files matched the pattern.' };
    }
    return { success: true, output: result.trim() };
  } catch (err: unknown) {
    return { success: false, output: `Glob failed: ${(err as Error).message}` };
  }
}

function execGrep(pattern: string, relPath?: string, include?: string): ToolResult {
  try {
    const cmd = [
      'grep',
      '-rn',
      '-E',
      `'${pattern.replace(/'/g, "'\\''")}'`,
      '--include=' + (include ?? '*'),
      relPath ?? '.',
    ].join(' ');
    const result = execSync(cmd, {
      cwd: PROJECT_ROOT,
      timeout: 15_000,
      encoding: 'utf-8',
      maxBuffer: 512 * 1024,
    });
    // Cap output at 200 lines
    const lines = (result || '').split('\n').slice(0, 200);
    return { success: true, output: lines.join('\n') || 'No matches found.' };
  } catch (err: unknown) {
    // grep returns exit code 1 when no matches — that's not an error
    const e = err as { status?: number };
    if (e.status === 1) {
      return { success: true, output: 'No matches found.' };
    }
    return { success: false, output: `Grep failed: ${(err as Error).message}` };
  }
}
