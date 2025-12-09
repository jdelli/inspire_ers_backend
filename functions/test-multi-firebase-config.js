/**
 * Test script for Multi-Firebase Configuration
 * Run with: node test-multi-firebase-config.js
 */

require('dotenv').config();
const multiFirebaseConfig = require('./src/config/multiFirebaseConfig');

console.log('=== Multi-Firebase Configuration Test ===\n');

// Test validation of all configs
console.log('1. Validating all configurations...');
const validationResult = multiFirebaseConfig.validateAllConfigs();
console.log('\nValidation Result:', JSON.stringify(validationResult, null, 2));

// Test primary config
console.log('\n2. Testing getPrimaryConfig()...');
const primaryConfig = multiFirebaseConfig.getPrimaryConfig();
if (primaryConfig) {
  console.log('✅ Primary config retrieved successfully');
  console.log('   Project ID:', primaryConfig.projectId);
  console.log('   Client Email:', primaryConfig.clientEmail);
  console.log('   Private Key:', primaryConfig.privateKey ? '(present)' : '(missing)');
  console.log('   Database URL:', primaryConfig.databaseURL || '(not set)');
} else {
  console.log('❌ Primary config is null or invalid');
}

// Test secondary config
console.log('\n3. Testing getSecondaryConfig()...');
const secondaryConfig = multiFirebaseConfig.getSecondaryConfig();
if (secondaryConfig) {
  console.log('✅ Secondary config retrieved successfully');
  console.log('   Project ID:', secondaryConfig.projectId);
  console.log('   Client Email:', secondaryConfig.clientEmail);
  console.log('   Private Key:', secondaryConfig.privateKey ? '(present)' : '(missing)');
  console.log('   Database URL:', secondaryConfig.databaseURL || '(not set)');
} else {
  console.log('ℹ️ Secondary config is not configured (this is optional)');
}

// Test isSecondaryEnabled
console.log('\n4. Testing isSecondaryEnabled()...');
const isEnabled = multiFirebaseConfig.isSecondaryEnabled();
console.log('Secondary Firebase enabled:', isEnabled);

console.log('\n=== Test Complete ===');
