#!/usr/bin/env node
/**
 * Custom parallel process runner with proper signal handling
 *
 * Solves the double-SIGINT problem that concurrently has with Firebase emulators.
 * When Ctrl-C is pressed, terminal sends SIGINT to the entire process group.
 * This script ensures children receive the signal naturally from the OS without
 * re-forwarding it, preventing the "Received SIGINT 2 times" dirty shutdown.
 *
 * Reference: https://github.com/open-cli-tools/concurrently/issues/283
 */

import { spawn } from 'child_process';
import process from 'process';

const COLORS = {
  reset: '\x1b[0m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

const processes = [
  {
    name: 'firebase',
    command: 'npm',
    args: ['run', 'dev:emulators'],
    color: COLORS.yellow,
    cwd: process.cwd(),
  },
  {
    name: 'frontend',
    command: 'npm',
    args: ['run', 'dev'],
    color: COLORS.green,
    cwd: process.cwd(),
    env: { ...process.env, VITE_USE_FIREBASE_EMULATORS: 'true' },
  },
];

const runningProcesses = new Map();
let isShuttingDown = false;

function log(name, color, message) {
  const prefix = `[${name}]`;
  const coloredPrefix = `${color}${prefix}${COLORS.reset}`;
  console.log(`${coloredPrefix} ${message}`);
}

function startProcess({ name, command, args, color, cwd, env = process.env }) {
  log(name, color, `Starting: ${command} ${args.join(' ')}`);

  const child = spawn(command, args, {
    cwd,
    env,
    stdio: 'pipe', // Capture output for prefixing
    // CRITICAL: Don't detach, but also don't forward signals manually
    // Let the OS send signals to the entire process group naturally
  });

  runningProcesses.set(name, child);

  // Prefix all output with process name
  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => log(name, color, line));
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => log(name, COLORS.red, line));
  });

  child.on('exit', (code, signal) => {
    runningProcesses.delete(name);

    if (signal) {
      log(name, color, `Exited with signal: ${signal}`);
    } else {
      log(name, color, `Exited with code: ${code}`);
    }

    // If not shutting down gracefully and process crashed, kill everything
    if (!isShuttingDown && code !== 0 && code !== null) {
      log(name, COLORS.red, 'Process crashed, shutting down all processes...');
      shutdown(1);
    }

    // If all processes have exited during shutdown, exit main process
    if (isShuttingDown && runningProcesses.size === 0) {
      process.exit(0);
    }
  });

  child.on('error', (err) => {
    log(name, COLORS.red, `Error: ${err.message}`);
  });

  return child;
}

function shutdown(exitCode = 0) {
  if (isShuttingDown) {
    return; // Already shutting down
  }

  isShuttingDown = true;
  console.log('\n🛑 Shutting down all processes...\n');

  if (runningProcesses.size === 0) {
    process.exit(exitCode);
  }

  // Don't send signals manually - children already received SIGINT from OS
  // Just wait for them to exit gracefully
  // If they don't exit within 10 seconds, force kill them
  const forceKillTimeout = setTimeout(() => {
    console.log('\n⚠️  Processes did not exit gracefully, forcing shutdown...\n');
    runningProcesses.forEach((child, name) => {
      log(name, COLORS.red, 'Forcing kill with SIGKILL');
      child.kill('SIGKILL');
    });
    process.exit(1);
  }, 10000);

  // Clear timeout if all processes exit naturally
  const checkInterval = setInterval(() => {
    if (runningProcesses.size === 0) {
      clearTimeout(forceKillTimeout);
      clearInterval(checkInterval);
      process.exit(exitCode);
    }
  }, 100);
}

// Handle Ctrl-C
// CRITICAL: Don't forward signals to children - they receive it from OS already
process.on('SIGINT', () => {
  console.log('\n📥 Received SIGINT (Ctrl-C), waiting for graceful shutdown...');
  console.log('    (Children receive signal from OS, not forwarded manually)');
  shutdown(130); // Standard exit code for SIGINT
});

process.on('SIGTERM', () => {
  console.log('\n📥 Received SIGTERM, waiting for graceful shutdown...');
  shutdown(143); // Standard exit code for SIGTERM
});

// Start all processes
console.log('🚀 Starting parallel processes...\n');
processes.forEach(startProcess);
