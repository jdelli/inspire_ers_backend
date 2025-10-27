const express = require('express');
const cors = require('cors');

// Import route modules
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
const PORT = process.env.PORT || 5001;
// Keep the same base path used throughout the project/docs
const BASE = '/inspire-ers/us-central1/api';

// Middleware
app.use(cors({ origin: true }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Mount routes
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

// Health check for Render
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend server is running' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend is listening on port ${PORT}`);
  console.log(`Health check: GET /health`);
  console.log(`API base: ${BASE}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  process.exit(0);
});

