# EmployeeSyncService Documentation

## Overview

The `EmployeeSyncService` handles employee data fetching, merging, and caching from multiple Firebase projects. It supports real-time subscriptions, field mapping for schema normalization, and intelligent caching with 5-minute expiry.

## Features

- ✅ Fetch employees from primary or secondary Firebase projects
- ✅ Merge employee data from multiple sources
- ✅ Field mapping to normalize different schemas
- ✅ Metadata enrichment (_source, _sourceProject, _fetchedAt, _syncStatus)
- ✅ Intelligent caching with 5-minute expiry
- ✅ Real-time subscriptions with automatic reconnection
- ✅ Flexible filtering (companyId, status, department, limit)
- ✅ Duplicate detection and removal
- ✅ Comprehensive error handling

## Installation

```javascript
const { getInstance } = require('./services/multiFirebaseService');
const EmployeeSyncService = require('./services/employeeSyncService');

// Initialize MultiFirebaseService first
const multiFirebase = getInstance();
await multiFirebase.initialize();

// Create EmployeeSyncService instance
const employeeSync = new EmployeeSyncService(multiFirebase);
```

## Usage Examples

### 1. Fetch Employees from a Specific Project

```javascript
// Fetch from primary project
const primaryEmployees = await employeeSync.fetchEmployees('primary', {
  companyId: 'company123',
  status: 'active',
  limit: 100
});

// Fetch from secondary project
const secondaryEmployees = await employeeSync.fetchEmployees('secondary', {
  department: 'Engineering',
  limit: 50
});
```

### 2. Fetch Merged Employees from All Projects

```javascript
// Fetch and merge from all sources
const result = await employeeSync.fetchMergedEmployees({
  source: 'all',  // 'all', 'primary', or 'secondary'
  filters: {
    status: 'active',
    limit: 200
  },
  useCache: true,
  includeDuplicates: false  // Remove duplicates based on employeeId/email
});

console.log('Total employees:', result.metadata.totalCount);
console.log('From primary:', result.metadata.primaryCount);
console.log('From secondary:', result.metadata.secondaryCount);
console.log('Employees:', result.employees);
```

### 3. Real-time Subscriptions

```javascript
// Subscribe to real-time updates
const unsubscribe = employeeSync.subscribeToEmployees(
  'primary',
  (employees, error) => {
    if (error) {
      console.error('Subscription error:', error);
      return;
    }
    
    console.log('Received update:', employees.length, 'employees');
    // Update your UI or state here
  },
  { companyId: 'company123' }  // Optional filters
);

// Later, unsubscribe when done
unsubscribe();
```

### 4. Cache Management

```javascript
// Clear cache for specific project
employeeSync.clearCache('primary');

// Clear cache for merged data
employeeSync.clearCache('merged');

// Clear all cache
employeeSync.clearCache();

// Get cache statistics
const stats = employeeSync.getCacheStats();
console.log('Cache entries:', stats.entries);
```

## Employee Data Structure

Each employee record is enriched with metadata:

```javascript
{
  // Original employee data
  id: "emp123",
  employeeId: "EMP-001",
  name: "John Doe",
  email: "john@example.com",
  phone: "+1234567890",
  department: "Engineering",
  position: "Software Engineer",
  company: "Acme Corp",
  status: "active",
  hireDate: Timestamp,
  
  // Metadata added by sync service
  _source: "primary" | "secondary",
  _sourceProject: "inspire-ers" | "external-project-id",
  _fetchedAt: "2025-11-28T10:30:00Z",
  _syncStatus: "synced" | "error" | "pending"
}
```

## Field Mapping

The service automatically normalizes field names from the secondary project:

```javascript
// Secondary project fields → Standard fields
{
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
  'work_location': 'location'
}
```

To customize field mappings, edit the `FIELD_MAPPINGS` constant in `employeeSyncService.js`.

## API Methods

### `fetchEmployees(projectKey, filters, useCache)`

Fetch employees from a specific project.

**Parameters:**
- `projectKey` (string): 'primary' or 'secondary'
- `filters` (object): Optional filters
  - `companyId` (string): Filter by company ID
  - `status` (string): Filter by employee status
  - `department` (string): Filter by department
  - `limit` (number): Limit number of results (default: 1000)
- `useCache` (boolean): Whether to use cached data (default: true)

**Returns:** `Promise<Array>` - Array of employee records with metadata

**Throws:** Error if projectKey is invalid or project is not available

### `fetchMergedEmployees(options)`

Fetch and merge employees from both projects.

**Parameters:**
- `options` (object):
  - `source` (string): 'all', 'primary', or 'secondary' (default: 'all')
  - `filters` (object): Filters to apply
  - `useCache` (boolean): Whether to use cached data (default: true)
  - `includeDuplicates` (boolean): Whether to include duplicate employees (default: true)

**Returns:** `Promise<Object>` - Object with employees array and metadata

### `subscribeToEmployees(projectKey, callback, filters)`

Subscribe to real-time updates from a project.

**Parameters:**
- `projectKey` (string): 'primary' or 'secondary'
- `callback` (function): Callback function `(employees, error) => {}`
- `filters` (object): Optional filters

**Returns:** `Function` - Unsubscribe function

### `clearCache(projectKey)`

Clear cache for a specific project or all projects.

**Parameters:**
- `projectKey` (string): Optional - 'primary', 'secondary', 'merged', or null for all

### `getCacheStats()`

Get cache statistics.

**Returns:** `Object` - Cache statistics with size and entries

### `unsubscribeAll()`

Unsubscribe from all active subscriptions.

## Error Handling

The service provides comprehensive error handling:

```javascript
try {
  const employees = await employeeSync.fetchEmployees('secondary');
} catch (error) {
  console.error('Error:', error.message);
  console.error('Project:', error.projectKey);
  console.error('Original error:', error.originalError);
}
```

For merged fetches, errors are captured in metadata:

```javascript
const result = await employeeSync.fetchMergedEmployees({ source: 'all' });

if (result.metadata.errors.length > 0) {
  console.warn('Some projects failed:', result.metadata.errors);
  // Continue with available data
}
```

## Caching Strategy

- **Cache Duration:** 5 minutes (300,000 ms)
- **Cache Keys:** 'primary', 'secondary', 'merged'
- **Cache Invalidation:** Automatic on expiry or manual via `clearCache()`
- **Real-time Updates:** Automatically clear cache when receiving updates

## Performance Considerations

1. **Limit Results:** Use the `limit` filter to reduce data transfer
2. **Use Cache:** Enable caching for frequently accessed data
3. **Filter Early:** Apply filters at the query level, not in memory
4. **Deduplicate:** Set `includeDuplicates: false` when merging to reduce data size
5. **Unsubscribe:** Always unsubscribe from real-time listeners when done

## Testing

Run the test script to verify functionality:

```bash
node backend/functions/test-employee-sync-service.js
```

**Note:** Requires valid Firebase credentials in environment variables.

## Requirements Fulfilled

This implementation fulfills the following requirements:

- **1.2:** Retrieve employee records from Secondary Firebase Project
- **1.5:** Cache data locally to reduce repeated network requests
- **2.2:** Retrieve employee records with timestamps from Secondary Firebase Project
- **6.1:** Merge employee records from both projects into unified view
- **6.4:** Indicate source project for each employee record

## Related Services

- `MultiFirebaseService` - Manages multiple Firebase connections
- `multiFirebaseConfig` - Configuration and validation

## Support

For issues or questions, refer to:
- Design document: `.kiro/specs/multi-firebase-employee-sync/design.md`
- Requirements: `.kiro/specs/multi-firebase-employee-sync/requirements.md`
