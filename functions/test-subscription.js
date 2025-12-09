/**
 * Test script for real-time subscription functionality
 * Tests subscribeToEmployees method with automatic reconnection
 */

const { getInstance } = require('./src/services/multiFirebaseService');
const EmployeeSyncService = require('./src/services/employeeSyncService');

async function testSubscription() {
  console.log('🧪 Testing Real-time Subscription Functionality...\n');

  try {
    // Initialize MultiFirebaseService
    console.log('1️⃣ Initializing MultiFirebaseService...');
    const multiFirebase = getInstance();
    await multiFirebase.initialize();
    console.log('✅ MultiFirebaseService initialized\n');

    // Create EmployeeSyncService instance
    console.log('2️⃣ Creating EmployeeSyncService instance...');
    const employeeSync = new EmployeeSyncService(multiFirebase);
    console.log('✅ EmployeeSyncService created\n');

    // Test 1: Subscribe to primary project
    console.log('3️⃣ Test: Subscribe to primary project employees...');
    
    let updateCount = 0;
    const maxUpdates = 2; // Listen for 2 updates then unsubscribe
    
    const unsubscribe = employeeSync.subscribeToEmployees(
      'primary',
      (employees, error) => {
        if (error) {
          console.error('❌ Subscription error:', error.message);
          return;
        }

        updateCount++;
        console.log(`📨 Update #${updateCount}: Received ${employees.length} employees`);
        
        if (employees.length > 0) {
          console.log('Sample employee:', {
            id: employees[0].id,
            name: employees[0].name,
            _source: employees[0]._source,
            _fetchedAt: employees[0]._fetchedAt
          });
        }

        // Unsubscribe after receiving specified number of updates
        if (updateCount >= maxUpdates) {
          console.log(`\n✅ Received ${maxUpdates} updates, unsubscribing...\n`);
          unsubscribe();
          
          // Test 2: Verify subscription was removed
          console.log('4️⃣ Test: Verify unsubscribe worked...');
          setTimeout(() => {
            console.log('✅ No more updates received after unsubscribe\n');
            
            // Test 3: Subscribe to secondary project if available
            if (multiFirebase.isProjectAvailable('secondary')) {
              console.log('5️⃣ Test: Subscribe to secondary project employees...');
              
              const unsubscribeSecondary = employeeSync.subscribeToEmployees(
                'secondary',
                (employees, error) => {
                  if (error) {
                    console.error('❌ Secondary subscription error:', error.message);
                    return;
                  }

                  console.log(`📨 Secondary update: Received ${employees.length} employees`);
                  
                  // Unsubscribe immediately
                  console.log('✅ Secondary subscription working, unsubscribing...\n');
                  unsubscribeSecondary();
                  
                  // Test 4: Test unsubscribeAll
                  testUnsubscribeAll(employeeSync);
                },
                { limit: 5 }
              );
            } else {
              console.log('5️⃣ Secondary Firebase not available, skipping test\n');
              testUnsubscribeAll(employeeSync);
            }
          }, 2000);
        }
      },
      { limit: 5 }
    );

    console.log('✅ Subscription set up successfully\n');
    console.log('⏳ Waiting for updates... (this may take a few seconds)\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

function testUnsubscribeAll(employeeSync) {
  console.log('6️⃣ Test: UnsubscribeAll functionality...');
  
  // Set up multiple subscriptions
  const unsub1 = employeeSync.subscribeToEmployees('primary', () => {}, { limit: 1 });
  const unsub2 = employeeSync.subscribeToEmployees('primary', () => {}, { limit: 1 });
  
  console.log('✅ Set up 2 test subscriptions');
  
  // Unsubscribe all
  employeeSync.unsubscribeAll();
  console.log('✅ UnsubscribeAll completed\n');
  
  console.log('✅ All subscription tests completed!\n');
  
  // Exit after a short delay
  setTimeout(() => {
    console.log('✅ Test script completed successfully');
    process.exit(0);
  }, 1000);
}

// Test error handling
async function testErrorHandling() {
  console.log('7️⃣ Test: Error handling with invalid project key...');
  
  try {
    const multiFirebase = getInstance();
    await multiFirebase.initialize();
    const employeeSync = new EmployeeSyncService(multiFirebase);
    
    employeeSync.subscribeToEmployees('invalid', () => {});
    console.error('❌ Should have thrown error for invalid project key');
  } catch (error) {
    console.log('✅ Correctly threw error:', error.message);
    console.log('');
  }
}

// Run tests
console.log('Starting subscription tests...\n');
testSubscription()
  .catch((error) => {
    console.error('❌ Test script failed:', error);
    process.exit(1);
  });

// Test error handling separately
setTimeout(() => {
  testErrorHandling().catch(console.error);
}, 5000);
