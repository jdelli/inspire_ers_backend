const admin = require('firebase-admin');
const { getTenantConfig } = require('../services/tenantConfigService');

// Map to store initialized apps
// Key: `${tenantId}:${serviceName}` (e.g., "company123:evaluation")
const apps = new Map();

/**
 * Builds service account credential object from environment variable name or explicit config.
 * @param {string} envVarName 
 * @param {Object} rawConfig 
 */
function buildServiceAccount(envVarName, rawConfig) {
  if (rawConfig) return rawConfig;
  
  if (envVarName && process.env[envVarName]) {
    try {
        const val = process.env[envVarName];
        // It could be a JSON string or we might need to construct it from multiple env vars
        if (val.trim().startsWith('{')) {
            return JSON.parse(val);
        }
        // If it's a file path, require it (not recommended for env vars but possible)
        // Ignoring for now to keep it safe.
    } catch (e) {
        console.error(`Failed to parse service account from env var ${envVarName}`, e);
    }
  }
  return null;
}

/**
 * Gets a Firestore instance for a specific tenant and logical service (e.g. 'evaluation').
 * @param {string} tenantId 
 * @param {string} serviceName 
 * @returns {Promise<admin.firestore.Firestore>}
 */
async function getDbForTenant(tenantId, serviceName = 'evaluation') {
  const key = `${tenantId}:${serviceName}`;

  if (apps.has(key)) {
    return apps.get(key).firestore();
  }

  // Load config
  const tenantConfig = await getTenantConfig(tenantId);
  
  // Determine config based on service name
  let serviceConfig;
  if (serviceName === 'evaluation') {
      serviceConfig = {
          projectId: tenantConfig.evalProjectId,
          databaseURL: tenantConfig.evalDatabaseURL,
          serviceAccountEnv: tenantConfig.evalServiceAccountEnv, // Name of env var
      };
  } else {
      throw new Error(`Unknown service name: ${serviceName}`);
  }

  if (!serviceConfig.projectId) {
      throw new Error(`Missing project ID for tenant ${tenantId} service ${serviceName}`);
  }

  // Check if app already exists in admin.apps (global registry)
  const existingApp = admin.apps.find(app => app.name === key);
  if (existingApp) {
      apps.set(key, existingApp);
      return existingApp.firestore();
  }

  // Initialize new app
  const credentialData = buildServiceAccount(serviceConfig.serviceAccountEnv);
  
  if (!credentialData) {
       throw new Error(`Missing credentials for tenant ${tenantId} service ${serviceName}. Check env var: ${serviceConfig.serviceAccountEnv}`);
  }

  const app = admin.initializeApp({
      credential: admin.credential.cert(credentialData),
      databaseURL: serviceConfig.databaseURL
  }, key);

  apps.set(key, app);
  return app.firestore();
}

module.exports = {
  getDbForTenant
};
