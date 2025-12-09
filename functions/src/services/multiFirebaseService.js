/**
 * Multi-Firebase Service
 * Manages multiple Firebase Admin SDK instances for connecting to different Firebase projects
 * Provides unified interface for accessing Firestore and Auth from multiple projects
 */

const admin = require('firebase-admin');
const { getPrimaryConfig, getSecondaryConfig, isSecondaryEnabled } = require('../config/multiFirebaseConfig');

class MultiFirebaseService {
  constructor() {
    /**
     * Map to store Firebase app instances
     * Key: projectKey ('primary' or 'secondary')
     * Value: Firebase Admin App instance
     */
    this.apps = new Map();
    
    /**
     * Initialization status flag
     */
    this.initialized = false;
    
    /**
     * Connection status for each project
     */
    this.connectionStatus = new Map();
  }

  /**
   * Initialize Firebase apps for primary and secondary projects
   * Sets up Firebase Admin SDK instances with proper credentials
   * @returns {Promise<void>}
   * @throws {Error} If primary Firebase initialization fails
   */
  async initialize() {
    if (this.initialized) {
      console.log('ℹ️ MultiFirebaseService already initialized');
      return;
    }

    console.log('🔧 Initializing MultiFirebaseService...');

    try {
      // Initialize primary Firebase project
      await this._initializePrimary();
      
      // Initialize secondary Firebase project (optional)
      if (isSecondaryEnabled()) {
        await this._initializeSecondary();
      } else {
        console.log('ℹ️ Secondary Firebase not configured - multi-project feature disabled');
      }

      this.initialized = true;
      console.log('✅ MultiFirebaseService initialized successfully');
    } catch (error) {
      console.error('❌ MultiFirebaseService initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Initialize primary Firebase project
   * @private
   * @throws {Error} If primary configuration is invalid or initialization fails
   */
  async _initializePrimary() {
    const config = getPrimaryConfig();
    
    if (!config) {
      throw new Error('Primary Firebase configuration is invalid or missing');
    }

    try {
      // Check if default app already exists
      let app;
      try {
        app = admin.app('[DEFAULT]');
        console.log('ℹ️ Primary Firebase app already initialized, reusing existing instance');
      } catch (error) {
        // Default app doesn't exist, create it
        app = admin.initializeApp({
          credential: admin.credential.cert({
            projectId: config.projectId,
            clientEmail: config.clientEmail,
            privateKey: config.privateKey,
          }),
          databaseURL: config.databaseURL,
        });
        console.log('✅ Primary Firebase app initialized');
      }

      this.apps.set('primary', app);
      this.connectionStatus.set('primary', {
        connected: true,
        lastChecked: new Date().toISOString(),
        error: null
      });
    } catch (error) {
      this.connectionStatus.set('primary', {
        connected: false,
        lastChecked: new Date().toISOString(),
        error: error.message
      });
      throw new Error(`Failed to initialize primary Firebase: ${error.message}`);
    }
  }

  /**
   * Initialize secondary Firebase project
   * @private
   * @returns {Promise<void>}
   */
  async _initializeSecondary() {
    const config = getSecondaryConfig();
    
    if (!config) {
      console.warn('⚠️ Secondary Firebase configuration is invalid - skipping initialization');
      return;
    }

    try {
      // Create a named app for secondary Firebase project
      const appName = `secondary-${config.projectId}`;
      
      // Check if app already exists
      let app;
      try {
        app = admin.app(appName);
        console.log('ℹ️ Secondary Firebase app already initialized, reusing existing instance');
      } catch (error) {
        // App doesn't exist, create it
        app = admin.initializeApp({
          credential: admin.credential.cert({
            projectId: config.projectId,
            clientEmail: config.clientEmail,
            privateKey: config.privateKey,
          }),
          databaseURL: config.databaseURL,
        }, appName);
        console.log(`✅ Secondary Firebase app initialized (${config.projectId})`);
      }

      this.apps.set('secondary', app);
      this.connectionStatus.set('secondary', {
        connected: true,
        lastChecked: new Date().toISOString(),
        error: null
      });
    } catch (error) {
      this.connectionStatus.set('secondary', {
        connected: false,
        lastChecked: new Date().toISOString(),
        error: error.message
      });
      console.error(`❌ Failed to initialize secondary Firebase: ${error.message}`);
      // Don't throw - secondary is optional
    }
  }

  /**
   * Get Firestore instance for a specific project
   * @param {string} projectKey - 'primary' or 'secondary'
   * @returns {admin.firestore.Firestore} Firestore instance
   * @throws {Error} If project is not initialized or projectKey is invalid
   */
  getFirestore(projectKey) {
    if (!this.initialized) {
      throw new Error('MultiFirebaseService not initialized. Call initialize() first.');
    }

    if (!['primary', 'secondary'].includes(projectKey)) {
      throw new Error(`Invalid projectKey: ${projectKey}. Must be 'primary' or 'secondary'.`);
    }

    const app = this.apps.get(projectKey);
    
    if (!app) {
      throw new Error(`Firebase app for project '${projectKey}' is not initialized`);
    }

    return app.firestore();
  }

  /**
   * Get Auth instance for a specific project
   * @param {string} projectKey - 'primary' or 'secondary'
   * @returns {admin.auth.Auth} Auth instance
   * @throws {Error} If project is not initialized or projectKey is invalid
   */
  getAuth(projectKey) {
    if (!this.initialized) {
      throw new Error('MultiFirebaseService not initialized. Call initialize() first.');
    }

    if (!['primary', 'secondary'].includes(projectKey)) {
      throw new Error(`Invalid projectKey: ${projectKey}. Must be 'primary' or 'secondary'.`);
    }

    const app = this.apps.get(projectKey);
    
    if (!app) {
      throw new Error(`Firebase app for project '${projectKey}' is not initialized`);
    }

    return app.auth();
  }

  /**
   * Check if a project is connected and healthy
   * Performs a lightweight operation to verify the connection
   * @param {string} projectKey - 'primary' or 'secondary'
   * @returns {Promise<boolean>} True if connection is healthy, false otherwise
   */
  async healthCheck(projectKey) {
    if (!this.initialized) {
      console.warn('⚠️ MultiFirebaseService not initialized');
      return false;
    }

    if (!['primary', 'secondary'].includes(projectKey)) {
      console.warn(`⚠️ Invalid projectKey for health check: ${projectKey}`);
      return false;
    }

    const app = this.apps.get(projectKey);
    
    if (!app) {
      console.warn(`⚠️ Firebase app for project '${projectKey}' is not initialized`);
      this.connectionStatus.set(projectKey, {
        connected: false,
        lastChecked: new Date().toISOString(),
        error: 'App not initialized'
      });
      return false;
    }

    try {
      // Perform a lightweight Firestore operation to verify connection
      const db = app.firestore();
      const startTime = Date.now();
      
      // Try to list collections (lightweight operation)
      await db.listCollections();
      
      const latency = Date.now() - startTime;
      
      this.connectionStatus.set(projectKey, {
        connected: true,
        lastChecked: new Date().toISOString(),
        latency,
        error: null
      });
      
      console.log(`✅ Health check passed for ${projectKey} (${latency}ms)`);
      return true;
    } catch (error) {
      console.error(`❌ Health check failed for ${projectKey}:`, error.message);
      
      this.connectionStatus.set(projectKey, {
        connected: false,
        lastChecked: new Date().toISOString(),
        error: error.message
      });
      
      return false;
    }
  }

  /**
   * Get connection status for a specific project
   * @param {string} projectKey - 'primary' or 'secondary'
   * @returns {Object|null} Connection status object or null if not found
   */
  getConnectionStatus(projectKey) {
    return this.connectionStatus.get(projectKey) || null;
  }

  /**
   * Get connection status for all projects
   * @returns {Object} Object with status for all initialized projects
   */
  getAllConnectionStatus() {
    const status = {};
    
    for (const [key, value] of this.connectionStatus.entries()) {
      status[key] = value;
    }
    
    return status;
  }

  /**
   * Check if a specific project is available
   * @param {string} projectKey - 'primary' or 'secondary'
   * @returns {boolean} True if project is initialized and available
   */
  isProjectAvailable(projectKey) {
    return this.apps.has(projectKey);
  }

  /**
   * Get list of available project keys
   * @returns {string[]} Array of available project keys
   */
  getAvailableProjects() {
    return Array.from(this.apps.keys());
  }
}

// Export singleton instance
let instance = null;

/**
 * Get singleton instance of MultiFirebaseService
 * @returns {MultiFirebaseService}
 */
function getInstance() {
  if (!instance) {
    instance = new MultiFirebaseService();
  }
  return instance;
}

module.exports = {
  MultiFirebaseService,
  getInstance
};
