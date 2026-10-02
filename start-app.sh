#!/usr/bin/env bash
# AirDrop Web Linux Desktop Launcher

set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$HOME/.local/state/airdrop-web"
PID_FILE="$RUN_DIR/server.pid"
LOG_FILE="$RUN_DIR/server.log"

mkdir -p "$RUN_DIR"

cd "$APP_DIR"

# Function to check if server is running and responding to /api/config
check_server() {
  local port=$1
  if curl -s --max-time 1 "http://localhost:${port}/api/config" | grep -q '"status":"ok"'; then
    return 0
  fi
  return 1
}

# Find active port if already running
FIND_PORT=""
for p in 3001 3000 3050 3051; do
  if check_server "$p"; then
    FIND_PORT="$p"
    break
  fi
done

if [ -n "$FIND_PORT" ]; then
  echo "AirDrop Web is already running on port $FIND_PORT"
  if command -v notify-send >/dev/null 2>&1; then
    notify-send -i airdrop-web "AirDrop Web" "Ứng dụng đang chạy trên cổng ${FIND_PORT}. Đang mở trình duyệt..."
  fi
  xdg-open "http://localhost:${FIND_PORT}" >/dev/null 2>&1 &
  exit 0
fi

# Ensure production bundle exists
if [ ! -f "$APP_DIR/dist/server.js" ] || [ ! -f "$APP_DIR/dist/index.html" ]; then
  echo "Building AirDrop Web..."
  npm run build:all >> "$LOG_FILE" 2>&1
fi

echo "Starting AirDrop Web server in background..."
export NODE_ENV=production
nohup setsid node "$APP_DIR/dist/server.js" >> "$LOG_FILE" 2>&1 &
SERVER_PID=$!
disown $SERVER_PID 2>/dev/null || true
echo "$SERVER_PID" > "$PID_FILE"

# Wait for server to become responsive
READY=0
ACTIVE_PORT=""
LAN_URL=""

for i in $(seq 1 30); do
  for p in 3001 3000 3050 3051 3052; do
    CONFIG_JSON=$(curl -s --max-time 1 "http://localhost:${p}/api/config" 2>/dev/null || true)
    if echo "$CONFIG_JSON" | grep -q '"status":"ok"'; then
      READY=1
      ACTIVE_PORT="$p"
      LAN_URL=$(echo "$CONFIG_JSON" | grep -o '"lanUrl":"[^"]*"' | cut -d'"' -f4 || true)
      break 2
    fi
  done
  sleep 0.3
done

if [ "$READY" -eq 1 ]; then
  echo "AirDrop Web started successfully on port $ACTIVE_PORT"
  if [ -n "$LAN_URL" ]; then
    echo "LAN / Wi-Fi URL: $LAN_URL"
    if command -v notify-send >/dev/null 2>&1; then
      notify-send -i airdrop-web "AirDrop Web Sẵn Sàng!" "💻 Local: http://localhost:${ACTIVE_PORT}\n📱 Wi-Fi LAN: ${LAN_URL}"
    fi
  else
    if command -v notify-send >/dev/null 2>&1; then
      notify-send -i airdrop-web "AirDrop Web Sẵn Sàng!" "Đang chạy trên http://localhost:${ACTIVE_PORT}"
    fi
  fi
  xdg-open "http://localhost:${ACTIVE_PORT}" >/dev/null 2>&1 &
else
  echo "Failed to start server within timeout. Check $LOG_FILE"
  if command -v notify-send >/dev/null 2>&1; then
    notify-send -i dialog-error "Lỗi Khởi Động AirDrop Web" "Không thể kết nối đến máy chủ. Xem chi tiết tại $LOG_FILE"
  fi
  exit 1
fi
