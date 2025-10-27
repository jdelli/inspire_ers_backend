/**
 * Firebase Admin SDK Initialization
 * Supports both local development (serviceAccountKey.json) and production (env vars)
 */

const admin = require('firebase-admin');

let firebaseInitialized = false;

function initializeFirebaseAdmin() {
  if (firebaseInitialized) {
    return admin;
  }

  try {
    // Production: Use environment variables
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      console.log('Initializing Firebase Admin with environment variables...');
      
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          // Render escapes newlines, so we need to replace \\n with actual newlines
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
      
      firebaseInitialized = true;
      console.log('✅ Firebase Admin initialized from environment variables');
      return admin;
    }

    // Local development: Use serviceAccountKey.json
    try {
      const serviceAccount = require('../../serviceAccountKey.json');
      console.log('Initializing Firebase Admin with service account file...');
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      
      firebaseInitialized = true;
      console.log('✅ Firebase Admin initialized from serviceAccountKey.json');
      return admin;
    } catch (fileError) {
      throw new Error(
        'Firebase Admin initialization failed. ' +
        'Either provide FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY as environment variables, ' +
        'or ensure serviceAccountKey.json exists in the project root.'
      );
    }
  } catch (error) {
    console.error('❌ Firebase Admin initialization error:', error.message);
    throw error;
  }
}

module.exports = initializeFirebaseAdmin;
