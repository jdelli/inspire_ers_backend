require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { attachRequestContext, requireAuthenticatedUser } = require('./src/middleware/requestContext');

// Import all the route modules
const authFunctions = require('./src/api/authFunctions');
const firestoreFunctions = require('./src/api/firestoreFunctions');
const payrollFunctions = require('./src/api/payrollFunctions');
const commissionFunctions = require('./src/api/commissionFunctions');
const reportFunctions = require('./src/api/reportFunctions');
const reportFunctionsPhase4 = require('./src/api/reportFunctionsPhase4');
const employeeFunctions = require('./src/api/employeeFunctions');
const employeeManagementFunctions = require('./src/api/employeeManagementFunctions');
const attendanceFunctions = require('./src/api/attendanceFunctions');
const holidayFunctions = require('./src/api/holidayFunctions');
const payslipFunctions = require('./src/api/payslipFunctions');
const fileFunctions = require('./src/api/fileFunctions');
const traineePayrollFunctions = require('./src/api/traineePayrollFunctions');
const adminFunctions = require('./src/api/adminFunctions');

console.log('Loading audit functions...');
const auditFunctions = require('./src/api/auditFunctions');
console.log('Audit functions loaded:', typeof auditFunctions, auditFunctions.stack ? 'Router object' : 'Unknown');

console.log('Loading activity functions...');
const activityFunctions = require('./src/api/activityFunctions');
console.log('Activity functions loaded:', typeof activityFunctions, activityFunctions.stack ? 'Router object' : 'Unknown');

const app = express();
const PORT = 5001;
const BASE = '/inspire-ers/us-central1/api';

// Middleware
// Request logger for debugging
app.use((req, res, next) => {
  console.log('\n🔔 [SERVER] Incoming Request:');
  console.log('  📍 Method:', req.method);
  console.log('  🌐 URL:', req.url);
  console.log('  🌍 Origin:', req.headers.origin || 'No Origin Header');
  console.log('  🔑 Content-Type:', req.headers['content-type'] || 'None');
  console.log('  📱 User-Agent:', req.headers['user-agent'] ? 'Present' : 'None');
  next();
});

// Robust CORS for local testing across localhost and LAN IPs
app.use(
  cors({
    origin: (origin, callback) => {
      console.log('🔐 [CORS Middleware] Checking origin:', origin || 'No origin');
      // Allow all origins in local dev; reflect the request origin if present
      callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);
// Preflight handler compatible with Express 5/path-to-regexp v6
app.use((req, res, next) => {
  const originHeader = req.headers.origin || '*';
  console.log('🔓 [CORS Headers] Setting Access-Control-Allow-Origin:', originHeader);
  res.header('Access-Control-Allow-Origin', originHeader);
  res.header('Vary', 'Origin');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    console.log('✅ [CORS] Responding to OPTIONS preflight');
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json());
app.use(attachRequestContext);

// Routes (mount under emulator-compatible base path)
app.use(`${BASE}/auth`, authFunctions);
app.use(`${BASE}/firestore`, firestoreFunctions);
app.use(`${BASE}/payroll`, requireAuthenticatedUser, payrollFunctions);
app.use(`${BASE}/commissions`, requireAuthenticatedUser, commissionFunctions);
app.use(`${BASE}/reports`, requireAuthenticatedUser, reportFunctions);
app.use(`${BASE}/reports/v4`, requireAuthenticatedUser, reportFunctionsPhase4);
app.use(`${BASE}/employee-mgmt`, requireAuthenticatedUser, employeeManagementFunctions);
app.use(`${BASE}/attendance`, requireAuthenticatedUser, attendanceFunctions);
app.use(`${BASE}/holidays`, requireAuthenticatedUser, holidayFunctions);
app.use(`${BASE}/employees`, employeeFunctions);
app.use(`${BASE}/files`, requireAuthenticatedUser, fileFunctions);
app.use(`${BASE}/trainee-payroll`, requireAuthenticatedUser, traineePayrollFunctions);
app.use(`${BASE}/admin`, requireAuthenticatedUser, adminFunctions);
app.use(`${BASE}/payslips`, requireAuthenticatedUser, payslipFunctions);

console.log('Mounting audit routes at:', `${BASE}/audit`);
app.use(`${BASE}/audit`, (req, res, next) => {
  console.log('Audit route hit:', req.method, req.path, req.url);
  next();
}, auditFunctions);
console.log('Audit routes mounted successfully');

console.log('Mounting activity routes at:', `${BASE}/activity`);
app.use(`${BASE}/activity`, requireAuthenticatedUser, (req, res, next) => {
  console.log('Activity route hit:', req.method, req.path, req.url);
  next();
}, activityFunctions);
console.log('Activity routes mounted successfully');

// Debug route to list all registered routes
app.get('/debug/routes', (req, res) => {
  const routes = [];
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    } else if (middleware.name === 'router' && middleware.handle.stack) {
      const basePath = middleware.regexp.source.replace(/\\\//g, '/').replace(/\^/g, '').replace(/\$/g, '').replace(/\?\(\?\=\/\|\$\)/g, '');
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          routes.push({
            path: basePath + handler.route.path,
            methods: Object.keys(handler.route.methods)
          });
        }
      });
    }
  });
  res.json({ routes });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend server is running' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  let localIP = '127.0.0.1';

  // Find the local network IP address
  // Prioritize standard network ranges (192.168.x.x, 10.x.x.x) over virtual adapters
  const candidates = [];
  for (const interfaceName in networkInterfaces) {
    for (const iface of networkInterfaces[interfaceName]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        candidates.push(iface.address);
      }
    }
  }

  // Prioritize 192.168.x.x and 10.x.x.x ranges (typical home/office networks)
  const preferredIP = candidates.find(ip => ip.startsWith('192.168.') || ip.startsWith('10.'));
  localIP = preferredIP || candidates[0] || '127.0.0.1';

  console.log(`🚀 Backend server running and accessible at:`);
  console.log(`   Local:   http://127.0.0.1:${PORT}`);
  console.log(`   Network: http://${localIP}:${PORT}`);
  console.log(`\n📊 Health check: http://${localIP}:${PORT}/health`);
  console.log(`\n📋 API Base URL for clients:`);
  console.log(`   http://${localIP}:${PORT}${BASE}`);
  console.log(`\n📋 Available endpoints:`);
  console.log(`   - ${BASE}/auth/*`);
  console.log(`   - ${BASE}/firestore/*`);
  console.log(`   - ${BASE}/payroll/*`);
  console.log(`   - ${BASE}/commissions/*`);
  console.log(`   - ${BASE}/reports/*`);
  console.log(`   - ${BASE}/employee-mgmt/*`);
  console.log(`   - ${BASE}/attendance/*`);
  console.log(`   - ${BASE}/holidays/*`);
  console.log(`   - ${BASE}/employees/*`);
  console.log(`\n⚠️  Configure firewall to allow port ${PORT} if needed`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down server...');
  process.exit(0);
});
