const express = require('express');
const { getInstance: getMultiFirebaseInstance } = require('../services/multiFirebaseService');
const EmployeeSyncService = require('../services/employeeSyncService');

const router = express.Router();

// Helper to get initialized service
const getService = async () => {
  const multiFirebase = getMultiFirebaseInstance();
  if (!multiFirebase.initialized) {
    await multiFirebase.initialize();
  }
  return new EmployeeSyncService(multiFirebase);
};

const employeeSyncService = new EmployeeSyncService(multiFirebase);

// Cache warming on module load (proactive fetch for common data)
(async () => {
    try {
        if (!multiFirebase.initialized) {
            await multiFirebase.initialize();
        }
        console.log('🔥 Warming employee sync cache...');
        // Fetch with useCache: false to ensure fresh data for warming
        await employeeSyncService.fetchMergedEmployees({ source: 'all', useCache: false });
        await employeeSyncService.fetchEmployees('primary', {}, false);
        console.log('✅ Employee sync cache warmed.');
    } catch (error) {
        console.error('⚠️ Failed to warm employee sync cache:', error.message);
    }
})();

// GET /api/employees/sync/merged - Get merged employees from all sources
router.get('/merged', async (req, res) => {
  try {
    const service = await getService();
    
    // Extract options from query parameters
    const options = {
      source: req.query.source || 'all',
      useCache: req.query.useCache !== 'false', // Default to true
      includeDuplicates: req.query.includeDuplicates !== 'false', // Default to true
      filters: {
        companyId: req.query.companyId,
        status: req.query.status,
        department: req.query.department,
        limit: req.query.limit ? parseInt(req.query.limit) : undefined
      }
    };

    const result = await service.fetchMergedEmployees(options);
    res.json(result);
  } catch (error) {
    console.error('Error fetching merged employees:', error);
    res.status(500).json({
      error: 'Failed to fetch merged employees',
      details: error.message
    });
  }
});

// GET /api/employees/sync/status - Get connection health status
router.get('/status', async (req, res) => {
  try {
    const multiFirebase = getMultiFirebaseInstance();
    if (!multiFirebase.initialized) {
      await multiFirebase.initialize();
    }
    
    const status = multiFirebase.getAllConnectionStatus();
    res.json(status);
  } catch (error) {
    console.error('Error checking connection status:', error);
    res.status(500).json({
      error: 'Failed to check connection status',
      details: error.message
    });
  }
});

// GET /api/employees/sync/test-connection - Test secondary connection
router.get('/test-connection', async (req, res) => {
  try {
    const multiFirebase = getMultiFirebaseInstance();
    if (!multiFirebase.initialized) {
      await multiFirebase.initialize();
    }
    
    const isHealthy = await multiFirebase.healthCheck('secondary');
    const status = multiFirebase.getConnectionStatus('secondary');
    
    res.json({
      healthy: isHealthy,
      status: status
    });
  } catch (error) {
    console.error('Error testing secondary connection:', error);
    res.status(500).json({
      error: 'Failed to test secondary connection',
      details: error.message
    });
  }
});

// POST /api/employees/sync/refresh/:projectKey - Clear cache
router.post('/refresh/:projectKey', async (req, res) => {
  try {
    const { projectKey } = req.params;
    const service = await getService();
    
    if (projectKey === 'all') {
      service.clearCache();
    } else {
      service.clearCache(projectKey);
    }
    
    res.json({
      message: `Cache cleared for ${projectKey}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`Error clearing cache for ${req.params.projectKey}:`, error);
    res.status(500).json({
      error: 'Failed to clear cache',
      details: error.message
    });
  }
});

// GET /api/employees/sync/:projectKey - Get employees from specific project
router.get('/:projectKey', async (req, res) => {
  try {
    const { projectKey } = req.params;
    const service = await getService();
    
    // Validate projectKey
    if (!['primary', 'secondary'].includes(projectKey)) {
      return res.status(400).json({
        error: 'Invalid project key',
        message: "Project key must be 'primary' or 'secondary'"
      });
    }

    // Extract filters from query parameters
    const filters = {
      companyId: req.query.companyId,
      status: req.query.status,
      department: req.query.department,
      limit: req.query.limit ? parseInt(req.query.limit) : undefined
    };
    
    const useCache = req.query.useCache !== 'false'; // Default to true

    const employees = await service.fetchEmployees(projectKey, filters, useCache);
    res.json(employees);
  } catch (error) {
    console.error(`Error fetching employees from ${req.params.projectKey}:`, error);
    res.status(500).json({
      error: `Failed to fetch employees from ${req.params.projectKey}`,
      details: error.message
    });
  }
});

module.exports = router;
