/**
 * Test script to manually create an activity log
 * Run this with: node test-activity-log.js
 */

const admin = require('firebase-admin');
const { recordActivity } = require('./src/services/activityLogService');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function testActivityLog() {
  console.log('🧪 Testing activity log creation...');

  try {
    await recordActivity({
      module: 'hr',
      action: 'EMPLOYEE_RECORD_UPDATED',
      companyId: 'denmark-company',
      entityType: 'employee',
      entityId: 'test-employee-123',
      summary: 'Test activity log - Manual creation',
      metadata: {
        collection: 'employees',
        updatedFields: ['firstName', 'lastName'],
        documentId: 'test-employee-123',
        testRun: true
      },
      context: {
        user: {
          uid: 'sLibQmHY9NQlFfztMHzVNi8VKf53',
          email: 'kenSuson@gmail.com',
          specialrole: 'superadmin'
        },
        request: {
          requestId: 'test-request-' + Date.now(),
          ipAddress: '127.0.0.1',
          forwardedFor: [],
          userAgent: 'Test Script'
        }
      }
    });

    console.log('✅ Activity log created successfully!');
    console.log('🔍 Check Firestore collections:');
    console.log('   - activityLogs (global)');
    console.log('   - companies/denmark-company/activityLogs');
    console.log('   - users/sLibQmHY9NQlFfztMHzVNi8VKf53/historyLogs');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating activity log:', error);
    process.exit(1);
  }
}

testActivityLog();
