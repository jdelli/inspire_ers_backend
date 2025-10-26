/**
 * Script to add sample attendance records for trainees
 * Run with: node scripts/add-sample-trainee-attendance.js
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

async function addSampleAttendance() {
  try {
    // Find the Trainee Company
    const companiesSnapshot = await db.collection('companies')
      .where('name', '==', 'Trainee Company')
      .get();

    if (companiesSnapshot.empty) {
      console.error('❌ Trainee Company not found.');
      process.exit(1);
    }

    const traineeCompanyId = companiesSnapshot.docs[0].id;
    console.log('✓ Found Trainee Company ID:', traineeCompanyId);

    // Find trainees for this company
    const traineesSnapshot = await db.collection('trainingRecords')
      .where('companyId', '==', traineeCompanyId)
      .get();

    if (traineesSnapshot.empty) {
      console.error('❌ No trainees found for Trainee Company.');
      process.exit(1);
    }

    const trainees = traineesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`✓ Found ${trainees.length} trainees`);

    // Generate attendance records for the last 14 days
    const today = new Date();
    const daysToGenerate = 14;
    let totalRecordsAdded = 0;

    console.log('\nGenerating attendance records...\n');

    for (const trainee of trainees) {
      console.log(`\nProcessing trainee: ${trainee.employeeName}`);

      for (let i = 0; i < daysToGenerate; i++) {
        const recordDate = new Date(today);
        recordDate.setDate(today.getDate() - i);

        // Skip weekends
        const dayOfWeek = recordDate.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          continue;
        }

        // Format date as YYYY-MM-DD
        const dateStr = recordDate.toISOString().split('T')[0];

        // Random variations for time in/out
        const variations = [
          { timeIn: '08:55', timeOut: '17:10', status: 'Present', hoursWorked: 8 },
          { timeIn: '09:00', timeOut: '17:00', status: 'Present', hoursWorked: 8 },
          { timeIn: '09:10', timeOut: '17:05', status: 'Present', hoursWorked: 7.9 },
          { timeIn: '08:50', timeOut: '18:00', status: 'Present', hoursWorked: 9 },
        ];

        const variation = variations[Math.floor(Math.random() * variations.length)];

        const attendanceRecord = {
          traineeId: trainee.id,
          traineeName: trainee.employeeName,
          date: recordDate,
          timeIn: variation.timeIn,
          timeOut: variation.timeOut,
          hoursWorked: variation.hoursWorked,
          status: variation.status,
          companyId: traineeCompanyId,
          managerId: trainee.managerId,
          managerName: trainee.managerName,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: trainee.managerId || 'system'
        };

        await db.collection('dailyTimeRecords').add(attendanceRecord);
        totalRecordsAdded++;
      }

      console.log(`  ✓ Added attendance records for ${trainee.employeeName}`);
    }

    console.log('\n✅ Sample attendance records added successfully!');
    console.log(`Total records added: ${totalRecordsAdded}`);
    console.log(`Trainees: ${trainees.length}`);

    process.exit(0);
  } catch (error) {
    console.error('Error adding sample attendance:', error);
    process.exit(1);
  }
}

// Run the function
addSampleAttendance();
