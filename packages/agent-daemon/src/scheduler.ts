/**
 * Task Scheduler for the Agent Daemon
 *
 * Runs tasks on cron schedules using the Claude Agent SDK.
 * Each task is an isolated query() call with its own budget and turn limit.
 */

export interface ScheduledTask {
  name: string;
  cron: string;       // "minute hour day month weekday"
  prompt: string;
  maxTurns: number;
  maxBudgetUsd: number;
}

// Parse simple cron: "minute hour day month weekday"
function parseCron(cron: string): { minute: number[]; hour: number[] } {
  const parts = cron.trim().split(/\s+/);
  const minute = parts[0] === '*' ? [] : parts[0].split(',').map(Number);
  const hour = parts[1] === '*' ? [] : parts[1].split(',').map(Number);
  return { minute, hour };
}

function matchesCron(cron: string, now: Date): boolean {
  const { minute, hour } = parseCron(cron);
  const currentMinute = now.getMinutes();
  const currentHour = now.getHours();

  if (minute.length > 0 && !minute.includes(currentMinute)) return false;
  if (hour.length > 0 && !hour.includes(currentHour)) return false;
  return true;
}

export class Scheduler {
  private tasks: ScheduledTask[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastRunMinute = -1;
  private lastRunHour = -1;

  addTask(task: ScheduledTask): void {
    this.tasks.push(task);
    console.log(`[scheduler] Registered task: "${task.name}" (${task.cron})`);
  }

  start(onTask: (task: ScheduledTask) => Promise<void>): void {
    console.log(`[scheduler] Starting with ${this.tasks.length} tasks`);
    console.log(`[scheduler] Checking every 60 seconds`);

    // Check every 60 seconds
    this.intervalId = setInterval(async () => {
      const now = new Date();
      const currentMinute = now.getMinutes();
      const currentHour = now.getHours();

      // Only trigger once per minute
      if (currentMinute === this.lastRunMinute && currentHour === this.lastRunHour) return;

      for (const task of this.tasks) {
        if (matchesCron(task.cron, now)) {
          console.log(`[scheduler] Firing task: "${task.name}" at ${now.toISOString()}`);
          try {
            await onTask(task);
          } catch (error) {
            console.error(`[scheduler] Task "${task.name}" failed:`, error);
          }
        }
      }

      this.lastRunMinute = currentMinute;
      this.lastRunHour = currentHour;
    }, 60_000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[scheduler] Stopped');
    }
  }
}
