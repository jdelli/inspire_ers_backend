// A more complete mock for firebase-admin
jest.mock('firebase-admin', () => {
  const mockApps = new Map(); // To store mock app instances

  // Mock for Firestore methods
  const mockFirestoreInstance = {
    collection: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn(() => Promise.resolve({ docs: [], size: 0 })), // Default empty snapshot
    listCollections: jest.fn(() => Promise.resolve([])), // For healthCheck
  };

  // Mock for Auth methods
  const mockAuthInstance = {
    // Add any specific auth methods that are called
  };

  // Function to create a mock app instance
  const createMockAppInstance = () => ({
    firestore: jest.fn(() => mockFirestoreInstance),
    auth: jest.fn(() => mockAuthInstance),
    initialized: true, // Mark as initialized
  });

  return {
    initializeApp: jest.fn((options, name) => {
      const appName = name || '[DEFAULT]';
      // If an app with this name already exists and is initialized, don't create a new one.
      // This mimics firebase-admin's behavior: admin.initializeApp() can only be called once per name.
      if (mockApps.has(appName)) {
        // In a real scenario, this would throw if re-initialized with different options
        // For testing, we can just return the existing mock or throw if re-init is tested
        return mockApps.get(appName);
      }
      const app = createMockAppInstance();
      mockApps.set(appName, app);
      return app;
    }),
    app: jest.fn((name = '[DEFAULT]') => {
      // Retrieve app, throw if not found to simulate real behavior
      if (!mockApps.has(name)) {
        throw new Error(`App named ${name} does not exist.`);
      }
      return mockApps.get(name);
    }),
    credential: {
      cert: jest.fn((config) => config),
    },
    // Direct access to firestore and auth if needed, e.g., admin.firestore().Timestamp
    // For now, we only need the app instances' firestore/auth
    _mockApps: mockApps, // Expose for clearing between tests if needed
  };
});

// Original code from multiFirebaseService.test.js
const { MultiFirebaseService } = require('./multiFirebaseService');
const { getPrimaryConfig, getSecondaryConfig, isSecondaryEnabled } = require('../config/multiFirebaseConfig');

// Mock multiFirebaseConfig module
jest.mock('../config/multiFirebaseConfig', () => ({
  getPrimaryConfig: jest.fn(),
  getSecondaryConfig: jest.fn(),
  isSecondaryEnabled: jest.fn(),
}));

// Mock console.log and console.error to prevent clutter during tests
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

describe('MultiFirebaseService', () => {
  let service;

  beforeEach(() => {
    // Reset mocks before each test
    const admin = require('firebase-admin'); // Get the mocked admin
    admin.initializeApp.mockClear();
    admin.app.mockClear();
    if (admin._mockApps) admin._mockApps.clear(); // Clear the internal map for new test runs

    admin.credential.cert.mockClear();
    getPrimaryConfig.mockClear();
    getSecondaryConfig.mockClear();
    isSecondaryEnabled.mockClear();

    // Set default mock implementations for config
    getPrimaryConfig.mockReturnValue({
      projectId: 'primary-project',
      clientEmail: 'primary@example.com',
      privateKey: 'primary-key',
      databaseURL: 'primary-db-url',
    });
    getSecondaryConfig.mockReturnValue({
      projectId: 'secondary-project',
      clientEmail: 'secondary@example.com',
      privateKey: 'secondary-key',
      databaseURL: 'secondary-db-url',
    });
    isSecondaryEnabled.mockReturnValue(true);

    service = new MultiFirebaseService();
  });

  afterAll(() => {
    // Restore original console functions
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockConsoleWarn.mockRestore();
  });

  it('should initialize primary and secondary Firebase apps if enabled', async () => {
    await service.initialize();

    expect(getPrimaryConfig).toHaveBeenCalledTimes(1);
    expect(getSecondaryConfig).toHaveBeenCalledTimes(1);
    expect(isSecondaryEnabled).toHaveBeenCalledTimes(1);
    
    // Expect initializeApp to be called once for default (primary) and once for secondary
    expect(admin.initializeApp).toHaveBeenCalledTimes(2); 
    expect(admin.initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'primary-project' }),
      '[DEFAULT]' // Explicitly check default name
    );
    expect(admin.initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'secondary-project' }),
      'secondary-secondary-project' // Name for secondary app
    );
    expect(service.initialized).toBe(true);
    expect(service.isProjectAvailable('primary')).toBe(true);
    expect(service.isProjectAvailable('secondary')).toBe(true);
  });

  it('should only initialize primary if secondary is disabled', async () => {
    isSecondaryEnabled.mockReturnValue(false);

    await service.initialize();

    expect(admin.initializeApp).toHaveBeenCalledTimes(1);
    expect(admin.initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'primary-project' }),
      '[DEFAULT]'
    );
    expect(service.initialized).toBe(true);
    expect(service.isProjectAvailable('primary')).toBe(true);
    expect(service.isProjectAvailable('secondary')).toBe(false); // Secondary should not be available
  });

  it('should not re-initialize if already initialized', async () => {
    await service.initialize();
    admin.initializeApp.mockClear(); // Clear calls from first initialization
    
    await service.initialize(); // Call again

    expect(admin.initializeApp).not.toHaveBeenCalled(); // Should not call again
    expect(service.initialized).toBe(true);
  });

  it('should throw error if primary config is missing during initialization', async () => {
    getPrimaryConfig.mockReturnValue(null);

    // Update expected error message to match actual service error
    await expect(service.initialize()).rejects.toThrow('Failed to initialize primary Firebase: Primary Firebase configuration is invalid or missing');
    expect(service.initialized).toBe(false);
  });

  it('should get Firestore instance for primary project', async () => {
    await service.initialize();
    const firestore = service.getFirestore('primary');
    const app = admin.app('[DEFAULT]'); // Should retrieve the mocked app, default name is [DEFAULT]
    expect(app.firestore).toHaveBeenCalledTimes(1); // Verify firestore method was called on the mock app
    expect(firestore).toBeDefined();
  });

  it('should get Auth instance for secondary project', async () => {
    await service.initialize();
    const auth = service.getAuth('secondary');
    const app = admin.app('secondary-secondary-project');
    expect(app.auth).toHaveBeenCalledTimes(1);
    expect(auth).toBeDefined();
  });

  it('should throw error if getting Firestore before initialization', () => {
    expect(() => service.getFirestore('primary')).toThrow('MultiFirebaseService not initialized');
  });

  it('should throw error for invalid projectKey when getting Firestore', async () => {
    await service.initialize();
    expect(() => service.getFirestore('invalid')).toThrow('Invalid projectKey');
  });

  it('should perform a successful healthCheck for primary', async () => {
    await service.initialize();
    const isHealthy = await service.healthCheck('primary');
    expect(isHealthy).toBe(true);
    const status = service.getConnectionStatus('primary');
    expect(status.connected).toBe(true);
    expect(status.latency).toBeDefined();
    // Verify that listCollections was called on the firestore instance
    const app = admin.app('[DEFAULT]');
    expect(app.firestore().listCollections).toHaveBeenCalledTimes(1);
  });

  it('should perform a failed healthCheck if Firestore listCollections fails', async () => {
    await service.initialize();
    
    // Directly mock the listCollections for the primary app's firestore instance
    const primaryAppMock = admin.app('[DEFAULT]');
    primaryAppMock.firestore().listCollections.mockImplementationOnce(() => Promise.reject(new Error('Firestore error')));

    const isHealthy = await service.healthCheck('primary');
    expect(isHealthy).toBe(false);
    const status = service.getConnectionStatus('primary');
    expect(status.connected).toBe(false);
    expect(status.error).toContain('Firestore error');
  });

  it('should return correct connection status for all projects', async () => {
    await service.initialize();
    const allStatus = service.getAllConnectionStatus();
    expect(allStatus.primary).toBeDefined();
    expect(allStatus.primary.connected).toBe(true);
    expect(allStatus.secondary).toBeDefined();
    expect(allStatus.secondary.connected).toBe(true);
  });

  it('should identify available projects', async () => {
    await service.initialize();
    const projects = service.getAvailableProjects();
    expect(projects).toEqual(['primary', 'secondary']);
  });

  it('should indicate secondary project as unavailable if not configured', async () => {
    isSecondaryEnabled.mockReturnValue(false);
    await service.initialize();
    expect(service.isProjectAvailable('secondary')).toBe(false);
    expect(service.getConnectionStatus('secondary')).toBe(null);
  });
});
