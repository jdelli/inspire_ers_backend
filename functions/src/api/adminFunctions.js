const express = require('express');
const admin = require('firebase-admin');
const { authenticateUser, rateLimit, setCorsHeaders, auditLog } = require('../middleware/securityMiddleware');

const router = express.Router();
router.use(setCorsHeaders);
router.use(authenticateUser);
router.use(rateLimit(60, 60_000));
router.use(auditLog);

const db = admin.firestore();

const mapServiceErrorToStatus = (error) => {
  switch (error?.code) {
    case 'invalid-argument':
      return 400;
    case 'not-found':
      return 404;
    case 'permission-denied':
      return 403;
    default:
      return 500;
  }
};

// Users
router.get('/users', async (req, res) => {
  try {
    const { role, companyId, uid } = req.query;
    if (uid) {
      const doc = await db.collection('users').doc(String(uid)).get();
      const user = doc.exists ? { id: doc.id, ...doc.data() } : null;
      return res.json({ success: true, users: user ? [user] : [] });
    }
    let q = db.collection('users');
    if (role) q = q.where('role', '==', role);
    const snap = await q.get();
    let users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (companyId) {
      users = users.filter((u) => Array.isArray(u.companies) && u.companies.includes(companyId));
    }
    res.json({ success: true, users });
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({ success: false, message: error.message || 'Failed to list users', code: error.code || 'internal' });
  }
});

router.post('/users/create', async (req, res) => {
  try {
    const { email, password, name, role = 'user', companies = [], photoURL } = req.body || {};
    if (!email || !password || !name) {
      return res.status(400).json({ success: false, code: 'invalid-argument', message: 'email, password, name are required' });
    }
    const created = await admin.auth().createUser({ email, password, displayName: name, photoURL });
    const userDoc = {
      name,
      email,
      role,
      companies: Array.isArray(companies) ? companies : [],
      photoURL: photoURL || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection('users').doc(created.uid).set(userDoc);
    res.status(201).json({ success: true, uid: created.uid, user: { id: created.uid, ...userDoc } });
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({ success: false, message: error.message || 'Failed to create user', code: error.code || 'internal' });
  }
});

router.post('/users/:uid/update', async (req, res) => {
  try {
    const { uid } = req.params;
    const { email, password, name, role, companies, photoURL, ...rest } = req.body || {};
    const authUpdate = {};
    if (email) authUpdate.email = email;
    if (password) authUpdate.password = password;
    if (name) authUpdate.displayName = name;
    if (photoURL) authUpdate.photoURL = photoURL;
    if (Object.keys(authUpdate).length > 0) {
      await admin.auth().updateUser(uid, authUpdate);
    }
    const docUpdate = { ...rest, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (email) docUpdate.email = email;
    if (name) docUpdate.name = name;
    if (role) docUpdate.role = role;
    if (Array.isArray(companies)) docUpdate.companies = companies;
    if (photoURL !== undefined) docUpdate.photoURL = photoURL;
    await db.collection('users').doc(uid).set(docUpdate, { merge: true });
    res.json({ success: true });
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({ success: false, message: error.message || 'Failed to update user', code: error.code || 'internal' });
  }
});

router.post('/users/:uid/delete', async (req, res) => {
  try {
    const { uid } = req.params;
    await admin.auth().deleteUser(uid);
    await db.collection('users').doc(uid).delete().catch(() => {});
    res.json({ success: true });
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({ success: false, message: error.message || 'Failed to delete user', code: error.code || 'internal' });
  }
});

// Companies
router.get('/companies', async (req, res) => {
  try {
    const snap = await db.collection('companies').get();
    const companies = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ success: true, companies });
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({ success: false, message: error.message || 'Failed to list companies', code: error.code || 'internal' });
  }
});

router.post('/companies/create', async (req, res) => {
  try {
    const data = req.body || {};
    const ref = await db.collection('companies').add({
      ...data,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.status(201).json({ success: true, id: ref.id });
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({ success: false, message: error.message || 'Failed to create company', code: error.code || 'internal' });
  }
});

router.post('/companies/:id/update', async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body || {};
    await db.collection('companies').doc(id).set({ ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    res.json({ success: true });
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({ success: false, message: error.message || 'Failed to update company', code: error.code || 'internal' });
  }
});

router.post('/companies/:id/delete', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('companies').doc(id).delete();
    res.json({ success: true });
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({ success: false, message: error.message || 'Failed to delete company', code: error.code || 'internal' });
  }
});

module.exports = router;
