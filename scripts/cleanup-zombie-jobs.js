#!/usr/bin/env node

/**
 * Cleanup zombie processing jobs in Firestore
 *
 * Finds conversations stuck in 'processing' status for longer than the threshold
 * and marks them as 'failed' so users can retry or delete them.
 *
 * Usage:
 *   # Dry run (default) - shows what would be cleaned up
 *   node scripts/cleanup-zombie-jobs.js
 *
 *   # Actually clean up the jobs
 *   node scripts/cleanup-zombie-jobs.js --execute
 *
 *   # Custom threshold (default: 65 minutes)
 *   node scripts/cleanup-zombie-jobs.js --threshold=30
 *
 * Environment:
 *   Set GOOGLE_APPLICATION_CREDENTIALS to your service account key path
 *   Or run on a machine with default GCP credentials (Cloud Shell, GCE, etc.)
 */

import admin from 'firebase-admin';

// Configuration
const DEFAULT_THRESHOLD_MINUTES = 65; // Slightly > max Cloud Function timeout (60 min)
const PROJECT_ID = 'audio-transcript-analyzer-01';

// Parse command line arguments
const args = process.argv.slice(2);
const execute = args.includes('--execute');
const thresholdArg = args.find(a => a.startsWith('--threshold='));
const thresholdMinutes = thresholdArg
  ? parseInt(thresholdArg.split('=')[1], 10)
  : DEFAULT_THRESHOLD_MINUTES;

// Initialize Firebase Admin
admin.initializeApp({
  projectId: PROJECT_ID,
  // Uses GOOGLE_APPLICATION_CREDENTIALS or default credentials
});

const db = admin.firestore();

async function findZombieJobs(thresholdMs) {
  const cutoff = new Date(Date.now() - thresholdMs);

  console.log(`\n🔍 Looking for jobs stuck in 'processing' since before ${cutoff.toISOString()}\n`);

  // Query for processing jobs
  // Note: Firestore requires an index for compound queries
  // If this fails, we'll fall back to client-side filtering
  const snapshot = await db.collection('conversations')
    .where('status', '==', 'processing')
    .get();

  const zombies = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();

    // Get the timestamp to check against
    const startedAt = data.processingStartedAt?.toDate?.()
      || data.updatedAt?.toDate?.()
      || data.createdAt?.toDate?.();

    if (!startedAt) {
      console.log(`⚠️  ${doc.id}: No timestamp found, skipping`);
      continue;
    }

    if (startedAt < cutoff) {
      zombies.push({
        id: doc.id,
        title: data.title || 'Untitled',
        userId: data.userId,
        startedAt,
        progress: data.progress,
        currentStep: data.currentStep,
        ageMinutes: Math.round((Date.now() - startedAt.getTime()) / 60000),
      });
    }
  }

  return zombies;
}

async function cleanupZombies(zombies) {
  console.log(`\n🧹 Cleaning up ${zombies.length} zombie job(s)...\n`);

  for (const zombie of zombies) {
    try {
      await db.collection('conversations').doc(zombie.id).update({
        status: 'failed',
        error: 'Processing timed out. Please delete and re-upload, or click Retry.',
        errorCode: 'ZOMBIE_TIMEOUT',
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
        zombieDetectedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastKnownProgress: zombie.progress,
        lastKnownStep: zombie.currentStep,
      });

      console.log(`✅ ${zombie.id} (${zombie.title}) - marked as failed`);
    } catch (error) {
      console.error(`❌ ${zombie.id} - failed to update: ${error.message}`);
    }
  }
}

async function main() {
  const thresholdMs = thresholdMinutes * 60 * 1000;

  console.log('═'.repeat(60));
  console.log('🧟 Zombie Job Cleanup');
  console.log('═'.repeat(60));
  console.log(`Mode: ${execute ? '🔴 EXECUTE (will modify data)' : '🟢 DRY RUN (preview only)'}`);
  console.log(`Threshold: ${thresholdMinutes} minutes`);
  console.log(`Project: ${PROJECT_ID}`);

  try {
    const zombies = await findZombieJobs(thresholdMs);

    if (zombies.length === 0) {
      console.log('\n✨ No zombie jobs found!\n');
      process.exit(0);
    }

    console.log(`\n📋 Found ${zombies.length} zombie job(s):\n`);

    for (const z of zombies) {
      console.log(`  📄 ${z.id}`);
      console.log(`     Title: ${z.title}`);
      console.log(`     User: ${z.userId}`);
      console.log(`     Age: ${z.ageMinutes} minutes`);
      console.log(`     Progress: ${z.progress}%`);
      console.log(`     Step: ${z.currentStep}`);
      console.log('');
    }

    if (execute) {
      await cleanupZombies(zombies);
      console.log('\n✅ Cleanup complete!\n');
    } else {
      console.log('─'.repeat(60));
      console.log('ℹ️  This was a dry run. To actually clean up these jobs, run:');
      console.log('   node scripts/cleanup-zombie-jobs.js --execute');
      console.log('─'.repeat(60));
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code === 'UNAUTHENTICATED' || error.code === 16) {
      console.error('\n💡 Make sure GOOGLE_APPLICATION_CREDENTIALS is set to your service account key path');
      console.error('   Or run this from Cloud Shell / a GCE instance with default credentials');
    }
    process.exit(1);
  }

  process.exit(0);
}

main();
