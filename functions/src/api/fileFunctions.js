const express = require('express');
const admin = require('firebase-admin');

const router = express.Router();

function createServiceError(code, message, status = 500, details) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = status;
  if (details !== undefined) err.details = details;
  return err;
}

function buildDownloadURL(bucketName, filePath, token) {
  const encodedPath = encodeURIComponent(filePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media${token ? `&token=${token}` : ''}`;
}

// POST /files/upload
// Body: { fileName, contentType, data (base64 or dataURL), folder?, companyId? }
router.post('/upload', async (req, res, next) => {
  try {
    const { fileName, contentType, data, folder, companyId } = req.body || {};

    if (!fileName || !contentType || !data) {
      throw createServiceError('invalid-argument', 'fileName, contentType and data are required', 400);
    }

    // Optional companyId validation
    const cid = companyId || req.body?.companyId || req.query?.companyId;
    if (!cid) {
      // For stricter access control uncomment next line to enforce
      // throw createServiceError('invalid-argument', 'companyId is required', 400);
    }

    // Parse base64 data (supports raw base64 or data URL)
    let base64String = data;
    const dataUrlPrefix = /^data:[^;]+;base64,/;
    if (dataUrlPrefix.test(base64String)) {
      base64String = base64String.replace(dataUrlPrefix, '');
    }

    const buffer = Buffer.from(base64String, 'base64');

    const bucket = admin.storage().bucket();
    const bucketName = bucket.name;

    const ts = Date.now();
    const safeFolder = folder ? String(folder).replace(/[^a-zA-Z0-9/_-]/g, '') : 'uploads';
    const ownerFolder = cid ? `${cid}/` : '';
    const path = `${safeFolder}/${ownerFolder}${ts}-${fileName}`.replace(/\/+/, '/');

    const file = bucket.file(path);

    // Add a download token to mimic getDownloadURL-style public link
    const token = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${ts}-${Math.random().toString(36).slice(2)}`;

    await file.save(buffer, {
      contentType,
      metadata: {
        contentType,
        metadata: {
          firebaseStorageDownloadTokens: token,
          uploadedBy: req.user?.uid || 'unknown',
          companyId: cid || null,
        },
      },
      public: false,
      resumable: false,
      validation: 'crc32c',
    });

    const downloadURL = buildDownloadURL(bucketName, path, token);

    res.status(201).json({
      success: true,
      path,
      bucket: bucketName,
      contentType,
      size: buffer.length,
      downloadURL,
      token,
    });
  } catch (err) {
    next(err);
  }
});

// GET /files/signed-url?path=...&expiresIn=900
router.get('/signed-url', async (req, res, next) => {
  try {
    const { path, expiresIn } = req.query;
    if (!path) {
      throw createServiceError('invalid-argument', 'path is required', 400);
    }

    const bucket = admin.storage().bucket();
    const file = bucket.file(String(path));

    const [exists] = await file.exists();
    if (!exists) {
      throw createServiceError('not-found', 'File not found', 404);
    }

    const expires = Date.now() + (Number(expiresIn) > 0 ? Number(expiresIn) * 1000 : 15 * 60 * 1000);

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires,
    });

    res.json({ success: true, url, path });
  } catch (err) {
    next(err);
  }
});

// POST /files/delete { path }
router.post('/delete', async (req, res, next) => {
  try {
    const { path } = req.body || {};
    if (!path) {
      throw createServiceError('invalid-argument', 'path is required', 400);
    }

    const bucket = admin.storage().bucket();
    const file = bucket.file(path);
    await file.delete({ ignoreNotFound: true });

    res.json({ success: true, path, message: 'File deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

