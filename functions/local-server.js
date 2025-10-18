const express = require('express');
const cors = require('cors');

// Import all the route modules
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
app.use(cors({ origin: true }));
app.use(express.json());

// Routes (mount under emulator-compatible base path)
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
app.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 Backend server running on http://127.0.0.1:${PORT}`);
  console.log(`📊 Health check: http://127.0.0.1:${PORT}/health`);
  console.log(`📋 Available endpoints:`);
  console.log(`   - /payroll/*`);
  console.log(`   - /commissions/*`);
  console.log(`   - /reports/*`);
  console.log(`   - /employee-mgmt/*`);
  console.log(`   - /attendance/*`);
  console.log(`   - /employees/*`);
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
