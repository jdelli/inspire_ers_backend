const admin = require('firebase-admin');

/**
 * Middleware to restrict audit routes to users with specialrole === "audit" (or superadmin override)
 * Verifies Firebase ID token and checks Firestore user record for required role.
 */
const requireAuditAccess = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'unauthorized',
        message: 'Authentication token is required for audit access.',
      });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const userDoc = await admin.firestore().collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return res.status(403).json({
        success: false,
        error: 'forbidden',
        message: 'User account not found.',
      });
    }

    const specialRole = (userDoc.data().specialrole || '').toLowerCase();
    const allowedRoles = new Set(['audit', 'superadmin']);

    if (!allowedRoles.has(specialRole)) {
      return res.status(403).json({
        success: false,
        error: 'forbidden',
        message: 'Audit access is restricted to users with the Audit role.',
      });
    }

    req.user = {
      uid: userId,
      email: decodedToken.email,
      specialrole: specialRole,
      token: decodedToken,
    };

    next();
  } catch (error) {
    console.error('Audit authorization error:', error);

    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        success: false,
        error: 'unauthorized',
        message: 'Authentication token has expired.',
      });
    }

    if (error.code === 'auth/argument-error') {
      return res.status(401).json({
        success: false,
        error: 'unauthorized',
        message: 'Invalid authentication token.',
      });
    }

    return res.status(500).json({
      success: false,
      error: 'internal',
      message: 'Failed to verify audit access.',
    });
  }
};

module.exports = {
  requireAuditAccess,
};
