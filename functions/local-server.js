const express = require('express');
const cors = require('cors');

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
const payslipFunctions = require('./src/api/payslipFunctions');
const fileFunctions = require('./src/api/fileFunctions');
const traineePayrollFunctions = require('./src/api/traineePayrollFunctions');
const adminFunctions = require('./src/api/adminFunctions');

const app = express();
const PORT = 5001;
const BASE = '/inspire-ers/us-central1/api';

// Middleware
// Robust CORS for local testing across localhost and LAN IPs
app.use(
  cors({
    origin: (origin, callback) => {
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
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Vary', 'Origin');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json());

// Routes (mount under emulator-compatible base path)
app.use(`${BASE}/auth`, authFunctions);
app.use(`${BASE}/firestore`, firestoreFunctions);
app.use(`${BASE}/payroll`, payrollFunctions);
app.use(`${BASE}/commissions`, commissionFunctions);
app.use(`${BASE}/reports`, reportFunctions);
app.use(`${BASE}/reports/v4`, reportFunctionsPhase4);
app.use(`${BASE}/employee-mgmt`, employeeManagementFunctions);
app.use(`${BASE}/attendance`, attendanceFunctions);
app.use(`${BASE}/employees`, employeeFunctions);
app.use(`${BASE}/files`, fileFunctions);
app.use(`${BASE}/trainee-payroll`, traineePayrollFunctions);
app.use(`${BASE}/admin`, adminFunctions);
app.use(`${BASE}/payslips`, payslipFunctions);

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
