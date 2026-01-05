const admin = require('firebase-admin');

// Connect to emulator
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';

const app = admin.initializeApp({ projectId: 'audio-transcript-app-dev' });
const db = admin.firestore();

const userId = 'wfodUGTqYzk7vGSFASXx0ffOKB1y';

async function makeAdmin() {
  const userRef = db.collection('users').doc(userId);
  const doc = await userRef.get();

  if (doc.exists) {
    await userRef.update({ isAdmin: true });
    console.log(`✅ Updated existing user ${userId} to admin`);
  } else {
    await userRef.set({
      uid: userId,
      email: 'sam@wachtel.us',
      displayName: 'Sam',
      isAdmin: true,
      createdAt: new Date()
    });
    console.log(`✅ Created user ${userId} as admin`);
  }

  // Verify
  const updated = await userRef.get();
  console.log('User document:', updated.data());
  process.exit(0);
}

makeAdmin().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
