const admin = require('firebase-admin');
const path = require('path');

if (!admin.apps.length) {
  try {
    // Try to load service account from environment variable or file
    let serviceAccount;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      // If JSON string is provided in environment variable
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      // Support separate env vars (Render-friendly). Ensure newlines in private key.
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
      serviceAccount = {
        project_id: projectId,
        client_email: clientEmail,
        private_key: privateKey,
      };
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
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID,
      });
      console.log('✅ Firebase Admin SDK initialized with service account');
    } else {
      // As a last resort, attempt application default with explicit projectId
      const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId,
      });
      console.log('✅ Firebase Admin SDK initialized with application default credentials');
    }
  } catch (error) {
    console.error('❌ Firebase initialization error:', error.message);
    throw error;
  }
}

module.exports = admin;
