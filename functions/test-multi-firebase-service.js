/**
 * Test script for MultiFirebaseService
 * Tests initialization, connection, and basic operations
 */

const { getInstance } = require('./src/services/multiFirebaseService');

async function testMultiFirebaseService() {
  console.log('='.repeat(60));
  console.log('Testing MultiFirebaseService');
  console.log('='.repeat(60));

  try {
    // Get singleton instance
    console.log('\n1. Getting MultiFirebaseService instance...');
    const service = getInstance();
    console.log('✅ Instance created');

    // Initialize the service
    console.log('\n2. Initializing MultiFirebaseService...');
    await service.initialize();
    console.log('✅ Service initialized');

    // Check available projects
    console.log('\n3. Checking available projects...');
    const availableProjects = service.getAvailableProjects();
    console.log('Available projects:', availableProjects);

    // Test primary Firebase
    console.log('\n4. Testing primary Firebase connection...');
    if (service.isProjectAvailable('primary')) {
      const primaryDb = service.getFirestore('primary');
      console.log('✅ Primary Firestore instance obtained');
      
      const primaryAuth = service.getAuth('primary');
      console.log('✅ Primary Auth instance obtained');
      
      const primaryHealthy = await service.healthCheck('primary');
      console.log(`Primary health check: ${primaryHealthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);
    } else {
      console.log('❌ Primary Firebase not available');
    }

    // Test secondary Firebase
    console.log('\n5. Testing secondary Firebase connection...');
    if (service.isProjectAvailable('secondary')) {
      const secondaryDb = service.getFirestore('secondary');
      console.log('✅ Secondary Firestore instance obtained');
      
      const secondaryAuth = service.getAuth('secondary');
      console.log('✅ Secondary Auth instance obtained');
      
      const secondaryHealthy = await service.healthCheck('secondary');
      console.log(`Secondary health check: ${secondaryHealthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);
    } else {
      console.log('ℹ️ Secondary Firebase not configured (this is optional)');
    }

    // Get all connection status
    console.log('\n6. Getting connection status for all projects...');
    const allStatus = service.getAllConnectionStatus();
    console.log('Connection Status:');
    console.log(JSON.stringify(allStatus, null, 2));

    // Test error handling
    console.log('\n7. Testing error handling...');
    try {
      service.getFirestore('invalid');
      console.log('❌ Should have thrown error for invalid project key');
    } catch (error) {
      console.log('✅ Correctly threw error for invalid project key:', error.message);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests completed successfully!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    console.error('='.repeat(60));
    process.exit(1);
  }
}

// Run the test
testMultiFirebaseService()
  .then(() => {
    console.log('\n✅ Test script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test script failed:', error);
    process.exit(1);
  });
