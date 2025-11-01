const { randomUUID } = require('crypto');
const admin = require('../utils/firebaseAdmin');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const parseAuthorization = (req) => {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== 'string') {
    return null;
  }
  if (!header.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  return header.slice(7).trim();
};

const hydrateUserFromToken = async (req, token) => {
  if (!token) {
    return false;
  }

  try {
    // Try JWT verification first (for tokens from our login endpoint)
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      console.log('✅ [Auth] JWT token verified:', decoded.uid);
    } catch (jwtError) {
      // If JWT fails, try Firebase ID token
      console.log('⚠️ [Auth] JWT verification failed, trying Firebase ID token');
      decoded = await admin.auth().verifyIdToken(token);
      console.log('✅ [Auth] Firebase ID token verified:', decoded.uid);
    }

    let specialRole = decoded.specialrole || decoded.role || null;
    let displayName = decoded.name || null;

    try {
      const userDoc = await admin.firestore().collection('users').doc(decoded.uid).get();
      if (userDoc.exists) {
        const data = userDoc.data();
        specialRole = data.specialrole || data.role || specialRole || null;
        displayName = data.name || displayName || null;
      }
    } catch (firestoreError) {
      // Non-fatal: swallow but record in request context for diagnostics
      req.activityContext = req.activityContext || {};
      req.activityContext.userLookupError = firestoreError.message;
    }

    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      name: displayName,
      specialrole: specialRole || null,
      token: decoded,
    };

    return true;
  } catch (error) {
    console.error('❌ [Auth] Token verification failed:', error.message);
    req.activityContext = req.activityContext || {};
    req.activityContext.authError = error.message;
    return false;
  }
};

const attachRequestContext = async (req, res, next) => {
  const forwardedRaw = req.headers['x-forwarded-for'];
  const forwardedFor =
    typeof forwardedRaw === 'string'
      ? forwardedRaw
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
      : [];

  req.activityContext = {
    requestId: req.headers['x-request-id'] || randomUUID(),
    ip: (req.headers['x-real-ip'] || req.ip || '').toString(),
    forwardedFor,
    userAgent: req.headers['user-agent'] || null,
  };

  if (!req.user) {
    const token = parseAuthorization(req);
    if (token) {
      await hydrateUserFromToken(req, token);
    }
  }

  return next();
};

const requireAuthenticatedUser = async (req, res, next) => {
  if (req.user) {
    return next();
  }

  const token = parseAuthorization(req);
  const hydrated = await hydrateUserFromToken(req, token);

  if (!hydrated) {
    return res.status(401).json({
      success: false,
      error: 'unauthorized',
      message: 'Authentication token is required.',
    });
  }

  return next();
};

module.exports = {
  attachRequestContext,
  requireAuthenticatedUser,
};
