#!/usr/bin/env bash
# AirDrop Web Stop Script

RUN_DIR="$HOME/.local/state/airdrop-web"
PID_FILE="$RUN_DIR/server.pid"

STOPPED=0

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    STOPPED=1
  fi
  rm -f "$PID_FILE"
fi

# Fallback: kill any running airdrop-web dist/server.js
pkill -f "airdrop-web/dist/server.js" 2>/dev/null && STOPPED=1 || true

if [ "$STOPPED" -eq 1 ]; then
  echo "AirDrop Web has been stopped."
  if command -v notify-send >/dev/null 2>&1; then
    notify-send -i airdrop-web "AirDrop Web" "Máy chủ AirDrop Web đã dừng."
  fi
else
  echo "AirDrop Web was not running."
fi
