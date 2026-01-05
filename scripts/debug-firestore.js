#!/usr/bin/env node

/**
 * Debug script for querying Firestore emulator
 * Bypasses security rules using Admin SDK
 *
 * Usage:
 *   node scripts/debug-firestore.js list _metrics
 *   node scripts/debug-firestore.js get _metrics vsux1xi7PALTwxjdP2K0
 */

import admin from 'firebase-admin';

// Initialize Admin SDK pointing to emulator
admin.initializeApp({
  projectId: 'audio-transcript-analyzer-01'
});

// Point Firestore to emulator
const db = admin.firestore();
db.settings({
  host: 'localhost:8081',
  ssl: false
});

const [,, command, collection, docId] = process.argv;

async function listCollection(collectionPath) {
  const snapshot = await db.collection(collectionPath).get();
  console.log(`\n📁 Collection: ${collectionPath} (${snapshot.size} documents)\n`);

  snapshot.forEach(doc => {
    console.log(`📄 ${doc.id}`);
    console.log(JSON.stringify(doc.data(), null, 2));
    console.log('---');
  });
}

async function getDocument(collectionPath, documentId) {
  const doc = await db.collection(collectionPath).doc(documentId).get();

  if (!doc.exists) {
    console.log(`❌ Document ${documentId} not found in ${collectionPath}`);
    return;
  }

  console.log(`\n📄 Document: ${collectionPath}/${documentId}\n`);
  console.log(JSON.stringify(doc.data(), null, 2));
}

async function main() {
  try {
    if (command === 'list' && collection) {
      await listCollection(collection);
    } else if (command === 'get' && collection && docId) {
      await getDocument(collection, docId);
    } else {
      console.log(`
Usage:
  node scripts/debug-firestore.js list <collection>
  node scripts/debug-firestore.js get <collection> <docId>

Examples:
  node scripts/debug-firestore.js list _metrics
  node scripts/debug-firestore.js get _metrics vsux1xi7PALTwxjdP2K0
  node scripts/debug-firestore.js list conversations
      `);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

main();
