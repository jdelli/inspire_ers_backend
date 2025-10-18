/**
 * Security Middleware - Phase 6 Implementation
 * Company-based access control, input validation, and rate limiting
 */

const admin = require('firebase-admin');
const db = admin.firestore();

// Rate limiting store (in production, use Redis)
const rateLimitStore = new Map();

/**
 * Authentication middleware - Verify user token
 */
exports.authenticateUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        code: 'unauthenticated',
        message: 'Missing authentication token',
        status: 401
      });
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        iat: decodedToken.iat
      };
      next();
    } catch (error) {
      console.error('Token verification failed:', error);
      return res.status(401).json({
        success: false,
        code: 'invalid-token',
        message: 'Invalid or expired authentication token',
        status: 401
      });
    }
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return res.status(500).json({
      success: false,
      code: 'auth-error',
      message: 'Authentication error occurred',
      status: 500
    });
  }
};

/**
 * Company access control middleware
 * Ensures user has access to the requested company
 */
exports.validateCompanyAccess = async (req, res, next) => {
  try {
    const companyId = req.body?.companyId || req.query?.companyId;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        code: 'invalid-argument',
        message: 'Company ID is required',
        status: 400
      });
    }

    // Get user's company assignments
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userData = userDoc.data();

    if (!userData) {
      return res.status(403).json({
        success: false,
        code: 'permission-denied',
        message: 'User profile not found',
        status: 403
      });
    }

    // Check if user has access to this company
    const userCompanies = userData.companies || [];
    const userRole = userData.role || 'viewer';

    if (userRole === 'admin') {
      // Admins can access all companies
      req.userCompanies = userCompanies;
      req.userRole = userRole;
      return next();
    }

    if (!userCompanies.includes(companyId)) {
      console.warn(`Access denied: User ${req.user.uid} attempted to access company ${companyId}`);
      return res.status(403).json({
        success: false,
        code: 'permission-denied',
        message: 'You do not have permission to access this company',
        status: 403
      });
    }

    req.userCompanies = userCompanies;
    req.userRole = userRole;
    req.companyId = companyId;
    next();
  } catch (error) {
    console.error('Company access validation error:', error);
    return res.status(500).json({
      success: false,
      code: 'internal',
      message: 'Error validating company access',
      status: 500
    });
  }
};

/**
 * Rate limiting middleware
 * Prevents abuse by limiting requests per user/IP
 */
exports.rateLimit = (maxRequests = 100, windowMs = 60000) => {
  return (req, res, next) => {
    try {
      const key = req.user?.uid || req.ip;
      const now = Date.now();

      if (!rateLimitStore.has(key)) {
        rateLimitStore.set(key, []);
      }

      const userRequests = rateLimitStore.get(key);
      const recentRequests = userRequests.filter(time => now - time < windowMs);

      if (recentRequests.length >= maxRequests) {
        console.warn(`Rate limit exceeded for ${key}`);
        return res.status(429).json({
          success: false,
          code: 'rate-limited',
          message: 'Too many requests. Please try again later.',
          status: 429,
          retryAfter: Math.ceil((recentRequests[0] + windowMs - now) / 1000)
        });
      }

      recentRequests.push(now);
      rateLimitStore.set(key, recentRequests);

      // Cleanup old entries
      if (rateLimitStore.size > 10000) {
        for (const [storeKey, requests] of rateLimitStore.entries()) {
          const active = requests.filter(time => now - time < windowMs);
          if (active.length === 0) {
            rateLimitStore.delete(storeKey);
          } else {
            rateLimitStore.set(storeKey, active);
          }
        }
      }

      next();
    } catch (error) {
      console.error('Rate limiting error:', error);
      next(); // Don't block on rate limiting errors
    }
  };
};

/**
 * Input validation middleware
 * Validates required fields and data types
 */
exports.validateInput = (schema) => {
  return (req, res, next) => {
    try {
      const errors = [];

      for (const [field, rules] of Object.entries(schema)) {
        const value = req.body[field];

        // Check required
        if (rules.required && (value === undefined || value === null || value === '')) {
          errors.push({
            field,
            error: `${field} is required`,
            value: value
          });
          continue;
        }

        if (value === undefined || value === null) {
          continue;
        }

        // Check type
        if (rules.type) {
          const valueType = Array.isArray(value) ? 'array' : typeof value;
          if (valueType !== rules.type) {
            errors.push({
              field,
              error: `${field} must be ${rules.type}, received ${valueType}`,
              value: value
            });
          }
        }

        // Check length
        if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
          errors.push({
            field,
            error: `${field} must be at least ${rules.minLength} characters`,
            value: value
          });
        }

        if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
          errors.push({
            field,
            error: `${field} must not exceed ${rules.maxLength} characters`,
            value: value
          });
        }

        // Check min/max values
        if (rules.min !== undefined && typeof value === 'number' && value < rules.min) {
          errors.push({
            field,
            error: `${field} must be at least ${rules.min}`,
            value: value
          });
        }

        if (rules.max !== undefined && typeof value === 'number' && value > rules.max) {
          errors.push({
            field,
            error: `${field} must not exceed ${rules.max}`,
            value: value
          });
        }

        // Check pattern (regex)
        if (rules.pattern && !rules.pattern.test(value)) {
          errors.push({
            field,
            error: `${field} has invalid format`,
            value: value
          });
        }

        // Check allowed values
        if (rules.enum && !rules.enum.includes(value)) {
          errors.push({
            field,
            error: `${field} must be one of: ${rules.enum.join(', ')}`,
            value: value
          });
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          code: 'invalid-argument',
          message: 'Input validation failed',
          status: 400,
          details: errors
        });
      }

      next();
    } catch (error) {
      console.error('Input validation error:', error);
      return res.status(400).json({
        success: false,
        code: 'invalid-argument',
        message: 'Input validation error',
        status: 400
      });
    }
  };
};

/**
 * Sanitize user input to prevent injection attacks
 */
exports.sanitizeInput = (value) => {
  if (typeof value === 'string') {
    // Remove potentially dangerous characters
    return value
      .trim()
      .replace(/[<>\"'`]/g, '') // Remove HTML/script tags
      .substring(0, 1000); // Limit length
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(v => exports.sanitizeInput(v));
  }

  if (typeof value === 'object' && value !== null) {
    const sanitized = {};
    for (const [key, val] of Object.entries(value)) {
      sanitized[key] = exports.sanitizeInput(val);
    }
    return sanitized;
  }

  return value;
};

/**
 * Request logging middleware for security audit trail
 */
exports.auditLog = async (req, res, next) => {
  try {
    const originalSend = res.send;

    res.send = function(data) {
      // Log the request
      const logEntry = {
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        userId: req.user?.uid || 'anonymous',
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        dataSize: req.method !== 'GET' ? JSON.stringify(req.body).length : 0
      };

      // Only add companyId if it exists (avoid undefined values)
      const companyId = req.companyId || req.body?.companyId || req.query?.companyId;
      if (companyId) {
        logEntry.companyId = companyId;
      }

      // Write to audit logs collection (non-blocking)
      db.collection('audit_logs').add(logEntry).catch(err => {
        console.error('Failed to write audit log:', err);
      });

      return originalSend.call(this, data);
    };

    next();
  } catch (error) {
    console.error('Audit logging error:', error);
    next();
  }
};

/**
 * Error handler middleware
 */
exports.errorHandler = (err, req, res, next) => {
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    userId: req.user?.uid,
    path: req.path,
    method: req.method
  });

  const statusCode = err.statusCode || 500;
  const code = err.code || 'internal';

  return res.status(statusCode).json({
    success: false,
    code: code,
    message: err.message || 'An unexpected error occurred',
    status: statusCode
  });
};

/**
 * CORS headers middleware
 */
exports.setCorsHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
};

/**
 * Check if user has specific role/permission
 */
exports.requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({
        success: false,
        code: 'permission-denied',
        message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`,
        status: 403
      });
    }
    next();
  };
};

exports.rateLimitStore = rateLimitStore;
