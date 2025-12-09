# Multi-Firebase Configuration

This module provides configuration management and validation for connecting to multiple Firebase projects.

## Features

- **Configuration Validation**: Validates all required environment variables for both primary and secondary Firebase projects
- **Secure Credential Management**: Handles Firebase credentials via environment variables
- **Optional Secondary Project**: Secondary Firebase is optional and gracefully degrades if not configured
- **Detailed Error Reporting**: Provides clear error messages for configuration issues

## Usage

```javascript
const multiFirebaseConfig = require('./config/multiFirebaseConfig');

// Get primary Firebase configuration
const primaryConfig = multiFirebaseConfig.getPrimaryConfig();

// Get secondary Firebase configuration (returns null if not configured)
const secondaryConfig = multiFirebaseConfig.getSecondaryConfig();

// Check if secondary Firebase is enabled
const isEnabled = multiFirebaseConfig.isSecondaryEnabled();

// Validate all configurations on startup
const validationResult = multiFirebaseConfig.validateAllConfigs();
```

## Environment Variables

### Primary Firebase (Required)

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYourPrivateKeyHere\n-----END PRIVATE KEY-----\n"
FIREBASE_DATABASE_URL=https://your-project-id.firebaseio.com
```

### Secondary Firebase (Optional)

```env
SECONDARY_FIREBASE_PROJECT_ID=external-project-id
SECONDARY_FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@external-project-id.iam.gserviceaccount.com
SECONDARY_FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYourPrivateKeyHere\n-----END PRIVATE KEY-----\n"
SECONDARY_FIREBASE_DATABASE_URL=https://external-project-id.firebaseio.com
```

## API Reference

### `getPrimaryConfig()`

Returns the primary Firebase configuration object or `null` if invalid.

**Returns:**
```javascript
{
  projectId: string,
  clientEmail: string,
  privateKey: string,
  databaseURL: string
}
```

### `getSecondaryConfig()`

Returns the secondary Firebase configuration object or `null` if not configured or invalid.

**Returns:**
```javascript
{
  projectId: string,
  clientEmail: string,
  privateKey: string,
  databaseURL: string
}
```

### `isSecondaryEnabled()`

Checks if secondary Firebase is properly configured and enabled.

**Returns:** `boolean`

### `validateAllConfigs()`

Validates all Firebase configurations and returns a detailed validation summary.

**Returns:**
```javascript
{
  primary: {
    configured: boolean,
    valid: boolean,
    errors: string[]
  },
  secondary: {
    configured: boolean,
    valid: boolean,
    errors: string[]
  }
}
```

## Testing

Run the test script to verify configuration:

```bash
cd backend/functions
node test-multi-firebase-config.js
```

## Error Handling

- If primary Firebase configuration is invalid, the module logs an error and returns `null`
- If secondary Firebase configuration is invalid, the module logs a warning and disables the multi-Firebase feature
- All validation errors are logged with detailed messages for debugging

## Security Considerations

- Never commit Firebase credentials to version control
- Use environment variables for all sensitive configuration
- Private keys are automatically normalized to handle escaped newlines from environment variables
- Configuration validation includes format checks for email and private key
