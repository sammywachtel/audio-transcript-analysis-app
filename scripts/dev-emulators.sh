#!/bin/bash
# Firebase Emulator wrapper script with proper cleanup
# Ensures orphaned Java subprocesses are cleaned up after emulator exits

# Cleanup orphaned processes - called after emulator exits
cleanup_orphans() {
    echo ""
    echo "🧹 Cleaning up any orphaned emulator processes..."

    # Wait a moment for processes to fully register as orphaned
    sleep 2

    # Kill any orphaned Java processes from the emulator
    # These show up as java processes running the firestore JAR
    local java_pids=$(pgrep -f 'java.*firestore' 2>/dev/null || true)
    if [ -n "$java_pids" ]; then
        echo "   Killing orphaned Java emulator processes: $java_pids"
        echo "$java_pids" | xargs kill -9 2>/dev/null || true
    else
        echo "   No orphaned processes found"
    fi

    echo "✨ Cleanup complete"
}

# Ignore SIGINT in this script - let only the child process handle it
# This prevents double-signal issues from bash re-raising SIGINT
trap '' INT

# Always run cleanup on exit
trap cleanup_orphans EXIT

# Clean up any existing emulator processes before starting
echo "🔍 Checking for existing emulator processes..."
existing=$(pgrep -f 'java.*firestore' 2>/dev/null || true)
if [ -n "$existing" ]; then
    echo "   Found existing Java emulator processes, cleaning up..."
    echo "$existing" | xargs kill -9 2>/dev/null || true
    sleep 1
fi

echo "🚀 Starting Firebase emulators..."
echo ""

# Run emulator - it receives SIGINT directly from terminal
GOOGLE_APPLICATION_CREDENTIALS= \
GEMINI_API_KEY="${GEMINI_API_KEY}" \
ALIGNMENT_SERVICE_URL="${ALIGNMENT_SERVICE_URL:-http://localhost:8080}" \
npx firebase emulators:start \
    --import=./emulator-data \
    --export-on-exit=./emulator-data

# Script exits here, triggering EXIT trap
