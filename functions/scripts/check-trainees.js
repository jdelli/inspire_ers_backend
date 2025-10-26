/**
 * Script to check all training records in the database
 * Run with: node scripts/check-trainees.js
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');

try {
  const serviceAccount = require(serviceAccountPath);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }

  console.log('✓ Firebase Admin initialized\n');
} catch (error) {
  console.error('Error initializing Firebase Admin:', error.message);
  process.exit(1);
}

const db = admin.firestore();

async function checkTrainees() {
  try {
    // Get all companies
    console.log('=== COMPANIES ===\n');
    const companiesSnapshot = await db.collection('companies').get();
    const companies = {};

    companiesSnapshot.docs.forEach(doc => {
      const data = doc.data();
      companies[doc.id] = data.name;
      console.log(`Company ID: ${doc.id}`);
      console.log(`  Name: ${data.name}`);
      console.log(`  Status: ${data.status}\n`);
    });

    // Get all training records
    console.log('\n=== TRAINING RECORDS ===\n');
    const traineesSnapshot = await db.collection('trainingRecords').get();

    console.log(`Total training records: ${traineesSnapshot.docs.length}\n`);

    // Group by companyId
    const byCompany = {};

    traineesSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const companyId = data.companyId || 'no-company';

      if (!byCompany[companyId]) {
        byCompany[companyId] = [];
      }

      byCompany[companyId].push({
        id: doc.id,
        name: data.employeeName,
        type: data.traineeType,
        status: data.status,
        department: data.department
      });
    });

    // Display by company
    Object.keys(byCompany).forEach(companyId => {
      const companyName = companies[companyId] || 'Unknown Company';
      console.log(`\n--- ${companyName} (${companyId}) ---`);
      console.log(`Trainees: ${byCompany[companyId].length}\n`);

      byCompany[companyId].forEach(trainee => {
        console.log(`  • ${trainee.name}`);
        console.log(`    ID: ${trainee.id}`);
        console.log(`    Type: ${trainee.type} | Status: ${trainee.status} | Dept: ${trainee.department}\n`);
      });
    });

    // Check for the specific trainee company
    console.log('\n=== TRAINEE COMPANY CHECK ===\n');
    const traineeCompanySnapshot = await db.collection('companies')
      .where('name', '==', 'Trainee Company')
      .get();

    if (!traineeCompanySnapshot.empty) {
      const traineeCompanyDoc = traineeCompanySnapshot.docs[0];
      const traineeCompanyId = traineeCompanyDoc.id;
      console.log(`Trainee Company ID: ${traineeCompanyId}`);

      const traineeCompanyRecords = await db.collection('trainingRecords')
        .where('companyId', '==', traineeCompanyId)
        .get();

      console.log(`Records with this companyId: ${traineeCompanyRecords.docs.length}\n`);

      traineeCompanyRecords.docs.forEach(doc => {
        const data = doc.data();
        console.log(`  • ${data.employeeName} (${doc.id})`);
      });
    } else {
      console.log('⚠ Trainee Company not found!');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkTrainees();
