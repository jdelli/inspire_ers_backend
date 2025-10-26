/**
 * Script to add sample trainees to the Trainee Company
 * Run with: node scripts/add-sample-trainees.js
 * (Run from backend/functions directory)
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

  console.log('✓ Firebase Admin initialized');
} catch (error) {
  console.error('Error initializing Firebase Admin:', error.message);
  console.log('Make sure serviceAccountKey.json exists in backend/functions/');
  process.exit(1);
}

const db = admin.firestore();

async function addSampleTrainees() {
  try {
    // First, find the Trainee Company
    const companiesSnapshot = await db.collection('companies')
      .where('name', '==', 'Trainee Company')
      .get();

    if (companiesSnapshot.empty) {
      console.error('❌ Trainee Company not found. Please create it first.');
      process.exit(1);
    }

    const traineeCompany = companiesSnapshot.docs[0];
    const traineeCompanyId = traineeCompany.id;
    const traineeCompanyData = traineeCompany.data();

    console.log('✓ Found Trainee Company:', traineeCompanyData.name);
    console.log('Company ID:', traineeCompanyId);

    // Get the first admin/manager user as managerId
    const usersSnapshot = await db.collection('users')
      .where('role', 'in', ['admin', 'manager', 'administrator'])
      .limit(1)
      .get();

    let managerId = 'default-manager';
    let managerName = 'System Manager';

    if (!usersSnapshot.empty) {
      const managerDoc = usersSnapshot.docs[0];
      managerId = managerDoc.id;
      managerName = managerDoc.data().name || managerDoc.data().email;
      console.log('✓ Using manager:', managerName, '(', managerId, ')');
    } else {
      console.log('⚠ No manager found, using default values');
    }

    // Sample trainees to add
    const sampleTrainees = [
      {
        firstName: 'John',
        middleName: 'Michael',
        lastName: 'Doe',
        employeeId: 'TRN-001',
        employeeName: 'John Michael Doe',
        emailAddress: 'john.doe@trainee.example.com',
        birthday: '2000-05-15',
        age: 24,
        department: 'IT',
        position: 'Software Development Trainee',
        traineeType: 'OJT',
        startDate: '2025-01-01',
        endDate: '2025-06-30',
        duration: '6 months',
        timeIn: '09:00',
        timeOut: '17:00',
        allowance: 5000,
        location: 'Main Office',
        status: 'Ongoing',
        certificate: 'In Progress',
        contactNumber: '09123456789',
        permanentAddress: '123 Main St, City',
        currentAddress: '123 Main St, City'
      },
      {
        firstName: 'Jane',
        middleName: 'Anne',
        lastName: 'Smith',
        employeeId: 'TRN-002',
        employeeName: 'Jane Anne Smith',
        emailAddress: 'jane.smith@trainee.example.com',
        birthday: '2001-08-22',
        age: 23,
        department: 'Marketing',
        position: 'Digital Marketing Trainee',
        traineeType: 'Internship',
        startDate: '2025-02-01',
        endDate: '2025-05-31',
        duration: '4 months',
        timeIn: '09:00',
        timeOut: '17:00',
        allowance: 4500,
        location: 'Marketing Department',
        status: 'Ongoing',
        certificate: 'Not Started',
        contactNumber: '09187654321',
        permanentAddress: '456 Oak Ave, City',
        currentAddress: '456 Oak Ave, City'
      },
      {
        firstName: 'Robert',
        middleName: 'James',
        lastName: 'Wilson',
        employeeId: 'TRN-003',
        employeeName: 'Robert James Wilson',
        emailAddress: 'robert.wilson@trainee.example.com',
        birthday: '2000-11-10',
        age: 24,
        department: 'HR',
        position: 'HR Assistant Trainee',
        traineeType: 'OJT',
        startDate: '2024-12-01',
        endDate: '2025-05-31',
        duration: '6 months',
        timeIn: '08:00',
        timeOut: '16:00',
        allowance: 5500,
        location: 'HR Department',
        status: 'Ongoing',
        certificate: 'In Progress',
        contactNumber: '09198765432',
        permanentAddress: '789 Pine Rd, City',
        currentAddress: '789 Pine Rd, City'
      }
    ];

    console.log('\nAdding sample trainees...\n');

    for (const trainee of sampleTrainees) {
      const traineeData = {
        ...trainee,
        companyId: traineeCompanyId,
        managerId: managerId,
        managerName: managerName,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: managerId
      };

      const docRef = await db.collection('trainingRecords').add(traineeData);
      console.log(`✓ Added trainee: ${trainee.employeeName} (${docRef.id})`);
    }

    console.log('\n✅ All sample trainees added successfully!');
    console.log(`\nTotal trainees added: ${sampleTrainees.length}`);
    console.log(`Company: ${traineeCompanyData.name} (${traineeCompanyId})`);

    process.exit(0);
  } catch (error) {
    console.error('Error adding sample trainees:', error);
    process.exit(1);
  }
}

// Run the function
addSampleTrainees();
