# MultiFirebaseService Documentation

## Overview

The `MultiFirebaseService` manages connections to multiple Firebase projects, allowing the application to fetch data from both a primary Firebase project and an optional secondary Firebase project. This is particularly useful for syncing employee records across different Firebase instances.

## Features

- ✅ Manages multiple Firebase Admin SDK instances
- ✅ Singleton pattern for consistent access across the application
- ✅ Health check functionality for connection monitoring
- ✅ Graceful handling of optional secondary Firebase
- ✅ Detailed error logging and connection status tracking
- ✅ Support for both Firestore and Auth services

## Architecture

```
┌─────────────────────────────────────────┐
│     MultiFirebaseService (Singleton)    │
├─────────────────────────────────────────┤
│  - apps: Map<string, FirebaseApp>      │
│  - connectionStatus: Map<string, Object>│
│  - initialized: boolean                 │
├─────────────────────────────────────────┤
│  + initialize()                         │
│  + getFirestore(projectKey)             │
│  + getAuth(projectKey)                  │
│  + healthCheck(projectKey)              │
│  + getConnectionStatus(projectKey)      │
│  + isProjectAvailable(projectKey)       │
└─────────────────────────────────────────┘
           │                    │
           ▼                    ▼
    ┌──────────┐        ┌──────────┐
    │ Primary  │        │Secondary │
    │ Firebase │        │ Firebase │
    │ Project  │        │ Project  │
    └──────────┘        └──────────┘
```

## Usage

### Basic Setup

```javascript
const { getInstance } = require('./services/multiFirebaseService');

// Get singleton instance
const multiFirebase = getInstance();

// Initialize the service (call once at application startup)
await multiFirebase.initialize();
```

### Accessing Firestore

```javascript
// Get Firestore instance for primary project
const primaryDb = multiFirebase.getFirestore('primary');
const employees = await primaryDb.collection('employees').get();

// Get Firestore instance for secondary project (if configured)
if (multiFirebase.isProjectAvailable('secondary')) {
  const secondaryDb = multiFirebase.getFirestore('secondary');
  const externalEmployees = await secondaryDb.collection('employees').get();
}
```

### Accessing Auth

```javascript
// Get Auth instance for primary project
const primaryAuth = multiFirebase.getAuth('primary');
const user = await primaryAuth.getUser(uid);

// Get Auth instance for secondary project (if configured)
if (multiFirebase.isProjectAvailable('secondary')) {
  const secondaryAuth = multiFirebase.getAuth('secondary');
  const externalUser = await secondaryAuth.getUser(uid);
}
```

### Health Checks

```javascript
// Check if primary Firebase is healthy
const isPrimaryHealthy = await multiFirebase.healthCheck('primary');

// Check if secondary Firebase is healthy
const isSecondaryHealthy = await multiFirebase.healthCheck('secondary');

// Get detailed connection status
const primaryStatus = multiFirebase.getConnectionStatus('primary');
console.log(primaryStatus);
// {
//   connected: true,
//   lastChecked: '2025-11-28T10:30:00.000Z',
//   latency: 45,
//   error: null
// }

// Get all connection statuses
const allStatus = multiFirebase.getAllConnectionStatus();
console.log(allStatus);
// {
//   primary: { connected: true, lastChecked: '...', latency: 45, error: null },
//   secondary: { connected: true, lastChecked: '...', latency: 120, error: null }
// }
```

### Checking Project Availability

```javascript
// Check if a project is available
if (multiFirebase.isProjectAvailable('secondary')) {
  // Secondary Firebase is configured and initialized
  console.log('Secondary Firebase is available');
}

// Get list of all available projects
const projects = multiFirebase.getAvailableProjects();
console.log(projects); // ['primary', 'secondary']
```

## Configuration

### Environment Variables

The service reads configuration from environment variables. See `backend/functions/.env.example` for the complete list.

**Primary Firebase (Required):**
```bash
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_DATABASE_URL=https://your-project-id.firebaseio.com
```

**Secondary Firebase (Optional):**
```bash
SECONDARY_FIREBASE_PROJECT_ID=external-project-id
SECONDARY_FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@external-project-id.iam.gserviceaccount.com
SECONDARY_FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
SECONDARY_FIREBASE_DATABASE_URL=https://external-project-id.firebaseio.com
```

### Getting Firebase Credentials

1. Go to Firebase Console: https://console.firebase.google.com/
2. Select your project
3. Go to Project Settings > Service Accounts
4. Click "Generate New Private Key"
5. Download the JSON file
6. Extract the values:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY`

## API Reference

### `getInstance()`

Returns the singleton instance of MultiFirebaseService.

**Returns:** `MultiFirebaseService`

### `initialize()`

Initializes Firebase apps for primary and secondary projects. Must be called before using any other methods.

**Returns:** `Promise<void>`

**Throws:** Error if primary Firebase initialization fails

### `getFirestore(projectKey)`

Gets the Firestore instance for a specific project.

**Parameters:**
- `projectKey` (string): 'primary' or 'secondary'

**Returns:** `admin.firestore.Firestore`

**Throws:** Error if service not initialized, invalid projectKey, or project not available

### `getAuth(projectKey)`

Gets the Auth instance for a specific project.

**Parameters:**
- `projectKey` (string): 'primary' or 'secondary'

**Returns:** `admin.auth.Auth`

**Throws:** Error if service not initialized, invalid projectKey, or project not available

### `healthCheck(projectKey)`

Performs a health check on a specific project by executing a lightweight Firestore operation.

**Parameters:**
- `projectKey` (string): 'primary' or 'secondary'

**Returns:** `Promise<boolean>` - true if healthy, false otherwise

### `getConnectionStatus(projectKey)`

Gets the connection status for a specific project.

**Parameters:**
- `projectKey` (string): 'primary' or 'secondary'

**Returns:** `Object | null`
```javascript
{
  connected: boolean,
  lastChecked: string,  // ISO timestamp
  latency: number,      // milliseconds (only if connected)
  error: string | null
}
```

### `getAllConnectionStatus()`

Gets connection status for all initialized projects.

**Returns:** `Object` - Map of projectKey to status objects

### `isProjectAvailable(projectKey)`

Checks if a specific project is initialized and available.

**Parameters:**
- `projectKey` (string): 'primary' or 'secondary'

**Returns:** `boolean`

### `getAvailableProjects()`

Gets a list of all available project keys.

**Returns:** `string[]` - Array of project keys (e.g., ['primary', 'secondary'])

## Error Handling

The service provides comprehensive error handling:

1. **Initialization Errors**: If primary Firebase fails to initialize, an error is thrown. If secondary Firebase fails, a warning is logged but the service continues.

2. **Invalid Project Keys**: Methods throw descriptive errors when invalid project keys are provided.

3. **Connection Errors**: Health checks catch connection errors and update the connection status accordingly.

4. **Detailed Logging**: All errors are logged with context for debugging.

## Best Practices

1. **Initialize Once**: Call `initialize()` once at application startup, typically in your main server file.

2. **Check Availability**: Always check if secondary Firebase is available before using it:
   ```javascript
   if (multiFirebase.isProjectAvailable('secondary')) {
     // Use secondary Firebase
   }
   ```

3. **Handle Errors**: Wrap Firebase operations in try-catch blocks:
   ```javascript
   try {
     const db = multiFirebase.getFirestore('secondary');
     const data = await db.collection('employees').get();
   } catch (error) {
     console.error('Failed to fetch from secondary:', error);
     // Fallback to primary or show error to user
   }
   ```

4. **Monitor Health**: Periodically run health checks to monitor connection status:
   ```javascript
   setInterval(async () => {
     await multiFirebase.healthCheck('primary');
     await multiFirebase.healthCheck('secondary');
   }, 60000); // Every minute
   ```

5. **Use Singleton**: Always use `getInstance()` to get the service instance rather than creating new instances.

## Testing

Run the test script to verify the service is working correctly:

```bash
cd backend/functions
node test-multi-firebase-service.js
```

The test script will:
- Initialize the service
- Check available projects
- Test Firestore and Auth access
- Run health checks
- Verify error handling

## Integration Example

Here's a complete example of integrating MultiFirebaseService in an Express API:

```javascript
const express = require('express');
const { getInstance } = require('./services/multiFirebaseService');

const app = express();
const multiFirebase = getInstance();

// Initialize on startup
app.listen(5001, async () => {
  try {
    await multiFirebase.initialize();
    console.log('Server started with multi-Firebase support');
  } catch (error) {
    console.error('Failed to initialize multi-Firebase:', error);
    process.exit(1);
  }
});

// API endpoint to get employees from both projects
app.get('/api/employees/all', async (req, res) => {
  try {
    const employees = [];
    
    // Fetch from primary
    const primaryDb = multiFirebase.getFirestore('primary');
    const primarySnapshot = await primaryDb.collection('employees').get();
    primarySnapshot.forEach(doc => {
      employees.push({ ...doc.data(), _source: 'primary' });
    });
    
    // Fetch from secondary if available
    if (multiFirebase.isProjectAvailable('secondary')) {
      const secondaryDb = multiFirebase.getFirestore('secondary');
      const secondarySnapshot = await secondaryDb.collection('employees').get();
      secondarySnapshot.forEach(doc => {
        employees.push({ ...doc.data(), _source: 'secondary' });
      });
    }
    
    res.json({ success: true, data: employees });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check endpoint
app.get('/api/health/firebase', async (req, res) => {
  const status = {
    primary: await multiFirebase.healthCheck('primary'),
    secondary: multiFirebase.isProjectAvailable('secondary') 
      ? await multiFirebase.healthCheck('secondary')
      : null
  };
  
  res.json({ success: true, status });
});
```

## Troubleshooting

### "Primary Firebase configuration is invalid or missing"

**Solution**: Ensure all required environment variables are set:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

### "Firebase app for project 'secondary' is not initialized"

**Solution**: This means secondary Firebase is not configured. Either:
1. Add secondary Firebase environment variables, or
2. Check if secondary is available before using it with `isProjectAvailable('secondary')`

### "Health check failed"

**Solution**: 
1. Check your internet connection
2. Verify Firebase credentials are correct
3. Ensure the Firebase project exists and is accessible
4. Check Firebase Console for any service outages

### Private key format errors

**Solution**: Ensure the private key includes proper newlines. In environment variables, use `\n` for newlines:
```
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYourKeyHere\n-----END PRIVATE KEY-----\n"
```

## Related Documentation

- [multiFirebaseConfig.js](../config/README_MULTI_FIREBASE.md) - Configuration management
- [Firebase Admin SDK Documentation](https://firebase.google.com/docs/admin/setup)
- [Multi-Firebase Employee Sync Spec](.kiro/specs/multi-firebase-employee-sync/)
