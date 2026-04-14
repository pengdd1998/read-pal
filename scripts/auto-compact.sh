#!/bin/bash
# Auto-compact: sends /compact to the current Claude Code session
# Usage: ./auto-compact.sh [interval_minutes]
# Default: checks every 30 minutes

INTERVAL=${1:-30}
ITERATION=0

echo "[auto-compact] Running every ${INTERVAL}m. PID: $$"
echo "[auto-compact] Press Ctrl+C to stop."
echo ""

while true; do
  sleep "${INTERVAL}m"
  ITERATION=$((ITERATION + 1))
  echo "[auto-compact] #${ITERATION} Triggering /compact at $(date '+%H:%M:%S')..."

  # Send /compact + Enter to the frontmost iTerm2 terminal
  osascript -e '
    tell application "iTerm2"
      activate
      tell current window
        tell current session of current tab
          write text "/compact"
        end tell
      end tell
    end tell
  '

  echo "[auto-compact] Sent. Next in ${INTERVAL}m."
done
