/**
 * Error Handler Utility - Phase 6.3 Error Handling & Logging
 * Comprehensive error handling with logging, classification, and recovery
 */

const admin = require('firebase-admin');
const db = admin.firestore();

// Cloud Logging client setup
let cloudLogging = null;

/**
 * Initialize Cloud Logging client
 */
const getCloudLoggingClient = () => {
  if (!cloudLogging) {
    try {
      const logging = require('@google-cloud/logging');
      cloudLogging = new logging.Logging();
    } catch (error) {
      console.warn('Cloud Logging not available:', error.message);
      return null;
    }
  }
  return cloudLogging;
};

/**
 * Custom error class for application errors
 */
class AppError extends Error {
  constructor(message, code, statusCode = 500, details = {}) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date();
    this.stack = Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error classification system
 */
const ErrorTypes = {
  // Client errors (4xx)
  INVALID_INPUT: { code: 'invalid-argument', status: 400, category: 'client' },
  UNAUTHENTICATED: { code: 'unauthenticated', status: 401, category: 'client' },
  PERMISSION_DENIED: { code: 'permission-denied', status: 403, category: 'client' },
  NOT_FOUND: { code: 'not-found', status: 404, category: 'client' },
  CONFLICT: { code: 'already-exists', status: 409, category: 'client' },
  RATE_LIMITED: { code: 'rate-limited', status: 429, category: 'client' },

  // Server errors (5xx)
  INTERNAL_ERROR: { code: 'internal', status: 500, category: 'server' },
  SERVICE_UNAVAILABLE: { code: 'service-unavailable', status: 503, category: 'server' },
  TIMEOUT: { code: 'deadline-exceeded', status: 504, category: 'server' },

  // Business logic errors
  VALIDATION_ERROR: { code: 'validation-failed', status: 400, category: 'validation' },
  FIRESTORE_ERROR: { code: 'firestore-error', status: 500, category: 'database' },
  TRANSACTION_ERROR: { code: 'transaction-failed', status: 500, category: 'database' },

  // Network errors
  NETWORK_ERROR: { code: 'network-error', status: 503, category: 'network' },
  TIMEOUT_ERROR: { code: 'timeout', status: 504, category: 'network' },
  CONNECTION_ERROR: { code: 'connection-error', status: 503, category: 'network' }
};

/**
 * Create an application error
 * @param {string} message - Error message
 * @param {string} errorType - Error type from ErrorTypes
 * @param {Object} details - Additional error details
 * @returns {AppError} Application error
 */
exports.createError = (message, errorType = 'INTERNAL_ERROR', details = {}) => {
  const typeConfig = ErrorTypes[errorType] || ErrorTypes.INTERNAL_ERROR;

  return new AppError(
    message,
    typeConfig.code,
    typeConfig.status,
    {
      errorType: errorType,
      category: typeConfig.category,
      ...details
    }
  );
};

/**
 * Handle Firebase errors and convert to AppError
 * @param {Error} error - Firebase error
 * @returns {AppError} Converted error
 */
exports.handleFirebaseError = (error) => {
  // Check error code
  if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-token') {
    return exports.createError(
      'Authentication failed',
      'UNAUTHENTICATED',
      { originalCode: error.code }
    );
  }

  if (error.code === 'permission-denied') {
    return exports.createError(
      'Permission denied',
      'PERMISSION_DENIED',
      { originalCode: error.code }
    );
  }

  if (error.code === 'not-found') {
    return exports.createError(
      'Resource not found',
      'NOT_FOUND',
      { originalCode: error.code }
    );
  }

  if (error.code === 'already-exists') {
    return exports.createError(
      'Resource already exists',
      'CONFLICT',
      { originalCode: error.code }
    );
  }

  if (error.code === 'deadline-exceeded' || error.code === 'DEADLINE_EXCEEDED') {
    return exports.createError(
      'Operation timed out',
      'TIMEOUT',
      { originalCode: error.code }
    );
  }

  if (error.code === 'unavailable' || error.code === 'UNAVAILABLE') {
    return exports.createError(
      'Service temporarily unavailable',
      'SERVICE_UNAVAILABLE',
      { originalCode: error.code }
    );
  }

  if (error.message && error.message.includes('FAILED_PRECONDITION')) {
    return exports.createError(
      'Operation failed precondition check',
      'INTERNAL_ERROR',
      { originalCode: error.code }
    );
  }

  // Generic Firestore error
  return exports.createError(
    error.message || 'Database operation failed',
    'FIRESTORE_ERROR',
    { originalCode: error.code, originalMessage: error.message }
  );
};

/**
 * Handle network errors with retry information
 * @param {Error} error - Network error
 * @param {number} attemptNumber - Current attempt number
 * @returns {AppError} Converted error with retry info
 */
exports.handleNetworkError = (error, attemptNumber = 1) => {
  const isTransient = error.code === 'ECONNRESET' ||
                     error.code === 'ETIMEDOUT' ||
                     error.code === 'ECONNREFUSED' ||
                     error.message.includes('timeout');

  if (isTransient && attemptNumber < 3) {
    return exports.createError(
      'Network error - will retry',
      'NETWORK_ERROR',
      {
        isTransient: true,
        attemptNumber: attemptNumber,
        maxAttempts: 3,
        retryAfterSeconds: Math.pow(2, attemptNumber - 1) // Exponential backoff
      }
    );
  }

  return exports.createError(
    'Network error - max retries exceeded',
    'NETWORK_ERROR',
    { isTransient: false, attemptNumber, maxAttempts: 3 }
  );
};

/**
 * Format error for response
 * @param {Error|AppError} error - Error to format
 * @param {boolean} includeStack - Include stack trace (dev only)
 * @returns {Object} Formatted error response
 */
exports.formatError = (error, includeStack = false) => {
  const isAppError = error instanceof AppError;

  const formattedError = {
    success: false,
    code: isAppError ? error.code : 'internal',
    message: error.message || 'An unexpected error occurred',
    status: isAppError ? error.statusCode : 500,
    timestamp: new Date().toISOString()
  };

  if (isAppError && error.details) {
    formattedError.details = error.details;
  }

  // Include stack trace only in development
  if (includeStack && process.env.NODE_ENV === 'development') {
    formattedError.stack = error.stack;
  }

  return formattedError;
};

/**
 * Log error to Cloud Logging
 * @param {Error|AppError} error - Error to log
 * @param {Object} context - Error context
 */
const logToCloudLogging = async (error, context = {}) => {
  try {
    const client = getCloudLoggingClient();
    if (!client) return; // Cloud Logging not available

    const isAppError = error instanceof AppError;
    const severity = error.statusCode >= 500 ? 'ERROR' : 'WARNING';

    const logName = client.log('inspire-ers-errors');

    const metadata = {
      resource: {
        type: 'cloud_function',
        labels: {
          function_name: process.env.FUNCTION_NAME || 'unknown',
          region: process.env.GCP_REGION || 'us-central1'
        }
      },
      severity: severity
    };

    const entry = logName.entry(metadata, {
      message: error.message,
      code: isAppError ? error.code : 'unknown',
      errorType: isAppError ? error.details?.errorType : null,
      category: isAppError ? error.details?.category : 'unknown',
      status: isAppError ? error.statusCode : 500,
      context: {
        userId: context.userId,
        companyId: context.companyId,
        path: context.path,
        method: context.method,
        ip: context.ip
      },
      details: isAppError ? error.details : { originalError: error.message },
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    await logName.write(entry);
  } catch (error) {
    console.warn('Failed to log to Cloud Logging:', error.message);
  }
};

/**
 * Log error to Firestore and console
 * @param {Error|AppError} error - Error to log
 * @param {Object} context - Error context
 */
exports.logError = async (error, context = {}) => {
  try {
    const isAppError = error instanceof AppError;
    const severity = error.statusCode >= 500 ? 'ERROR' : 'WARNING';

    const logEntry = {
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      severity: severity,
      code: isAppError ? error.code : 'unknown',
      message: error.message,
      category: isAppError ? error.details?.category : 'unknown',
      errorType: isAppError ? error.details?.errorType : null,
      status: isAppError ? error.statusCode : 500,
      context: {
        userId: context.userId,
        companyId: context.companyId,
        path: context.path,
        method: context.method,
        ip: context.ip
      },
      details: isAppError ? error.details : { originalError: error.message },
      stack: error.stack
    };

    // Write to error_logs collection in Firestore
    await db.collection('error_logs').add(logEntry);

    // Also log to Cloud Logging
    await logToCloudLogging(error, context);

    // Also log to console
    console.error(`[${severity}] ${error.code || 'ERROR'}: ${error.message}`, {
      context,
      details: isAppError ? error.details : null
    });
  } catch (logError) {
    // Fallback to console logging if Firestore fails
    console.error('Failed to log error:', logError);
    console.error('Original error:', error);
  }
};

/**
 * Retry logic with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} Function result or final error
 */
exports.retryWithBackoff = async (fn, options = {}) => {
  const {
    maxAttempts = 3,
    initialDelayMs = 100,
    maxDelayMs = 10000,
    backoffFactor = 2,
    shouldRetry = (error) => {
      // Retry on transient errors
      return error.code === 'UNAVAILABLE' ||
             error.code === 'DEADLINE_EXCEEDED' ||
             error.code === 'INTERNAL' ||
             (error.statusCode >= 500 && error.statusCode !== 501);
    }
  } = options;

  let lastError;
  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxAttempts} for operation`);
      const result = await fn();
      return result;
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt < maxAttempts && shouldRetry(error)) {
        console.warn(
          `Attempt ${attempt} failed: ${error.message}, retrying in ${delay}ms`,
          { attempt, delay }
        );

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));

        // Increase delay exponentially
        delay = Math.min(delay * backoffFactor, maxDelayMs);
      } else if (attempt === maxAttempts) {
        console.error(`All ${maxAttempts} attempts failed`, { error: lastError.message });
      }
    }
  }

  throw lastError;
};

/**
 * Wrap a function with error handling and logging
 * @param {Function} fn - Function to wrap
 * @param {Object} context - Error context
 * @returns {Function} Wrapped function
 */
exports.withErrorHandling = (fn, context = {}) => {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      const appError = error instanceof AppError ? error : exports.handleFirebaseError(error);
      await exports.logError(appError, context);
      throw appError;
    }
  };
};

/**
 * Create error statistics from logs
 * @param {string} companyId - Filter by company (optional)
 * @param {number} hoursBack - Hours to look back (default: 24)
 * @returns {Promise<Object>} Error statistics
 */
exports.getErrorStats = async (companyId = null, hoursBack = 24) => {
  try {
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);

    let query = db.collection('error_logs')
      .where('timestamp', '>=', cutoffTime)
      .orderBy('timestamp', 'desc');

    if (companyId) {
      query = query.where('context.companyId', '==', companyId);
    }

    const snapshot = await query.get();
    const errors = snapshot.docs.map(doc => doc.data());

    // Calculate statistics
    const stats = {
      totalErrors: errors.length,
      byCode: {},
      byCategory: {},
      bySeverity: { ERROR: 0, WARNING: 0 },
      errorRate: 0,
      recentErrors: errors.slice(0, 10)
    };

    for (const error of errors) {
      // Count by code
      stats.byCode[error.code] = (stats.byCode[error.code] || 0) + 1;

      // Count by category
      stats.byCategory[error.category] = (stats.byCategory[error.category] || 0) + 1;

      // Count by severity
      if (stats.bySeverity[error.severity]) {
        stats.bySeverity[error.severity]++;
      }
    }

    // Calculate error rate (errors per hour)
    stats.errorRate = Math.round((errors.length / hoursBack) * 100) / 100;

    return {
      success: true,
      timeRange: { from: cutoffTime, to: now, hours: hoursBack },
      companyId: companyId,
      stats: stats
    };
  } catch (error) {
    console.error('Error calculating error stats:', error);
    throw error;
  }
};

/**
 * Create error alert if threshold exceeded
 * @param {string} errorCode - Error code to monitor
 * @param {number} threshold - Error count threshold
 * @param {number} hoursBack - Time window
 * @returns {Promise<Object>} Alert information
 */
exports.checkErrorThreshold = async (errorCode, threshold = 10, hoursBack = 1) => {
  try {
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);

    const snapshot = await db.collection('error_logs')
      .where('code', '==', errorCode)
      .where('timestamp', '>=', cutoffTime)
      .get();

    const errorCount = snapshot.size;
    const exceeded = errorCount >= threshold;

    if (exceeded) {
      // Log alert
      console.warn(`ERROR THRESHOLD EXCEEDED: ${errorCode} occurred ${errorCount} times in ${hoursBack}h`, {
        threshold,
        actual: errorCount
      });

      // Store alert
      await db.collection('error_alerts').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        errorCode: errorCode,
        errorCount: errorCount,
        threshold: threshold,
        timeWindowHours: hoursBack,
        status: 'active'
      });
    }

    return {
      exceeded: exceeded,
      errorCode: errorCode,
      errorCount: errorCount,
      threshold: threshold,
      timeWindowHours: hoursBack
    };
  } catch (error) {
    console.error('Error checking error threshold:', error);
    throw error;
  }
};

/**
 * Export error types and classes
 */
exports.AppError = AppError;
exports.ErrorTypes = ErrorTypes;

module.exports = exports;
