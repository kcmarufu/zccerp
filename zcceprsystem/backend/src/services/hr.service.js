/**
 * HR Service
 * Business logic for Human Resources module
 * Column names match migration_category_and_hr.sql exactly
 */

const { query, transaction } = require('../config/database');

class HRService {

  // ========================================================================
  // EMPLOYEES
  // ========================================================================

  async getEmployees(filters = {}) {
    const { page = 1, limit = 25, search, departmentId, status, employmentType } = filters;
    const offset = (page - 1) * limit;
    let where = ['1=1'];
    let params = [];

    if (search) {
      where.push('(e.first_name LIKE ? OR e.last_name LIKE ? OR e.employee_number LIKE ? OR e.personal_email LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (departmentId) { where.push('e.department_id = ?'); params.push(departmentId); }
    if (status) { where.push('e.employment_status = ?'); params.push(status); }
    if (employmentType) { where.push('e.employment_type = ?'); params.push(employmentType); }

    const countSql = `SELECT COUNT(*) as total FROM hr_employees e WHERE ${where.join(' AND ')}`;
    const countResult = await query(countSql, [...params]);
    const total = countResult[0].total;

    const sql = `
      SELECT e.*, e.employment_type as contract_type,
             e.position_title as job_title,
             e.phone_primary as phone_number,
             d.department_name, 
             CONCAT(m.first_name, ' ', m.last_name) as supervisor_name
      FROM hr_employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN hr_employees m ON e.supervisor_id = m.id
      WHERE ${where.join(' AND ')}
      ORDER BY e.last_name, e.first_name
      LIMIT ${Number(limit)} OFFSET ${Number(offset)}
    `;
    const data = await query(sql, [...params]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getEmployeeById(id) {
    const sql = `
      SELECT e.*, e.employment_type as contract_type,
             e.position_title as job_title,
             e.phone_primary as phone_number,
             e.personal_email,
             d.department_name,
             CONCAT(m.first_name, ' ', m.last_name) as supervisor_name,
             u.email as system_email, r.role_name as system_role
      FROM hr_employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN hr_employees m ON e.supervisor_id = m.id
      LEFT JOIN users u ON e.user_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE e.id = ?
    `;
    const rows = await query(sql, [id]);
    if (rows.length === 0) return null;

    // Get contracts
    const contracts = await query(
      `SELECT * FROM hr_contracts WHERE employee_id = ? ORDER BY start_date DESC`,
      [id]
    );

    // Get leave balances for current year
    const leaveBalances = await query(
      `SELECT lb.*, lt.leave_name as leave_type_name,
              lt.default_days_per_year as max_days_per_year,
              lb.entitlement as total_days,
              lb.taken as used_days,
              lb.pending as pending_days,
              (lb.entitlement + lb.carried_forward - lb.taken - lb.pending) as remaining_days,
              lb.fiscal_year as year
       FROM hr_leave_balances lb
       JOIN hr_leave_types lt ON lb.leave_type_id = lt.id
       WHERE lb.employee_id = ? AND lb.fiscal_year = YEAR(NOW())`,
      [id]
    );

    return { ...rows[0], contracts, leaveBalances };
  }

  async createEmployee(data, createdBy) {
    return await transaction(async (connection) => {
      const employeeNumber = await this.generateEmployeeNumber(connection);
      
      const [result] = await connection.execute(
        `INSERT INTO hr_employees (
          employee_number, user_id, first_name, last_name, middle_name,
          date_of_birth, gender, marital_status, nationality,
          personal_email, work_email, phone_primary, phone_secondary,
          address, city, province,
          national_id, passport_number, passport_expiry, tax_id, nssa_number,
          nok_name, nok_relationship, nok_phone, nok_email, nok_address,
          bank_name, bank_branch, bank_account_number, bank_account_name, bank_currency,
          department_id, position_title, salary_grade_id, supervisor_id,
          duty_station, work_location,
          primary_donor_id, project_name,
          employment_type, employment_status, hire_date,
          probation_end_date, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          employeeNumber, data.user_id || null,
          data.first_name, data.last_name, data.middle_name || null,
          data.date_of_birth || null, data.gender || null,
          data.marital_status || null, data.nationality || 'Zimbabwean',
          data.personal_email || null, data.work_email || null,
          data.phone_primary || data.phone_number || null, data.phone_secondary || null,
          data.address || null, data.city || null, data.province || null,
          data.national_id || null, data.passport_number || null,
          data.passport_expiry || null, data.tax_id || null, data.nssa_number || null,
          data.nok_name || null, data.nok_relationship || null,
          data.nok_phone || null, data.nok_email || null, data.nok_address || null,
          data.bank_name || null, data.bank_branch || null,
          data.bank_account_number || null, data.bank_account_name || null,
          data.bank_currency || 'USD',
          data.department_id || null, data.position_title || data.job_title || null,
          data.salary_grade_id || null, data.supervisor_id || null,
          data.duty_station || null, data.work_location || 'OFFICE',
          data.primary_donor_id || null, data.project_name || null,
          data.employment_type || data.contract_type || 'FULL_TIME', data.employment_status || 'ACTIVE',
          data.hire_date || new Date(),
          data.probation_end_date || null, data.notes || null, createdBy
        ]
      );

      // Initialize leave balances for the current year
      await this.initializeLeaveBalances(connection, result.insertId);

      return { id: result.insertId, employee_number: employeeNumber };
    });
  }

  async updateEmployee(id, data, updatedBy) {
    // Map frontend field names to DB column names
    const mappedData = { ...data };
    if (data.contract_type !== undefined) { mappedData.employment_type = data.contract_type; }
    if (data.job_title !== undefined) { mappedData.position_title = data.job_title; }
    if (data.phone_number !== undefined) { mappedData.phone_primary = data.phone_number; }

    const fields = [];
    const params = [];

    const allowedFields = [
      'first_name', 'last_name', 'middle_name', 'date_of_birth', 'gender',
      'marital_status', 'nationality',
      'personal_email', 'work_email', 'phone_primary', 'phone_secondary',
      'address', 'city', 'province',
      'national_id', 'passport_number', 'passport_expiry', 'tax_id', 'nssa_number',
      'nok_name', 'nok_relationship', 'nok_phone', 'nok_email', 'nok_address',
      'bank_name', 'bank_branch', 'bank_account_number', 'bank_account_name', 'bank_currency',
      'department_id', 'position_title', 'salary_grade_id', 'supervisor_id',
      'duty_station', 'work_location',
      'primary_donor_id', 'project_name',
      'employment_type', 'employment_status', 'hire_date',
      'probation_end_date', 'confirmation_date', 'termination_date', 'termination_reason',
      'notes', 'photo_url'
    ];

    for (const field of allowedFields) {
      if (mappedData[field] !== undefined) {
        fields.push(`${field} = ?`);
        params.push(mappedData[field]);
      }
    }

    if (fields.length === 0) throw new Error('No fields to update');

    params.push(id);

    await query(`UPDATE hr_employees SET ${fields.join(', ')} WHERE id = ?`, params);
    return await this.getEmployeeById(id);
  }

  async generateEmployeeNumber(connection) {
    const [rows] = await connection.execute(
      `SELECT employee_number FROM hr_employees ORDER BY id DESC LIMIT 1`
    );
    if (rows.length === 0) return 'EMP-0001';
    const lastNum = parseInt(rows[0].employee_number.replace('EMP-', '')) || 0;
    return `EMP-${String(lastNum + 1).padStart(4, '0')}`;
  }

  async initializeLeaveBalances(connection, employeeId) {
    const [leaveTypes] = await connection.execute(
      `SELECT id, default_days_per_year FROM hr_leave_types WHERE is_active = 1`
    );
    const year = new Date().getFullYear();
    for (const lt of leaveTypes) {
      await connection.execute(
        `INSERT INTO hr_leave_balances (employee_id, leave_type_id, fiscal_year, entitlement, carried_forward, taken, pending)
         VALUES (?, ?, ?, ?, 0, 0, 0)`,
        [employeeId, lt.id, year, lt.default_days_per_year]
      );
    }
  }

  // ========================================================================
  // CONTRACTS
  // ========================================================================

  async getContracts(employeeId) {
    return await query(
      `SELECT c.*, CONCAT(e.first_name, ' ', e.last_name) as employee_name
       FROM hr_contracts c
       JOIN hr_employees e ON c.employee_id = e.id
       WHERE c.employee_id = ?
       ORDER BY c.start_date DESC`,
      [employeeId]
    );
  }

  async createContract(data, createdBy) {
    // Generate contract number
    const countResult = await query(`SELECT COUNT(*) as cnt FROM hr_contracts`);
    const contractNumber = `CTR-${String((countResult[0].cnt || 0) + 1).padStart(4, '0')}`;

    const result = await query(
      `INSERT INTO hr_contracts (employee_id, contract_number, contract_type, position_title,
       department_id, start_date, end_date, probation_months,
       basic_salary, currency_code, salary_grade_id,
       donor_id, project_name, budget_line_id,
       transport_allowance, housing_allowance, field_allowance, other_allowances,
       allowances_description, document_url, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.employee_id, contractNumber,
        data.contract_type || 'FIXED_TERM', data.position_title || null,
        data.department_id || null, data.start_date,
        data.end_date || null, data.probation_months || 3,
        data.basic_salary || 0, data.currency_code || 'USD',
        data.salary_grade_id || null,
        data.donor_id || null, data.project_name || null, data.budget_line_id || null,
        data.transport_allowance || 0, data.housing_allowance || 0,
        data.field_allowance || 0, data.other_allowances || 0,
        data.allowances_description || null,
        data.document_url || null, data.notes || null, createdBy
      ]
    );

    // Update employee employment_type
    await query(
      `UPDATE hr_employees SET employment_type = ? WHERE id = ?`,
      [data.contract_type || 'FIXED_TERM', data.employee_id]
    );

    return { id: result.insertId, contract_number: contractNumber };
  }

  async renewContract(contractId, data, createdBy) {
    return await transaction(async (connection) => {
      // Expire current contract
      await connection.execute(
        `UPDATE hr_contracts SET status = 'EXPIRED', end_date = CURDATE() WHERE id = ?`,
        [contractId]
      );

      // Get employee_id from old contract
      const [old] = await connection.execute(`SELECT employee_id, position_title, department_id FROM hr_contracts WHERE id = ?`, [contractId]);
      if (old.length === 0) throw new Error('Contract not found');
      const employeeId = old[0].employee_id;

      // Generate new contract number
      const [countRows] = await connection.execute(`SELECT COUNT(*) as cnt FROM hr_contracts`);
      const contractNumber = `CTR-${String((countRows[0].cnt || 0) + 1).padStart(4, '0')}`;

      // Create new contract
      const [result] = await connection.execute(
        `INSERT INTO hr_contracts (employee_id, contract_number, contract_type, position_title,
         department_id, start_date, end_date, basic_salary, currency_code, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          employeeId, contractNumber,
          data.contract_type || 'FIXED_TERM',
          data.position_title || old[0].position_title,
          data.department_id || old[0].department_id,
          data.start_date || new Date(),
          data.end_date || null, data.basic_salary || 0,
          data.currency_code || 'USD', data.notes || null, createdBy
        ]
      );

      return { id: result.insertId, contract_number: contractNumber };
    });
  }

  // ========================================================================
  // LEAVE MANAGEMENT
  // ========================================================================

  async getLeaveTypes() {
    return await query(`SELECT * FROM hr_leave_types WHERE is_active = 1 ORDER BY leave_name`);
  }

  async getLeaveRequests(filters = {}) {
    const { page = 1, limit = 25, employeeId, departmentId, status, year } = filters;
    const offset = (page - 1) * limit;
    let where = ['1=1'];
    let params = [];

    if (employeeId) { where.push('lr.employee_id = ?'); params.push(employeeId); }
    if (departmentId) { where.push('e.department_id = ?'); params.push(departmentId); }
    if (status) { where.push('lr.status = ?'); params.push(status); }
    if (year) { where.push('YEAR(lr.start_date) = ?'); params.push(year); }

    const countResult = await query(
      `SELECT COUNT(*) as total FROM hr_leave_requests lr JOIN hr_employees e ON lr.employee_id = e.id WHERE ${where.join(' AND ')}`,
      [...params]
    );

    const sql = `
      SELECT lr.*, lr.days_requested as total_days,
             lt.leave_name as leave_type_name,
             CONCAT(e.first_name, ' ', e.last_name) as employee_name,
             e.department_id, d.department_name,
             CONCAT(au.first_name, ' ', au.last_name) as approved_by_name,
             lr.rejection_reason as approval_comments
      FROM hr_leave_requests lr
      JOIN hr_employees e ON lr.employee_id = e.id
      JOIN hr_leave_types lt ON lr.leave_type_id = lt.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users au ON lr.approved_by = au.id
      WHERE ${where.join(' AND ')}
      ORDER BY lr.created_at DESC
      LIMIT ${Number(limit)} OFFSET ${Number(offset)}
    `;
    const data = await query(sql, [...params]);

    return { data, total: countResult[0].total, page, limit, totalPages: Math.ceil(countResult[0].total / limit) };
  }

  async createLeaveRequest(data, requestedBy) {
    return await transaction(async (connection) => {
      // Get employee record for the user
      const [employees] = await connection.execute(
        `SELECT id FROM hr_employees WHERE user_id = ? OR id = ?`,
        [requestedBy, data.employee_id || 0]
      );
      if (employees.length === 0) throw new Error('Employee record not found');
      const employeeId = data.employee_id || employees[0].id;

      // Calculate days
      const startDate = new Date(data.start_date);
      const endDate = new Date(data.end_date);
      const diffTime = Math.abs(endDate - startDate);
      const daysRequested = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      // Check leave balance
      const year = startDate.getFullYear();
      const [balances] = await connection.execute(
        `SELECT * FROM hr_leave_balances WHERE employee_id = ? AND leave_type_id = ? AND fiscal_year = ?`,
        [employeeId, data.leave_type_id, year]
      );

      if (balances.length > 0) {
        const bal = balances[0];
        const available = Number(bal.entitlement) + Number(bal.carried_forward) - Number(bal.taken) - Number(bal.pending);
        if (available < daysRequested) {
          throw new Error(`Insufficient leave balance. Available: ${available} days, Requested: ${daysRequested} days`);
        }
        // Increment pending
        await connection.execute(
          `UPDATE hr_leave_balances SET pending = pending + ? WHERE id = ?`,
          [daysRequested, bal.id]
        );
      }

      const [result] = await connection.execute(
        `INSERT INTO hr_leave_requests (employee_id, leave_type_id, start_date, end_date,
         days_requested, reason, status)
         VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
        [employeeId, data.leave_type_id, data.start_date, data.end_date, daysRequested, data.reason || null]
      );

      return { id: result.insertId, days_requested: daysRequested };
    });
  }

  async approveLeaveRequest(leaveRequestId, approverId, comments, approved = true) {
    return await transaction(async (connection) => {
      const [requests] = await connection.execute(
        `SELECT lr.*, e.department_id FROM hr_leave_requests lr 
         JOIN hr_employees e ON lr.employee_id = e.id
         WHERE lr.id = ? FOR UPDATE`,
        [leaveRequestId]
      );
      if (requests.length === 0) throw new Error('Leave request not found');
      const request = requests[0];
      if (request.status !== 'PENDING') throw new Error('Leave request is not pending');

      const newStatus = approved ? 'APPROVED' : 'REJECTED';
      await connection.execute(
        `UPDATE hr_leave_requests SET status = ?, approved_by = ?, rejection_reason = ?, 
         approved_at = NOW() WHERE id = ?`,
        [newStatus, approverId, approved ? null : (comments || null), leaveRequestId]
      );

      // Update leave balance
      const year = new Date(request.start_date).getFullYear();
      if (approved) {
        // Move from pending to taken
        await connection.execute(
          `UPDATE hr_leave_balances SET pending = GREATEST(pending - ?, 0), 
           taken = taken + ? WHERE employee_id = ? AND leave_type_id = ? AND fiscal_year = ?`,
          [request.days_requested, request.days_requested, request.employee_id, request.leave_type_id, year]
        );
      } else {
        // Restore: remove from pending
        await connection.execute(
          `UPDATE hr_leave_balances SET pending = GREATEST(pending - ?, 0) 
           WHERE employee_id = ? AND leave_type_id = ? AND fiscal_year = ?`,
          [request.days_requested, request.employee_id, request.leave_type_id, year]
        );
      }

      return { id: leaveRequestId, status: newStatus };
    });
  }

  async getLeaveBalances(employeeId, year) {
    const currentYear = year || new Date().getFullYear();
    return await query(
      `SELECT lb.*, lt.leave_name as leave_type_name,
              lt.default_days_per_year as max_days_per_year,
              lb.entitlement as total_days,
              lb.taken as used_days,
              lb.pending as pending_days,
              (lb.entitlement + lb.carried_forward - lb.taken - lb.pending) as remaining_days,
              lb.fiscal_year as year
       FROM hr_leave_balances lb
       JOIN hr_leave_types lt ON lb.leave_type_id = lt.id
       WHERE lb.employee_id = ? AND lb.fiscal_year = ?
       ORDER BY lt.leave_name`,
      [employeeId, currentYear]
    );
  }

  // ========================================================================
  // TIMESHEETS
  // ========================================================================

  async getTimesheets(filters = {}) {
    const { page = 1, limit = 25, employeeId, departmentId, status, month, year } = filters;
    const offset = (page - 1) * limit;
    let where = ['1=1'];
    let params = [];

    if (employeeId) { where.push('t.employee_id = ?'); params.push(employeeId); }
    if (departmentId) { where.push('e.department_id = ?'); params.push(departmentId); }
    if (status) { where.push('t.status = ?'); params.push(status); }
    if (month) { where.push('t.period_month = ?'); params.push(month); }
    if (year) { where.push('t.period_year = ?'); params.push(year); }

    const countResult = await query(
      `SELECT COUNT(*) as total FROM hr_timesheets t JOIN hr_employees e ON t.employee_id = e.id WHERE ${where.join(' AND ')}`,
      [...params]
    );

    const sql = `
      SELECT t.*, t.period_month as month, t.period_year as year,
             CONCAT(e.first_name, ' ', e.last_name) as employee_name,
             d.department_name,
             CONCAT(su.first_name, ' ', su.last_name) as approved_by_name
      FROM hr_timesheets t
      JOIN hr_employees e ON t.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users su ON t.supervisor_approved_by = su.id
      WHERE ${where.join(' AND ')}
      ORDER BY t.period_year DESC, t.period_month DESC
      LIMIT ${Number(limit)} OFFSET ${Number(offset)}
    `;
    const data = await query(sql, [...params]);

    return { data, total: countResult[0].total, page, limit, totalPages: Math.ceil(countResult[0].total / limit) };
  }

  async getTimesheetById(id) {
    const timesheet = await query(
      `SELECT t.*, t.period_month as month, t.period_year as year,
              CONCAT(e.first_name, ' ', e.last_name) as employee_name,
              d.department_name
       FROM hr_timesheets t
       JOIN hr_employees e ON t.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE t.id = ?`, [id]
    );
    if (timesheet.length === 0) return null;

    const entries = await query(
      `SELECT te.*, te.hours as hours_worked, te.project_name as project_code,
              dn.donor_name
       FROM hr_timesheet_entries te
       LEFT JOIN donors dn ON te.donor_id = dn.id
       WHERE te.timesheet_id = ?
       ORDER BY te.entry_date`, [id]
    );

    return { ...timesheet[0], entries };
  }

  async createTimesheet(data, createdBy) {
    return await transaction(async (connection) => {
      // Get employee
      const [employees] = await connection.execute(
        `SELECT id FROM hr_employees WHERE user_id = ? OR id = ?`,
        [createdBy, data.employee_id || 0]
      );
      if (employees.length === 0) throw new Error('Employee record not found');
      const employeeId = data.employee_id || employees[0].id;

      // Check if timesheet already exists for this period
      const [existing] = await connection.execute(
        `SELECT id FROM hr_timesheets WHERE employee_id = ? AND period_month = ? AND period_year = ?`,
        [employeeId, periodMonth, periodYear]
      );
      if (existing.length > 0) throw new Error('Timesheet already exists for this period');

      const periodMonth = data.period_month || data.month;
      const periodYear = data.period_year || data.year;
      const [result] = await connection.execute(
        `INSERT INTO hr_timesheets (employee_id, period_month, period_year, total_hours, status, notes)
         VALUES (?, ?, ?, 0, 'DRAFT', ?)`,
        [employeeId, periodMonth, periodYear, data.notes || null]
      );

      // Insert entries
      if (data.entries && data.entries.length > 0) {
        let totalHours = 0;
        for (const entry of data.entries) {
          const entryHours = entry.hours || entry.hours_worked || 0;
          await connection.execute(
            `INSERT INTO hr_timesheet_entries (timesheet_id, entry_date, hours,
             donor_id, project_name, activity_description, is_overtime)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              result.insertId, entry.entry_date, entryHours,
              entry.donor_id || null, entry.project_name || entry.project_code || null,
              entry.activity_description || null, entry.is_overtime || false
            ]
          );
          totalHours += Number(entryHours);
        }
        await connection.execute(
          `UPDATE hr_timesheets SET total_hours = ? WHERE id = ?`,
          [totalHours, result.insertId]
        );
      }

      return { id: result.insertId };
    });
  }

  async submitTimesheet(timesheetId, userId) {
    const timesheets = await query(`SELECT * FROM hr_timesheets WHERE id = ?`, [timesheetId]);
    if (timesheets.length === 0) throw new Error('Timesheet not found');
    if (timesheets[0].status !== 'DRAFT') throw new Error('Timesheet is not in draft status');

    await query(
      `UPDATE hr_timesheets SET status = 'SUBMITTED', submitted_at = NOW() WHERE id = ?`,
      [timesheetId]
    );
    return { id: timesheetId, status: 'SUBMITTED' };
  }

  async approveTimesheet(timesheetId, approverId, comments, approved = true) {
    return await transaction(async (connection) => {
      const [timesheets] = await connection.execute(
        `SELECT * FROM hr_timesheets WHERE id = ? FOR UPDATE`, [timesheetId]
      );
      if (timesheets.length === 0) throw new Error('Timesheet not found');
      if (timesheets[0].status !== 'SUBMITTED') throw new Error('Timesheet is not submitted');

      const newStatus = approved ? 'SUPERVISOR_APPROVED' : 'REJECTED';
      await connection.execute(
        `UPDATE hr_timesheets SET status = ?, supervisor_approved_by = ?,
         rejection_reason = ?, supervisor_approved_at = NOW() WHERE id = ?`,
        [newStatus, approverId, approved ? null : (comments || null), timesheetId]
      );

      return { id: timesheetId, status: newStatus };
    });
  }

  // ========================================================================
  // PAYROLL
  // ========================================================================

  async getPayrollPeriods(filters = {}) {
    const { page = 1, limit = 25, year, status } = filters;
    const offset = (page - 1) * limit;
    let where = ['1=1'];
    let params = [];

    if (year) { where.push('pp.period_year = ?'); params.push(year); }
    if (status) { where.push('pp.status = ?'); params.push(status); }

    const countResult = await query(
      `SELECT COUNT(*) as total FROM hr_payroll_periods pp WHERE ${where.join(' AND ')}`, [...params]
    );

    const data = await query(
      `SELECT pp.*, 
              (SELECT COUNT(*) FROM hr_payroll_records pr WHERE pr.payroll_period_id = pp.id) as record_count,
              (SELECT SUM(net_pay) FROM hr_payroll_records pr WHERE pr.payroll_period_id = pp.id) as total_net
       FROM hr_payroll_periods pp
       WHERE ${where.join(' AND ')}
       ORDER BY pp.period_year DESC, pp.period_month DESC
       LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      [...params]
    );

    return { data, total: countResult[0].total, page, limit, totalPages: Math.ceil(countResult[0].total / limit) };
  }

  async getPayrollRecords(periodId) {
    return await query(
      `SELECT pr.*, CONCAT(e.first_name, ' ', e.last_name) as employee_name,
              e.employee_number, e.bank_name, e.bank_account_number,
              d.department_name
       FROM hr_payroll_records pr
       JOIN hr_employees e ON pr.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE pr.payroll_period_id = ?
       ORDER BY e.last_name, e.first_name`,
      [periodId]
    );
  }

  // ========================================================================
  // PERFORMANCE REVIEWS
  // ========================================================================

  async getPerformanceReviews(filters = {}) {
    const { page = 1, limit = 25, employeeId, departmentId, reviewPeriod, status } = filters;
    const offset = (page - 1) * limit;
    let where = ['1=1'];
    let params = [];

    if (employeeId) { where.push('pr.employee_id = ?'); params.push(employeeId); }
    if (departmentId) { where.push('e.department_id = ?'); params.push(departmentId); }
    if (reviewPeriod) { where.push('pr.review_period = ?'); params.push(reviewPeriod); }
    if (status) { where.push('pr.status = ?'); params.push(status); }

    const countResult = await query(
      `SELECT COUNT(*) as total FROM hr_performance_reviews pr JOIN hr_employees e ON pr.employee_id = e.id WHERE ${where.join(' AND ')}`,
      [...params]
    );

    const sql = `
      SELECT pr.*, pr.areas_for_improvement as areas_of_improvement,
             pr.reviewer_comments as comments,
             pr.overall_rating,
             CONCAT(e.first_name, ' ', e.last_name) as employee_name,
             e.employee_number, e.position_title as job_title, d.department_name,
             CONCAT(ru.first_name, ' ', ru.last_name) as reviewer_name
      FROM hr_performance_reviews pr
      JOIN hr_employees e ON pr.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users ru ON pr.reviewer_id = ru.id
      WHERE ${where.join(' AND ')}
      ORDER BY pr.review_date DESC
      LIMIT ${Number(limit)} OFFSET ${Number(offset)}
    `;
    const data = await query(sql, [...params]);

    return { data, total: countResult[0].total, page, limit, totalPages: Math.ceil(countResult[0].total / limit) };
  }

  async createPerformanceReview(data, createdBy) {
    const result = await query(
      `INSERT INTO hr_performance_reviews (employee_id, reviewer_id, review_period, review_type,
       review_date, job_knowledge_score, quality_of_work_score, productivity_score,
       communication_score, teamwork_score, initiative_score, attendance_score,
       overall_score, overall_rating,
       goals_json, achievements, areas_for_improvement,
       training_recommendations, reviewer_comments, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.employee_id, data.reviewer_id || createdBy, data.review_period,
        data.review_type || 'ANNUAL', data.review_date || new Date(),
        data.job_knowledge_score || null, data.quality_of_work_score || null,
        data.productivity_score || null, data.communication_score || null,
        data.teamwork_score || null, data.initiative_score || null,
        data.attendance_score || null, data.overall_score || null,
        data.overall_rating || null,
        data.goals_json ? JSON.stringify(data.goals_json) : null,
        data.achievements || null, data.areas_for_improvement || null,
        data.training_recommendations || null, data.reviewer_comments || null,
        data.status || 'DRAFT'
      ]
    );
    return { id: result.insertId };
  }

  async updatePerformanceReview(id, data) {
    const fields = [];
    const params = [];

    if (data.goals_json !== undefined) { fields.push('goals_json = ?'); params.push(JSON.stringify(data.goals_json)); }
    if (data.achievements !== undefined) { fields.push('achievements = ?'); params.push(data.achievements); }
    if (data.areas_for_improvement !== undefined || data.areas_of_improvement !== undefined) { fields.push('areas_for_improvement = ?'); params.push(data.areas_for_improvement || data.areas_of_improvement); }
    if (data.training_recommendations !== undefined) { fields.push('training_recommendations = ?'); params.push(data.training_recommendations); }
    if (data.overall_rating !== undefined) { fields.push('overall_rating = ?'); params.push(data.overall_rating); }
    if (data.overall_score !== undefined) { fields.push('overall_score = ?'); params.push(data.overall_score); }
    if (data.reviewer_comments !== undefined || data.comments !== undefined) { fields.push('reviewer_comments = ?'); params.push(data.reviewer_comments || data.comments); }
    if (data.employee_comments !== undefined) { fields.push('employee_comments = ?'); params.push(data.employee_comments); }
    if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status); }
    if (data.job_knowledge_score !== undefined) { fields.push('job_knowledge_score = ?'); params.push(data.job_knowledge_score); }
    if (data.quality_of_work_score !== undefined) { fields.push('quality_of_work_score = ?'); params.push(data.quality_of_work_score); }
    if (data.productivity_score !== undefined) { fields.push('productivity_score = ?'); params.push(data.productivity_score); }
    if (data.communication_score !== undefined) { fields.push('communication_score = ?'); params.push(data.communication_score); }
    if (data.teamwork_score !== undefined) { fields.push('teamwork_score = ?'); params.push(data.teamwork_score); }
    if (data.initiative_score !== undefined) { fields.push('initiative_score = ?'); params.push(data.initiative_score); }
    if (data.attendance_score !== undefined) { fields.push('attendance_score = ?'); params.push(data.attendance_score); }
    if (data.employee_acknowledged !== undefined) { 
      fields.push('employee_acknowledged = ?'); params.push(data.employee_acknowledged);
      if (data.employee_acknowledged) { fields.push('acknowledged_at = NOW()'); }
    }

    if (fields.length === 0) throw new Error('No fields to update');
    params.push(id);

    await query(`UPDATE hr_performance_reviews SET ${fields.join(', ')} WHERE id = ?`, params);
    return { id };
  }

  // ========================================================================
  // TRAINING RECORDS
  // ========================================================================

  async getTrainingRecords(filters = {}) {
    const { page = 1, limit = 25, employeeId, departmentId, status } = filters;
    const offset = (page - 1) * limit;
    let where = ['1=1'];
    let params = [];

    if (employeeId) { where.push('tr.employee_id = ?'); params.push(employeeId); }
    if (departmentId) { where.push('e.department_id = ?'); params.push(departmentId); }
    if (status) { where.push('tr.status = ?'); params.push(status); }

    const countResult = await query(
      `SELECT COUNT(*) as total FROM hr_training_records tr JOIN hr_employees e ON tr.employee_id = e.id WHERE ${where.join(' AND ')}`,
      [...params]
    );

    const sql = `
      SELECT tr.*, tr.training_name as training_title,
             tr.currency_code as currency,
             IF(tr.certification_name IS NOT NULL, 1, 0) as certification_received,
             CONCAT(e.first_name, ' ', e.last_name) as employee_name,
             e.employee_number, d.department_name,
             dn.donor_name,
             IF(tr.donor_id IS NOT NULL, 1, 0) as donor_funded
      FROM hr_training_records tr
      JOIN hr_employees e ON tr.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN donors dn ON tr.donor_id = dn.id
      WHERE ${where.join(' AND ')}
      ORDER BY tr.start_date DESC
      LIMIT ${Number(limit)} OFFSET ${Number(offset)}
    `;
    const data = await query(sql, [...params]);

    return { data, total: countResult[0].total, page, limit, totalPages: Math.ceil(countResult[0].total / limit) };
  }

  async createTrainingRecord(data, createdBy) {
    const result = await query(
      `INSERT INTO hr_training_records (employee_id, training_name, training_type, provider,
       start_date, end_date, duration_hours, cost, currency_code, donor_id,
       certification_name, certification_expiry, certificate_url,
       status, approved_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.employee_id, data.training_name || data.training_title, data.training_type || 'EXTERNAL',
        data.provider || null, data.start_date, data.end_date || null,
        data.duration_hours || null, data.cost || 0,
        data.currency_code || data.currency || 'USD', data.donor_id || null,
        data.certification_name || null, data.certification_expiry || null,
        data.certificate_url || null,
        data.status || 'PLANNED', data.approved_by || null, data.notes || null
      ]
    );
    return { id: result.insertId };
  }

  // ========================================================================
  // DISCIPLINARY RECORDS
  // ========================================================================

  async getDisciplinaryRecords(filters = {}) {
    const { page = 1, limit = 25, employeeId, type, status } = filters;
    const offset = (page - 1) * limit;
    let where = ['1=1'];
    let params = [];

    if (employeeId) { where.push('dr.employee_id = ?'); params.push(employeeId); }
    if (type) { where.push('dr.incident_type = ?'); params.push(type); }
    if (status) { where.push('dr.status = ?'); params.push(status); }

    const countResult = await query(
      `SELECT COUNT(*) as total FROM hr_disciplinary_records dr WHERE ${where.join(' AND ')}`, [...params]
    );

    const sql = `
      SELECT dr.*, CONCAT(e.first_name, ' ', e.last_name) as employee_name,
             e.employee_number, 
             CONCAT(ru.first_name, ' ', ru.last_name) as reported_by_name
      FROM hr_disciplinary_records dr
      JOIN hr_employees e ON dr.employee_id = e.id
      LEFT JOIN users ru ON dr.reported_by = ru.id
      WHERE ${where.join(' AND ')}
      ORDER BY dr.incident_date DESC
      LIMIT ${Number(limit)} OFFSET ${Number(offset)}
    `;
    const data = await query(sql, [...params]);

    return { data, total: countResult[0].total, page, limit, totalPages: Math.ceil(countResult[0].total / limit) };
  }

  async createDisciplinaryRecord(data, createdBy) {
    const result = await query(
      `INSERT INTO hr_disciplinary_records (employee_id, incident_date, incident_type, severity,
       description, action_taken, warning_level, investigation_notes,
       reported_by, status, follow_up_date, document_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.employee_id, data.incident_date,
        data.incident_type || 'WARNING', data.severity || 'MINOR',
        data.description, data.action_taken || null,
        data.warning_level || null, data.investigation_notes || null,
        createdBy, data.status || 'OPEN',
        data.follow_up_date || null, data.document_url || null
      ]
    );
    return { id: result.insertId };
  }

  // ========================================================================
  // EXIT / CLEARANCE
  // ========================================================================

  async getExitClearances(filters = {}) {
    const { page = 1, limit = 25, status } = filters;
    const offset = (page - 1) * limit;
    let where = ['1=1'];
    let params = [];

    if (status) { where.push('ec.status = ?'); params.push(status); }

    const countResult = await query(
      `SELECT COUNT(*) as total FROM hr_exit_clearance ec WHERE ${where.join(' AND ')}`, [...params]
    );

    const sql = `
      SELECT ec.*, CONCAT(e.first_name, ' ', e.last_name) as employee_name,
             e.employee_number, e.position_title, d.department_name
      FROM hr_exit_clearance ec
      JOIN hr_employees e ON ec.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE ${where.join(' AND ')}
      ORDER BY ec.created_at DESC
      LIMIT ${Number(limit)} OFFSET ${Number(offset)}
    `;
    const data = await query(sql, [...params]);

    return { data, total: countResult[0].total, page, limit, totalPages: Math.ceil(countResult[0].total / limit) };
  }

  async initiateExitClearance(data, createdBy) {
    return await transaction(async (connection) => {
      const [result] = await connection.execute(
        `INSERT INTO hr_exit_clearance (employee_id, exit_type, exit_date, notice_date,
         last_working_date, reason, status, processed_by)
         VALUES (?, ?, ?, ?, ?, ?, 'INITIATED', ?)`,
        [
          data.employee_id, data.exit_type || 'RESIGNATION',
          data.exit_date, data.notice_date || null,
          data.last_working_date || null, data.reason || null, createdBy
        ]
      );

      // Update employee status
      await connection.execute(
        `UPDATE hr_employees SET employment_status = 'SUSPENDED' WHERE id = ?`,
        [data.employee_id]
      );

      return { id: result.insertId };
    });
  }

  async updateExitClearance(id, data) {
    const fields = [];
    const params = [];

    if (data.it_cleared !== undefined) { fields.push('it_cleared = ?'); params.push(data.it_cleared ? 1 : 0); }
    if (data.finance_cleared !== undefined) { fields.push('finance_cleared = ?'); params.push(data.finance_cleared ? 1 : 0); }
    if (data.hr_cleared !== undefined) { fields.push('hr_cleared = ?'); params.push(data.hr_cleared ? 1 : 0); }
    if (data.assets_returned !== undefined) { fields.push('assets_returned = ?'); params.push(data.assets_returned ? 1 : 0); }
    if (data.admin_cleared !== undefined) { fields.push('admin_cleared = ?'); params.push(data.admin_cleared ? 1 : 0); }
    if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status); }
    if (data.exit_interview_conducted !== undefined) { fields.push('exit_interview_conducted = ?'); params.push(data.exit_interview_conducted ? 1 : 0); }
    if (data.exit_interview_notes !== undefined) { fields.push('exit_interview_notes = ?'); params.push(data.exit_interview_notes); }
    if (data.outstanding_leave_days !== undefined) { fields.push('outstanding_leave_days = ?'); params.push(data.outstanding_leave_days); }
    if (data.leave_payment !== undefined) { fields.push('leave_payment = ?'); params.push(data.leave_payment); }
    if (data.outstanding_advances !== undefined) { fields.push('outstanding_advances = ?'); params.push(data.outstanding_advances); }
    if (data.final_salary !== undefined) { fields.push('final_salary = ?'); params.push(data.final_salary); }
    if (data.gratuity !== undefined) { fields.push('gratuity = ?'); params.push(data.gratuity); }
    if (data.total_final_payment !== undefined) { fields.push('total_final_payment = ?'); params.push(data.total_final_payment); }

    if (fields.length === 0) throw new Error('No fields to update');
    params.push(id);

    await query(`UPDATE hr_exit_clearance SET ${fields.join(', ')} WHERE id = ?`, params);

    // If completed, terminate employee
    if (data.status === 'COMPLETED') {
      const clearance = await query(`SELECT employee_id FROM hr_exit_clearance WHERE id = ?`, [id]);
      if (clearance.length > 0) {
        await query(
          `UPDATE hr_employees SET employment_status = 'TERMINATED', termination_date = CURDATE() WHERE id = ?`,
          [clearance[0].employee_id]
        );
      }
    }

    return { id };
  }

  // ========================================================================
  // HR DOCUMENTS
  // ========================================================================

  async getDocuments(employeeId) {
    return await query(
      `SELECT * FROM hr_documents WHERE employee_id = ? AND is_active = 1 ORDER BY created_at DESC`,
      [employeeId]
    );
  }

  async createDocument(data, uploadedBy) {
    const result = await query(
      `INSERT INTO hr_documents (employee_id, document_type, document_name, file_url,
       file_size, expiry_date, description, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.employee_id, data.document_type, data.document_name,
        data.file_url, data.file_size || 0, data.expiry_date || null,
        data.description || null, uploadedBy
      ]
    );
    return { id: result.insertId };
  }

  async deleteDocument(id) {
    await query(`UPDATE hr_documents SET is_active = 0 WHERE id = ?`, [id]);
    return { success: true };
  }

  // ========================================================================
  // HR DASHBOARD STATS
  // ========================================================================

  async getDashboardStats(departmentId = null) {
    let deptFilter = '';
    let params = [];
    if (departmentId) {
      deptFilter = 'WHERE department_id = ?';
      params.push(departmentId);
    }

    const totalEmployees = await query(
      `SELECT COUNT(*) as count FROM hr_employees ${deptFilter}`, params
    );

    const byStatus = await query(
      `SELECT employment_status, COUNT(*) as count FROM hr_employees ${deptFilter} GROUP BY employment_status`, params
    );

    const byDepartment = await query(
      `SELECT d.department_name, COUNT(*) as count 
       FROM hr_employees e 
       LEFT JOIN departments d ON e.department_id = d.id 
       ${departmentId ? 'WHERE e.department_id = ?' : ''}
       GROUP BY e.department_id, d.department_name`, params
    );

    const byEmploymentType = await query(
      `SELECT employment_type, COUNT(*) as count FROM hr_employees ${deptFilter} GROUP BY employment_type`, params
    );

    const pendingLeaveRequests = await query(
      `SELECT COUNT(*) as count FROM hr_leave_requests lr
       JOIN hr_employees e ON lr.employee_id = e.id
       WHERE lr.status = 'PENDING' ${departmentId ? 'AND e.department_id = ?' : ''}`,
      departmentId ? [departmentId] : []
    );

    const expiringContracts = await query(
      `SELECT COUNT(*) as count FROM hr_contracts c
       JOIN hr_employees e ON c.employee_id = e.id
       WHERE c.status = 'ACTIVE' AND c.end_date IS NOT NULL 
       AND c.end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 90 DAY)
       ${departmentId ? 'AND e.department_id = ?' : ''}`,
      departmentId ? [departmentId] : []
    );

    const upcomingBirthdays = await query(
      `SELECT id, first_name, last_name, date_of_birth, department_id
       FROM hr_employees 
       WHERE employment_status = 'ACTIVE'
       AND date_of_birth IS NOT NULL
       AND DAYOFYEAR(date_of_birth) BETWEEN DAYOFYEAR(CURDATE()) AND DAYOFYEAR(CURDATE()) + 30
       ${departmentId ? 'AND department_id = ?' : ''}
       ORDER BY DAYOFYEAR(date_of_birth)
       LIMIT 10`,
      departmentId ? [departmentId] : []
    );

    return {
      totalEmployees: totalEmployees[0].count,
      byStatus,
      byDepartment,
      byContractType: byEmploymentType,
      pendingLeaveRequests: pendingLeaveRequests[0].count,
      expiringContracts: expiringContracts[0].count,
      upcomingBirthdays
    };
  }
}

module.exports = new HRService();
