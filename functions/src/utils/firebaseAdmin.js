const admin = require('firebase-admin');
const path = require('path');

if (!admin.apps.length) {
  try {
    // Try to load service account from environment variable or file
    let serviceAccount;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      // If JSON string is provided in environment variable
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // If path to credentials file is provided
      serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    } else {
      // Try local service account file (for development)
      const localPath = path.join(__dirname, '../../serviceAccountKey.json');
      try {
        serviceAccount = require(localPath);
      } catch (e) {
        // No local file, try default credentials
        serviceAccount = undefined;
      }
    }

    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('✅ Firebase Admin SDK initialized with service account');
    } else {
      admin.initializeApp();
      console.log('✅ Firebase Admin SDK initialized with default credentials');
    }
  } catch (error) {
    console.error('❌ Firebase initialization error:', error.message);
    throw error;
  }
}

module.exports = admin;
