# Real-time Subscription Functionality

## Overview

The `subscribeToEmployees` method in `EmployeeSyncService` provides real-time updates for employee data from Firebase projects. It uses Firestore snapshot listeners to detect changes and automatically handles reconnection on errors.

## Features

✅ **Real-time Updates**: Receives instant notifications when employee data changes
✅ **Automatic Reconnection**: Reconnects automatically after 30 seconds if connection is interrupted
✅ **Filter Support**: Apply filters (companyId, status, department) to subscriptions
✅ **Field Normalization**: Automatically normalizes secondary project field names
✅ **Metadata Enrichment**: Adds source tracking metadata to all employee records
✅ **Cache Invalidation**: Clears cache when updates are received
✅ **Error Handling**: Robust error handling with callback notifications

## Usage

### Basic Subscription

```javascript
const employeeSync = new EmployeeSyncService(multiFirebaseService);

// Subscribe to primary project employees
const unsubscribe = employeeSync.subscribeToEmployees(
  'primary',
  (employees, error) => {
    if (error) {
      console.error('Subscription error:', error);
      return;
    }
    
    console.log(`Received ${employees.length} employees`);
    // Update UI with new data
  }
);

// Later, when done
unsubscribe();
```

### Subscription with Filters

```javascript
// Subscribe to active employees in Engineering department
const unsubscribe = employeeSync.subscribeToEmployees(
  'secondary',
  (employees, error) => {
    if (error) {
      console.error('Error:', error);
      return;
    }
    
    // Handle updated employees
    updateEmployeeList(employees);
  },
  {
    status: 'active',
    department: 'Engineering',
    companyId: 'company-123'
  }
);
```

### Multiple Subscriptions

```javascript
// Subscribe to both projects
const unsubPrimary = employeeSync.subscribeToEmployees('primary', handlePrimaryUpdate);
const unsubSecondary = employeeSync.subscribeToEmployees('secondary', handleSecondaryUpdate);

// Unsubscribe from all at once
employeeSync.unsubscribeAll();
```

## Method Signature

```javascript
subscribeToEmployees(projectKey, callback, filters = {})
```

### Parameters

- **projectKey** (string): `'primary'` or `'secondary'`
- **callback** (function): Callback function with signature `(employees, error) => void`
  - `employees`: Array of employee objects with metadata (when successful)
  - `error`: Error object (when error occurs)
- **filters** (object, optional): Filter options
  - `companyId`: Filter by company ID
  - `status`: Filter by employee status
  - `department`: Filter by department

### Returns

- **Function**: Unsubscribe function to stop listening to updates

## Callback Behavior

The callback is invoked in two scenarios:

1. **Successful Update**: `callback(employees, null)`
   - `employees` is an array of employee objects with metadata
   - Each employee has `_source`, `_sourceProject`, `_fetchedAt`, `_syncStatus` fields

2. **Error**: `callback(null, error)`
   - `error` contains the error object
   - Automatic reconnection is triggered after 30 seconds

## Automatic Reconnection

When a subscription error occurs:

1. The callback is invoked with the error: `callback(null, error)`
2. A 30-second timer is started
3. After 30 seconds, `subscribeToEmployees` is called again with the same parameters
4. This continues until the subscription succeeds or is manually unsubscribed

```javascript
// Error handler in implementation
(error) => {
  console.error(`❌ Subscription error for ${projectKey}:`, error.message);
  callback(null, error);

  // Attempt to reconnect after 30 seconds
  setTimeout(() => {
    console.log(`🔄 Attempting to reconnect subscription for ${projectKey}...`);
    this.subscribeToEmployees(projectKey, callback, filters);
  }, 30000);
}
```

## Employee Data Structure

Each employee object returned includes:

```javascript
{
  // Original employee data
  id: "emp123",
  name: "John Doe",
  email: "john@example.com",
  department: "Engineering",
  status: "active",
  // ... other fields

  // Metadata added by sync service
  _source: "primary" | "secondary",
  _sourceProject: "inspire-ers" | "external-project-id",
  _fetchedAt: "2025-11-28T10:30:00Z",
  _syncStatus: "synced"
}
```

## Cache Behavior

When a subscription receives an update:

1. The cache for that project is automatically cleared
2. The merged cache (if exists) is also cleared
3. This ensures subsequent `fetchEmployees` calls get fresh data

## Error Handling

### Invalid Project Key

```javascript
try {
  employeeSync.subscribeToEmployees('invalid', callback);
} catch (error) {
  // Error: Invalid projectKey: invalid. Must be 'primary' or 'secondary'.
}
```

### Project Not Available

```javascript
try {
  employeeSync.subscribeToEmployees('secondary', callback);
} catch (error) {
  // Error: Firebase project 'secondary' is not initialized or available
}
```

### Connection Errors

Connection errors are handled gracefully:
- Callback is invoked with error
- Automatic reconnection after 30 seconds
- Continues until successful or manually unsubscribed

## Best Practices

### 1. Always Unsubscribe

```javascript
// Store unsubscribe function
const unsubscribe = employeeSync.subscribeToEmployees('primary', callback);

// Clean up when component unmounts or no longer needed
useEffect(() => {
  return () => unsubscribe();
}, []);
```

### 2. Handle Both Success and Error Cases

```javascript
const callback = (employees, error) => {
  if (error) {
    // Show error message to user
    setConnectionStatus('error');
    setErrorMessage(error.message);
    return;
  }
  
  // Update UI with new data
  setEmployees(employees);
  setConnectionStatus('connected');
};
```

### 3. Use Filters to Reduce Data Transfer

```javascript
// Only subscribe to relevant employees
const unsubscribe = employeeSync.subscribeToEmployees(
  'primary',
  callback,
  { 
    companyId: currentCompanyId,
    status: 'active'
  }
);
```

### 4. Unsubscribe All on Cleanup

```javascript
// In application shutdown or cleanup
employeeSync.unsubscribeAll();
```

## Requirements Satisfied

This implementation satisfies the following requirements:

- **5.1**: Subscribes to changes in Firebase project employee collection
- **5.2**: Updates are received in real-time (typically < 1 second)
- **5.4**: Automatic reconnection every 30 seconds on connection interruption

## Testing

See `backend/functions/test-subscription.js` for comprehensive tests including:

- Basic subscription setup
- Receiving updates
- Unsubscribe functionality
- Multiple subscriptions
- Error handling
- Automatic reconnection
- UnsubscribeAll functionality

## Performance Considerations

- Subscriptions maintain an open connection to Firestore
- Each subscription consumes memory and network resources
- Use filters to limit the amount of data transferred
- Always unsubscribe when no longer needed
- Consider using `unsubscribeAll()` during application shutdown

## Monitoring

The service logs all subscription activities:

- `🔔` Subscription setup
- `📨` Updates received
- `❌` Errors
- `🔄` Reconnection attempts
- `🔕` Unsubscribe events

Monitor these logs to track subscription health and performance.
