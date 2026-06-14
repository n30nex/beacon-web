#!/usr/bin/env bash
# Start/stop helper for the beacon-web Vite dev server.
#
# Usage:
#   scripts/devserver.sh start      # launch on the public tunnel target port (background)
#   scripts/devserver.sh stop       # stop the server this script started
#   scripts/devserver.sh restart    # stop then start
#   scripts/devserver.sh status     # is it running? on what URL?
#   scripts/devserver.sh stop-all   # kill ALL stray vite processes (cleanup)
#
# Port defaults to the Cloudflare tunnel target used by the local operator.
# Override with BEACON_WEB_PORT=NNNN and BEACON_WEB_HOST=HOST for scratch runs.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${BEACON_WEB_HOST:-0.0.0.0}"
PORT="${BEACON_WEB_PORT:-5174}"
RUNTIME_DIR="$DIR/.scripts"
PID_FILE="$RUNTIME_DIR/devserver-$PORT.pid"
LOG_FILE="$RUNTIME_DIR/devserver-$PORT.log"
VITE_BIN="$DIR/node_modules/vite/bin/vite.js"

is_alive() { [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; }

start() {
  if is_alive; then
    echo "dev server already running (pid $(cat "$PID_FILE")) — $(url)"
    return 0
  fi
  if [ ! -f "$VITE_BIN" ]; then
    echo "vite not found at $VITE_BIN — run 'npm install' first" >&2
    exit 1
  fi
  mkdir -p "$RUNTIME_DIR"
  # --strictPort: fail loudly if the port is taken instead of silently drifting.
  nohup node "$VITE_BIN" --host "$HOST" --port "$PORT" --strictPort >"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
  # Give Vite a moment to bind (or fail) so status output is accurate.
  for _ in $(seq 1 20); do
    grep -q "Local:" "$LOG_FILE" 2>/dev/null && break
    is_alive || { echo "dev server failed to start — see $LOG_FILE" >&2; rm -f "$PID_FILE"; tail -n 5 "$LOG_FILE" >&2; exit 1; }
    sleep 0.25
  done
  echo "dev server started (pid $(cat "$PID_FILE")) — $(url)"
}

stop() {
  local stopped=0
  if is_alive; then
    local pid; pid="$(cat "$PID_FILE")"
    kill "$pid" 2>/dev/null || true
    pkill -P "$pid" 2>/dev/null || true   # any children Vite spawned
    stopped=1
  fi
  rm -f "$PID_FILE"
  [ "$stopped" = 1 ] && echo "dev server stopped" || echo "dev server was not running"
}

status() {
  if is_alive; then
    echo "running (pid $(cat "$PID_FILE")) — $(url)"
  else
    echo "not running"
  fi
}

# Best-effort cleanup of the stale instances that pile up across sessions.
# Matches any vite launched from THIS project's node_modules (covers both the
# `.bin/vite` symlink used by `npm run dev` and the resolved `vite/bin/vite.js`
# used by this script) so it won't touch other projects' servers.
stop_all() {
  pkill -f "$DIR/node_modules/.*vite" 2>/dev/null && echo "killed stray beacon-web vite processes" || echo "no stray beacon-web vite processes found"
  rm -f "$PID_FILE"
}

# Read the actual URL Vite reported (handles the case where the port differs).
url() {
  grep -oE "http://(localhost|127\.0\.0\.1|[0-9.]+):[0-9]+/?" "$LOG_FILE" 2>/dev/null | head -1 || echo "http://$HOST:$PORT/"
}

case "${1:-}" in
  start)    start ;;
  stop)     stop ;;
  restart)  stop; start ;;
  status)   status ;;
  stop-all) stop_all ;;
  *) echo "usage: $0 {start|stop|restart|status|stop-all}" >&2; exit 2 ;;
esac
