/**
 * Employee Sync Service
 * Handles employee data fetching, merging, and caching from multiple Firebase projects
 * Supports real-time subscriptions and field mapping for schema normalization
 */

/**
 * Field mapping configuration for normalizing employee data from different schemas
 * Maps secondary project field names to standard field names
 */
const FIELD_MAPPINGS = {
  secondary: {
    'emp_id': 'employeeId',
    'full_name': 'name',
    'dept': 'department',
    'job_title': 'position',
    'emp_status': 'status',
    'hire_date': 'hireDate',
    'phone_number': 'phone',
    'email_address': 'email',
    'company_name': 'company',
    'mgr_id': 'manager',
    'work_location': 'location',
    'created_at': 'createdAt',
    'updated_at': 'updatedAt',
    'created_by_user': 'createdBy',
    'updated_by_user': 'updatedBy'
  }
};

class EmployeeSyncService {
  /**
   * Constructor
   * @param {MultiFirebaseService} multiFirebaseService - Instance of MultiFirebaseService
   */
  constructor(multiFirebaseService) {
    if (!multiFirebaseService) {
      throw new Error('MultiFirebaseService instance is required');
    }

    this.multiFirebase = multiFirebaseService;
    
    /**
     * Cache storage
     * Key: projectKey or 'merged'
     * Value: { data, timestamp }
     */
    this.cache = new Map();
    
    /**
     * Cache expiry time in milliseconds (5 minutes)
     */
    this.cacheExpiry = 5 * 60 * 1000;
    
    /**
     * Active subscriptions
     * Key: projectKey
     * Value: unsubscribe function
     */
    this.subscriptions = new Map();
  }

  /**
   * Fetch employees from a specific project
   * @param {string} projectKey - 'primary' or 'secondary'
   * @param {Object} filters - Optional filters
   * @param {string} filters.companyId - Filter by company ID
   * @param {string} filters.status - Filter by employee status
   * @param {string} filters.department - Filter by department
   * @param {number} filters.limit - Limit number of results
   * @param {boolean} useCache - Whether to use cached data (default: true)
   * @returns {Promise<Array>} Array of employee records with metadata
   */
  async fetchEmployees(projectKey, filters = {}, useCache = true) {
    // Validate projectKey
    if (!['primary', 'secondary'].includes(projectKey)) {
      throw new Error(`Invalid projectKey: ${projectKey}. Must be 'primary' or 'secondary'.`);
    }

    // Check if project is available
    if (!this.multiFirebase.isProjectAvailable(projectKey)) {
      throw new Error(`Firebase project '${projectKey}' is not initialized or available`);
    }

    // Check cache first
    if (useCache) {
      const cached = this._getCachedData(projectKey);
      if (cached) {
        console.log(`✅ Cache hit for ${projectKey} employees`);
        return this._applyFilters(cached, filters);
      }
    }

    console.log(`📥 Fetching employees from ${projectKey} Firebase project...`);

    try {
      const db = this.multiFirebase.getFirestore(projectKey);
      const startTime = Date.now();

      // Build query
      let query = db.collection('employees');

      // Apply filters
      if (filters.companyId) {
        query = query.where('companyId', '==', filters.companyId);
      }

      if (filters.status) {
        query = query.where('status', '==', filters.status);
      }

      if (filters.department) {
        query = query.where('department', '==', filters.department);
      }

      // Apply limit
      const limit = filters.limit || 1000;
      query = query.limit(limit);

      // Execute query
      const snapshot = await query.get();
      const fetchTime = Date.now() - startTime;

      // Map documents to employee objects
      let employees = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Normalize field names if this is secondary project
      if (projectKey === 'secondary') {
        employees = employees.map(emp => this._normalizeFields(emp, projectKey));
      }

      // Enrich with metadata
      employees = employees.map(emp => this._enrichWithMetadata(emp, projectKey));

      // Cache the results
      this._setCachedData(projectKey, employees);

      console.log(`✅ Fetched ${employees.length} employees from ${projectKey} in ${fetchTime}ms`);

      return employees;
    } catch (error) {
      console.error(`❌ Error fetching employees from ${projectKey}:`, error.message);
      
      // Enrich error with metadata
      const enrichedError = new Error(`Failed to fetch employees from ${projectKey}: ${error.message}`);
      enrichedError.projectKey = projectKey;
      enrichedError.originalError = error;
      
      throw enrichedError;
    }
  }

  /**
   * Fetch and merge employees from both projects
   * @param {Object} options - Merge options
   * @param {string} options.source - 'all', 'primary', or 'secondary'
   * @param {Object} options.filters - Filters to apply
   * @param {boolean} options.useCache - Whether to use cached data
   * @param {boolean} options.includeDuplicates - Whether to include duplicate employees
   * @returns {Promise<Object>} Object with merged employees and metadata
   */
  async fetchMergedEmployees(options = {}) {
    const {
      source = 'all',
      filters = {},
      useCache = true,
      includeDuplicates = true
    } = options;

    console.log(`🔄 Fetching merged employees (source: ${source})...`);

    // Check cache for merged data
    if (useCache && source === 'all') {
      const cached = this._getCachedData('merged');
      if (cached) {
        console.log('✅ Cache hit for merged employees');
        return {
          employees: this._applyFilters(cached.employees, filters),
          metadata: cached.metadata
        };
      }
    }

    const results = {
      employees: [],
      metadata: {
        source: source,
        totalCount: 0,
        primaryCount: 0,
        secondaryCount: 0,
        fetchedAt: new Date().toISOString(),
        cacheHit: false,
        errors: []
      }
    };

    // Fetch from primary project
    if (source === 'all' || source === 'primary') {
      try {
        const primaryEmployees = await this.fetchEmployees('primary', filters, useCache);
        results.employees.push(...primaryEmployees);
        results.metadata.primaryCount = primaryEmployees.length;
        console.log(`✅ Fetched ${primaryEmployees.length} employees from primary`);
      } catch (error) {
        console.error('❌ Error fetching from primary:', error.message);
        results.metadata.errors.push({
          project: 'primary',
          error: error.message
        });
        
        // If primary fails and it's the only source, throw error
        if (source === 'primary') {
          throw error;
        }
      }
    }

    // Fetch from secondary project
    if (source === 'all' || source === 'secondary') {
      if (this.multiFirebase.isProjectAvailable('secondary')) {
        try {
          const secondaryEmployees = await this.fetchEmployees('secondary', filters, useCache);
          results.employees.push(...secondaryEmployees);
          results.metadata.secondaryCount = secondaryEmployees.length;
          console.log(`✅ Fetched ${secondaryEmployees.length} employees from secondary`);
        } catch (error) {
          console.error('❌ Error fetching from secondary:', error.message);
          results.metadata.errors.push({
            project: 'secondary',
            error: error.message
          });
          
          // If secondary fails and it's the only source, throw error
          if (source === 'secondary') {
            throw error;
          }
        }
      } else {
        console.warn('⚠️ Secondary Firebase project not available');
        if (source === 'secondary') {
          throw new Error('Secondary Firebase project is not initialized or available');
        }
      }
    }

    // Handle duplicates if needed
    if (!includeDuplicates && source === 'all') {
      results.employees = this._deduplicateEmployees(results.employees);
    }

    results.metadata.totalCount = results.employees.length;

    // Cache merged results if fetching from all sources
    if (source === 'all') {
      this._setCachedData('merged', results);
    }

    console.log(`✅ Merged ${results.metadata.totalCount} employees (primary: ${results.metadata.primaryCount}, secondary: ${results.metadata.secondaryCount})`);

    return results;
  }

  /**
   * Subscribe to real-time updates from a project
   * @param {string} projectKey - 'primary' or 'secondary'
   * @param {Function} callback - Callback function to receive updates
   * @param {Object} filters - Optional filters
   * @returns {Function} Unsubscribe function
   */
  subscribeToEmployees(projectKey, callback, filters = {}) {
    // Validate projectKey
    if (!['primary', 'secondary'].includes(projectKey)) {
      throw new Error(`Invalid projectKey: ${projectKey}. Must be 'primary' or 'secondary'.`);
    }

    // Check if project is available
    if (!this.multiFirebase.isProjectAvailable(projectKey)) {
      throw new Error(`Firebase project '${projectKey}' is not initialized or available`);
    }

    console.log(`🔔 Setting up real-time subscription for ${projectKey} employees...`);

    try {
      const db = this.multiFirebase.getFirestore(projectKey);

      // Build query
      let query = db.collection('employees');

      // Apply filters
      if (filters.companyId) {
        query = query.where('companyId', '==', filters.companyId);
      }

      if (filters.status) {
        query = query.where('status', '==', filters.status);
      }

      if (filters.department) {
        query = query.where('department', '==', filters.department);
      }

      // Set up snapshot listener
      const unsubscribe = query.onSnapshot(
        (snapshot) => {
          console.log(`📨 Received update from ${projectKey}: ${snapshot.size} employees`);

          // Map documents to employee objects
          let employees = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));

          // Normalize field names if this is secondary project
          if (projectKey === 'secondary') {
            employees = employees.map(emp => this._normalizeFields(emp, projectKey));
          }

          // Enrich with metadata
          employees = employees.map(emp => this._enrichWithMetadata(emp, projectKey));

          // Clear cache for this project
          this.clearCache(projectKey);

          // Call the callback with updated data
          callback(employees, null);
        },
        (error) => {
          console.error(`❌ Subscription error for ${projectKey}:`, error.message);
          callback(null, error);

          // Attempt to reconnect after 30 seconds
          setTimeout(() => {
            console.log(`🔄 Attempting to reconnect subscription for ${projectKey}...`);
            this.subscribeToEmployees(projectKey, callback, filters);
          }, 30000);
        }
      );

      // Store subscription
      this.subscriptions.set(projectKey, unsubscribe);

      console.log(`✅ Real-time subscription active for ${projectKey}`);

      // Return unsubscribe function
      return () => {
        console.log(`🔕 Unsubscribing from ${projectKey} employees`);
        unsubscribe();
        this.subscriptions.delete(projectKey);
      };
    } catch (error) {
      console.error(`❌ Error setting up subscription for ${projectKey}:`, error.message);
      throw error;
    }
  }

  /**
   * Clear cache for a specific project or all projects
   * @param {string} projectKey - Optional project key ('primary', 'secondary', or 'merged')
   */
  clearCache(projectKey = null) {
    if (projectKey) {
      if (this.cache.has(projectKey)) {
        this.cache.delete(projectKey);
        console.log(`🗑️ Cache cleared for ${projectKey}`);
      }
      
      // If clearing primary or secondary, also clear merged cache
      if (projectKey === 'primary' || projectKey === 'secondary') {
        if (this.cache.has('merged')) {
          this.cache.delete('merged');
          console.log('🗑️ Merged cache cleared');
        }
      }
    } else {
      // Clear all cache
      this.cache.clear();
      console.log('🗑️ All cache cleared');
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    const stats = {
      size: this.cache.size,
      entries: []
    };

    for (const [key, value] of this.cache.entries()) {
      const age = Date.now() - value.timestamp;
      const isExpired = age > this.cacheExpiry;
      
      stats.entries.push({
        key,
        itemCount: Array.isArray(value.data) ? value.data.length : (value.data.employees ? value.data.employees.length : 0),
        age: Math.round(age / 1000), // in seconds
        expired: isExpired
      });
    }

    return stats;
  }

  /**
   * Unsubscribe from all active subscriptions
   */
  unsubscribeAll() {
    console.log(`🔕 Unsubscribing from ${this.subscriptions.size} active subscriptions...`);
    
    for (const [projectKey, unsubscribe] of this.subscriptions.entries()) {
      try {
        unsubscribe();
        console.log(`✅ Unsubscribed from ${projectKey}`);
      } catch (error) {
        console.error(`❌ Error unsubscribing from ${projectKey}:`, error.message);
      }
    }
    
    this.subscriptions.clear();
  }

  // ==================== Private Helper Methods ====================

  /**
   * Get cached data if not expired
   * @private
   * @param {string} key - Cache key
   * @returns {Array|Object|null} Cached data or null if not found/expired
   */
  _getCachedData(key) {
    const cached = this.cache.get(key);
    
    if (!cached) {
      return null;
    }

    const age = Date.now() - cached.timestamp;
    
    if (age > this.cacheExpiry) {
      console.log(`⏰ Cache expired for ${key} (age: ${Math.round(age / 1000)}s)`);
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * Set cached data with timestamp
   * @private
   * @param {string} key - Cache key
   * @param {Array|Object} data - Data to cache
   */
  _setCachedData(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    console.log(`💾 Cached data for ${key}`);
  }

  /**
   * Normalize field names from secondary project schema
   * @private
   * @param {Object} employee - Employee object
   * @param {string} projectKey - Project key
   * @returns {Object} Normalized employee object
   */
  _normalizeFields(employee, projectKey) {
    if (projectKey !== 'secondary' || !FIELD_MAPPINGS.secondary) {
      return employee;
    }

    const normalized = { ...employee };
    const mapping = FIELD_MAPPINGS.secondary;

    // Apply field mappings
    for (const [oldField, newField] of Object.entries(mapping)) {
      if (oldField in normalized) {
        normalized[newField] = normalized[oldField];
        delete normalized[oldField];
      }
    }

    return normalized;
  }

  /**
   * Enrich employee data with metadata
   * @private
   * @param {Object} employee - Employee object
   * @param {string} projectKey - Project key
   * @returns {Object} Employee object with metadata
   */
  _enrichWithMetadata(employee, projectKey) {
    const config = projectKey === 'primary' 
      ? { projectId: process.env.FIREBASE_PROJECT_ID }
      : { projectId: process.env.SECONDARY_FIREBASE_PROJECT_ID };

    return {
      ...employee,
      _source: projectKey,
      _sourceProject: config.projectId || projectKey,
      _fetchedAt: new Date().toISOString(),
      _syncStatus: 'synced'
    };
  }

    /**

     * Apply filters to employee array

     * @private

     * @param {Array} employees - Array of employees

     * @param {Object} filters - Filters to apply

     * @returns {Array} Filtered employees

     */

    _applyFilters(employees, filters) {

      if (!filters || Object.keys(filters).length === 0) {

        return employees;

      }

  

      let filtered = [...employees];

  

      if (filters.companyId) {

        filtered = filtered.filter(emp => emp.companyId === filters.companyId);

      }

  

      if (filters.status) {

        filtered = filtered.filter(emp => emp.status === filters.status);

      }

  

      if (filters.department && filters.department !== 'all') {

        filtered = filtered.filter(emp => emp.department === filters.department);

      }

  

      // Search functionality

      if (filters.search) {

        const searchTerm = filters.search.toLowerCase().trim();

        filtered = filtered.filter(emp => {

          const searchableFields = [

            emp.name,

            emp.firstName,

            emp.lastName,

            emp.fullName,

            emp.displayName,

            emp.employeeId,

            emp.email,

            emp.department,

            emp.position,

            emp.jobTitle,

            emp.id

          ];

          

          return searchableFields.some(field => 

            field && String(field).toLowerCase().includes(searchTerm)

          );

        });

      }

  

      if (filters.limit) {

        filtered = filtered.slice(0, filters.limit);

      }

  

      return filtered;

    }

  /**
   * Deduplicate employees based on employeeId or email
   * Priority: primary > secondary
   * @private
   * @param {Array} employees - Array of employees
   * @returns {Array} Deduplicated employees
   */
  _deduplicateEmployees(employees) {
    const seen = new Map();
    const deduplicated = [];

    // Sort to ensure primary employees come first
    const sorted = [...employees].sort((a, b) => {
      if (a._source === 'primary' && b._source === 'secondary') return -1;
      if (a._source === 'secondary' && b._source === 'primary') return 1;
      return 0;
    });

    for (const employee of sorted) {
      // Use employeeId or email as unique key
      const key = employee.employeeId || employee.email || employee.id;
      
      if (!seen.has(key)) {
        seen.set(key, true);
        deduplicated.push(employee);
      }
    }

    const duplicateCount = employees.length - deduplicated.length;
    if (duplicateCount > 0) {
      console.log(`🔍 Removed ${duplicateCount} duplicate employees`);
    }

    return deduplicated;
  }
}

module.exports = EmployeeSyncService;
