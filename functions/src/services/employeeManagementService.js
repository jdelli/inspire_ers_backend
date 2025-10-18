const admin = require('../utils/firebaseAdmin');

const firestore = () => {
  if (typeof admin.firestore !== 'function') {
    throw new Error('Firestore is not initialized');
  }
  return admin.firestore();
};

const FieldValue = admin.firestore.FieldValue;
const EMPLOYEES_COLLECTION = 'employees';
const RECYCLE_BIN_COLLECTION = 'recycleBin';

const createServiceError = (code, message, details) => {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
};

const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const safeString = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return String(value).trim();
};

const calculateAge = (birthDate) => {
  if (!birthDate) {
    return null;
  }
  try {
    const today = new Date();
    const birth = new Date(birthDate);

    if (Number.isNaN(birth.getTime())) {
      return null;
    }

    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    return age;
  } catch (error) {
    return null;
  }
};

const cleanObject = (input) => {
  return Object.keys(input).reduce((acc, key) => {
    const value = input[key];
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});
};

const validateEmployeeData = (data) => {
  const errors = [];

  if (!safeString(data.firstName)) {
    errors.push('First name is required');
  }

  if (!safeString(data.lastName)) {
    errors.push('Last name is required');
  }

  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('Invalid email format');
  }

  if (data.basicPay && toNumber(data.basicPay) < 0) {
    errors.push('Basic pay cannot be negative');
  }

  if (data.dateHired) {
    const hireDate = new Date(data.dateHired);
    if (Number.isNaN(hireDate.getTime())) {
      errors.push('Invalid hire date format');
    }
  }

  if (data.birthDate) {
    const birthDate = new Date(data.birthDate);
    if (Number.isNaN(birthDate.getTime())) {
      errors.push('Invalid birth date format');
    }
  }

  return errors;
};

const prepareEmployeeRecord = (data, options = {}) => {
  const errors = validateEmployeeData(data);
  if (errors.length > 0) {
    throw createServiceError('invalid-argument', `Validation errors: ${errors.join(', ')}`, errors);
  }

  const firstName = safeString(data.firstName);
  const middleName = safeString(data.middleName || '');
  const lastName = safeString(data.lastName);
  const employeeName = [firstName, middleName, lastName].filter(Boolean).join(' ');

  const age = data.age ? toNumber(data.age) : calculateAge(data.birthDate);
  const basicPay = toNumber(data.basicPay, 0);
  const allowance = toNumber(data.allowance, 0);
  const transportationAllowance = toNumber(data.transportationAllowance, 0);
  const monthlySalary = basicPay + allowance + transportationAllowance;

  const employeeRecord = cleanObject({
    firstName,
    middleName,
    lastName,
    employeeName,
    idNumber: safeString(data.idNumber),
    dateHired: safeString(data.dateHired),
    birthDate: safeString(data.birthDate),
    age,
    email: safeString(data.email),
    cellphoneNumber: safeString(data.cellphoneNumber),
    currentAddress: safeString(data.currentAddress),
    permanentAddress: safeString(data.permanentAddress),
    bankName: safeString(data.bankName),
    bankAccount: safeString(data.bankAccount),
    position: safeString(data.position),
    department: safeString(data.department),
    employmentType: safeString(data.employmentType),
    status: safeString(data.status || 'Active'),
    basicPay,
    allowance,
    transportationAllowance,
    monthlySalary,
    basicSalary: basicPay, // For backward compatibility
    startDate: safeString(data.dateHired), // For backward compatibility
    phone: safeString(data.cellphoneNumber), // For backward compatibility
    sssNumber: safeString(data.sssNumber),
    philhealthNumber: safeString(data.philhealthNumber),
    pagibigNumber: safeString(data.pagibigNumber),
    tinNumber: safeString(data.tinNumber),
    civilStatus: safeString(data.civilStatus),
    emergencyContactPerson: safeString(data.emergencyContactPerson),
    emergencyContactNumber: safeString(data.emergencyContactNumber),
    emergencyRelationship: safeString(data.emergencyRelationship),
    photoURL: safeString(data.photoURL),
    nbiClearance: safeString(data.nbiClearance),
    tor: safeString(data.tor),
    coe: safeString(data.coe),
    sssDocument: safeString(data.sssDocument),
    philhealthDocument: safeString(data.philhealthDocument),
    pagibigDocument: safeString(data.pagibigDocument),
    tinDocument: safeString(data.tinDocument),
    companyId: safeString(data.companyId),
    processedAt: new Date().toISOString(),
  });

  if (options.userId) {
    employeeRecord.createdBy = options.userId;
  }

  if (options.email) {
    employeeRecord.createdByEmail = options.email;
  }

  return employeeRecord;
};

const createEmployee = async (payload = {}, options = {}) => {
  try {
    const employeeRecord = prepareEmployeeRecord(payload, options);

    const db = firestore();
    const docRef = db.collection(EMPLOYEES_COLLECTION).doc();

    await docRef.set({
      ...employeeRecord,
      id: docRef.id,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      employeeId: docRef.id,
      employee: {
        id: docRef.id,
        ...employeeRecord,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      message: `Employee ${employeeRecord.employeeName} created successfully`,
    };
  } catch (error) {
    if (error.code) {
      throw error;
    }
    throw createServiceError('internal', `Failed to create employee: ${error.message}`);
  }
};

const updateEmployee = async (employeeId, payload = {}, options = {}) => {
  if (!safeString(employeeId)) {
    throw createServiceError('invalid-argument', 'Employee ID is required');
  }

  try {
    const db = firestore();
    const employeeRef = db.collection(EMPLOYEES_COLLECTION).doc(employeeId);
    const snapshot = await employeeRef.get();

    if (!snapshot.exists) {
      throw createServiceError('not-found', `Employee with ID ${employeeId} not found`);
    }

    const existingData = snapshot.data();
    const mergedData = { ...existingData, ...payload };
    const employeeRecord = prepareEmployeeRecord(mergedData, options);

    await employeeRef.update({
      ...employeeRecord,
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (options.userId) {
      await employeeRef.update({
        updatedBy: options.userId,
      });
    }

    if (options.email) {
      await employeeRef.update({
        updatedByEmail: options.email,
      });
    }

    return {
      success: true,
      employeeId,
      employee: {
        id: employeeId,
        ...employeeRecord,
        updatedAt: new Date().toISOString(),
      },
      message: `Employee ${employeeRecord.employeeName} updated successfully`,
    };
  } catch (error) {
    if (error.code) {
      throw error;
    }
    throw createServiceError('internal', `Failed to update employee: ${error.message}`);
  }
};

const getEmployee = async (employeeId) => {
  if (!safeString(employeeId)) {
    throw createServiceError('invalid-argument', 'Employee ID is required');
  }

  try {
    const db = firestore();
    const employeeRef = db.collection(EMPLOYEES_COLLECTION).doc(employeeId);
    const snapshot = await employeeRef.get();

    if (!snapshot.exists) {
      throw createServiceError('not-found', `Employee with ID ${employeeId} not found`);
    }

    return {
      success: true,
      employee: {
        id: snapshot.id,
        ...snapshot.data(),
      },
    };
  } catch (error) {
    if (error.code) {
      throw error;
    }
    throw createServiceError('internal', `Failed to retrieve employee: ${error.message}`);
  }
};

const deleteEmployee = async (employeeId, payload = {}, options = {}) => {
  if (!safeString(employeeId)) {
    throw createServiceError('invalid-argument', 'Employee ID is required');
  }

  try {
    const db = firestore();
    const employeeRef = db.collection(EMPLOYEES_COLLECTION).doc(employeeId);
    const snapshot = await employeeRef.get();

    if (!snapshot.exists) {
      throw createServiceError('not-found', `Employee with ID ${employeeId} not found`);
    }

    const employeeData = snapshot.data();
    const deletionReason = safeString(payload.reason || '');
    const isHardDelete = payload.hardDelete === true;

    if (isHardDelete) {
      // Hard delete - permanently remove from database
      await employeeRef.delete();
      return {
        success: true,
        employeeId,
        message: `Employee ${employeeData.employeeName} permanently deleted`,
        deleted: true,
      };
    } else {
      // Soft delete - move to recycle bin
      const recycleBinRef = db.collection(RECYCLE_BIN_COLLECTION).doc(employeeId);

      await db.runTransaction(async (transaction) => {
        transaction.set(recycleBinRef, {
          ...employeeData,
          id: employeeId,
          deletedAt: FieldValue.serverTimestamp(),
          deletedBy: options.userId || null,
          deletedByEmail: options.email || null,
          deletionReason,
          originalCollection: EMPLOYEES_COLLECTION,
        });

        transaction.delete(employeeRef);
      });

      return {
        success: true,
        employeeId,
        message: `Employee ${employeeData.employeeName} moved to recycle bin`,
        deleted: false,
        recycleBinId: employeeId,
      };
    }
  } catch (error) {
    if (error.code) {
      throw error;
    }
    throw createServiceError('internal', `Failed to delete employee: ${error.message}`);
  }
};

const restoreEmployee = async (employeeId, options = {}) => {
  if (!safeString(employeeId)) {
    throw createServiceError('invalid-argument', 'Employee ID is required');
  }

  try {
    const db = firestore();
    const recycleBinRef = db.collection(RECYCLE_BIN_COLLECTION).doc(employeeId);
    const snapshot = await recycleBinRef.get();

    if (!snapshot.exists) {
      throw createServiceError('not-found', `No deleted employee found with ID ${employeeId}`);
    }

    const employeeData = snapshot.data();
    delete employeeData.deletedAt;
    delete employeeData.deletedBy;
    delete employeeData.deletedByEmail;
    delete employeeData.deletionReason;
    delete employeeData.originalCollection;

    const employeeRef = db.collection(EMPLOYEES_COLLECTION).doc(employeeId);

    await db.runTransaction(async (transaction) => {
      transaction.set(employeeRef, {
        ...employeeData,
        restoredAt: FieldValue.serverTimestamp(),
        restoredBy: options.userId || null,
        restoredByEmail: options.email || null,
      });

      transaction.delete(recycleBinRef);
    });

    return {
      success: true,
      employeeId,
      message: `Employee ${employeeData.employeeName} restored successfully`,
      employee: {
        id: employeeId,
        ...employeeData,
      },
    };
  } catch (error) {
    if (error.code) {
      throw error;
    }
    throw createServiceError('internal', `Failed to restore employee: ${error.message}`);
  }
};

const listEmployees = async (companyId, options = {}) => {
  try {
    const db = firestore();
    const pageSize = Math.max(1, Math.min(100, toNumber(options.pageSize, 20)));
    const pageNumber = Math.max(1, toNumber(options.pageNumber, 1));
    const offset = (pageNumber - 1) * pageSize;

    let query = db.collection(EMPLOYEES_COLLECTION);

    if (companyId) {
      query = query.where('companyId', '==', companyId);
    }

    if (options.status) {
      query = query.where('status', '==', options.status);
    }

    if (options.department) {
      query = query.where('department', '==', options.department);
    }

    if (options.searchTerm) {
      const searchLower = safeString(options.searchTerm).toLowerCase();
      query = query.where('employeeName', '>=', searchLower);
      query = query.where('employeeName', '<=', searchLower + '\uf8ff');
    }

    // Get total count
    const countSnapshot = await query.count().get();
    const totalCount = countSnapshot.data().count;

    // Get paginated results
    const snapshot = await query
      .orderBy('employeeName', 'asc')
      .limit(pageSize)
      .offset(offset)
      .get();

    const employees = [];
    snapshot.forEach((doc) => {
      employees.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      success: true,
      employees,
      pagination: {
        currentPage: pageNumber,
        pageSize,
        totalItems: totalCount,
        totalPages,
        hasNextPage: pageNumber < totalPages,
        hasPreviousPage: pageNumber > 1,
      },
    };
  } catch (error) {
    if (error.code) {
      throw error;
    }
    throw createServiceError('internal', `Failed to list employees: ${error.message}`);
  }
};

const bulkDeleteEmployees = async (employeeIds = [], payload = {}, options = {}) => {
  if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
    throw createServiceError('invalid-argument', 'At least one employee ID is required');
  }

  try {
    const db = firestore();
    const deletionReason = safeString(payload.reason || '');
    const isHardDelete = payload.hardDelete === true;

    const results = [];
    const errors = [];

    for (const employeeId of employeeIds) {
      try {
        const result = await deleteEmployee(employeeId, { reason: deletionReason, hardDelete: isHardDelete }, options);
        results.push(result);
      } catch (error) {
        errors.push({
          employeeId,
          error: error.message || 'Unknown error',
        });
      }
    }

    return {
      success: errors.length === 0,
      totalProcessed: employeeIds.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors,
    };
  } catch (error) {
    throw createServiceError('internal', `Failed to bulk delete employees: ${error.message}`);
  }
};

module.exports = {
  createEmployee,
  updateEmployee,
  getEmployee,
  deleteEmployee,
  restoreEmployee,
  listEmployees,
  bulkDeleteEmployees,
  prepareEmployeeRecord,
  validateEmployeeData,
  calculateAge,
};
