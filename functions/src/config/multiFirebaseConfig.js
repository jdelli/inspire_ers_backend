/**
 * Multi-Firebase Configuration and Validation
 * Manages configuration for primary and secondary Firebase projects
 * Supports secure credential management via environment variables
 */

/**
 * Validates that all required environment variables are present
 * @param {Object} config - Configuration object with required fields
 * @param {string} projectType - 'primary' or 'secondary' for error messages
 * @returns {Object} Validation result with success flag and errors array
 */
function validateConfig(config, projectType) {
  const errors = [];
  const requiredFields = ['projectId', 'clientEmail', 'privateKey'];

  requiredFields.forEach(field => {
    if (!config[field] || config[field].trim() === '') {
      errors.push(`Missing or empty ${field} for ${projectType} Firebase project`);
    }
  });

  // Validate email format
  if (config.clientEmail && !config.clientEmail.includes('@')) {
    errors.push(`Invalid email format for ${projectType} Firebase client email`);
  }

  // Validate private key format
  if (config.privateKey && !config.privateKey.includes('BEGIN PRIVATE KEY')) {
    errors.push(`Invalid private key format for ${projectType} Firebase project`);
  }

  return {
    success: errors.length === 0,
    errors
  };
}

/**
 * Get primary Firebase configuration from environment variables
 * @returns {Object|null} Primary Firebase configuration or null if invalid
 */
function getPrimaryConfig() {
  const config = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
    databaseURL: process.env.FIREBASE_DATABASE_URL
  };

  const validation = validateConfig(config, 'primary');
  
  if (!validation.success) {
    console.warn('⚠️ Primary Firebase configuration validation failed:', validation.errors);
    return null;
  }

  // Normalize private key (handle escaped newlines from environment variables)
  config.privateKey = config.privateKey.replace(/\\n/g, '\n');

  return config;
}

/**
 * Get secondary Firebase configuration from environment variables
 * @returns {Object|null} Secondary Firebase configuration or null if not configured/invalid
 */
function getSecondaryConfig() {
  // Check if secondary Firebase is configured
  if (!process.env.SECONDARY_FIREBASE_PROJECT_ID) {
    return null;
  }

  const config = {
    projectId: process.env.SECONDARY_FIREBASE_PROJECT_ID,
    clientEmail: process.env.SECONDARY_FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.SECONDARY_FIREBASE_PRIVATE_KEY,
    databaseURL: process.env.SECONDARY_FIREBASE_DATABASE_URL
  };

  const validation = validateConfig(config, 'secondary');
  
  if (!validation.success) {
    console.warn('⚠️ Secondary Firebase configuration validation failed:', validation.errors);
    console.warn('⚠️ Multi-Firebase feature will be disabled');
    return null;
  }

  // Normalize private key (handle escaped newlines from environment variables)
  config.privateKey = config.privateKey.replace(/\\n/g, '\n');

  return config;
}

/**
 * Check if secondary Firebase is enabled and properly configured
 * @returns {boolean} True if secondary Firebase is configured and valid
 */
function isSecondaryEnabled() {
  const secondaryConfig = getSecondaryConfig();
  return secondaryConfig !== null;
}

/**
 * Validate all Firebase configurations on startup
 * Logs warnings for any configuration issues
 * @returns {Object} Validation summary with status for each project
 */
function validateAllConfigs() {
  const result = {
    primary: {
      configured: false,
      valid: false,
      errors: []
    },
    secondary: {
      configured: false,
      valid: false,
      errors: []
    }
  };

  // Validate primary configuration
  const primaryConfig = getPrimaryConfig();
  result.primary.configured = true;
  result.primary.valid = primaryConfig !== null;
  
  if (!result.primary.valid) {
    result.primary.errors.push('Primary Firebase configuration is invalid or missing');
    console.error('❌ Primary Firebase configuration validation failed');
  } else {
    console.log('✅ Primary Firebase configuration validated successfully');
  }

  // Validate secondary configuration (optional)
  if (process.env.SECONDARY_FIREBASE_PROJECT_ID) {
    result.secondary.configured = true;
    const secondaryConfig = getSecondaryConfig();
    result.secondary.valid = secondaryConfig !== null;
    
    if (!result.secondary.valid) {
      result.secondary.errors.push('Secondary Firebase configuration is invalid');
      console.warn('⚠️ Secondary Firebase configuration validation failed - feature will be disabled');
    } else {
      console.log('✅ Secondary Firebase configuration validated successfully');
    }
  } else {
    console.log('ℹ️ Secondary Firebase not configured (optional feature)');
  }

  return result;
}

module.exports = {
  getPrimaryConfig,
  getSecondaryConfig,
  isSecondaryEnabled,
  validateAllConfigs,
  validateConfig // Export for testing purposes
};
