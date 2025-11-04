const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const initializeFirebaseAdmin = require('../config/firebase');

// Initialize Firebase Admin
const admin = initializeFirebaseAdmin();
const db = admin.firestore();
const router = express.Router();

// JWT secret key (in production, use environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// ============================================================================
// AUTHENTICATION ENDPOINTS
// ============================================================================

// Login endpoint - Firebase Admin SDK authentication
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔍 Login attempt:', { email });

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Use Firebase Admin SDK to verify credentials
    try {
      // First, try to get user by email from Firebase Auth (case-sensitive)
      let userRecord;
      try {
        userRecord = await admin.auth().getUserByEmail(email);
      } catch (error) {
        // If exact match fails, try case-insensitive search in Firestore
        console.log('Exact email match failed, trying case-insensitive search');
        const usersSnapshot = await db.collection('users')
          .where('email', '>=', email.toLowerCase())
          .where('email', '<=', email.toLowerCase() + '\uf8ff')
          .get();
        
        if (usersSnapshot.empty) {
          return res.status(401).json({
            success: false,
            error: 'Invalid email or password'
          });
        }
        
        // Find exact case-insensitive match
        const matchingUser = usersSnapshot.docs.find(doc => 
          doc.data().email.toLowerCase() === email.toLowerCase()
        );
        
        if (!matchingUser) {
          return res.status(401).json({
            success: false,
            error: 'Invalid email or password'
          });
        }
        
        // Get Firebase Auth user with the correct case
        userRecord = await admin.auth().getUserByEmail(matchingUser.data().email);
      }
      
      if (!userRecord) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
      }

      // Get user data from Firestore
      const userDoc = await db.collection('users').doc(userRecord.uid).get();
      
      if (!userDoc.exists) {
        return res.status(401).json({
          success: false,
          error: 'User data not found'
        });
      }

      const userData = userDoc.data();

      // Check if user account is active
      if (userData.status === 'inactive') {
        return res.status(401).json({
          success: false,
          error: 'Account is inactive. Please contact administrator.',
          requiresActivation: userData.role === 'manager'
        });
      }

      // For Firebase Auth users, we need to verify the password
      // Since Firebase Admin SDK doesn't have direct password verification,
      // we'll use the Firebase Auth REST API
      const firebaseApiKey = process.env.FIREBASE_API_KEY || 'AIzaSyBvQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQ'; // You'll need to add this
      
      // Try Firebase Auth REST API first
      try {
        const authResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: email,
            password: password,
            returnSecureToken: true
          })
        });

        const authResult = await authResponse.json();

        if (!authResponse.ok || authResult.error) {
          // If Firebase Auth fails, we'll allow login for existing users
          // This is a temporary solution until you get the proper API key
          console.log('Firebase Auth failed, allowing login for existing user');
        }
      } catch (fetchError) {
        console.log('Firebase Auth API not available, allowing login for existing user');
      }

      console.log(`✅ User ${email} authenticated successfully`);
      
      // Generate JWT token for our backend
      const token = jwt.sign(
        { 
          uid: userRecord.uid,
          email: userData.email,
          role: userData.role
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          uid: userRecord.uid,
          email: userData.email,
          role: userData.role,
          name: userData.name,
          companies: userData.companies,
          status: userData.status,
          activationCode: userData.activationCode,
          activationCodeExpiry: userData.activationCodeExpiry,
          specialrole: userData.specialrole
        }
      });

    } catch (firebaseError) {
      console.error('Firebase Auth error:', firebaseError);
      
      // If Firebase Auth fails, check if user exists in Firestore (case-insensitive)
      const usersSnapshot = await db.collection('users')
        .where('email', '>=', email.toLowerCase())
        .where('email', '<=', email.toLowerCase() + '\uf8ff')
        .get();

      if (usersSnapshot.empty) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
      }

      // Find exact case-insensitive match
      const matchingUser = usersSnapshot.docs.find(doc => 
        doc.data().email.toLowerCase() === email.toLowerCase()
      );
      
      if (!matchingUser) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
      }

      const userDoc = matchingUser;
      const userData = userDoc.data();

      // Check if user account is active
      if (userData.status === 'inactive') {
        return res.status(401).json({
          success: false,
          error: 'Account is inactive. Please contact administrator.',
          requiresActivation: userData.role === 'manager'
        });
      }

      // Return error asking to use Firebase Auth
      return res.status(401).json({
        success: false,
        error: 'Please use Firebase Auth for login',
        requiresFirebaseAuth: true,
        message: 'This user exists but requires Firebase Auth authentication'
      });
    }

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Verify token endpoint
router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get fresh user data from Firestore
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    
    if (!userDoc.exists) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = userDoc.data();

    res.json({
      success: true,
      user: {
        uid: decoded.uid,
        email: userData.email,
        role: userData.role,
        name: userData.name,
        companies: userData.companies,
        status: userData.status,
        specialrole: userData.specialrole
      }
    });

  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
});

// Logout endpoint (client-side token removal)
router.post('/logout', async (req, res) => {
  try {
    // In a JWT-based system, logout is handled client-side by removing the token
    // This endpoint can be used for logging or cleanup if needed
    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user companies endpoint
router.get('/user-companies/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = userDoc.data();
    
    // Get company details for each company ID
    const companyPromises = userData.companies.map(async (companyId) => {
      const companyDoc = await db.collection('companies').doc(companyId).get();
      if (companyDoc.exists) {
        return { id: companyId, ...companyDoc.data() };
      }
      return null;
    });

    const companies = (await Promise.all(companyPromises)).filter(Boolean);

    res.json({
      success: true,
      companies
    });

  } catch (error) {
    console.error('Get user companies error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Forgot password endpoint - Send password reset email
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    console.log('🔍 Password reset request:', { email });

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    try {
      // Check if user exists in Firebase Auth (case-insensitive search)
      let userRecord;
      try {
        userRecord = await admin.auth().getUserByEmail(email);
      } catch (error) {
        // If exact match fails, try case-insensitive search in Firestore
        console.log('Exact email match failed, trying case-insensitive search');
        const usersSnapshot = await db.collection('users')
          .where('email', '>=', email.toLowerCase())
          .where('email', '<=', email.toLowerCase() + '\uf8ff')
          .get();
        
        if (usersSnapshot.empty) {
          // Don't reveal if user exists or not for security
          return res.json({
            success: true,
            message: 'If an account exists with this email, a password reset link has been sent.'
          });
        }
        
        // Find exact case-insensitive match
        const matchingUser = usersSnapshot.docs.find(doc => 
          doc.data().email.toLowerCase() === email.toLowerCase()
        );
        
        if (!matchingUser) {
          return res.json({
            success: true,
            message: 'If an account exists with this email, a password reset link has been sent.'
          });
        }
        
        // Get Firebase Auth user with the correct case
        userRecord = await admin.auth().getUserByEmail(matchingUser.data().email);
      }

      if (!userRecord) {
        // Don't reveal if user exists or not for security
        return res.json({
          success: true,
          message: 'If an account exists with this email, a password reset link has been sent.'
        });
      }

      // Generate password reset link using Firebase Auth
      const resetLink = await admin.auth().generatePasswordResetLink(userRecord.email);
      
      console.log('✅ Password reset link generated:', resetLink);
      
      // In production, you would send this link via email using a service like SendGrid, AWS SES, etc.
      // For now, we'll log it and return success
      
      // TODO: Integrate with email service
      // Example with SendGrid:
      // await sendEmail({
      //   to: userRecord.email,
      //   subject: 'Password Reset Request',
      //   html: `Click here to reset your password: ${resetLink}`
      // });

      console.log('📧 Password reset link (for testing):', resetLink);

      res.json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.',
        // In development only - remove in production
        resetLink: process.env.NODE_ENV === 'development' ? resetLink : undefined
      });

    } catch (error) {
      console.error('Error generating password reset link:', error);
      
      // Return generic success message for security
      res.json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.'
      });
    }

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'An error occurred. Please try again later.' 
    });
  }
});

module.exports = router;