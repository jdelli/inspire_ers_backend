/**
 * Test script for Multi-Firebase Employee Sync API Endpoints
 * Verifies the functionality of the /api/employees/sync routes.
 *
 * To run this script:
 * 1. Ensure your backend server is running (e.g., `npm run dev` or `npm start` in backend/functions).
 * 2. Optionally, set a TEST_AUTH_TOKEN environment variable with a valid JWT.
 *    If not set, a placeholder will be used and authentication will likely fail if required.
 * 3. Run: `node backend/functions/test-api-endpoints.js`
 */

require('dotenv').config({ path: '.env' }); // Load .env file for backend functions

const API_BASE_URL = 'http://localhost:5001/inspire-ers/us-central1/api/employees/sync';
// Replace with a valid JWT token for a test user if authentication is enabled
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN || 'YOUR_TEST_JWT_TOKEN_HERE'; 

async function runApiTests() {
  console.log('🚀 Running Employee Sync API Tests...\n');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${AUTH_TOKEN}`
  };

  // Helper for consistent API calls
  async function testEndpoint(name, url, method = 'GET', body = null, expectedStatus = 200) {
    console.log(`--- Testing ${name} (${method} ${url}) ---`);
    try {
      const options = { method, headers };
      if (body) {
        options.body = JSON.stringify(body);
      }
      
      const response = await fetch(url, options);
      const data = await response.json().catch(() => ({ message: response.statusText || 'Non-JSON response' }));

      if (response.status === expectedStatus) {
        console.log(`✅ Success: ${name} responded with status ${response.status}`);
        console.log('Response data:', data);
        return { success: true, data };
      } else {
        console.error(`❌ Failed: ${name} expected status ${expectedStatus}, got ${response.status}`);
        console.error('Error data:', data);
        return { success: false, data, status: response.status };
      }
    } catch (error) {
      console.error(`❌ Error during ${name} test:`, error.message);
      return { success: false, error: error.message };
    } finally {
      console.log('\n');
    }
  }

  // Test 1: GET /merged
  await testEndpoint(
    'Get Merged Employees',
    `${API_BASE_URL}/merged?filters.companyId=test-company-id&useCache=false`,
    'GET'
  );

  // Test 2: GET /primary
  await testEndpoint(
    'Get Primary Employees',
    `${API_BASE_URL}/primary?filters.companyId=test-company-id&useCache=false`,
    'GET'
  );

  // Test 3: GET /status
  await testEndpoint(
    'Get Connection Status',
    `${API_BASE_URL}/status`,
    'GET'
  );

  // Test 4: GET /test-connection
  await testEndpoint(
    'Test Secondary Connection',
    `${API_BASE_URL}/test-connection`,
    'GET'
  );

  // Test 5: POST /refresh/all
  await testEndpoint(
    'Refresh All Cache',
    `${API_BASE_URL}/refresh/all`,
    'POST'
  );

  // Test 6: POST /refresh/primary
  await testEndpoint(
    'Refresh Primary Cache',
    `${API_BASE_URL}/refresh/primary`,
    'POST'
  );

  // Test 7: GET /secondary (assuming secondary is enabled and configured)
  await testEndpoint(
    'Get Secondary Employees (Optional)',
    `${API_BASE_URL}/secondary?filters.companyId=test-secondary-company-id&useCache=false`,
    'GET'
  );

  console.log('✅ All API tests completed.');
}

runApiTests();
