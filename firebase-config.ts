import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, GoogleAuthProvider } from 'firebase/auth';

/**
 * Firebase Configuration
 *
 * Initializes Firebase services for authentication. Config values are loaded
 * from environment variables (VITE_ prefix required for Vite to expose them).
 *
 * Make sure you've created a Firebase project and enabled Google Sign-In at:
 * console.firebase.google.com -> Authentication -> Sign-in method
 */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Validate configuration before initializing
const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID'
];

const missingVars = requiredEnvVars.filter(key => !import.meta.env[key]);
if (missingVars.length > 0) {
  console.warn(
    `Missing Firebase environment variables: ${missingVars.join(', ')}\n` +
    `Authentication will not work until these are configured in .env`
  );
}

// Initialize Firebase
export const app: FirebaseApp = initializeApp(firebaseConfig);

// Initialize Auth service
export const auth: Auth = getAuth(app);

// Configure Google Auth Provider
export const googleProvider = new GoogleAuthProvider();

// Request specific user data scopes
googleProvider.addScope('profile');
googleProvider.addScope('email');

// Optional: Force account selection every time (useful during development)
// googleProvider.setCustomParameters({
//   prompt: 'select_account'
// });
