/**
 * HR Service
 * Business logic for Human Resources module
 * Column names match migration_category_and_hr.sql exactly
 */

const { query, transaction } = require('../config/database');
const { ROLES } = require('../config/roles');
const leaveApproval = require('./leaveApproval.service');

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

class HRService {

  // ========================================================================
  // EMPLOYEES
  // ========================================================================

  /**
   * Mirror active user accounts into hr_employees.
   *
   * The Employee Directory is meant to be "everyone in the system", so any
   * active user without an employee record gets one. Runs as a single
   * INSERT..SELECT, so it is cheap enough to call on every directory load and
   * naturally idempotent — existing records are never touched or overwritten.
   *
   * Returns the number of employee records created.
   */
  async syncEmployeesFromUsers() {
    const result = await query(
      `INSERT INTO hr_employees
         (user_id, employee_number, first_name, last_name, department_id,
          employment_type, employment_status, is_active)
       SELECT u.id,
              CONCAT('ZCC-', LPAD(u.id, 4, '0')),
              COALESCE(NULLIF(TRIM(u.first_name), ''), 'Unknown'),
              COALESCE(NULLIF(TRIM(u.last_name),  ''), 'Unknown'),
              u.department_id,
              'FULL_TIME', 'ACTIVE', 1
       FROM users u
       LEFT JOIN hr_employees e ON e.user_id = u.id
       WHERE u.is_active = TRUE AND e.id IS NULL`
    );

    const created = result.affectedRows || 0;

    // Give anyone new an opening balance row for the accrual-target type, so
    // they appear in the register straight away rather than after the 25th.
    if (created > 0) {
      const year = new Date().getFullYear();
      await query(
        `INSERT INTO hr_leave_balances
           (employee_id, leave_type_id, fiscal_year,
            entitlement, carried_forward, taken, pending)
         SELECT e.id, lt.id, ?, 0, 0, 0, 0
         FROM hr_employees e
         CROSS JOIN hr_leave_types lt
         LEFT JOIN hr_leave_balances lb
                ON lb.employee_id = e.id AND lb.leave_type_id = lt.id
               AND lb.fiscal_year = ?
         WHERE lt.is_accrual_target = 1 AND lt.is_active = 1
           AND e.employment_status = 'ACTIVE'
           AND lb.id IS NULL`,
        [year, year]
      );
    }

    return created;
  }

  async getEmployees(filters = {}) {
    const { page = 1, limit = 25, search, departmentId, status, employmentType, userId } = filters;
    const offset = (page - 1) * limit;
    let where = ['1=1'];
    let params = [];

    if (search) {
      where.push('(e.first_name LIKE ? OR e.last_name LIKE ? OR e.employee_number LIKE ? OR e.personal_email LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (departmentId) { where.push('e.department_id = ?'); params.push(departmentId); }
    if (userId) { where.push('e.user_id = ?'); params.push(userId); }
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
      SELECT e.*,
              CONCAT(ub.first_name, ' ', ub.last_name) AS updated_by_name, e.employment_type as contract_type,
             e.position_title as job_title,
             e.phone_primary as phone_number,
             e.personal_email,
             d.department_name,
             CONCAT(m.first_name, ' ', m.last_name) as supervisor_name,
             u.email as system_email, r.role_name as system_role
      FROM hr_employees e
       LEFT JOIN users ub ON e.updated_by = ub.id
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
              (SELECT COALESCE(SUM(lr.deductible_days), 0)
                 FROM hr_leave_requests lr
                WHERE lr.employee_id = lb.employee_id
                  AND lr.status = 'PENDING'
                  AND YEAR(lr.start_date) = lb.fiscal_year) as pending_days,
              (lb.entitlement + lb.carried_forward - lb.taken) as remaining_days,
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
      'notes', 'photo_url',
      // Education / qualifications — certificates themselves live in hr_documents.
      'highest_qualification', 'field_of_study', 'institution',
      'year_qualified', 'professional_body',
      // Accrual settings: whether this account earns leave, and at what rate.
      'accrual_enabled', 'monthly_accrual_days', 'accrual_note'
    ];

    for (const field of allowedFields) {
      if (mappedData[field] !== undefined) {
        fields.push(`${field} = ?`);
        params.push(mappedData[field]);
      }
    }

    if (fields.length === 0) throw new Error('No fields to update');

    // Snapshot the row first so the audit log can record what actually moved.
    const beforeRows = await query('SELECT * FROM hr_employees WHERE id = ?', [id]);
    const before = beforeRows[0] || {};

    const actorId = typeof updatedBy === 'object' && updatedBy ? updatedBy.id : updatedBy;
    const actorRole = typeof updatedBy === 'object' && updatedBy ? updatedBy.role : null;

    fields.push('updated_by = ?');
    params.push(actorId || null);
    params.push(id);

    await query(`UPDATE hr_employees SET ${fields.join(', ')} WHERE id = ?`, params);

    // Diff only the fields that were actually submitted and genuinely changed.
    const changes = {};
    for (const field of allowedFields) {
      if (mappedData[field] === undefined) continue;
      const from = before[field];
      const to = mappedData[field];
      const norm = (v) => (v === null || v === undefined ? '' : String(v));
      if (norm(from) !== norm(to)) {
        changes[field] = { from: from ?? null, to: to ?? null };
      }
    }

    if (Object.keys(changes).length > 0) {
      await query(
        `INSERT INTO hr_employee_audit
           (employee_id, action, changes, actor_user_id, actor_role)
         VALUES (?, 'UPDATED', ?, ?, ?)`,
        [id, JSON.stringify(changes), actorId || null, actorRole]
      );
    }

    return await this.getEmployeeById(id);
  }

  /** Who changed this employee record, when, and what moved. */
  async getEmployeeAudit(employeeId) {
    const rows = await query(
      `SELECT a.*, CONCAT(u.first_name, ' ', u.last_name) AS actor_name
       FROM hr_employee_audit a
       LEFT JOIN users u ON a.actor_user_id = u.id
       WHERE a.employee_id = ?
       ORDER BY a.created_at DESC
       LIMIT 100`,
      [employeeId]
    );
    return rows.map((r) => {
      let parsed = null;
      try { parsed = r.changes ? JSON.parse(r.changes) : null; } catch { parsed = null; }
      return { ...r, changes: parsed };
    });
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

  // ------------------------------------------------------------------
  // Leave types — HR Office manages deductible / accrual-target flags
  // ------------------------------------------------------------------

  async getLeaveTypes() {
    return await query(
      `SELECT id, leave_code, leave_name, description,
              default_days_per_year, is_paid, requires_documentation,
              max_carry_forward, is_active,
              is_deductible, is_accrual_target, monthly_accrual_days,
              requires_document, free_days_limit, free_days_window_months
       FROM hr_leave_types
       WHERE is_active = 1
       ORDER BY is_accrual_target DESC, leave_name`
    );
  }

  async updateLeaveType(id, data) {
    return await transaction(async (connection) => {
      const [existing] = await connection.execute(
        `SELECT id FROM hr_leave_types WHERE id = ?`, [id]
      );
      if (existing.length === 0) throw new Error('Leave type not found');

      const fields = [];
      const params = [];

      const setFlag = (column, value) => {
        fields.push(`${column} = ?`);
        params.push(value ? 1 : 0);
      };

      if (data.is_deductible !== undefined)     setFlag('is_deductible',     data.is_deductible);
      if (data.is_accrual_target !== undefined) setFlag('is_accrual_target', data.is_accrual_target);
      if (data.monthly_accrual_days !== undefined) {
        const v = Number(data.monthly_accrual_days);
        if (!Number.isFinite(v) || v < 0) throw new Error('monthly_accrual_days must be a non-negative number');
        fields.push('monthly_accrual_days = ?'); params.push(v);
      }
      if (data.leave_name !== undefined) { fields.push('leave_name = ?'); params.push(data.leave_name); }
      if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }
      if (data.default_days_per_year !== undefined) {
        const v = Number(data.default_days_per_year);
        if (!Number.isFinite(v) || v < 0) throw new Error('default_days_per_year must be a non-negative number');
        fields.push('default_days_per_year = ?'); params.push(v);
      }
      if (data.max_carry_forward !== undefined) {
        const v = Number(data.max_carry_forward);
        if (!Number.isFinite(v) || v < 0) throw new Error('max_carry_forward must be a non-negative number');
        fields.push('max_carry_forward = ?'); params.push(v);
      }
      if (data.is_active !== undefined) setFlag('is_active', data.is_active);

      if (fields.length === 0) throw new Error('No fields to update');

      // At most one accrual target — clear all others first if turning this on.
      if (data.is_accrual_target === true || data.is_accrual_target === 1) {
        await connection.execute(
          `UPDATE hr_leave_types SET is_accrual_target = 0 WHERE id <> ?`, [id]
        );
      }

      params.push(id);
      await connection.execute(
        `UPDATE hr_leave_types SET ${fields.join(', ')} WHERE id = ?`,
        params
      );

      const [rows] = await connection.execute(
        `SELECT id, leave_code, leave_name, description,
                default_days_per_year, is_paid, requires_documentation,
                max_carry_forward, is_active,
                is_deductible, is_accrual_target, monthly_accrual_days
         FROM hr_leave_types WHERE id = ?`, [id]
      );
      return rows[0];
    });
  }

  // ------------------------------------------------------------------
  // Employee record resolution
  // ------------------------------------------------------------------

  /**
   * Return the hr_employees row for a user, creating the link row on first use.
   *
   * Leave, timesheets and accrual all key off hr_employees rather than users,
   * so a user with no employee row cannot transact at all. Rather than fail,
   * we derive the row from the user record that already exists — name and
   * department are copied across, nothing is invented. HR can complete the
   * remaining fields (hire date, bank details, grade) in the Employee
   * Directory afterwards.
   *
   * Runs inside the caller's transaction.
   */
  async ensureEmployeeRecord(connection, userId) {
    const [existing] = await connection.execute(
      `SELECT id, department_id, user_id FROM hr_employees WHERE user_id = ? LIMIT 1`,
      [userId]
    );
    if (existing.length > 0) return existing[0];

    const [users] = await connection.execute(
      `SELECT id, first_name, last_name, department_id, is_active
       FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    if (users.length === 0) throw new Error('User account not found');
    const u = users[0];
    if (!u.is_active) throw new Error('Inactive user accounts cannot transact');

    // Deterministic, collision-free, and stable across re-runs.
    const employeeNumber = `ZCC-${String(u.id).padStart(4, '0')}`;

    const [res] = await connection.execute(
      `INSERT INTO hr_employees
         (user_id, employee_number, first_name, last_name,
          department_id, employment_type, employment_status, is_active)
       VALUES (?, ?, ?, ?, ?, 'FULL_TIME', 'ACTIVE', 1)`,
      [
        u.id,
        employeeNumber,
        u.first_name || 'Unknown',
        u.last_name  || 'Unknown',
        u.department_id || null,
      ]
    );

    return { id: res.insertId, department_id: u.department_id, user_id: u.id };
  }

  // ------------------------------------------------------------------
  // Deduction engine
  // ------------------------------------------------------------------
  //
  // Only one balance accrues — Vacation Leave — so every chargeable day is
  // taken from that pool regardless of which leave type was requested.
  //
  // A type may carry a free allowance (Compassionate: 12 days; Sick: 90 days
  // in a rolling 12 months). Days inside the allowance cost nothing; only the
  // excess is charged to Vacation.
  // ------------------------------------------------------------------

  /** The accrual-target leave type — the pool every deduction is charged to. */
  async getVacationType(connection) {
    const runner = connection
      ? (sql, params) => connection.execute(sql, params).then(([rows]) => rows)
      : (sql, params) => query(sql, params);

    const rows = await runner(
      `SELECT id, leave_name FROM hr_leave_types
       WHERE is_active = 1 AND is_accrual_target = 1 LIMIT 1`,
      []
    );
    if (rows.length === 0) {
      throw new Error('No accrual-target leave type is configured');
    }
    return rows[0];
  }

  /**
   * Split a request into free days and chargeable days.
   *
   *   leaveType            row from hr_leave_types
   *   startDate            Date the leave begins (anchors the allowance window)
   *   daysRequested        total calendar days requested
   *   excludeRequestId     ignore this request when counting prior usage, so
   *                        editing a request does not count its own days twice
   *
   * Returns { freeDays, deductibleDays, allowanceUsed, allowanceLimit }.
   */
  async splitLeaveDays(connection, employeeId, leaveType, startDate, daysRequested, excludeRequestId = null) {
    const days = Number(daysRequested);

    // Types like Maternity and Examination never touch the balance.
    if (!leaveType.is_deductible) {
      return { freeDays: days, deductibleDays: 0, allowanceUsed: 0, allowanceLimit: null };
    }

    const limit = leaveType.free_days_limit === null || leaveType.free_days_limit === undefined
      ? null
      : Number(leaveType.free_days_limit);

    // No allowance — every day is charged (Vacation, Study).
    if (limit === null) {
      return { freeDays: 0, deductibleDays: days, allowanceUsed: 0, allowanceLimit: null };
    }

    // Count free days of this type already consumed inside the window.
    const windowMonths = Number(leaveType.free_days_window_months) || 12;
    const params = [employeeId, leaveType.id, startDate, windowMonths, startDate];
    let sql = `SELECT COALESCE(SUM(free_days_used), 0) AS used
               FROM hr_leave_requests
               WHERE employee_id = ?
                 AND leave_type_id = ?
                 AND status IN ('PENDING', 'APPROVED')
                 AND start_date > DATE_SUB(?, INTERVAL ? MONTH)
                 AND start_date <= ?`;
    if (excludeRequestId) {
      sql += ' AND id <> ?';
      params.push(excludeRequestId);
    }

    const [rows] = await connection.execute(sql, params);
    const used = Number(rows[0].used) || 0;

    const freeRemaining = Math.max(0, limit - used);
    const freeDays = Math.min(days, freeRemaining);

    return {
      freeDays,
      deductibleDays: days - freeDays,
      allowanceUsed: used,
      allowanceLimit: limit,
    };
  }

  /**
   * Move days on the Vacation balance for a given fiscal year, creating the
   * row if it does not exist yet. Deltas may be negative; balances are allowed
   * to go below zero.
   */
  async applyVacationBalance(connection, employeeId, vacationTypeId, fiscalYear, { pending = 0, taken = 0 }) {
    if (pending === 0 && taken === 0) return;

    await connection.execute(
      `INSERT INTO hr_leave_balances
         (employee_id, leave_type_id, fiscal_year, entitlement, carried_forward, taken, pending)
       VALUES (?, ?, ?, 0, 0, 0, 0)
       ON DUPLICATE KEY UPDATE employee_id = employee_id`,
      [employeeId, vacationTypeId, fiscalYear]
    );

    await connection.execute(
      `UPDATE hr_leave_balances
       SET pending = GREATEST(pending + ?, 0),
           taken   = taken + ?
       WHERE employee_id = ? AND leave_type_id = ? AND fiscal_year = ?`,
      [pending, taken, employeeId, vacationTypeId, fiscalYear]
    );
  }

  // ------------------------------------------------------------------
  // Leave audit trail helpers
  // ------------------------------------------------------------------

  /**
   * Read the deductible-pool snapshot for one employee/type/year inside an open
   * transaction. Returns null when no balance row exists yet (non-deductible
   * types never create one).
   */
  async readBalanceSnapshot(connection, employeeId, leaveTypeId, fiscalYear) {
    const [rows] = await connection.execute(
      `SELECT entitlement, carried_forward, taken, pending
       FROM hr_leave_balances
       WHERE employee_id = ? AND leave_type_id = ? AND fiscal_year = ?`,
      [employeeId, leaveTypeId, fiscalYear]
    );
    if (rows.length === 0) return null;
    const b = rows[0];
    return {
      entitlement:     Number(b.entitlement),
      carried_forward: Number(b.carried_forward),
      taken:           Number(b.taken),
      pending:         Number(b.pending),
      // Pending requests are NOT subtracted: days are only deducted on approval.
      available:       Number(b.entitlement) + Number(b.carried_forward)
                       - Number(b.taken),
    };
  }

  /**
   * Append one immutable row to hr_leave_audit. Never throws into the caller's
   * transaction for cosmetic reasons — but it IS part of the transaction, so a
   * genuine failure correctly rolls the whole action back.
   */
  async recordLeaveAudit(connection, entry) {
    await connection.execute(
      `INSERT INTO hr_leave_audit
         (leave_request_id, employee_id, leave_type_id,
          action, from_status, to_status,
          actor_user_id, actor_role, comments,
          days_affected, is_deductible,
          balance_before, balance_after,
          entitlement_at, taken_at, pending_at, fiscal_year)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.leave_request_id,
        entry.employee_id,
        entry.leave_type_id,
        entry.action,
        entry.from_status   ?? null,
        entry.to_status     ?? null,
        entry.actor_user_id ?? null,
        entry.actor_role    ?? null,
        entry.comments      ?? null,
        entry.days_affected ?? 0,
        entry.is_deductible ? 1 : 0,
        entry.balance_before ?? null,
        entry.balance_after  ?? null,
        entry.entitlement_at ?? null,
        entry.taken_at       ?? null,
        entry.pending_at     ?? null,
        entry.fiscal_year    ?? null,
      ]
    );
  }

  /**
   * Full trail for one leave request, newest last (chronological reading order).
   */
  async getLeaveAuditTrail(leaveRequestId) {
    return await query(
      `SELECT a.*,
              CONCAT(u.first_name, ' ', u.last_name) AS actor_name,
              lt.leave_name AS leave_type_name
       FROM hr_leave_audit a
       LEFT JOIN users u          ON a.actor_user_id = u.id
       LEFT JOIN hr_leave_types lt ON a.leave_type_id = lt.id
       WHERE a.leave_request_id = ?
       ORDER BY a.created_at ASC, a.id ASC`,
      [leaveRequestId]
    );
  }

  // ------------------------------------------------------------------
  // Leave requests
  // ------------------------------------------------------------------

  async getLeaveRequests(filters = {}) {
    const {
      page = 1, limit = 25,
      employeeId, departmentId, status, year,
      leaveTypeId, search, startFrom, startTo, role,
      pendingForApprover,    // { id, role, department_id } — when set, overrides other filters with role-based scope
      pendingScope = 'department', // 'department' | 'all' (HR Office only)
    } = filters;
    const offset = (page - 1) * limit;
    const where = ['1=1'];
    const params = [];

    if (employeeId)   { where.push('lr.employee_id = ?'); params.push(employeeId); }
    if (departmentId) { where.push('e.department_id = ?'); params.push(departmentId); }
    // The role the request was raised from — which is also what decides who
    // approves it, so it is worth being able to read the queue by role.
    if (role)         { where.push('COALESCE(req_r.role_name, ?) = ?'); params.push('GENERAL_USER', role); }
    if (status)       { where.push('lr.status = ?');       params.push(status); }
    if (year)         { where.push('YEAR(lr.start_date) = ?'); params.push(year); }
    if (leaveTypeId)  { where.push('lr.leave_type_id = ?');   params.push(leaveTypeId); }
    if (startFrom)    { where.push('lr.start_date >= ?');     params.push(startFrom); }
    if (startTo)      { where.push('lr.start_date <= ?');     params.push(startTo); }
    if (search) {
      where.push(`(
        CONCAT(e.first_name, ' ', e.last_name) LIKE ?
        OR e.employee_number LIKE ?
        OR lr.reason LIKE ?
      )`);
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (pendingForApprover) {
      where.push("lr.status = 'PENDING'");
      const frag = leaveApproval.pendingForApproverWhereClause(pendingForApprover, pendingScope);
      where.push(frag.sql);
      params.push(...frag.params);
    }

    const countResult = await query(
      `SELECT COUNT(*) AS total
       FROM hr_leave_requests lr
       JOIN hr_employees e ON lr.employee_id = e.id
       LEFT JOIN users  req_u ON e.user_id   = req_u.id
       LEFT JOIN roles  req_r ON req_u.role_id = req_r.id
       WHERE ${where.join(' AND ')}`,
      [...params]
    );

    const data = await query(
      `SELECT lr.id, lr.employee_id, lr.leave_type_id,
              lr.start_date, lr.end_date, lr.days_requested AS total_days,
              lr.deductible_days, lr.free_days_used,
              lr.balance_before, lr.balance_after,
              lr.reason, lr.status, lr.updated_at,
              lr.approved_by, lr.approved_at, lr.rejection_reason,
              lr.created_at,
              lt.leave_name AS leave_type_name,
              lt.is_deductible, lt.is_accrual_target,
              CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
              e.employee_number,
              -- The page needs this to decide whether the viewer owns the
              -- request and may therefore edit or resubmit it.
              e.user_id AS employee_user_id,
              e.department_id,
              d.department_name,
              COALESCE(req_r.role_name, 'GENERAL_USER') AS requester_role,
              CONCAT(au.first_name, ' ', au.last_name) AS approved_by_name,
              -- Live standing balance for this employee/type/year. For a PENDING
              -- row this already excludes the reserved days, so the approver sees
              -- lr.balance_before (standing) and lr.balance_after (if approved).
              lt.free_days_limit, lt.free_days_window_months,
              (SELECT lb.entitlement + lb.carried_forward - lb.taken
                 FROM hr_leave_balances lb
                 JOIN hr_leave_types vt ON lb.leave_type_id = vt.id
                                       AND vt.is_accrual_target = 1
                WHERE lb.employee_id = lr.employee_id
                  AND lb.fiscal_year = YEAR(lr.start_date)) AS current_balance
       FROM hr_leave_requests lr
       JOIN hr_employees    e     ON lr.employee_id   = e.id
       JOIN hr_leave_types  lt    ON lr.leave_type_id = lt.id
       LEFT JOIN departments d    ON e.department_id  = d.id
       LEFT JOIN users  req_u     ON e.user_id        = req_u.id
       LEFT JOIN roles  req_r     ON req_u.role_id    = req_r.id
       LEFT JOIN users  au        ON lr.approved_by   = au.id
       WHERE ${where.join(' AND ')}
       ORDER BY lr.created_at DESC, lr.id DESC
       LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      [...params]
    );

    return {
      data,
      total: countResult[0].total,
      page, limit,
      totalPages: Math.ceil(countResult[0].total / limit),
    };
  }

  /**
   * Submit a leave request.
   * - Only deductible leave types check / reserve from the balance.
   * - Approver is computed at the time of action (not stored on the row), so
   *   role/department changes between submission and approval are honoured.
   */
  async createLeaveRequest(data, requestedByUserId) {
    return await transaction(async (connection) => {
      // Locate the caller's own employee record, creating the link row if this
      // is their first HR transaction. Resolved by user_id only — matching on
      // data.employee_id here would let the caller's identity be spoofed.
      const employee = await this.ensureEmployeeRecord(connection, requestedByUserId);
      const employeeId = data.employee_id || employee.id;

      // Block submitting for someone else unless the caller is the same employee.
      if (data.employee_id && Number(data.employee_id) !== Number(employee.id)) {
        // Only ADMIN-level may submit on someone's behalf; controller is
        // responsible for that gate. We just check the employee row exists.
        const [target] = await connection.execute(
          `SELECT id FROM hr_employees WHERE id = ?`, [data.employee_id]
        );
        if (target.length === 0) throw new Error('Target employee not found');
      }

      // Validate dates.
      const startDate = new Date(data.start_date);
      const endDate   = new Date(data.end_date);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        throw new Error('Invalid start_date or end_date');
      }
      if (endDate < startDate) {
        throw new Error('End date must be on or after start date');
      }
      const daysRequested =
        Math.ceil(Math.abs(endDate - startDate) / 86_400_000) + 1;

      // Look up the leave type to decide whether the balance is touched.
      const [types] = await connection.execute(
        `SELECT id, leave_name, is_deductible, requires_document,
                free_days_limit, free_days_window_months
         FROM hr_leave_types
         WHERE id = ? AND is_active = 1`,
        [data.leave_type_id]
      );
      if (types.length === 0) throw new Error('Leave type not found or inactive');
      const leaveType = types[0];

      // Types such as Study Leave cannot be raised without evidence. The
      // controller stages the uploaded files and passes them in as
      // data.attachments; refusing here keeps the rule server-side.
      const stagedAttachments = Array.isArray(data.attachments) ? data.attachments : [];
      if (leaveType.requires_document && stagedAttachments.length === 0) {
        throw new Error(
          `${leaveType.leave_name} requires at least one supporting document.`
        );
      }

      // Split into free days and days that WOULD be charged to the Vacation
      // pool. Nothing is written to the balance here: days are only ever
      // deducted when an approver says yes. A request that is rejected, or
      // still waiting, leaves the balance completely untouched.
      const fiscalYear = startDate.getFullYear();
      const vacation   = await this.getVacationType(connection);

      const split = await this.splitLeaveDays(
        connection, employeeId, leaveType, data.start_date, daysRequested
      );

      let balanceBefore = null;
      let balanceAfter  = null;

      if (leaveType.is_deductible) {
        const pre = await this.readBalanceSnapshot(
          connection, employeeId, vacation.id, fiscalYear
        );
        balanceBefore = pre ? pre.available : 0;
        // What the balance becomes IF this is approved — a projection only.
        balanceAfter  = balanceBefore - split.deductibleDays;
      }

      const snapshot = null;

      const [result] = await connection.execute(
        `INSERT INTO hr_leave_requests
           (employee_id, leave_type_id, start_date, end_date,
            days_requested, deductible_days, free_days_used,
            balance_before, balance_after, reason, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
        [
          employeeId, data.leave_type_id,
          data.start_date, data.end_date,
          daysRequested, split.deductibleDays, split.freeDays,
          balanceBefore, balanceAfter,
          data.reason || null,
        ]
      );

      for (const att of stagedAttachments) {
        await connection.execute(
          `INSERT INTO hr_leave_attachments
             (leave_request_id, file_name, file_path, file_size, mime_type,
              description, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            result.insertId,
            att.file_name,
            att.file_path,
            att.file_size || 0,
            att.mime_type || null,
            att.description || null,
            requestedByUserId,
          ]
        );
      }

      await this.recordLeaveAudit(connection, {
        leave_request_id: result.insertId,
        employee_id:      employeeId,
        leave_type_id:    data.leave_type_id,
        action:           'SUBMITTED',
        from_status:      null,
        to_status:        'PENDING',
        actor_user_id:    requestedByUserId,
        actor_role:       data.actor_role || null,
        comments:         data.reason || null,
        days_affected:    split.deductibleDays,
        is_deductible:    split.deductibleDays > 0,
        balance_before:   balanceBefore,
        balance_after:    balanceAfter,
        entitlement_at:   snapshot ? snapshot.entitlement : null,
        taken_at:         snapshot ? snapshot.taken   : null,
        pending_at:       snapshot ? snapshot.pending : null,
        fiscal_year:      fiscalYear,
      });

      return {
        id: result.insertId,
        days_requested:  daysRequested,
        deductible_days: split.deductibleDays,
        free_days_used:  split.freeDays,
        allowance_limit: split.allowanceLimit,
        allowance_used:  split.allowanceUsed + split.freeDays,
        balance_before:  balanceBefore,
        balance_after:   balanceAfter,
        is_deductible:   split.deductibleDays > 0,
      };
    });
  }

  /**
   * Edit a leave request, or resubmit one that was rejected.
   *
   *   PENDING  → the owner may correct dates, type or reason before a decision.
   *   REJECTED → the owner may fix whatever caused the rejection and send it
   *              back for approval; the row returns to PENDING.
   *
   * Both paths release any existing reservation and re-reserve against the new
   * dates, so the balance never double-counts. The whole history stays on the
   * same request id, and the audit trail records the change.
   */
  async updateLeaveRequest(leaveRequestId, data, actor) {
    return await transaction(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT lr.*, e.user_id AS employee_user_id, e.department_id
         FROM hr_leave_requests lr
         JOIN hr_employees   e  ON lr.employee_id  = e.id
         JOIN hr_leave_types lt ON lr.leave_type_id = lt.id
         WHERE lr.id = ?
         FOR UPDATE`,
        [leaveRequestId]
      );
      if (rows.length === 0) throw new Error('Leave request not found');
      const request = rows[0];

      if (!['PENDING', 'REJECTED'].includes(request.status)) {
        throw new Error(
          `A ${request.status.toLowerCase()} leave request can no longer be changed.`
        );
      }

      // Only the employee who raised the leave may change it — not an approver,
      // and not the HR Office. An approver who can rewrite a request before
      // approving it is approving their own wording rather than the employee's,
      // and the audit trail then records a decision on something the employee
      // never submitted. Approvers reject with a reason instead, and the
      // employee amends and resubmits.
      const isOwner = Number(request.employee_user_id) === Number(actor.id);
      if (!isOwner) {
        throw new Error(
          'Only the employee who raised this leave request can change it. ' +
          'Reject it with a reason if it needs correcting.'
        );
      }

      const wasRejected = request.status === 'REJECTED';

      // ── New values, falling back to what is already stored ──────────────
      const startDate = new Date(data.start_date || request.start_date);
      const endDate   = new Date(data.end_date   || request.end_date);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        throw new Error('Invalid start_date or end_date');
      }
      if (endDate < startDate) {
        throw new Error('End date must be on or after start date');
      }
      const daysRequested =
        Math.ceil(Math.abs(endDate - startDate) / 86_400_000) + 1;

      const newTypeId = data.leave_type_id
        ? Number(data.leave_type_id)
        : Number(request.leave_type_id);

      const [types] = await connection.execute(
        `SELECT id, leave_name, is_deductible, requires_document,
                free_days_limit, free_days_window_months
         FROM hr_leave_types WHERE id = ? AND is_active = 1`,
        [newTypeId]
      );
      if (types.length === 0) throw new Error('Leave type not found or inactive');
      const leaveType = types[0];

      // ── Supporting documents: count what survives plus anything new ──────
      const stagedAttachments = Array.isArray(data.attachments) ? data.attachments : [];
      if (leaveType.requires_document) {
        const [[existing]] = await connection.execute(
          `SELECT COUNT(*) AS n FROM hr_leave_attachments WHERE leave_request_id = ?`,
          [leaveRequestId]
        );
        if (Number(existing.n) + stagedAttachments.length === 0) {
          throw new Error(`${leaveType.leave_name} requires at least one supporting document.`);
        }
      }

      const newYear = startDate.getFullYear();
      const vacation = await this.getVacationType(connection);

      // Nothing was reserved when the request was raised, so there is nothing
      // to release here — only the projection is recalculated.
      //
      // The request excludes itself from the allowance tally so that editing
      // does not count its own free days twice.
      const split = await this.splitLeaveDays(
        connection, request.employee_id, leaveType,
        data.start_date || request.start_date, daysRequested, leaveRequestId
      );

      let balanceBefore = null;
      let balanceAfter  = null;
      const snapshot    = null;

      if (leaveType.is_deductible) {
        const pre = await this.readBalanceSnapshot(
          connection, request.employee_id, vacation.id, newYear
        );
        balanceBefore = pre ? pre.available : 0;
        balanceAfter  = balanceBefore - split.deductibleDays;
      }

      // ── Write the request back as PENDING ────────────────────────────────
      await connection.execute(
        `UPDATE hr_leave_requests
         SET leave_type_id    = ?,
             start_date       = ?,
             end_date         = ?,
             days_requested   = ?,
             deductible_days  = ?,
             free_days_used   = ?,
             balance_before   = ?,
             balance_after    = ?,
             reason           = ?,
             status           = 'PENDING',
             approved_by      = NULL,
             approved_at      = NULL,
             rejection_reason = NULL
         WHERE id = ?`,
        [
          newTypeId,
          data.start_date || request.start_date,
          data.end_date   || request.end_date,
          daysRequested,
          split.deductibleDays,
          split.freeDays,
          balanceBefore,
          balanceAfter,
          data.reason !== undefined ? data.reason : request.reason,
          leaveRequestId,
        ]
      );

      for (const att of stagedAttachments) {
        await connection.execute(
          `INSERT INTO hr_leave_attachments
             (leave_request_id, file_name, file_path, file_size, mime_type,
              description, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            leaveRequestId, att.file_name, att.file_path,
            att.file_size || 0, att.mime_type || null,
            att.description || null, actor.id,
          ]
        );
      }

      await this.recordLeaveAudit(connection, {
        leave_request_id: leaveRequestId,
        employee_id:      request.employee_id,
        leave_type_id:    newTypeId,
        action:           wasRejected ? 'RESUBMITTED' : 'UPDATED',
        from_status:      request.status,
        to_status:        'PENDING',
        actor_user_id:    actor.id,
        actor_role:       actor.role,
        comments:         data.change_note
          || (wasRejected
            ? 'Resubmitted for approval after rejection'
            : 'Request amended before approval'),
        days_affected:    split.deductibleDays,
        is_deductible:    split.deductibleDays > 0,
        balance_before:   balanceBefore,
        balance_after:    balanceAfter,
        entitlement_at:   snapshot ? snapshot.entitlement : null,
        taken_at:         snapshot ? snapshot.taken   : null,
        pending_at:       snapshot ? snapshot.pending : null,
        fiscal_year:      newYear,
      });

      return {
        id: leaveRequestId,
        status: 'PENDING',
        resubmitted: wasRejected,
        days_requested:  daysRequested,
        deductible_days: split.deductibleDays,
        free_days_used:  split.freeDays,
        balance_before:  balanceBefore,
        balance_after:   balanceAfter,
      };
    });
  }

  /**
   * Single-stage approval. Approver is validated via leaveApproval service
   * which encodes the role-based routing rules.
   *
   *   approver = { id, role, department_id }   (from req.user)
   */
  async approveLeaveRequest(leaveRequestId, approver, { approved = true, comments = null } = {}) {
    return await transaction(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT lr.*, e.department_id AS employee_department_id,
                e.user_id           AS employee_user_id,
                req_r.role_name     AS requester_role,
                lt.is_deductible    AS leave_is_deductible,
                lt.leave_name       AS leave_type_name
         FROM hr_leave_requests lr
         JOIN hr_employees    e     ON lr.employee_id   = e.id
         JOIN hr_leave_types  lt    ON lr.leave_type_id = lt.id
         LEFT JOIN users      req_u ON e.user_id        = req_u.id
         LEFT JOIN roles      req_r ON req_u.role_id    = req_r.id
         WHERE lr.id = ?
         FOR UPDATE`,
        [leaveRequestId]
      );
      if (rows.length === 0) throw new Error('Leave request not found');
      const request = rows[0];

      if (request.status !== 'PENDING') {
        throw new Error(`Cannot act on a leave request with status "${request.status}"`);
      }

      // Build the requester context for the routing check.
      const requesterContext = {
        userId:       request.employee_user_id,
        role:         request.requester_role || ROLES.GENERAL_USER,
        departmentId: request.employee_department_id,
      };

      await leaveApproval.assertCanApprove(approver, requesterContext);

      const newStatus = approved ? 'APPROVED' : 'REJECTED';

      await connection.execute(
        `UPDATE hr_leave_requests
         SET status            = ?,
             approved_by       = ?,
             approved_at       = NOW(),
             rejection_reason  = ?
         WHERE id = ?`,
        [
          newStatus,
          approver.id,
          approved ? null : (comments || null),
          leaveRequestId,
        ]
      );

      // This is the only place leave days are ever deducted.
      //   APPROVED → the chargeable days come off the Vacation pool
      //   REJECTED → nothing happens; the balance is exactly as it was
      const fiscalYear = new Date(request.start_date).getFullYear();
      const charged    = Number(request.deductible_days) || 0;

      let before = null;
      let after  = null;
      let snapshot = null;

      if (charged > 0) {
        const vacation = await this.getVacationType(connection);

        const pre = await this.readBalanceSnapshot(
          connection, request.employee_id, vacation.id, fiscalYear
        );
        // Nothing was ever reserved, so the stored balance IS the standing one.
        before = pre ? pre.available : 0;

        if (newStatus === 'APPROVED') {
          await this.applyVacationBalance(connection, request.employee_id, vacation.id, fiscalYear, {
            taken: charged,
          });
          snapshot = await this.readBalanceSnapshot(
            connection, request.employee_id, vacation.id, fiscalYear
          );
          after = snapshot ? snapshot.available : null;
        } else {
          // Rejected — no deduction at all.
          after = before;
        }

        await connection.execute(
          `UPDATE hr_leave_requests SET balance_before = ?, balance_after = ? WHERE id = ?`,
          [before, after, leaveRequestId]
        );
      }

      await this.recordLeaveAudit(connection, {
        leave_request_id: leaveRequestId,
        employee_id:      request.employee_id,
        leave_type_id:    request.leave_type_id,
        action:           newStatus,
        from_status:      'PENDING',
        to_status:        newStatus,
        actor_user_id:    approver.id,
        actor_role:       approver.role,
        comments:         comments || null,
        days_affected:    newStatus === 'APPROVED' ? charged : 0,
        is_deductible:    charged > 0,
        balance_before:   before,
        balance_after:    after,
        entitlement_at:   snapshot ? snapshot.entitlement : null,
        taken_at:         snapshot ? snapshot.taken   : null,
        pending_at:       snapshot ? snapshot.pending : null,
        fiscal_year:      fiscalYear,
      });

      return {
        id: leaveRequestId,
        status: newStatus,
        balance_before: before,
        balance_after:  after,
        days_deducted:  newStatus === 'APPROVED' ? charged : 0,
        free_days_used: Number(request.free_days_used) || 0,
      };
    });
  }

  /**
   * One leave request with everything the approver needs on screen:
   * requester identity, leave type deductibility, and the balance either side.
   */
  async getLeaveRequestById(id) {
    const rows = await query(
      `SELECT lr.*, lr.days_requested AS total_days,
              lt.leave_name AS leave_type_name, lt.leave_code,
              lt.is_deductible, lt.is_accrual_target,
              lt.free_days_limit, lt.free_days_window_months,
              CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
              e.employee_number, e.user_id AS employee_user_id,
              e.department_id, d.department_name,
              COALESCE(req_r.role_name, 'GENERAL_USER') AS requester_role,
              CONCAT(au.first_name, ' ', au.last_name) AS approved_by_name,
              (SELECT lb.entitlement + lb.carried_forward - lb.taken
                 FROM hr_leave_balances lb
                WHERE lb.employee_id   = lr.employee_id
                  AND lb.leave_type_id = lr.leave_type_id
                  AND lb.fiscal_year   = YEAR(lr.start_date)) AS current_balance
       FROM hr_leave_requests lr
       JOIN hr_employees   e      ON lr.employee_id   = e.id
       JOIN hr_leave_types lt     ON lr.leave_type_id = lt.id
       LEFT JOIN departments d    ON e.department_id  = d.id
       LEFT JOIN users  req_u     ON e.user_id        = req_u.id
       LEFT JOIN roles  req_r     ON req_u.role_id    = req_r.id
       LEFT JOIN users  au        ON lr.approved_by   = au.id
       WHERE lr.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  // ------------------------------------------------------------------
  // Leave attachments
  // ------------------------------------------------------------------

  async getLeaveAttachments(leaveRequestId) {
    return await query(
      `SELECT a.id, a.leave_request_id, a.file_name, a.file_size, a.mime_type,
              a.description, a.created_at,
              CONCAT(u.first_name, ' ', u.last_name) AS uploaded_by_name
       FROM hr_leave_attachments a
       LEFT JOIN users u ON a.uploaded_by = u.id
       WHERE a.leave_request_id = ?
       ORDER BY a.created_at ASC`,
      [leaveRequestId]
    );
  }

  /** Full row including file_path — for the download/view handler only. */
  async getLeaveAttachmentById(attachmentId) {
    const rows = await query(
      `SELECT a.*, lr.employee_id, e.department_id, e.user_id AS employee_user_id
       FROM hr_leave_attachments a
       JOIN hr_leave_requests lr ON a.leave_request_id = lr.id
       JOIN hr_employees      e  ON lr.employee_id     = e.id
       WHERE a.id = ?`,
      [attachmentId]
    );
    return rows[0] || null;
  }

  /** Attach a document to an existing request (e.g. approver asks for proof). */
  async addLeaveAttachment(leaveRequestId, file, uploadedByUserId, description = null) {
    const result = await query(
      `INSERT INTO hr_leave_attachments
         (leave_request_id, file_name, file_path, file_size, mime_type,
          description, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        leaveRequestId,
        file.originalname,
        file.path,
        file.size || 0,
        file.mimetype || null,
        description,
        uploadedByUserId,
      ]
    );
    return { id: result.insertId };
  }

  async deleteLeaveAttachment(attachmentId) {
    await query('DELETE FROM hr_leave_attachments WHERE id = ?', [attachmentId]);
    return { id: attachmentId };
  }

  // ------------------------------------------------------------------
  // Manual balance adjustments (HR / Admin / HOP / Lead)
  // ------------------------------------------------------------------

  /**
   * Credit or debit an employee's leave balance by hand.
   *
   *   adjustmentDays > 0  → top-up   (entitlement increased)
   *   adjustmentDays < 0  → deduction (entitlement reduced)
   *
   * A reason is mandatory. The change is written to hr_leave_adjustments with
   * the balance either side, so the figure can always be explained later.
   * Balances are allowed to go negative.
   */
  async adjustLeaveBalance({
    employeeId, leaveTypeId, fiscalYear, adjustmentDays, reason, actor,
  }) {
    const days = Number(adjustmentDays);
    if (!Number.isFinite(days) || days === 0) {
      throw new Error('Adjustment must be a non-zero number of days');
    }
    if (!reason || !String(reason).trim()) {
      throw new Error('A reason is required for every manual adjustment');
    }

    const year = Number(fiscalYear) || new Date().getFullYear();

    return await transaction(async (connection) => {
      const [emps] = await connection.execute(
        `SELECT id FROM hr_employees WHERE id = ?`, [employeeId]
      );
      if (emps.length === 0) throw new Error('Employee not found');

      const [types] = await connection.execute(
        `SELECT id, leave_name FROM hr_leave_types WHERE id = ? AND is_active = 1`,
        [leaveTypeId]
      );
      if (types.length === 0) throw new Error('Leave type not found or inactive');

      // Lock (or create) the balance row.
      const [existing] = await connection.execute(
        `SELECT * FROM hr_leave_balances
         WHERE employee_id = ? AND leave_type_id = ? AND fiscal_year = ?
         FOR UPDATE`,
        [employeeId, leaveTypeId, year]
      );
      if (existing.length === 0) {
        await connection.execute(
          `INSERT INTO hr_leave_balances
             (employee_id, leave_type_id, fiscal_year,
              entitlement, carried_forward, taken, pending)
           VALUES (?, ?, ?, 0, 0, 0, 0)`,
          [employeeId, leaveTypeId, year]
        );
      }

      const before = await this.readBalanceSnapshot(connection, employeeId, leaveTypeId, year);

      await connection.execute(
        `UPDATE hr_leave_balances
         SET entitlement = entitlement + ?
         WHERE employee_id = ? AND leave_type_id = ? AND fiscal_year = ?`,
        [days, employeeId, leaveTypeId, year]
      );

      const after = await this.readBalanceSnapshot(connection, employeeId, leaveTypeId, year);

      const [res] = await connection.execute(
        `INSERT INTO hr_leave_adjustments
           (employee_id, leave_type_id, fiscal_year, adjustment_days, reason,
            balance_before, balance_after, adjusted_by, adjusted_by_role)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          employeeId, leaveTypeId, year, days, String(reason).trim(),
          before ? before.available : null,
          after  ? after.available  : null,
          actor?.id   || null,
          actor?.role || null,
        ]
      );

      return {
        id: res.insertId,
        adjustment_days: days,
        balance_before: before ? before.available : null,
        balance_after:  after  ? after.available  : null,
        leave_type: types[0].leave_name,
      };
    });
  }

  /**
   * Adjustment history. Filterable by employee, department or year.
   */
  async getLeaveAdjustments({ employeeId = null, departmentId = null, year = null, limit = 200 } = {}) {
    const where = ['1=1'];
    const params = [];
    if (employeeId)   { where.push('adj.employee_id = ?');  params.push(employeeId); }
    if (departmentId) { where.push('e.department_id = ?');  params.push(departmentId); }
    if (year)         { where.push('adj.fiscal_year = ?');  params.push(Number(year)); }

    return await query(
      `SELECT adj.*,
              CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
              e.employee_number,
              d.department_name,
              lt.leave_name AS leave_type_name,
              CONCAT(u.first_name, ' ', u.last_name) AS adjusted_by_name
       FROM hr_leave_adjustments adj
       JOIN hr_employees   e  ON adj.employee_id  = e.id
       JOIN hr_leave_types lt ON adj.leave_type_id = lt.id
       LEFT JOIN departments d ON e.department_id  = d.id
       LEFT JOIN users u       ON adj.adjusted_by  = u.id
       WHERE ${where.join(' AND ')}
       ORDER BY adj.created_at DESC
       LIMIT ${Number(limit)}`,
      params
    );
  }

  // ------------------------------------------------------------------
  // Accrual history for one employee
  // ------------------------------------------------------------------

  /**
   * How this person's leave built up over a period: every monthly accrual
   * credit, every manual adjustment, and every approved deduction, in one
   * chronological statement with a running balance.
   *
   * Used both by staff looking at their own record and by an approver looking
   * at the individual they are about to decide on.
   */
  async getEmployeeAccrualHistory(employeeId, { year, months = 12 } = {}) {
    const fiscalYear = Number(year) || new Date().getFullYear();

    const accruals = await query(
      `SELECT al.fiscal_year, al.accrual_month, al.days_added, al.created_at,
              lt.leave_name AS leave_type_name,
              CONCAT(u.first_name, ' ', u.last_name) AS triggered_by_name
       FROM hr_leave_accrual_log al
       JOIN hr_leave_types lt ON al.leave_type_id = lt.id
       LEFT JOIN users u ON al.triggered_by = u.id
       WHERE al.employee_id = ? AND al.fiscal_year = ?
       ORDER BY al.accrual_month`,
      [employeeId, fiscalYear]
    );

    const adjustments = await query(
      `SELECT adj.adjustment_days, adj.reason, adj.created_at,
              lt.leave_name AS leave_type_name,
              CONCAT(u.first_name, ' ', u.last_name) AS adjusted_by_name
       FROM hr_leave_adjustments adj
       JOIN hr_leave_types lt ON adj.leave_type_id = lt.id
       LEFT JOIN users u ON adj.adjusted_by = u.id
       WHERE adj.employee_id = ? AND adj.fiscal_year = ?
       ORDER BY adj.created_at`,
      [employeeId, fiscalYear]
    );

    const taken = await query(
      `SELECT lr.id, lr.start_date, lr.end_date, lr.days_requested,
              lr.deductible_days, lr.free_days_used, lr.approved_at,
              lt.leave_name AS leave_type_name
       FROM hr_leave_requests lr
       JOIN hr_leave_types lt ON lr.leave_type_id = lt.id
       WHERE lr.employee_id = ? AND lr.status = 'APPROVED'
         AND YEAR(lr.start_date) = ?
       ORDER BY lr.start_date`,
      [employeeId, fiscalYear]
    );

    // One chronological statement with a running balance.
    const events = [
      ...accruals.map((a) => ({
        date: a.created_at,
        type: 'ACCRUAL',
        label: `Monthly accrual — ${MONTH_NAMES[a.accrual_month - 1]} ${a.fiscal_year}`,
        days: Number(a.days_added),
        detail: a.triggered_by_name ? `Run by ${a.triggered_by_name}` : 'Automatic',
      })),
      ...adjustments.map((a) => ({
        date: a.created_at,
        type: Number(a.adjustment_days) >= 0 ? 'TOP_UP' : 'DEDUCTION',
        label: Number(a.adjustment_days) >= 0 ? 'Manual top-up' : 'Manual deduction',
        days: Number(a.adjustment_days),
        detail: `${a.reason}${a.adjusted_by_name ? ` — ${a.adjusted_by_name}` : ''}`,
      })),
      ...taken
        .filter((t) => Number(t.deductible_days) > 0)
        .map((t) => ({
          date: t.approved_at || t.start_date,
          type: 'LEAVE_TAKEN',
          label: `${t.leave_type_name} taken`,
          days: -Number(t.deductible_days),
          detail: `${t.days_requested} day(s) requested`
            + (Number(t.free_days_used) > 0 ? `, ${t.free_days_used} within allowance` : ''),
        })),
    ].sort((a, b) => new Date(a.date) - new Date(b.date));

    let running = 0;
    for (const e of events) {
      running += e.days;
      e.balance_after = Math.round(running * 10) / 10;
    }

    const totalAccrued = accruals.reduce((n, a) => n + Number(a.days_added), 0);
    const totalAdjusted = adjustments.reduce((n, a) => n + Number(a.adjustment_days), 0);
    const totalTaken = taken.reduce((n, t) => n + Number(t.deductible_days), 0);

    return {
      fiscal_year: fiscalYear,
      months_covered: accruals.length,
      totals: {
        accrued: Math.round(totalAccrued * 10) / 10,
        adjusted: Math.round(totalAdjusted * 10) / 10,
        taken: Math.round(totalTaken * 10) / 10,
        net: Math.round((totalAccrued + totalAdjusted - totalTaken) * 10) / 10,
      },
      accruals,
      adjustments,
      events,
    };
  }

  // ------------------------------------------------------------------
  // Leave register — every employee's standing balance
  // ------------------------------------------------------------------

  /**
   * One row per employee with their accrued/taken/remaining days, so HR can see
   * "how many days does everyone have" at a glance. Includes employees who have
   * no balance row yet (shown as zero) so nobody is invisible.
   */
  async getLeaveRegister({ year, departmentId = null, search = null, dateFrom = null, dateTo = null } = {}) {
    const fiscalYear = Number(year) || new Date().getFullYear();
    const where = ["e.employment_status = 'ACTIVE'"];
    const filterParams = [];

    if (departmentId) { where.push('e.department_id = ?'); filterParams.push(departmentId); }
    if (search) {
      where.push("(CONCAT(e.first_name,' ',e.last_name) LIKE ? OR e.employee_number LIKE ?)");
      filterParams.push(`%${search}%`, `%${search}%`);
    }

    // Optional reporting period. Leave is counted when it OVERLAPS the period,
    // so a request running across the boundary is not lost from both ends of a
    // month-by-month read of the register. An open-ended bound is left open.
    const periodFrom = dateFrom || null;
    const periodTo   = dateTo   || null;
    const overlaps = (alias) => [
      periodTo   ? `${alias}.start_date <= ?` : null,
      periodFrom ? `${alias}.end_date   >= ?` : null,
    ].filter(Boolean).join(' AND ') || '1=1';
    const overlapParams = [
      ...(periodTo   ? [periodTo]   : []),
      ...(periodFrom ? [periodFrom] : []),
    ];

    return await query(
      `SELECT e.id AS employee_id, e.employee_number,
              CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
              e.department_id, d.department_name,
              e.position_title,
              e.accrual_enabled,
              e.monthly_accrual_days AS accrual_rate_override,
              e.accrual_note,
              COALESCE(req_r.role_name, 'GENERAL_USER') AS role_name,
              COALESCE(lb.entitlement, 0)      AS entitlement,
              COALESCE(lb.carried_forward, 0)  AS carried_forward,
              COALESCE(lb.taken, 0)            AS taken,
              (SELECT COALESCE(SUM(lr.deductible_days), 0)
                 FROM hr_leave_requests lr
                WHERE lr.employee_id = e.id
                  AND lr.status = 'PENDING'
                  AND YEAR(lr.start_date) = ?) AS pending,
              -- Days falling inside the chosen reporting period, if one is set.
              (SELECT COALESCE(SUM(lr.deductible_days), 0)
                 FROM hr_leave_requests lr
                WHERE lr.employee_id = e.id
                  AND lr.status = 'APPROVED'
                  AND ${overlaps('lr')}) AS taken_in_period,
              (SELECT COALESCE(SUM(lr.deductible_days), 0)
                 FROM hr_leave_requests lr
                WHERE lr.employee_id = e.id
                  AND lr.status = 'PENDING'
                  AND ${overlaps('lr')}) AS pending_in_period,
              (SELECT COUNT(*)
                 FROM hr_leave_requests lr
                WHERE lr.employee_id = e.id
                  AND lr.status IN ('APPROVED', 'PENDING')
                  AND ${overlaps('lr')}) AS requests_in_period,
              COALESCE(lb.entitlement + lb.carried_forward - lb.taken, 0) AS remaining_days,
              (SELECT COALESCE(SUM(al.days_added), 0)
                 FROM hr_leave_accrual_log al
                WHERE al.employee_id = e.id AND al.fiscal_year = ?) AS accrued_this_year,
              (SELECT COALESCE(SUM(aj.adjustment_days), 0)
                 FROM hr_leave_adjustments aj
                WHERE aj.employee_id = e.id AND aj.fiscal_year = ?) AS manual_adjustments
       FROM hr_employees e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN users  req_u  ON e.user_id       = req_u.id
       LEFT JOIN roles  req_r  ON req_u.role_id   = req_r.id
       LEFT JOIN hr_leave_types lt
              ON lt.is_accrual_target = 1 AND lt.is_active = 1
       LEFT JOIN hr_leave_balances lb
              ON lb.employee_id   = e.id
             AND lb.leave_type_id = lt.id
             AND lb.fiscal_year   = ?
       WHERE ${where.join(' AND ')}
       ORDER BY d.department_name, employee_name`,
      // Placeholder order: pending subquery, the three period subqueries,
      // accrued subquery, adjustments subquery, balance join, then whatever the
      // WHERE clause added.
      [fiscalYear,
       ...overlapParams, ...overlapParams, ...overlapParams,
       fiscalYear, fiscalYear, fiscalYear, ...filterParams]
    );
  }

  /**
   * Accrual totals per department and per month — the "accruals per department
   * and for the whole organisation" report.
   */
  async getAccrualReport({ year, departmentId = null } = {}) {
    const fiscalYear = Number(year) || new Date().getFullYear();
    const deptWhere  = departmentId ? 'AND e.department_id = ?' : '';
    const deptParam  = departmentId ? [departmentId] : [];

    const byDepartment = await query(
      `SELECT d.id AS department_id,
              COALESCE(d.department_name, 'Unassigned') AS department_name,
              COUNT(DISTINCT al.employee_id) AS employees_credited,
              COALESCE(SUM(al.days_added), 0) AS days_accrued
       FROM hr_leave_accrual_log al
       JOIN hr_employees e ON al.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE al.fiscal_year = ? ${deptWhere}
       GROUP BY d.id, d.department_name
       ORDER BY days_accrued DESC`,
      [fiscalYear, ...deptParam]
    );

    const byMonth = await query(
      `SELECT al.accrual_month AS month,
              COUNT(DISTINCT al.employee_id) AS employees_credited,
              COALESCE(SUM(al.days_added), 0) AS days_accrued,
              MAX(al.created_at) AS last_run
       FROM hr_leave_accrual_log al
       JOIN hr_employees e ON al.employee_id = e.id
       WHERE al.fiscal_year = ? ${deptWhere}
       GROUP BY al.accrual_month
       ORDER BY al.accrual_month`,
      [fiscalYear, ...deptParam]
    );

    const totals = await query(
      `SELECT COUNT(*) AS credit_events,
              COUNT(DISTINCT al.employee_id) AS employees,
              COALESCE(SUM(al.days_added), 0) AS days_accrued
       FROM hr_leave_accrual_log al
       JOIN hr_employees e ON al.employee_id = e.id
       WHERE al.fiscal_year = ? ${deptWhere}`,
      [fiscalYear, ...deptParam]
    );

    const adjustments = await query(
      `SELECT COALESCE(d.department_name, 'Unassigned') AS department_name,
              COALESCE(SUM(CASE WHEN aj.adjustment_days > 0 THEN aj.adjustment_days ELSE 0 END), 0) AS days_added,
              COALESCE(SUM(CASE WHEN aj.adjustment_days < 0 THEN -aj.adjustment_days ELSE 0 END), 0) AS days_removed,
              COUNT(*) AS adjustment_count
       FROM hr_leave_adjustments aj
       JOIN hr_employees e ON aj.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE aj.fiscal_year = ? ${deptWhere}
       GROUP BY d.id, d.department_name
       ORDER BY adjustment_count DESC`,
      [fiscalYear, ...deptParam]
    );

    return {
      fiscal_year: fiscalYear,
      totals: totals[0],
      byDepartment,
      byMonth,
      adjustments,
    };
  }

  // ------------------------------------------------------------------
  // Leave analytics - HR Office / Super Admin oversight
  // ------------------------------------------------------------------

  /**
   * Organisation-wide leave picture. `departmentId` narrows it to one
   * department (used when a HOP views their own unit).
   *
   * `highBalanceThreshold` flags employees who have banked too many days and
   * should be pushed to take leave.
   */
  async getLeaveAnalytics({ year, departmentId = null, highBalanceThreshold = 30 } = {}) {
    const fiscalYear = Number(year) || new Date().getFullYear();
    const deptWhere  = departmentId ? 'AND e.department_id = ?' : '';
    const deptParam  = departmentId ? [departmentId] : [];

    // 1. Headline totals across the deductible pool.
    const summary = await query(
      `SELECT COUNT(DISTINCT e.id)                        AS employees,
              COALESCE(SUM(lb.entitlement + lb.carried_forward), 0) AS total_entitlement,
              COALESCE(SUM(lb.taken), 0)                  AS total_taken,
              -- Awaiting approval, taken from the open requests rather than
              -- the balance row: nothing is reserved before approval.
              (SELECT COALESCE(SUM(lr2.deductible_days), 0)
                 FROM hr_leave_requests lr2
                 JOIN hr_employees e2 ON lr2.employee_id = e2.id
                WHERE lr2.status = 'PENDING'
                  AND YEAR(lr2.start_date) = ?)             AS total_pending,
              COALESCE(SUM(lb.entitlement + lb.carried_forward
                           - lb.taken), 0)                AS total_remaining,
              COALESCE(AVG(lb.entitlement + lb.carried_forward
                           - lb.taken), 0)                AS avg_remaining
       FROM hr_leave_balances lb
       JOIN hr_employees   e  ON lb.employee_id  = e.id
       JOIN hr_leave_types lt ON lb.leave_type_id = lt.id
       WHERE lb.fiscal_year = ? AND lt.is_deductible = 1
         AND e.employment_status = 'ACTIVE' ${deptWhere}`,
      // First placeholder belongs to the total_pending subquery above.
      [fiscalYear, fiscalYear, ...deptParam]
    );

    // 2. Employees carrying an excessive balance - the "too many days" list.
    const highBalances = await query(
      `SELECT e.id AS employee_id, e.employee_number,
              CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
              d.department_name, lt.leave_name AS leave_type_name,
              lb.entitlement, lb.carried_forward, lb.taken, lb.pending,
              (lb.entitlement + lb.carried_forward - lb.taken) AS remaining_days
       FROM hr_leave_balances lb
       JOIN hr_employees   e  ON lb.employee_id  = e.id
       JOIN hr_leave_types lt ON lb.leave_type_id = lt.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE lb.fiscal_year = ? AND lt.is_accrual_target = 1
         AND e.employment_status = 'ACTIVE' ${deptWhere}
         AND (lb.entitlement + lb.carried_forward - lb.taken) >= ?
       ORDER BY remaining_days DESC
       LIMIT 100`,
      [fiscalYear, ...deptParam, highBalanceThreshold]
    );

    // 3. Employees who have taken little or no leave all year.
    const lowUtilisation = await query(
      `SELECT e.id AS employee_id, e.employee_number,
              CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
              d.department_name,
              COALESCE(SUM(lb.taken), 0) AS days_taken
       FROM hr_employees e
       LEFT JOIN hr_leave_balances lb
              ON lb.employee_id = e.id AND lb.fiscal_year = ?
       LEFT JOIN hr_leave_types lt ON lb.leave_type_id = lt.id AND lt.is_deductible = 1
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.employment_status = 'ACTIVE' ${deptWhere}
       GROUP BY e.id, e.employee_number, e.first_name, e.last_name, d.department_name
       HAVING days_taken <= 5
       ORDER BY days_taken ASC
       LIMIT 100`,
      [fiscalYear, ...deptParam]
    );

    // 4. Balance and usage rolled up per department.
    const byDepartment = await query(
      `SELECT d.id AS department_id, d.department_name,
              COUNT(DISTINCT e.id) AS employees,
              COALESCE(SUM(lb.taken), 0) AS days_taken,
              COALESCE(SUM(lb.entitlement + lb.carried_forward
                           - lb.taken), 0) AS days_remaining
       FROM hr_employees e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN hr_leave_balances lb
              ON lb.employee_id = e.id AND lb.fiscal_year = ?
       LEFT JOIN hr_leave_types lt
              ON lb.leave_type_id = lt.id AND lt.is_deductible = 1
       WHERE e.employment_status = 'ACTIVE' ${deptWhere}
       GROUP BY d.id, d.department_name
       ORDER BY days_remaining DESC`,
      [fiscalYear, ...deptParam]
    );

    // 5. Usage split by leave type (sick-leave patterns vs vacation).
    const byLeaveType = await query(
      `SELECT lt.id AS leave_type_id, lt.leave_name, lt.leave_code,
              lt.is_deductible,
              COUNT(lr.id) AS request_count,
              COALESCE(SUM(CASE WHEN lr.status = 'APPROVED'
                                THEN lr.days_requested ELSE 0 END), 0) AS days_approved,
              COALESCE(SUM(CASE WHEN lr.status = 'PENDING'
                                THEN lr.days_requested ELSE 0 END), 0) AS days_pending
       FROM hr_leave_types lt
       LEFT JOIN hr_leave_requests lr
              ON lr.leave_type_id = lt.id AND YEAR(lr.start_date) = ?
       LEFT JOIN hr_employees e ON lr.employee_id = e.id
       WHERE lt.is_active = 1 ${departmentId ? 'AND (e.department_id = ? OR lr.id IS NULL)' : ''}
       GROUP BY lt.id, lt.leave_name, lt.leave_code, lt.is_deductible
       ORDER BY days_approved DESC`,
      [fiscalYear, ...deptParam]
    );

    // 6. Month-by-month approved leave, for the trend line.
    const monthlyTrend = await query(
      `SELECT MONTH(lr.start_date) AS month,
              COUNT(*) AS request_count,
              COALESCE(SUM(lr.days_requested), 0) AS days
       FROM hr_leave_requests lr
       JOIN hr_employees e ON lr.employee_id = e.id
       WHERE YEAR(lr.start_date) = ? AND lr.status = 'APPROVED' ${deptWhere}
       GROUP BY MONTH(lr.start_date)
       ORDER BY month`,
      [fiscalYear, ...deptParam]
    );

    // 7. Requests still awaiting an approver, oldest first.
    const pendingAging = await query(
      `SELECT lr.id, CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
              d.department_name, lt.leave_name AS leave_type_name,
              lr.start_date, lr.days_requested AS total_days, lr.created_at,
              DATEDIFF(CURDATE(), DATE(lr.created_at)) AS days_waiting
       FROM hr_leave_requests lr
       JOIN hr_employees   e  ON lr.employee_id  = e.id
       JOIN hr_leave_types lt ON lr.leave_type_id = lt.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE lr.status = 'PENDING' ${deptWhere}
       ORDER BY lr.created_at ASC
       LIMIT 50`,
      deptParam
    );

    // 8. Last accrual runs, so HR can confirm the 25th-of-month job fired.
    const accrualHistory = await query(
      `SELECT fiscal_year, accrual_month, MAX(created_at) AS run_at,
              COUNT(*) AS employees_credited, SUM(days_added) AS days_added
       FROM hr_leave_accrual_log
       GROUP BY fiscal_year, accrual_month
       ORDER BY fiscal_year DESC, accrual_month DESC
       LIMIT 6`
    );

    return {
      fiscal_year: fiscalYear,
      high_balance_threshold: Number(highBalanceThreshold),
      summary: summary[0],
      highBalances,
      lowUtilisation,
      byDepartment,
      byLeaveType,
      monthlyTrend,
      pendingAging,
      accrualHistory,
    };
  }

  /**
   * Flat, denormalised rows for the PDF / Excel exports. No pagination - the
   * caller is producing a document.
   */
  async getLeaveExportRows({ year, departmentId = null, status = null, employeeId = null } = {}) {
    const where  = ['1=1'];
    const params = [];
    if (year)         { where.push('YEAR(lr.start_date) = ?'); params.push(Number(year)); }
    if (departmentId) { where.push('e.department_id = ?');     params.push(departmentId); }
    if (status)       { where.push('lr.status = ?');           params.push(status); }
    if (employeeId)   { where.push('lr.employee_id = ?');      params.push(employeeId); }

    return await query(
      `SELECT lr.id,
              e.employee_number,
              CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
              d.department_name,
              COALESCE(req_r.role_name, 'GENERAL_USER') AS requester_role,
              lt.leave_name AS leave_type_name,
              lt.is_deductible,
              lr.start_date, lr.end_date, lr.days_requested AS total_days,
              lr.balance_before, lr.balance_after,
              lr.status, lr.reason, lr.rejection_reason,
              lr.created_at, lr.approved_at,
              CONCAT(au.first_name, ' ', au.last_name) AS approved_by_name
       FROM hr_leave_requests lr
       JOIN hr_employees   e  ON lr.employee_id  = e.id
       JOIN hr_leave_types lt ON lr.leave_type_id = lt.id
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN users req_u   ON e.user_id       = req_u.id
       LEFT JOIN roles req_r   ON req_u.role_id   = req_r.id
       LEFT JOIN users au      ON lr.approved_by  = au.id
       WHERE ${where.join(' AND ')}
       ORDER BY lr.created_at DESC`,
      params
    );
  }

  /**
   * Per-employee leave balance rows for the balance-register export.
   */
  async getLeaveBalanceExportRows({ year, departmentId = null } = {}) {
    const fiscalYear = Number(year) || new Date().getFullYear();
    const deptWhere  = departmentId ? 'AND e.department_id = ?' : '';
    const deptParam  = departmentId ? [departmentId] : [];

    return await query(
      `SELECT e.employee_number,
              CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
              d.department_name,
              lt.leave_name AS leave_type_name,
              lt.is_deductible,
              lb.fiscal_year,
              lb.entitlement, lb.carried_forward, lb.taken, lb.pending,
              (lb.entitlement + lb.carried_forward - lb.taken) AS remaining_days
       FROM hr_leave_balances lb
       JOIN hr_employees   e  ON lb.employee_id  = e.id
       JOIN hr_leave_types lt ON lb.leave_type_id = lt.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE lb.fiscal_year = ? AND e.employment_status = 'ACTIVE' ${deptWhere}
       ORDER BY d.department_name, employee_name, lt.leave_name`,
      [fiscalYear, ...deptParam]
    );
  }

  async getLeaveBalances(employeeId, year) {
    const currentYear = year || new Date().getFullYear();
    return await query(
      `SELECT lb.*, lt.leave_name AS leave_type_name,
              lt.default_days_per_year AS max_days_per_year,
              lt.is_deductible, lt.is_accrual_target, lt.monthly_accrual_days,
              lb.entitlement AS total_days,
              lb.taken       AS used_days,
              -- Days sitting in un-decided requests. Informational only: they
              -- are not deducted until the request is approved.
              (SELECT COALESCE(SUM(lr.deductible_days), 0)
                 FROM hr_leave_requests lr
                WHERE lr.employee_id = lb.employee_id
                  AND lr.status = 'PENDING'
                  AND YEAR(lr.start_date) = lb.fiscal_year) AS pending_days,
              (lb.entitlement + lb.carried_forward - lb.taken) AS remaining_days,
              lb.fiscal_year AS year
       FROM hr_leave_balances lb
       JOIN hr_leave_types lt ON lb.leave_type_id = lt.id
       WHERE lb.employee_id = ? AND lb.fiscal_year = ?
       ORDER BY lt.leave_name`,
      [employeeId, currentYear]
    );
  }

  // ------------------------------------------------------------------
  // Monthly leave accrual
  //   +monthly_accrual_days (default 2.5) on the 25th of each month, once.
  //   Idempotent via UNIQUE(employee_id, leave_type_id, fiscal_year, month).
  // ------------------------------------------------------------------

  async runMonthlyAccrual({ now = new Date(), triggeredByUserId = null } = {}) {
    const year  = now.getFullYear();
    const month = now.getMonth() + 1;

    // Find the (single) accrual-target leave type.
    const targets = await query(
      `SELECT id, leave_code, leave_name, monthly_accrual_days
       FROM hr_leave_types
       WHERE is_active = 1 AND is_accrual_target = 1
       LIMIT 1`
    );
    if (targets.length === 0) {
      return { ran: false, reason: 'No accrual-target leave type configured', credited: 0 };
    }
    const target = targets[0];
    const days = Number(target.monthly_accrual_days) || 0;
    if (days <= 0) {
      return { ran: false, reason: 'Accrual target has monthly_accrual_days = 0', credited: 0 };
    }

    // Active employees who actually accrue. `accrual_enabled = 0` covers
    // accounts that must never earn leave (service accounts, contractors),
    // and monthly_accrual_days overrides the standard rate for staff on a
    // level-of-effort or part-time contract.
    const employees = await query(
      `SELECT id, accrual_enabled, monthly_accrual_days
       FROM hr_employees
       WHERE employment_status = 'ACTIVE' AND accrual_enabled = 1`
    );
    if (employees.length === 0) {
      return { ran: true, credited: 0, skipped: 0, leave_type: target.leave_name };
    }

    let credited = 0;
    let skipped  = 0;

    let skippedZeroRate = 0;

    for (const emp of employees) {
      // Per-employee rate wins over the leave type default.
      const empDays = emp.monthly_accrual_days === null || emp.monthly_accrual_days === undefined
        ? days
        : Number(emp.monthly_accrual_days);

      if (!(empDays > 0)) { skippedZeroRate += 1; continue; }

      try {
        await transaction(async (connection) => {
          // INSERT into idempotency log first. If a row already exists for this
          // (employee, type, year, month) the UNIQUE constraint trips and we
          // skip the balance update.
          await connection.execute(
            `INSERT INTO hr_leave_accrual_log
               (employee_id, leave_type_id, fiscal_year, accrual_month, days_added, triggered_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [emp.id, target.id, year, month, empDays, triggeredByUserId]
          );

          // Ensure a balance row exists for this year, then top up entitlement.
          await connection.execute(
            `INSERT INTO hr_leave_balances
               (employee_id, leave_type_id, fiscal_year,
                entitlement, carried_forward, taken, pending)
             VALUES (?, ?, ?, ?, 0, 0, 0)
             ON DUPLICATE KEY UPDATE entitlement = entitlement + VALUES(entitlement)`,
            [emp.id, target.id, year, empDays]
          );
        });
        credited += 1;
      } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') {
          skipped += 1;
        } else {
          throw err;
        }
      }
    }

    return {
      ran: true,
      year, month,
      leave_type: target.leave_name,
      /** The standard rate; individuals may be credited a different amount. */
      days_per_employee: days,
      credited,
      skipped,
      skipped_zero_rate: skippedZeroRate,
      total_employees: employees.length,
    };
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
            ,e.department_id
            ,u.email, u.email AS username
      FROM hr_exit_clearance ec
      JOIN hr_employees e ON ec.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users u ON e.user_id = u.id
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

  /** One employee document, including its stored path — for the download handler. */
  async getDocumentById(id) {
    const rows = await query(
      `SELECT d.*, e.user_id AS employee_user_id, e.department_id
       FROM hr_documents d
       JOIN hr_employees e ON d.employee_id = e.id
       WHERE d.id = ?`,
      [id]
    );
    return rows[0] || null;
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

  /**
   * The dashboard an ordinary member of staff sees: their own leave position
   * and request activity. Deliberately carries none of the organisation-wide
   * figures, which they have no right to.
   */
  async getPersonalDashboard(userId) {
    const employees = await query(
      `SELECT e.id, e.employee_number, e.department_id, d.department_name,
              CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
              e.position_title, e.hire_date
       FROM hr_employees e
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.user_id = ? LIMIT 1`,
      [userId]
    );

    if (employees.length === 0) {
      return {
        personal: true,
        employee: null,
        balances: [],
        requestCounts: { pending: 0, approved: 0, rejected: 0 },
        recentRequests: [],
      };
    }

    const employee = employees[0];
    const year = new Date().getFullYear();

    const balances = await this.getLeaveBalances(employee.id, year);

    const counts = await query(
      `SELECT lr.status, COUNT(*) AS count
       FROM hr_leave_requests lr
       WHERE lr.employee_id = ? AND YEAR(lr.start_date) = ?
       GROUP BY lr.status`,
      [employee.id, year]
    );

    const recentRequests = await query(
      `SELECT lr.id, lr.start_date, lr.end_date, lr.days_requested AS total_days,
              lr.status, lr.created_at, lt.leave_name AS leave_type_name,
              lt.is_deductible
       FROM hr_leave_requests lr
       JOIN hr_leave_types lt ON lr.leave_type_id = lt.id
       WHERE lr.employee_id = ?
       ORDER BY lr.created_at DESC
       LIMIT 5`,
      [employee.id]
    );

    const byStatus = (s) =>
      Number((counts.find((c) => c.status === s) || {}).count || 0);

    return {
      personal: true,
      employee,
      balances,
      requestCounts: {
        pending:  byStatus('PENDING'),
        approved: byStatus('APPROVED'),
        rejected: byStatus('REJECTED'),
      },
      recentRequests,
    };
  }

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

    // Next 30 days, wrapping correctly across the year end. `days_until` is the
    // distance from today to this year's (or next year's) anniversary.
    const upcomingBirthdays = await query(
      `SELECT e.id, e.first_name, e.last_name, e.date_of_birth, e.department_id,
              d.department_name,
              CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
              DATEDIFF(
                IF(
                  DATE_FORMAT(e.date_of_birth, '%m-%d') >= DATE_FORMAT(CURDATE(), '%m-%d'),
                  STR_TO_DATE(CONCAT(YEAR(CURDATE()), '-', DATE_FORMAT(e.date_of_birth, '%m-%d')), '%Y-%m-%d'),
                  STR_TO_DATE(CONCAT(YEAR(CURDATE()) + 1, '-', DATE_FORMAT(e.date_of_birth, '%m-%d')), '%Y-%m-%d')
                ),
                CURDATE()
              ) AS days_until
       FROM hr_employees e
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.employment_status = 'ACTIVE'
         AND e.date_of_birth IS NOT NULL
         ${departmentId ? 'AND e.department_id = ?' : ''}
       HAVING days_until <= 30
       ORDER BY days_until
       LIMIT 10`,
      departmentId ? [departmentId] : []
    );

    // The contracts actually expiring, not just the count, so the dashboard can
    // name them.
    const expiringContractList = await query(
      `SELECT c.id, c.end_date, c.contract_type,
              CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
              e.employee_number, d.department_name,
              DATEDIFF(c.end_date, CURDATE()) AS days_remaining
       FROM hr_contracts c
       JOIN hr_employees e ON c.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE c.status = 'ACTIVE' AND c.end_date IS NOT NULL
         AND c.end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 90 DAY)
         ${departmentId ? 'AND e.department_id = ?' : ''}
       ORDER BY c.end_date
       LIMIT 20`,
      departmentId ? [departmentId] : []
    );

    return {
      totalEmployees: totalEmployees[0].count,
      byStatus,
      byDepartment,
      byContractType: byEmploymentType,
      pendingLeaveRequests: pendingLeaveRequests[0].count,
      expiringContracts: expiringContracts[0].count,
      expiringContractList,
      upcomingBirthdays
    };
  }
}

module.exports = new HRService();
