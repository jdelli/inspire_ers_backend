// backend/functions/src/services/employeeSyncService.test.js

const EmployeeSyncService = require('./employeeSyncService');
// We need to access the MultiFirebaseService class to create a mock instance
const { MultiFirebaseService } = require('./multiFirebaseService'); 
const { getPrimaryConfig, getSecondaryConfig, isSecondaryEnabled } = require('../config/multiFirebaseConfig');

// Mock firebase-admin and its methods for MultiFirebaseService's internal use
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(() => ({
    firestore: jest.fn(() => ({
      collection: jest.fn(() => ({
        listCollections: jest.fn(() => Promise.resolve([]))
      })),
    })),
    auth: jest.fn(() => ({})),
  })),
  app: jest.fn((name) => {
    // Return a mock object that matches the structure expected by MultiFirebaseService.getFirestore/getAuth
    return {
      firestore: jest.fn(() => ({
        collection: jest.fn(() => ({
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn(() => Promise.resolve({ docs: [], size: 0 })), // Default empty snapshot
        })),
      })),
      auth: jest.fn(() => ({})),
    };
  }),
  credential: {
    cert: jest.fn((config) => config),
  },
}));

// Mock multiFirebaseConfig for MultiFirebaseService's constructor
jest.mock('../config/multiFirebaseConfig', () => ({
    getPrimaryConfig: jest.fn(),
    getSecondaryConfig: jest.fn(),
    isSecondaryEnabled: jest.fn(),
}));

// Mock console.log and console.error to prevent clutter during tests
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

describe('EmployeeSyncService', () => {
  let employeeSyncService;
  let mockMultiFirebaseServiceInstance;
  let mockFirestore; // To control the Firestore behavior

  beforeEach(() => {
    jest.clearAllMocks(); // Clear mocks before each test
    
    // Set up mock Firestore chain for individual query methods
    mockFirestore = {
        collection: jest.fn(() => mockFirestore),
        where: jest.fn(() => mockFirestore),
        limit: jest.fn(() => mockFirestore),
        get: jest.fn(() => Promise.resolve({ docs: [], size: 0 })), // Default to empty snapshot
    };

    // Mock MultiFirebaseService instance for each test
    mockMultiFirebaseServiceInstance = {
      initialize: jest.fn(),
      initialized: true, // Assume it's initialized for EmployeeSyncService tests
      isProjectAvailable: jest.fn(() => true), // Assume projects are available by default
      getFirestore: jest.fn(() => mockFirestore),
      getAuth: jest.fn(),
      getConnectionStatus: jest.fn(),
      getAllConnectionStatus: jest.fn(),
    };

    // Set up config mocks for MultiFirebaseService creation during initialization for EmployeeSyncService test
    getPrimaryConfig.mockReturnValue({ projectId: 'primary-project' });
    getSecondaryConfig.mockReturnValue({ projectId: 'secondary-project' });
    isSecondaryEnabled.mockReturnValue(true);

    employeeSyncService = new EmployeeSyncService(mockMultiFirebaseServiceInstance);
  });

  afterAll(() => {
    // Restore original console functions
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockConsoleWarn.mockRestore();
  });

  it('should be constructed with a MultiFirebaseService instance', () => {
    expect(employeeSyncService.multiFirebase).toBe(mockMultiFirebaseServiceInstance);
  });

  it('should throw error if MultiFirebaseService is not provided', () => {
    expect(() => new EmployeeSyncService(null)).toThrow('MultiFirebaseService instance is required');
  });

  describe('fetchEmployees', () => {
    it('should fetch employees from primary project', async () => {
      const mockEmployees = [{ id: 'e1', name: 'Emp1', companyId: 'c1' }];
      mockFirestore.get.mockResolvedValueOnce({
        docs: mockEmployees.map(emp => ({ id: emp.id, data: () => emp })),
        size: mockEmployees.length,
      });

      const employees = await employeeSyncService.fetchEmployees('primary', { companyId: 'c1' });

      expect(mockMultiFirebaseServiceInstance.getFirestore).toHaveBeenCalledWith('primary');
      expect(mockFirestore.collection).toHaveBeenCalledWith('employees');
      expect(mockFirestore.where).toHaveBeenCalledWith('companyId', '==', 'c1');
      expect(employees).toHaveLength(1);
      expect(employees[0]).toMatchObject({ name: 'Emp1', _source: 'primary' });
    });

    it('should fetch employees from secondary project and normalize fields', async () => {
      const mockSecondaryEmployees = [{ id: 'se1', emp_id: 'S1', full_name: 'SecEmp1', dept: 'HR' }];
      mockFirestore.get.mockResolvedValueOnce({
        docs: mockSecondaryEmployees.map(emp => ({ id: emp.id, data: () => emp })),
        size: mockSecondaryEmployees.length,
      });

      const employees = await employeeSyncService.fetchEmployees('secondary', { companyId: 'c2' });

      expect(mockMultiFirebaseServiceInstance.getFirestore).toHaveBeenCalledWith('secondary');
      expect(employees).toHaveLength(1);
      expect(employees[0]).toMatchObject({
        id: 'se1',
        employeeId: 'S1',
        name: 'SecEmp1',
        department: 'HR',
        _source: 'secondary',
      });
    });

    it('should use cache if available and useCache is true', async () => {
      const cachedEmployees = [{ id: 'ce1', name: 'CachedEmp' }];
      employeeSyncService.cache.set('primary', { data: cachedEmployees, timestamp: Date.now() });

      const employees = await employeeSyncService.fetchEmployees('primary', {}, true);

      expect(employees).toEqual(cachedEmployees);
      expect(mockFirestore.get).not.toHaveBeenCalled(); // Should not hit Firestore
    });

    it('should refetch if cache is expired', async () => {
      const cachedEmployees = [{ id: 'ce1', name: 'ExpiredCachedEmp' }];
      employeeSyncService.cache.set('primary', { data: cachedEmployees, timestamp: Date.now() - (employeeSyncService.cacheExpiry + 1000) });

      const freshEmployees = [{ id: 'fe1', name: 'FreshEmp' }];
      mockFirestore.get.mockResolvedValueOnce({
        docs: freshEmployees.map(emp => ({ id: emp.id, data: () => emp })),
        size: freshEmployees.length,
      });

      const employees = await employeeSyncService.fetchEmployees('primary', {}, true);

      expect(employees).toEqual(freshEmployees);
      expect(mockFirestore.get).toHaveBeenCalledTimes(1);
    });

    it('should throw an error for invalid projectKey', async () => {
      await expect(employeeSyncService.fetchEmployees('invalid', {})).rejects.toThrow('Invalid projectKey');
    });

    it('should throw an error if project is not available', async () => {
      mockMultiFirebaseServiceInstance.isProjectAvailable.mockReturnValueOnce(false);
      await expect(employeeSyncService.fetchEmployees('primary', {})).rejects.toThrow('Firebase project \'primary\' is not initialized or available');
    });

    it('should apply search filter', async () => {
      const mockEmployees = [
        { id: 'e1', name: 'Alice', department: 'HR' },
        { id: 'e2', name: 'Bob', department: 'IT' },
        { id: 'e3', name: 'Charlie', department: 'HR' }
      ];
      mockFirestore.get.mockResolvedValueOnce({
        docs: mockEmployees.map(emp => ({ id: emp.id, data: () => emp })),
        size: mockEmployees.length,
      });

      const employees = await employeeSyncService.fetchEmployees('primary', { search: 'ali' });
      expect(employees).toHaveLength(1);
      expect(employees[0].name).toBe('Alice');
    });
  });

  describe('fetchMergedEmployees', () => {
    it('should merge employees from primary and secondary', async () => {
      const primaryEmployees = [{ id: 'p1', name: 'P-Emp1' }];
      const secondaryEmployees = [{ id: 's1', emp_id: 'S-Emp1', full_name: 'S-Emp1' }];

      // Mock employeeSyncService.fetchEmployees directly for this test
      employeeSyncService.fetchEmployees = jest.fn()
        .mockResolvedValueOnce(primaryEmployees.map(e => ({...e, _source: 'primary'}))) // Enriched by actual fetchEmployees
        .mockResolvedValueOnce(secondaryEmployees.map(e => ({...e, employeeId: e.emp_id, name: e.full_name, department: 'HR', _source: 'secondary'}))); // Enriched and normalized by actual fetchEmployees

      const result = await employeeSyncService.fetchMergedEmployees({ source: 'all', useCache: false });

      expect(result.employees).toHaveLength(2);
      expect(result.metadata.primaryCount).toBe(1);
      expect(result.metadata.secondaryCount).toBe(1);
      expect(result.employees[0]._source).toBe('primary');
      expect(result.employees[1]._source).toBe('secondary');
      
      // Restore original fetchEmployees after test
      employeeSyncService.fetchEmployees.mockRestore(); 
    });

    it('should deduplicate employees if includeDuplicates is false', async () => {
      const primaryEmployee = { id: 'prim_id', employeeId: 'EMP001', name: 'Primary Emp', _source: 'primary' };
      const secondaryEmployee = { id: 'sec_id', employeeId: 'EMP001', name: 'Secondary Emp', _source: 'secondary' };

      // Mock fetchEmployees to return employees with the same logical ID but different sources
      employeeSyncService.fetchEmployees = jest.fn()
        .mockResolvedValueOnce([primaryEmployee])
        .mockResolvedValueOnce([secondaryEmployee]);

      const result = await employeeSyncService.fetchMergedEmployees({ source: 'all', includeDuplicates: false, useCache: false });

      expect(result.employees).toHaveLength(1); // Should be deduplicated
      expect(result.employees[0].employeeId).toBe('EMP001');
      expect(result.employees[0]._source).toBe('primary'); // Primary takes precedence
      
      employeeSyncService.fetchEmployees.mockRestore();
    });

    it('should record errors from failed project fetches', async () => {
        mockMultiFirebaseServiceInstance.isProjectAvailable.mockReturnValue(true);
        
        // Mock primary to succeed, secondary to fail
        const primaryEmployees = [{ id: 'p1', name: 'Primary Emp' }];
        employeeSyncService.fetchEmployees = jest.fn()
          .mockResolvedValueOnce(primaryEmployees.map(e => ({...e, _source: 'primary'})))
          .mockRejectedValueOnce(new Error('Secondary fetch failed'));
  
        const result = await employeeSyncService.fetchMergedEmployees({ source: 'all', useCache: false });
  
        expect(result.employees).toHaveLength(1);
        expect(result.metadata.primaryCount).toBe(1);
        expect(result.metadata.secondaryCount).toBe(0); // Secondary failed
        expect(result.metadata.errors).toHaveLength(1);
        expect(result.metadata.errors[0].project).toBe('secondary');
        expect(result.metadata.errors[0].error).toContain('Secondary fetch failed');
        
        employeeSyncService.fetchEmployees.mockRestore();
      });

    it('should apply department and search filters on merged results', async () => {
        const allEmployees = [
            { id: 'p1', name: 'Alice', department: 'HR', _source: 'primary', companyId: 'comp1' },
            { id: 'p2', name: 'Bob', department: 'IT', _source: 'primary', companyId: 'comp1' },
            { id: 's1', name: 'Charlie', department: 'HR', _source: 'secondary', companyId: 'comp1' },
            { id: 's2', name: 'David', department: 'IT', _source: 'secondary', companyId: 'comp2' },
        ];

        employeeSyncService.fetchEmployees = jest.fn()
            .mockResolvedValueOnce(allEmployees.filter(e => e._source === 'primary'))
            .mockResolvedValueOnce(allEmployees.filter(e => e._source === 'secondary'));

        const options = {
            source: 'all',
            filters: {
                companyId: 'comp1',
                department: 'HR',
                search: 'ali'
            },
            useCache: false
        };

        const result = await employeeSyncService.fetchMergedEmployees(options);
        expect(result.employees).toHaveLength(1);
        expect(result.employees[0].name).toBe('Alice');
        expect(result.employees[0].department).toBe('HR');
        
        employeeSyncService.fetchEmployees.mockRestore();
    });
  });

  describe('clearCache', () => {
    it('should clear cache for a specific project key', () => {
      employeeSyncService.cache.set('primary', { data: [], timestamp: Date.now() });
      employeeSyncService.clearCache('primary');
      expect(employeeSyncService.cache.has('primary')).toBe(false);
    });

    it('should clear merged cache when primary or secondary cache is cleared', () => {
      employeeSyncService.cache.set('primary', { data: [], timestamp: Date.now() });
      employeeSyncService.cache.set('merged', { data: [], timestamp: Date.now() });
      employeeSyncService.clearCache('primary');
      expect(employeeSyncService.cache.has('primary')).toBe(false);
      expect(employeeSyncService.cache.has('merged')).toBe(false);
    });

    it('should clear all cache if no project key is specified', () => {
      employeeSyncService.cache.set('primary', { data: [], timestamp: Date.now() });
      employeeSyncService.cache.set('secondary', { data: [], timestamp: Date.now() });
      employeeSyncService.clearCache();
      expect(employeeSyncService.cache.size).toBe(0);
    });
  });

  describe('Private Methods', () => {
    it('_normalizeFields should convert secondary field names', () => {
      const employee = { emp_id: '123', full_name: 'John Doe', dept: 'IT' };
      const normalized = employeeSyncService._normalizeFields(employee, 'secondary');
      expect(normalized).toMatchObject({ employeeId: '123', name: 'John Doe', department: 'IT' });
      expect(normalized.emp_id).toBeUndefined();
    });

    it('_enrichWithMetadata should add source and sync status', () => {
      const employee = { id: 'e1', name: 'Test' };
      const enriched = employeeSyncService._enrichWithMetadata(employee, 'primary');
      expect(enriched).toMatchObject({
        id: 'e1',
        name: 'Test',
        _source: 'primary',
        _syncStatus: 'synced',
      });
      expect(enriched._fetchedAt).toBeDefined();
    });

    it('_deduplicateEmployees should prioritize primary over secondary', () => {
      const employees = [
        { id: 'sec_id', employeeId: 'EMP001', name: 'Secondary Emp', _source: 'secondary' },
        { id: 'prim_id', employeeId: 'EMP001', name: 'Primary Emp', _source: 'primary' },
      ];
      const deduplicated = employeeSyncService._deduplicateEmployees(employees);
      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0]).toMatchObject({ id: 'prim_id', name: 'Primary Emp', _source: 'primary' });
    });
  });
});
