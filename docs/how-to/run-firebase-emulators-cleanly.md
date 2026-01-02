# How to Run Firebase Emulators with Clean Shutdown

This guide shows you how to run Firebase emulators alongside the frontend with proper signal handling for clean shutdowns.

## Quick Start

**Use the custom runner for clean shutdown:**

```bash
npm run dev:emu:clean
```

**Or use concurrently (may have double-SIGINT issues):**

```bash
npm run dev:emu
```

## What You Get

With `dev:emu:clean`, you get:

- ✅ **Single Ctrl-C shutdown** - no double SIGINT warnings
- ✅ **Clean data export** - `--export-on-exit` works correctly
- ✅ **No orphaned processes** - automatic cleanup of Java subprocesses
- ✅ **Colored output** - yellow for Firebase, green for frontend
- ✅ **Process name prefixes** - `[firebase]` and `[frontend]` labels
- ✅ **Proper exit codes** - 130 for SIGINT (Ctrl-C)

## Usage

### Starting the Emulators

```bash
npm run dev:emu:clean
```

You'll see:
```
🚀 Starting parallel processes...

[firebase] Starting: npm run dev:emulators
[frontend] Starting: npm run dev

[firebase] 🔍 Checking for existing emulator processes...
[firebase] 🚀 Starting Firebase emulators...
[frontend] VITE v6.2.0 ready in 234 ms
```

### Stopping the Emulators

**Press Ctrl-C once:**

```
^C
📥 Received SIGINT (Ctrl-C), waiting for graceful shutdown...
    (Children receive signal from OS, not forwarded manually)

🛑 Shutting down all processes...

[firebase] i  emulators: Received SIGINT (Ctrl-C) for the first time. Starting a clean shutdown.
[firebase] i  hub: Stopping emulator hub
[firebase] i  Automatically exporting data to ./emulator-data
[frontend] Exited with signal: SIGINT
[firebase] Exited with code: 0
```

**If processes hang (rare):**

The script automatically force-kills after 10 seconds:

```
⚠️  Processes did not exit gracefully, forcing shutdown...
[firebase] Forcing kill with SIGKILL
```

## Environment Variables

The custom runner automatically sets:

```bash
VITE_USE_FIREBASE_EMULATORS=true  # Tells frontend to use emulators
GEMINI_API_KEY                     # From your shell environment
ALIGNMENT_SERVICE_URL              # Defaults to http://localhost:8080
```

**Set in your shell (e.g., `~/.zshrc`):**

```bash
export GEMINI_API_KEY="your-api-key-here"  # pragma: allowlist secret
export ALIGNMENT_SERVICE_URL="http://localhost:8080"  # Optional
```

## Customizing the Runner

Edit `/scripts/run-dev-parallel.js` to change:

**1. Process list:**

```javascript
const processes = [
  {
    name: 'firebase',
    command: 'npm',
    args: ['run', 'dev:emulators'],
    color: COLORS.yellow,
  },
  {
    name: 'frontend',
    command: 'npm',
    args: ['run', 'dev'],
    color: COLORS.green,
    env: { ...process.env, VITE_USE_FIREBASE_EMULATORS: 'true' },
  },
  // Add more processes here
];
```

**2. Force-kill timeout (default 10 seconds):**

```javascript
const forceKillTimeout = setTimeout(() => {
  console.log('Forcing shutdown...');
  // ...
}, 10000); // Change this value (milliseconds)
```

**3. Output colors:**

```javascript
const COLORS = {
  reset: '\x1b[0m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};
```

## Troubleshooting

### "Emulator UI failed to initialize"

**Symptom:** Emulators start but UI doesn't load.

**Solution:** Check if port 4000 is already in use:

```bash
lsof -i :4000
kill -9 <PID>
```

### "Port already in use" errors

**Symptom:** Firestore or Auth emulator fails to start.

**Solution:** Clean up orphaned processes:

```bash
pgrep -f 'java.*firestore' | xargs kill -9
lsof -i :8080  # Firestore
lsof -i :9099  # Auth
```

### Processes don't exit after Ctrl-C

**Symptom:** Script hangs after pressing Ctrl-C.

**Solution:**

1. Wait 10 seconds for force-kill timeout
2. Or press Ctrl-C again (only in emergency)
3. Or in another terminal: `pkill -f firebase`

### Frontend can't connect to emulators

**Symptom:** Frontend shows connection errors.

**Solution:** Verify environment variable is set:

```bash
# In browser console:
console.log(import.meta.env.VITE_USE_FIREBASE_EMULATORS);
// Should print: "true"
```

If not set, the runner may not be passing it correctly. Check `run-dev-parallel.js`:

```javascript
{
  name: 'frontend',
  env: { ...process.env, VITE_USE_FIREBASE_EMULATORS: 'true' },
}
```

## Comparing dev:emu vs dev:emu:clean

| Feature | `dev:emu` (concurrently) | `dev:emu:clean` (custom) |
|---------|-------------------------|--------------------------|
| Shutdown behavior | May receive double SIGINT | Single SIGINT |
| Data export | May fail | Always works |
| Orphan cleanup | Manual | Automatic |
| Output format | Concurrently style | Custom colored |
| Force-kill timeout | No | Yes (10s) |
| Cross-platform | Yes | Yes |
| Dependencies | concurrently package | None (Node.js built-in) |

## When to Use Each

**Use `dev:emu:clean`:**
- When you need reliable `--export-on-exit`
- When you experience double-SIGINT warnings
- When orphaned Java processes are a problem
- For production-like development environment

**Use `dev:emu`:**
- When concurrently features are needed (e.g., `--kill-others`)
- When you prefer concurrently's output format
- When the double-SIGINT issue doesn't affect you

## Next Steps

- [Understanding Firebase Signal Handling](/docs/explanation/firebase-emulator-signal-handling.md) - Deep dive into the double-SIGINT problem
- [Firebase Emulator Setup](/docs/how-to/firebase-setup.md) - Initial emulator configuration
- [Development Workflow](/DEVELOPMENT.md) - Complete development guide

## Related Scripts

- `npm run dev:emulators` - Run only Firebase emulators (no frontend)
- `npm run dev` - Run only frontend (no emulators, uses production Firebase)
- `npm run dev:full` - Run alignment service + emulators + frontend (Docker required)
