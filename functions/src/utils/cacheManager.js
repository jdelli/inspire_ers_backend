/**
 * Cache Manager Utility - Phase 6.2 Performance Optimization
 * In-memory caching for tax tables, configurations, and frequently accessed data
 */

const admin = require('firebase-admin');
const db = admin.firestore();

/**
 * Simple in-memory cache with TTL support
 */
class CacheStore {
  constructor() {
    this.store = new Map();
    this.ttls = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  /**
   * Set cache value with optional TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttlMs - Time to live in milliseconds (0 = no expiry)
   */
  set(key, value, ttlMs = 0) {
    this.store.set(key, value);
    this.stats.sets++;

    if (ttlMs > 0) {
      // Clear existing timeout
      if (this.ttls.has(key)) {
        clearTimeout(this.ttls.get(key));
      }

      // Set new timeout
      const timeout = setTimeout(() => {
        this.delete(key);
        console.log(`Cache expired for key: ${key}`);
      }, ttlMs);

      this.ttls.set(key, timeout);
    }
  }

  /**
   * Get cache value
   * @param {string} key - Cache key
   * @returns {any|null} Cached value or null
   */
  get(key) {
    if (this.store.has(key)) {
      this.stats.hits++;
      return this.store.get(key);
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Check if key exists
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists
   */
  has(key) {
    return this.store.has(key);
  }

  /**
   * Delete cache value
   * @param {string} key - Cache key
   */
  delete(key) {
    this.store.delete(key);
    this.stats.deletes++;

    if (this.ttls.has(key)) {
      clearTimeout(this.ttls.get(key));
      this.ttls.delete(key);
    }
  }

  /**
   * Clear entire cache
   */
  clear() {
    for (const timeout of this.ttls.values()) {
      clearTimeout(timeout);
    }

    this.store.clear();
    this.ttls.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? Math.round((this.stats.hits / total) * 100) : 0;

    return {
      ...this.stats,
      totalRequests: total,
      hitRate: `${hitRate}%`,
      size: this.store.size
    };
  }
}

// Global cache instance
const cache = new CacheStore();

/**
 * Cache tax configuration from Firestore
 * @param {string} companyId - Company ID
 * @param {number} ttlMs - Cache TTL in milliseconds (default: 1 hour)
 * @returns {Promise<Object>} Tax configuration
 */
exports.cacheTaxConfig = async (companyId, ttlMs = 3600000) => {
  const cacheKey = `tax-config-${companyId}`;

  // Check cache first
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`Cache hit for tax config: ${companyId}`);
    return cached;
  }

  console.log(`Cache miss for tax config: ${companyId}, fetching from Firestore`);

  try {
    const doc = await db.collection('tax_configurations').doc(companyId).get();

    if (!doc.exists) {
      // Return default config
      const defaultConfig = {
        sssRate: 0.045,
        pagibigRate: 0.02,
        philhealthRate: 0.0275,
        birTaxTable: [],
        lastUpdated: new Date()
      };

      cache.set(cacheKey, defaultConfig, ttlMs);
      return defaultConfig;
    }

    const config = doc.data();
    cache.set(cacheKey, config, ttlMs);

    return config;
  } catch (error) {
    console.error(`Error fetching tax config for ${companyId}:`, error);
    throw error;
  }
};

/**
 * Cache employee list with pagination
 * @param {string} companyId - Company ID
 * @param {Object} options - Pagination and filter options
 * @param {number} ttlMs - Cache TTL in milliseconds (default: 5 minutes)
 * @returns {Promise<Object>} Employee list
 */
exports.cacheEmployeeList = async (companyId, options = {}, ttlMs = 300000) => {
  const cacheKey = `employee-list-${companyId}-${JSON.stringify(options)}`;

  // Check cache first
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`Cache hit for employee list: ${companyId}`);
    return cached;
  }

  console.log(`Cache miss for employee list: ${companyId}, fetching from Firestore`);

  try {
    let query = db.collection('employees').where('companyId', '==', companyId);

    // Apply filters
    if (options.status) {
      query = query.where('status', '==', options.status);
    }

    if (options.department) {
      query = query.where('department', '==', options.department);
    }

    // Apply pagination
    const pageSize = options.pageSize || 100;
    query = query.limit(pageSize);

    const snapshot = await query.get();
    const employees = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const result = {
      employees: employees,
      count: employees.length,
      fetchedAt: new Date()
    };

    cache.set(cacheKey, result, ttlMs);

    return result;
  } catch (error) {
    console.error(`Error fetching employee list for ${companyId}:`, error);
    throw error;
  }
};

/**
 * Cache attendance summary
 * @param {string} companyId - Company ID
 * @param {string} date - Date string (YYYY-MM-DD)
 * @param {number} ttlMs - Cache TTL (default: 15 minutes)
 * @returns {Promise<Object>} Attendance summary
 */
exports.cacheAttendanceSummary = async (companyId, date, ttlMs = 900000) => {
  const cacheKey = `attendance-summary-${companyId}-${date}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`Cache hit for attendance summary: ${companyId} ${date}`);
    return cached;
  }

  try {
    const snapshot = await db.collection('attendanceSummaries')
      .where('companyId', '==', companyId)
      .where('date', '==', date)
      .get();

    const records = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Calculate summary
    const summary = {
      totalEmployees: records.length,
      present: records.filter(r => r.status === 'Present').length,
      absent: records.filter(r => r.status === 'Absent').length,
      late: records.filter(r => r.status === 'Late').length,
      halfDay: records.filter(r => r.status === 'Half Day').length,
      date: date
    };

    cache.set(cacheKey, summary, ttlMs);

    return summary;
  } catch (error) {
    console.error(`Error fetching attendance summary:`, error);
    throw error;
  }
};

/**
 * Cache company settings
 * @param {string} companyId - Company ID
 * @param {number} ttlMs - Cache TTL (default: 1 hour)
 * @returns {Promise<Object>} Company settings
 */
exports.cacheCompanySettings = async (companyId, ttlMs = 3600000) => {
  const cacheKey = `company-settings-${companyId}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`Cache hit for company settings: ${companyId}`);
    return cached;
  }

  try {
    const doc = await db.collection('companies').doc(companyId).get();

    if (!doc.exists) {
      throw new Error(`Company ${companyId} not found`);
    }

    const settings = doc.data();
    cache.set(cacheKey, settings, ttlMs);

    return settings;
  } catch (error) {
    console.error(`Error fetching company settings:`, error);
    throw error;
  }
};

/**
 * Invalidate cache by pattern
 * @param {string} pattern - Key pattern (e.g., "employee-list-*")
 */
exports.invalidateByPattern = (pattern) => {
  const regex = new RegExp(pattern.replace('*', '.*'));
  let invalidatedCount = 0;

  for (const key of cache.store.keys()) {
    if (regex.test(key)) {
      cache.delete(key);
      invalidatedCount++;
    }
  }

  console.log(`Invalidated ${invalidatedCount} cache entries matching pattern: ${pattern}`);

  return {
    pattern: pattern,
    invalidatedCount: invalidatedCount
  };
};

/**
 * Invalidate cache for company
 * @param {string} companyId - Company ID
 */
exports.invalidateCompanyCache = (companyId) => {
  const patterns = [
    `tax-config-${companyId}`,
    `employee-list-${companyId}`,
    `company-settings-${companyId}`,
    `attendance-summary-${companyId}`
  ];

  let invalidatedCount = 0;

  for (const pattern of patterns) {
    const regex = new RegExp(`^${pattern}`);
    for (const key of cache.store.keys()) {
      if (regex.test(key)) {
        cache.delete(key);
        invalidatedCount++;
      }
    }
  }

  console.log(`Invalidated ${invalidatedCount} cache entries for company: ${companyId}`);

  return {
    companyId: companyId,
    invalidatedCount: invalidatedCount
  };
};

/**
 * Get cache statistics and info
 * @returns {Object} Cache stats
 */
exports.getCacheStats = () => {
  return {
    stats: cache.getStats(),
    cacheSize: cache.store.size,
    timestamp: new Date()
  };
};

/**
 * Clear entire cache
 */
exports.clearCache = () => {
  const size = cache.store.size;
  cache.clear();
  console.log(`Cleared cache with ${size} entries`);

  return {
    clearedCount: size,
    timestamp: new Date()
  };
};

/**
 * Preload common cache entries
 * @param {string} companyId - Company ID
 */
exports.preloadCompanyCache = async (companyId) => {
  const startTime = Date.now();
  const preloadedItems = [];

  try {
    // Preload tax config
    try {
      await exports.cacheTaxConfig(companyId);
      preloadedItems.push('tax_config');
    } catch (error) {
      console.warn(`Failed to preload tax config:`, error.message);
    }

    // Preload company settings
    try {
      await exports.cacheCompanySettings(companyId);
      preloadedItems.push('company_settings');
    } catch (error) {
      console.warn(`Failed to preload company settings:`, error.message);
    }

    // Preload employee list (first page)
    try {
      await exports.cacheEmployeeList(companyId, { pageSize: 100 });
      preloadedItems.push('employee_list');
    } catch (error) {
      console.warn(`Failed to preload employee list:`, error.message);
    }

    const duration = Date.now() - startTime;

    return {
      success: true,
      companyId: companyId,
      preloadedItems: preloadedItems,
      duration: duration
    };
  } catch (error) {
    console.error('Cache preload error:', error);
    throw {
      code: 'cache-preload-error',
      message: error.message || 'Cache preload failed',
      companyId: companyId
    };
  }
};

// Export cache instance for direct access if needed
exports.cache = cache;
exports.CacheStore = CacheStore;

module.exports = exports;
