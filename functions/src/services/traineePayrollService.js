const admin = require('../utils/firebaseAdmin');

const firestore = () => {
  if (typeof admin.firestore !== 'function') throw new Error('Firestore is not initialized');
  return admin.firestore();
};

const createServiceError = (code, message, details) => {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
};

const safeString = (v) => (v == null ? '' : String(v).trim());

async function deleteTraineePayrollPeriod({ payDate, cutoffStartDate, cutoffEndDate }) {
  const db = firestore();
  if (!safeString(payDate)) {
    throw createServiceError('invalid-argument', 'payDate is required');
  }
  let q = db.collection('traineePayroll').where('payDate', '==', safeString(payDate));
  if (safeString(cutoffStartDate)) q = q.where('cutoffStartDate', '==', safeString(cutoffStartDate));
  if (safeString(cutoffEndDate)) q = q.where('cutoffEndDate', '==', safeString(cutoffEndDate));

  const snap = await q.get();
  let deletedMain = 0;
  let deletedSub = 0;
  for (const doc of snap.docs) {
    const subSnap = await doc.ref.collection('payrolls').get();
    const batch = db.batch();
    subSnap.forEach((s) => batch.delete(s.ref));
    if (!subSnap.empty) {
      await batch.commit();
      deletedSub += subSnap.size;
    }
    await doc.ref.delete();
    deletedMain += 1;
  }
  return { success: true, deletedPeriods: deletedMain, deletedRecords: deletedSub };
}

async function deleteTraineePayrollEmployee({ payDate, employeeId, cutoffStartDate, cutoffEndDate }) {
  const db = firestore();
  if (!safeString(payDate) || !safeString(employeeId)) {
    throw createServiceError('invalid-argument', 'payDate and employeeId are required');
  }
  let q = db.collection('traineePayroll').where('payDate', '==', safeString(payDate));
  if (safeString(cutoffStartDate)) q = q.where('cutoffStartDate', '==', safeString(cutoffStartDate));
  if (safeString(cutoffEndDate)) q = q.where('cutoffEndDate', '==', safeString(cutoffEndDate));
  const mainSnap = await q.get();
  let deleted = 0;
  for (const doc of mainSnap.docs) {
    const subSnap = await doc.ref.collection('payrolls').get();
    for (const s of subSnap.docs) {
      const data = s.data();
      if (safeString(data.employeeId) === safeString(employeeId)) {
        await s.ref.delete();
        deleted += 1;
      }
    }
  }
  if (deleted === 0) {
    throw createServiceError('not-found', 'No trainee payroll record found for the given employee');
  }
  return { success: true, deleted };
}

module.exports = { deleteTraineePayrollPeriod, deleteTraineePayrollEmployee };

