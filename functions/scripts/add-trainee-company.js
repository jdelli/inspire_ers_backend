/**
 * Script to add a Trainee Company to Firestore
 * Run with: node scripts/add-trainee-company.js
 * (Run from backend/functions directory)
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');

try {
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  console.log('✓ Firebase Admin initialized');
} catch (error) {
  console.error('Error initializing Firebase Admin:', error.message);
  console.log('Make sure serviceAccountKey.json exists in backend/functions/');
  process.exit(1);
}

const db = admin.firestore();

async function addTraineeCompany() {
  try {
    const traineeCompanyData = {
      name: 'Trainee Company',
      description: 'Company for managing trainee employees and their training programs',
      industry: 'Training & Development',
      location: 'Philippines',
      contactEmail: 'trainees@inspire.com',
      contactPhone: '',
      website: '',
      address: '',
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    console.log('Creating trainee company...');
    const docRef = await db.collection('companies').add(traineeCompanyData);

    console.log('✓ Trainee company created successfully!');
    console.log('Company ID:', docRef.id);
    console.log('Company Name:', traineeCompanyData.name);

    // Verify the company was created
    const doc = await docRef.get();
    if (doc.exists) {
      console.log('\n✓ Verified: Company exists in Firestore');
      console.log('Data:', { id: doc.id, ...doc.data() });
    }

    process.exit(0);
  } catch (error) {
    console.error('Error adding trainee company:', error);
    process.exit(1);
  }
}

// Run the function
addTraineeCompany();
