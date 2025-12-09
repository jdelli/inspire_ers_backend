/**
 * Test script for EmployeeSyncService
 * Tests basic functionality of employee data fetching and merging
 */

const { getInstance } = require('./src/services/multiFirebaseService');
const EmployeeSyncService = require('./src/services/employeeSyncService');

async function testEmployeeSyncService() {
  console.log('🧪 Testing EmployeeSyncService...\n');

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

    // Test 1: Fetch employees from primary project
    console.log('3️⃣ Test: Fetch employees from primary project...');
    try {
      const primaryEmployees = await employeeSync.fetchEmployees('primary', { limit: 5 });
      console.log(`✅ Fetched ${primaryEmployees.length} employees from primary`);
      
      if (primaryEmployees.length > 0) {
        console.log('Sample employee:', {
          id: primaryEmployees[0].id,
          name: primaryEmployees[0].name,
          _source: primaryEmployees[0]._source,
          _sourceProject: primaryEmployees[0]._sourceProject,
          _syncStatus: primaryEmployees[0]._syncStatus
        });
      }
      console.log('');
    } catch (error) {
      console.error('❌ Error fetching from primary:', error.message);
      console.log('');
    }

    // Test 2: Fetch employees from secondary project (if available)
    if (multiFirebase.isProjectAvailable('secondary')) {
      console.log('4️⃣ Test: Fetch employees from secondary project...');
      try {
        const secondaryEmployees = await employeeSync.fetchEmployees('secondary', { limit: 5 });
        console.log(`✅ Fetched ${secondaryEmployees.length} employees from secondary`);
        
        if (secondaryEmployees.length > 0) {
          console.log('Sample employee:', {
            id: secondaryEmployees[0].id,
            name: secondaryEmployees[0].name,
            _source: secondaryEmployees[0]._source,
            _sourceProject: secondaryEmployees[0]._sourceProject,
            _syncStatus: secondaryEmployees[0]._syncStatus
          });
        }
        console.log('');
      } catch (error) {
        console.error('❌ Error fetching from secondary:', error.message);
        console.log('');
      }
    } else {
      console.log('4️⃣ Secondary Firebase not available, skipping test\n');
    }

    // Test 3: Fetch merged employees
    console.log('5️⃣ Test: Fetch merged employees from all sources...');
    try {
      const mergedResult = await employeeSync.fetchMergedEmployees({
        source: 'all',
        filters: { limit: 10 }
      });
      
      console.log('✅ Merged employees fetched successfully');
      console.log('Metadata:', {
        totalCount: mergedResult.metadata.totalCount,
        primaryCount: mergedResult.metadata.primaryCount,
        secondaryCount: mergedResult.metadata.secondaryCount,
        source: mergedResult.metadata.source,
        errors: mergedResult.metadata.errors
      });
      console.log('');
    } catch (error) {
      console.error('❌ Error fetching merged employees:', error.message);
      console.log('');
    }

    // Test 4: Test cache functionality
    console.log('6️⃣ Test: Cache functionality...');
    try {
      // First fetch (should hit database)
      console.log('First fetch (cache miss expected)...');
      await employeeSync.fetchEmployees('primary', { limit: 5 }, true);
      
      // Second fetch (should hit cache)
      console.log('Second fetch (cache hit expected)...');
      await employeeSync.fetchEmployees('primary', { limit: 5 }, true);
      
      // Get cache stats
      const cacheStats = employeeSync.getCacheStats();
      console.log('✅ Cache stats:', cacheStats);
      console.log('');
    } catch (error) {
      console.error('❌ Error testing cache:', error.message);
      console.log('');
    }

    // Test 5: Clear cache
    console.log('7️⃣ Test: Clear cache...');
    employeeSync.clearCache('primary');
    const statsAfterClear = employeeSync.getCacheStats();
    console.log('✅ Cache cleared. Stats after clear:', statsAfterClear);
    console.log('');

    // Test 6: Test with filters
    console.log('8️⃣ Test: Fetch with filters...');
    try {
      const filteredEmployees = await employeeSync.fetchEmployees('primary', {
        status: 'active',
        limit: 3
      });
      console.log(`✅ Fetched ${filteredEmployees.length} active employees`);
      console.log('');
    } catch (error) {
      console.error('❌ Error fetching with filters:', error.message);
      console.log('');
    }

    // Test 7: Test error handling with invalid project key
    console.log('9️⃣ Test: Error handling with invalid project key...');
    try {
      await employeeSync.fetchEmployees('invalid', {});
      console.error('❌ Should have thrown error for invalid project key');
    } catch (error) {
      console.log('✅ Correctly threw error:', error.message);
      console.log('');
    }

    console.log('✅ All tests completed!\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
testEmployeeSyncService()
  .then(() => {
    console.log('✅ Test script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test script failed:', error);
    process.exit(1);
  });
