const nodemailer = require('nodemailer');

let cachedTransporter = null;
let cachedStatus = null;

function getBool(value, def = false) {
  if (value === undefined || value === null) return def;
  if (typeof value === 'boolean') return value;
  const v = String(value).toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function mask(value) {
  if (!value) return '';
  if (value.length <= 4) return '*'.repeat(value.length);
  return value.slice(0, 2) + '****' + value.slice(-2);
}

function getFromAddress() {
  const from = process.env.SMTP_FROM || process.env.MAIL_FROM || '';
  return from || 'Inspire ERS <no-reply@inspire-ers.local>';
}

async function buildDevFallbackTransport() {
  // For non-production: create an Ethereal test account automatically if real SMTP missing
  try {
    const testAccount = await nodemailer.createTestAccount();
    console.warn('[mailService] Using Ethereal test SMTP account (development fallback).');
    cachedStatus = {
      mode: 'ethereal-fallback',
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      user: testAccount.user,
      pass: '(hidden)',
      from: getFromAddress(),
      configured: true,
      fallback: true,
    };
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
  } catch (e) {
    console.error('[mailService] Failed to create Ethereal fallback account:', e.message);
    return null;
  }
}

function computeStatus({ host, port, user, pass, secure }) {
  return {
    mode: 'smtp',
    host,
    port,
    secure,
    user: mask(user),
    pass: pass ? '***' : '',
    from: getFromAddress(),
    configured: Boolean(host && port && user && pass),
    fallback: false,
  };
}

function getMailTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || process.env.SMTP_USERNAME;
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
  const secure = getBool(process.env.SMTP_SECURE, port === 465);

  cachedStatus = computeStatus({ host, port, user, pass, secure });

  if (!cachedStatus.configured) {
    console.warn('[mailService] SMTP env incomplete (HOST, PORT, USER, PASS required).');
    // Attempt dev fallback only if not production
    const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
    if (nodeEnv !== 'production') {
      return null; // fallback created asynchronously via explicit init if desired
    }
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  return cachedTransporter;
}

async function ensureTransport() {
  if (cachedTransporter) return cachedTransporter;
  const tx = getMailTransporter();
  if (tx) return tx;
  // Try dev fallback
  const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
  if (!cachedStatus?.configured && nodeEnv !== 'production') {
    cachedTransporter = await buildDevFallbackTransport();
    return cachedTransporter;
  }
  return null;
}

function getMailConfigStatus() {
  return cachedStatus || { configured: false, reason: 'Not initialized yet' };
}

module.exports = {
  getMailTransporter,
  ensureTransport,
  getMailConfigStatus,
  getFromAddress,
};
