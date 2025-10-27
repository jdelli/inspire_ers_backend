const admin = require('firebase-admin');

/**
 * Middleware to restrict payroll access to users with specialrole === "superadmin"
 * Checks Firebase Auth token and verifies the user has superadmin role in Firestore
 */
const requirePayrollAccess = async (req, res, next) => {
  try {
    // Extract the authorization token from the request header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'No authentication token provided'
      });
    }

    const token = authHeader.split('Bearer ')[1];

    // Verify the Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    console.log('🔐 Payroll access attempt by user:', userId);

    // Get user document from Firestore to check specialrole
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      console.warn('⛔ User document not found:', userId);
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'User account not found'
      });
    }

    const userData = userDoc.data();
    const specialRole = userData.specialrole || '';

    // Check if user has superadmin role
    if (specialRole !== 'superadmin') {
      console.warn('⛔ Unauthorized payroll access attempt by user:', userId, 'Role:', specialRole);
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to access payroll data. Super Admin privileges required.'
      });
    }

    console.log('✅ Authorized payroll access granted to superadmin:', userId);
    
    // Attach user info to request for downstream use
    req.user = {
      uid: userId,
      email: decodedToken.email,
      specialrole: specialRole,
      token: decodedToken
    };

    next();
  } catch (error) {
    console.error('❌ Payroll authorization error:', error);
    
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication token has expired'
      });
    }
    
    if (error.code === 'auth/argument-error') {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid authentication token'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to verify authentication'
    });
  }
};

module.exports = {
  requirePayrollAccess
};
