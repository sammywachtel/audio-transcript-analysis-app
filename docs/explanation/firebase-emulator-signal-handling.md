# Firebase Emulator Signal Handling

## The Double-SIGINT Problem

When running Firebase emulators through process managers like `concurrently` or `npm-run-all`, pressing Ctrl-C causes the emulators to receive SIGINT twice, triggering a dirty shutdown:

```
[firebase] i  emulators: Received SIGINT (Ctrl-C) for the first time. Starting a clean shutdown.
... graceful shutdown starts ...
[firebase] ⚠  emulators: Received SIGINT (Ctrl-C) 2 times. You have forced the Emulator Suite to exit without waiting for 1 subprocess to finish.
```

This results in:
- Failed data export when using `--export-on-exit`
- Orphaned Java processes (Firestore emulator)
- Corrupted emulator data
- Blocked ports requiring manual cleanup

## Root Cause

### How SIGINT Propagates

When you press Ctrl-C in a terminal:

1. **Terminal sends SIGINT to the entire process group** (all processes in the foreground job)
2. **Each process receives SIGINT directly from the OS** - they don't need it forwarded
3. **But process managers often forward it anyway**, causing children to receive it twice:
   - Once from the OS (terminal → process group → child)
   - Once from the parent process manager (concurrently → child)

### Why concurrently Causes This

From the [concurrently GitHub issue #283](https://github.com/open-cli-tools/concurrently/issues/283):

> "It looks like spawn-command does not spawn the subprocess in detached mode, and it seems the defaults in concurrently are not setting detached options either. Because if not, it's perfectly normal to have the SIGINT sent twice, because it's received by the subprocess, and then resent with command.kill(signal) a second time."

The problem:
1. `concurrently` spawns children in the same process group
2. Children receive SIGINT naturally from the OS
3. `concurrently` also explicitly sends SIGINT to children
4. Result: Children receive SIGINT twice

### Why npm Scripts Make It Worse

From [Firebase issue #3034](https://github.com/firebase/firebase-tools/issues/3034) and [npm issue #1591](https://github.com/npm/cli/issues/1591):

> "Running a node process using an npm script and using CTRL+C to exit will fire the command twice."

npm adds another layer that can duplicate signals, especially when using `&&` chains or nested npm scripts.

## Why Common "Fixes" Don't Work

### ❌ Bash `trap '' INT`

**Attempted fix:**
```bash
#!/bin/bash
trap '' INT  # Ignore SIGINT in bash wrapper
npx firebase emulators:start
```

**Why it fails:**
- Only prevents the bash script from handling SIGINT
- Child process (firebase) still receives SIGINT from both OS and concurrently
- Bash ignoring the signal doesn't stop signal propagation to children

### ❌ Removing `--kill-others` from concurrently

**Attempted fix:**
```json
"dev:emu": "concurrently \"npm run dev:emulators\" \"vite\""
```

**Why it fails:**
- `--kill-others` only controls whether concurrently kills children when one exits
- Signal forwarding happens regardless of this flag
- concurrently still forwards Ctrl-C signals to all children

### ❌ Custom `--kill-signal`

**Attempted fix:**
```json
"dev:emu": "concurrently --kill-signal SIGTERM ..."
```

**Why it fails:**
- Only affects the signal sent when concurrently kills children
- Doesn't prevent forwarding of incoming SIGINT from Ctrl-C
- Children still receive SIGINT from OS + forwarded signal

## Working Solutions

### Solution 1: Custom Node.js Process Runner (Recommended)

**File:** `/scripts/run-dev-parallel.js`

This custom script solves the problem by:
1. **Not forwarding signals manually** - lets OS handle it naturally
2. **Waiting for graceful shutdown** - gives processes time to clean up
3. **Force-kill timeout** - prevents indefinite hanging (10 second timeout)

**Key implementation detail:**
```javascript
// CRITICAL: Don't forward signals to children
// They already received SIGINT from the OS
process.on('SIGINT', () => {
  console.log('Received SIGINT, waiting for graceful shutdown...');
  // Just wait - don't call child.kill()
  shutdown(130);
});
```

**Usage:**
```bash
npm run dev:emu:clean
```

**Advantages:**
- ✅ Single SIGINT per child process
- ✅ Clean data export with `--export-on-exit`
- ✅ Proper exit codes (130 for SIGINT)
- ✅ Colored output with process name prefixes
- ✅ Cross-platform (works on Windows, macOS, Linux)

**Disadvantages:**
- Custom code to maintain
- Adds another script to the project

### Solution 2: Run Firebase Outside Process Manager

**Implementation:**
```json
{
  "scripts": {
    "dev": "npm run dev:emulators & npm run dev:frontend",
    "dev:frontend": "VITE_USE_FIREBASE_EMULATORS=true vite"
  }
}
```

**How it works:**
- Firebase runs in background via `&` operator
- Only frontend runs through npm
- Reduces signal forwarding layers

**Advantages:**
- ✅ Simple, no extra dependencies
- ✅ Reduces signal forwarding complexity

**Disadvantages:**
- ❌ No unified output logging
- ❌ Doesn't work on Windows (no `&` operator)
- ❌ Harder to stop all processes together
- ❌ Background job doesn't show output interleaved

### Solution 3: Use Yarn Instead of NPM

**Implementation:**
```json
{
  "scripts": {
    "dev:emulators": "firebase emulators:start",
    "dev": "concurrently 'yarn dev:emulators' 'yarn dev:frontend'"
  }
}
```

**Why it helps:**
From the concurrently issue thread:

> "If the firebase command is wrapped with a yarn script command in package.json, the issue is not reproduced. It looks like yarn already does some protection of double sent signals."

**Advantages:**
- ✅ Works with existing concurrently setup
- ✅ Yarn handles signal deduplication

**Disadvantages:**
- ❌ Requires yarn (can't use npm)
- ❌ Relies on undocumented yarn behavior
- ❌ May break in future yarn versions

### Solution 4: Docker Compose

**Implementation:**
```yaml
# docker-compose.yml
services:
  firebase:
    image: firebase-emulator
    command: firebase emulators:start

  frontend:
    image: node
    command: npm run dev
```

**Advantages:**
- ✅ Complete process isolation
- ✅ Industry-standard tooling
- ✅ Explicit signal handling configuration

**Disadvantages:**
- ❌ Heavy setup for local development
- ❌ Slower startup time
- ❌ Requires Docker knowledge

## Comparison of Solutions

| Solution | Clean Shutdown | Cross-Platform | Complexity | Recommended |
|----------|---------------|----------------|------------|-------------|
| Custom Node.js runner | ✅ | ✅ | Medium | **Yes** |
| Background `&` operator | ✅ | ❌ (Unix only) | Low | No |
| Yarn wrapper | ✅ | ✅ | Low | Maybe |
| Docker Compose | ✅ | ✅ | High | For production |

## Signal Handling Best Practices

### 1. Understand Process Groups

When you run a command in a terminal:
- All processes in the foreground job share a **process group ID (PGID)**
- Ctrl-C sends SIGINT to the entire process group
- Children receive signals from the OS, not forwarded by parents

### 2. Don't Manually Forward Signals (Usually)

**Bad:**
```javascript
process.on('SIGINT', () => {
  child.kill('SIGINT'); // Child already got it from OS!
});
```

**Good:**
```javascript
process.on('SIGINT', () => {
  // Just wait for child to exit naturally
  // It already received SIGINT from the OS
});
```

### 3. Use Proper Exit Codes

When exiting due to signals:
- `SIGINT` (Ctrl-C): Exit with code **130** (128 + 2)
- `SIGTERM`: Exit with code **143** (128 + 15)
- `SIGKILL`: Exit with code **137** (128 + 9)

### 4. Implement Force-Kill Timeout

Always add a timeout to prevent indefinite hangs:

```javascript
const forceKillTimeout = setTimeout(() => {
  console.log('Forcing shutdown after 10 seconds');
  child.kill('SIGKILL'); // -9 can't be caught
}, 10000);
```

## Testing Signal Handling

**Manual test:**
```bash
# Start the emulators
npm run dev:emu:clean

# Press Ctrl-C once
# Should see:
# - "Received SIGINT" message
# - Clean emulator shutdown
# - Data exported successfully
# - No "Received SIGINT 2 times" message
```

**Check for orphaned processes:**
```bash
# After shutdown, verify no orphans
pgrep -f 'java.*firestore'  # Should return nothing

# Check ports are free
lsof -i :8080  # Firestore port
lsof -i :9099  # Auth port
```

## References

- [concurrently issue #283: SIGINT sent twice](https://github.com/open-cli-tools/concurrently/issues/283)
- [Firebase issue #3034: No graceful exit with npm scripts](https://github.com/firebase/firebase-tools/issues/3034)
- [Firebase issue #3578: Revisit emulator shutdown behavior](https://github.com/firebase/firebase-tools/issues/3578)
- [npm issue #1591: NPM Scripts double SIGINT](https://github.com/npm/cli/issues/1591)
- [Baeldung: SIGINT Propagation Between Processes](https://www.baeldung.com/linux/signal-propagation)
- [Linux Bash: Forward signals to child processes](https://www.linuxbash.sh/post/forward-signals-to-child-processes-using-trap-and-kill--term-)

## Migration Guide

### From concurrently to Custom Runner

**Before:**
```json
{
  "dev:emu": "concurrently -n firebase,frontend \"npm run dev:emulators\" \"vite\""
}
```

**After:**
```json
{
  "dev:emu:clean": "node scripts/run-dev-parallel.js"
}
```

**Update environment variables in `run-dev-parallel.js`:**
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
];
```

**No changes needed to:**
- `scripts/dev-emulators.sh` - still handles cleanup
- Firebase configuration
- Environment variables

**Test the migration:**
```bash
# Should work identically, but with clean shutdown
npm run dev:emu:clean

# Press Ctrl-C once
# Verify: Single SIGINT, clean export, no orphans
```
