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
const PORT = process.env.PORT || 5001; // Use environment PORT for deployment
const BASE = '/inspire-ers/us-central1/api';

// Middleware
app.use(cors({ origin: true }));
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
  res.json({ 
    status: 'OK', 
    message: 'Backend server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'INSPIRE-ERS API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      api: BASE
    }
  });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 INSPIRE-ERS Backend Server`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Port: ${PORT}`);
  console.log(`   API Base: ${BASE}`);
  console.log(`   Health Check: /health`);
  console.log(`✅ Server is ready!`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

module.exports = app; // Export for testing
