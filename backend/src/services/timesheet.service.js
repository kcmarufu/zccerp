/**
 * Timesheet Service
 *
 * One timesheet per employee per calendar month, January to December.
 *
 * The shape of a timesheet is a grid:
 *   rows    — the projects the employee is allocated to (from hr_employee_loe),
 *             each carrying an activity description and its LOE %
 *   columns — every day of the month
 *   cells   — the hours the employee actually worked
 *
 * Expected hours are derived, never typed in:
 *
 *   working days   = days of the month falling on a configured work day
 *   less holidays  = hr_public_holidays landing on a working day
 *   less leave     = hr_leave_requests (APPROVED) landing on a working day
 *   ------------------------------------------------------------------
 *   available days x standard daily hours = expected hours for the month
 *   expected hours x LOE % = expected hours for one project
 *
 * Actual % is what the employee really recorded, so LOE % and Actual % sit side
 * by side and the gap is visible.
 *
 * Everything about projects and partners is read through `projects` and
 * `donors` — the Float Requisition registers. Nothing is copied.
 */

const { query, transaction } = require('../config/database');
const {
  ROLES,
  TIMESHEET_STATUS,
  TIMESHEET_EDITABLE_STATUSES,
  TIMESHEET_PENDING_STATUSES,
  hasOrgTimesheetAccess,
  hasTeamTimesheetAccess,
  requiresTimesheet,
} = require('../config/roles');
const timesheetApproval = require('./timesheetApproval.service');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** 'YYYY-MM-DD' for a UTC date, so no timezone can shift a day. */
const iso = (d) => d.toISOString().slice(0, 10);

/** ISO weekday, 1 = Monday .. 7 = Sunday. */
const isoWeekday = (d) => (d.getUTCDay() === 0 ? 7 : d.getUTCDay());

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const pct = (part, whole) => (whole > 0 ? round2((Number(part) / Number(whole)) * 100) : 0);

class TimesheetService {

  // ==========================================================================
  // SETTINGS
  // ==========================================================================

  /** Organisation-wide settings. The row is seeded by the migration. */
  async getSettings() {
    const rows = await query('SELECT * FROM hr_timesheet_settings WHERE id = 1');
    const s = rows[0] || { standard_daily_hours: 8, work_days: '1,2,3,4,5', submission_due_day: 5 };
    return {
      standard_daily_hours: Number(s.standard_daily_hours),
      work_days: String(s.work_days).split(',').map(Number).filter((n) => n >= 1 && n <= 7),
      submission_due_day: Number(s.submission_due_day),
      updated_at: s.updated_at || null,
    };
  }

  async updateSettings(data, userId) {
    const current = await this.getSettings();
    const dailyHours = data.standard_daily_hours !== undefined
      ? Number(data.standard_daily_hours) : current.standard_daily_hours;
    if (!(dailyHours > 0) || dailyHours > 24) {
      throw new Error('Standard daily hours must be between 0 and 24');
    }

    let workDays = current.work_days;
    if (data.work_days !== undefined) {
      workDays = (Array.isArray(data.work_days) ? data.work_days : String(data.work_days).split(','))
        .map(Number)
        .filter((n) => n >= 1 && n <= 7);
      if (workDays.length === 0) throw new Error('At least one working day must be selected');
    }

    const dueDay = data.submission_due_day !== undefined
      ? Number(data.submission_due_day) : current.submission_due_day;
    if (!(dueDay >= 1 && dueDay <= 28)) {
      throw new Error('Submission due day must be between 1 and 28');
    }

    await query(
      `INSERT INTO hr_timesheet_settings (id, standard_daily_hours, work_days, submission_due_day, updated_by)
       VALUES (1, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         standard_daily_hours = VALUES(standard_daily_hours),
         work_days            = VALUES(work_days),
         submission_due_day   = VALUES(submission_due_day),
         updated_by           = VALUES(updated_by)`,
      [dailyHours, workDays.join(','), dueDay, userId || null]
    );
    return this.getSettings();
  }

  // ==========================================================================
  // PUBLIC HOLIDAYS
  // ==========================================================================

  /**
   * Holidays as they apply to a given year. A recurring holiday is projected
   * onto the requested year, so HR enters Christmas Day once.
   */
  async getHolidaysForYear(year) {
    const rows = await query(
      `SELECT id, holiday_date, holiday_name, is_recurring, notes
         FROM hr_public_holidays
        WHERE is_active = 1
          AND (is_recurring = 1 OR YEAR(holiday_date) = ?)
        ORDER BY MONTH(holiday_date), DAY(holiday_date)`,
      [year]
    );

    const seen = new Map();
    for (const r of rows) {
      const d = new Date(r.holiday_date);
      const projected = iso(new Date(Date.UTC(year, d.getUTCMonth(), d.getUTCDate())));
      if (!seen.has(projected)) {
        seen.set(projected, {
          id: r.id,
          date: projected,
          name: r.holiday_name,
          is_recurring: Boolean(r.is_recurring),
          notes: r.notes,
        });
      }
    }
    return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  async listHolidays(year) {
    const rows = await query(
      `SELECT h.*, CONCAT(u.first_name, ' ', u.last_name) AS created_by_name
         FROM hr_public_holidays h
         LEFT JOIN users u ON h.created_by = u.id
        WHERE (? IS NULL OR h.is_recurring = 1 OR YEAR(h.holiday_date) = ?)
        ORDER BY h.holiday_date`,
      [year || null, year || null]
    );
    return rows;
  }

  async createHoliday(data, userId) {
    if (!data.holiday_date) throw new Error('A date is required');
    if (!data.holiday_name || !String(data.holiday_name).trim()) {
      throw new Error('A holiday name is required');
    }
    const existing = await query(
      'SELECT id FROM hr_public_holidays WHERE holiday_date = ?',
      [data.holiday_date]
    );
    if (existing.length > 0) throw new Error('A holiday already exists on that date');

    const result = await query(
      `INSERT INTO hr_public_holidays (holiday_date, holiday_name, is_recurring, notes, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [
        data.holiday_date,
        String(data.holiday_name).trim(),
        data.is_recurring ? 1 : 0,
        data.notes || null,
        userId || null,
      ]
    );
    return { id: result.insertId };
  }

  async updateHoliday(id, data) {
    const rows = await query('SELECT id FROM hr_public_holidays WHERE id = ?', [id]);
    if (rows.length === 0) throw new Error('Holiday not found');

    const sets = [];
    const params = [];
    if (data.holiday_date !== undefined) { sets.push('holiday_date = ?'); params.push(data.holiday_date); }
    if (data.holiday_name !== undefined) { sets.push('holiday_name = ?'); params.push(String(data.holiday_name).trim()); }
    if (data.is_recurring !== undefined) { sets.push('is_recurring = ?'); params.push(data.is_recurring ? 1 : 0); }
    if (data.notes !== undefined)        { sets.push('notes = ?');        params.push(data.notes || null); }
    if (data.is_active !== undefined)    { sets.push('is_active = ?');    params.push(data.is_active ? 1 : 0); }
    if (sets.length === 0) return { id };

    params.push(id);
    await query(`UPDATE hr_public_holidays SET ${sets.join(', ')} WHERE id = ?`, params);
    return { id };
  }

  async deleteHoliday(id) {
    await query('DELETE FROM hr_public_holidays WHERE id = ?', [id]);
    return { id };
  }

  // ==========================================================================
  // PERIOD MATHS — working days, holidays, leave, expected hours
  // ==========================================================================

  /**
   * Days of approved leave for one employee inside a month, as an ISO-date Set.
   *
   * The leave module stores a range rather than individual dates, so the range
   * is expanded here and intersected with the month.
   */
  async getApprovedLeaveDates(employeeId, year, month) {
    const all = await this.getApprovedLeaveDatesFor([employeeId], year, month);
    return all.get(Number(employeeId)) || new Map();
  }

  /**
   * The same, for a set of employees at once. The trackers score the whole
   * organisation for a month, and one query beats sixty-five.
   */
  async getApprovedLeaveDatesFor(employeeIds, year, month) {
    const ids = [...new Set((employeeIds || []).map(Number).filter(Boolean))];
    const out = new Map(ids.map((id) => [id, new Map()]));
    if (ids.length === 0) return out;

    const firstDay = iso(new Date(Date.UTC(year, month - 1, 1)));
    const lastDay = iso(new Date(Date.UTC(year, month - 1, daysInMonth(year, month))));

    const rows = await query(
      `SELECT lr.employee_id, lr.start_date, lr.end_date, lt.leave_name
         FROM hr_leave_requests lr
         LEFT JOIN hr_leave_types lt ON lr.leave_type_id = lt.id
        WHERE lr.employee_id IN (${ids.map(() => '?').join(',')})
          AND lr.status = 'APPROVED'
          AND lr.start_date <= ?
          AND lr.end_date   >= ?`,
      [...ids, lastDay, firstDay]
    );

    for (const r of rows) {
      const bucket = out.get(Number(r.employee_id));
      if (!bucket) continue;
      const start = new Date(r.start_date);
      const end = new Date(r.end_date);
      for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
           d <= end;
           d.setUTCDate(d.getUTCDate() + 1)) {
        const key = iso(d);
        if (key >= firstDay && key <= lastDay) bucket.set(key, r.type_name || 'Leave');
      }
    }
    return out;
  }

  /**
   * Settings and holidays, loaded once and passed down when a caller is about
   * to score many employees over the same period.
   */
  async loadPeriodContext(year) {
    const [settings, holidays] = await Promise.all([
      this.getSettings(),
      this.getHolidaysForYear(year),
    ]);
    return { settings, holidayByDate: new Map(holidays.map((h) => [h.date, h.name])) };
  }

  /**
   * The full calendar for one employee-month, with each day classified, plus
   * the derived day counts and expected hours.
   *
   * `ctx` (from loadPeriodContext) and `leaveByDate` are optional; they are
   * supplied by the trackers so a batch does not re-read shared data per row.
   */
  async getPeriodMetrics(employeeId, year, month, ctx = null, preloadedLeave = null) {
    const { settings, holidayByDate } = ctx || (await this.loadPeriodContext(year));
    const leaveByDate = preloadedLeave
      || (employeeId ? await this.getApprovedLeaveDates(employeeId, year, month) : new Map());

    const total = daysInMonth(year, month);
    const days = [];
    let workingDays = 0;
    let holidayDays = 0;
    let leaveDays = 0;

    for (let day = 1; day <= total; day += 1) {
      const d = new Date(Date.UTC(year, month - 1, day));
      const key = iso(d);
      const weekday = isoWeekday(d);
      const isWorkDay = settings.work_days.includes(weekday);
      const holidayName = holidayByDate.get(key) || null;
      const leaveName = leaveByDate.get(key) || null;

      if (isWorkDay) {
        workingDays += 1;
        if (holidayName) holidayDays += 1;
        else if (leaveName) leaveDays += 1;
      }

      days.push({
        day,
        date: key,
        weekday,
        is_work_day: isWorkDay,
        is_weekend: !isWorkDay,
        holiday_name: holidayName,
        leave_type: holidayName ? null : leaveName,
        // A day nobody is expected to work: weekend, holiday, or approved leave.
        is_expected: isWorkDay && !holidayName && !leaveName,
      });
    }

    const availableDays = workingDays - holidayDays - leaveDays;
    return {
      year,
      month,
      month_name: MONTH_NAMES[month - 1],
      days_in_month: total,
      working_days: workingDays,
      holiday_days: holidayDays,
      leave_days: leaveDays,
      available_days: availableDays,
      daily_hours: settings.standard_daily_hours,
      expected_hours: round2(availableDays * settings.standard_daily_hours),
      days,
    };
  }

  // ==========================================================================
  // EMPLOYEES
  // ==========================================================================

  async getEmployeeIdForUser(userId) {
    const rows = await query('SELECT id FROM hr_employees WHERE user_id = ? LIMIT 1', [userId]);
    return rows.length > 0 ? rows[0].id : null;
  }

  /**
   * The employee row for a user, created from the user account if HR has not
   * yet completed the record. Mirrors hr.service.ensureEmployeeRecord so a new
   * starter is never blocked from filing a timesheet.
   */
  async ensureEmployeeForUser(userId) {
    const existing = await this.getEmployeeIdForUser(userId);
    if (existing) return existing;

    const users = await query(
      'SELECT id, first_name, last_name, department_id, is_active FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (users.length === 0) throw new Error('User account not found');
    const u = users[0];
    if (!u.is_active) throw new Error('Inactive user accounts cannot file timesheets');

    const result = await query(
      `INSERT INTO hr_employees
         (user_id, employee_number, first_name, last_name, department_id,
          employment_type, employment_status, is_active)
       VALUES (?, ?, ?, ?, ?, 'FULL_TIME', 'ACTIVE', 1)`,
      [
        u.id,
        `ZCC-${String(u.id).padStart(4, '0')}`,
        u.first_name || 'Unknown',
        u.last_name || 'Unknown',
        u.department_id || null,
      ]
    );
    return result.insertId;
  }

  /** Employee + the user account and department behind them. */
  async getEmployeeContext(employeeId) {
    const rows = await query(
      `SELECT e.id, e.employee_number, e.first_name, e.last_name, e.department_id,
              e.position_title, e.user_id, e.is_active, e.employment_status,
              d.department_name, d.department_code,
              u.email, u.job_title, u.is_active AS user_active,
              r.role_name AS role
         FROM hr_employees e
         LEFT JOIN departments d ON e.department_id = d.id
         LEFT JOIN users u       ON e.user_id = u.id
         LEFT JOIN roles r       ON u.role_id = r.id
        WHERE e.id = ?`,
      [employeeId]
    );
    if (rows.length === 0) return null;
    const e = rows[0];
    return {
      ...e,
      employee_name: `${e.first_name} ${e.last_name}`.trim(),
      role: e.role || ROLES.GENERAL_USER,
    };
  }

  /**
   * Every member of staff who must file a timesheet, optionally narrowed to one
   * department. The Super Admin is excluded — they approve, never submit.
   */
  async getTimesheetPopulation(departmentId = null) {
    // COALESCE covers an employee record with no linked user account: they are
    // ordinary staff, so they still owe a timesheet.
    const params = [ROLES.GENERAL_USER, ROLES.ADMIN];
    let where = 'e.is_active = 1 AND COALESCE(r.role_name, ?) <> ?';
    if (departmentId) {
      where += ' AND e.department_id = ?';
      params.push(departmentId);
    }

    return query(
      `SELECT e.id AS employee_id, e.employee_number, e.first_name, e.last_name,
              e.department_id, e.position_title, e.user_id,
              d.department_name, d.department_code,
              COALESCE(r.role_name, 'GENERAL_USER') AS role,
              CONCAT(e.first_name, ' ', e.last_name) AS employee_name
         FROM hr_employees e
         LEFT JOIN departments d ON e.department_id = d.id
         LEFT JOIN users u       ON e.user_id = u.id
         LEFT JOIN roles r       ON u.role_id = r.id
        WHERE ${where}
        ORDER BY d.department_name, e.first_name, e.last_name`,
      params
    );
  }

  // ==========================================================================
  // LEVEL OF EFFORT
  // ==========================================================================

  /**
   * The allocations in force for a given month. A row applies when the month
   * falls inside its effective window.
   */
  async getEffectiveLoe(employeeId, year, month) {
    return query(
      `SELECT l.id, l.employee_id, l.project_id, l.loe_percent, l.notes,
              l.effective_from_month, l.effective_to_month, l.loe_year,
              p.project_code, p.project_name, p.donor_id, p.department_id AS project_department_id,
              dn.donor_name AS partner_name, dn.donor_code AS partner_code
         FROM hr_employee_loe l
         JOIN projects p  ON l.project_id = p.id
         LEFT JOIN donors dn ON p.donor_id = dn.id
        WHERE l.employee_id = ?
          AND l.loe_year = ?
          AND l.is_active = 1
          AND ? BETWEEN l.effective_from_month AND l.effective_to_month
        ORDER BY l.loe_percent DESC, p.project_code`,
      [employeeId, year, month]
    );
  }

  /** Every allocation held for an employee in a year, for the HR editor. */
  async getEmployeeLoe(employeeId, year) {
    const rows = await query(
      `SELECT l.*, p.project_code, p.project_name, p.donor_id,
              dn.donor_name AS partner_name, dn.donor_code AS partner_code,
              CONCAT(cu.first_name, ' ', cu.last_name) AS updated_by_name
         FROM hr_employee_loe l
         JOIN projects p ON l.project_id = p.id
         LEFT JOIN donors dn ON p.donor_id = dn.id
         LEFT JOIN users cu  ON l.updated_by = cu.id
        WHERE l.employee_id = ? AND l.loe_year = ?
        ORDER BY l.effective_from_month, l.loe_percent DESC`,
      [employeeId, year]
    );
    return rows.map((r) => ({ ...r, loe_percent: Number(r.loe_percent) }));
  }

  /**
   * The allocation register, for the LOE management screens.
   * Returns one entry per employee with their allocations and the total, so an
   * employee who does not add up to 100% is easy to spot.
   */
  async getLoeRegister({ year, departmentId = null, employeeId = null, projectId = null, month = null }) {
    const people = await this.getTimesheetPopulation(departmentId);
    const filtered = employeeId
      ? people.filter((p) => Number(p.employee_id) === Number(employeeId))
      : people;
    if (filtered.length === 0) return [];

    const ids = filtered.map((p) => p.employee_id);
    const placeholders = ids.map(() => '?').join(',');
    const params = [...ids, year];
    let monthClause = '';
    if (month) {
      monthClause = ' AND ? BETWEEN l.effective_from_month AND l.effective_to_month';
      params.push(Number(month));
    }
    let projectClause = '';
    if (projectId) {
      projectClause = ' AND l.project_id = ?';
      params.push(Number(projectId));
    }

    const rows = await query(
      `SELECT l.id, l.employee_id, l.project_id, l.loe_percent, l.notes,
              l.effective_from_month, l.effective_to_month,
              p.project_code, p.project_name, p.donor_id,
              dn.donor_name AS partner_name, dn.donor_code AS partner_code
         FROM hr_employee_loe l
         JOIN projects p ON l.project_id = p.id
         LEFT JOIN donors dn ON p.donor_id = dn.id
        WHERE l.employee_id IN (${placeholders})
          AND l.loe_year = ?
          AND l.is_active = 1
          ${monthClause}
          ${projectClause}
        ORDER BY l.effective_from_month, l.loe_percent DESC`,
      params
    );

    const byEmployee = new Map();
    for (const r of rows) {
      if (!byEmployee.has(r.employee_id)) byEmployee.set(r.employee_id, []);
      byEmployee.get(r.employee_id).push({ ...r, loe_percent: Number(r.loe_percent) });
    }

    return filtered
      .map((p) => {
        const allocations = byEmployee.get(p.employee_id) || [];
        const totalPercent = round2(allocations.reduce((s, a) => s + a.loe_percent, 0));
        return {
          ...p,
          year: Number(year),
          allocations,
          total_percent: totalPercent,
          is_complete: Math.abs(totalPercent - 100) < 0.01,
          project_count: allocations.length,
        };
      })
      // With a project filter, only people actually on that project are useful.
      .filter((p) => (projectId ? p.allocations.length > 0 : true));
  }

  /**
   * Replace an employee's allocations for a year.
   *
   * Sent as a complete set, which is how the editor works: what arrives is what
   * the year holds afterwards. Percentages are validated per month — every
   * month that has any allocation must total 100.
   */
  async saveEmployeeLoe(employeeId, year, allocations, userId) {
    const employee = await this.getEmployeeContext(employeeId);
    if (!employee) throw new Error('Employee not found');

    const rows = (allocations || []).map((a) => ({
      project_id: Number(a.project_id),
      loe_percent: round2(a.loe_percent),
      effective_from_month: Number(a.effective_from_month || 1),
      effective_to_month: Number(a.effective_to_month || 12),
      notes: a.notes || null,
    }));

    for (const r of rows) {
      if (!r.project_id) throw new Error('Every allocation needs a project');
      if (!(r.loe_percent > 0)) throw new Error('Every allocation needs a percentage above zero');
      if (r.loe_percent > 100) throw new Error('A single allocation cannot exceed 100%');
      if (r.effective_from_month < 1 || r.effective_to_month > 12
          || r.effective_from_month > r.effective_to_month) {
        throw new Error('The effective month range must fall inside January to December');
      }
    }

    // Duplicate project inside an overlapping window would double-count.
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        if (rows[i].project_id === rows[j].project_id
            && rows[i].effective_from_month <= rows[j].effective_to_month
            && rows[j].effective_from_month <= rows[i].effective_to_month) {
          throw new Error('The same project is allocated twice over overlapping months');
        }
      }
    }

    // Each month that carries any allocation must add up to exactly 100%.
    for (let m = 1; m <= 12; m += 1) {
      const applicable = rows.filter((r) => m >= r.effective_from_month && m <= r.effective_to_month);
      if (applicable.length === 0) continue;
      const total = round2(applicable.reduce((s, r) => s + r.loe_percent, 0));
      if (Math.abs(total - 100) > 0.01) {
        throw new Error(
          `${MONTH_NAMES[m - 1]} totals ${total}% — each month with an allocation must total 100%`
        );
      }
    }

    // Projects must exist and be live.
    if (rows.length > 0) {
      const ids = [...new Set(rows.map((r) => r.project_id))];
      const found = await query(
        `SELECT id FROM projects WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
      if (found.length !== ids.length) throw new Error('One or more projects no longer exist');
    }

    await transaction(async (connection) => {
      await connection.execute(
        'DELETE FROM hr_employee_loe WHERE employee_id = ? AND loe_year = ?',
        [employeeId, year]
      );
      for (const r of rows) {
        await connection.execute(
          `INSERT INTO hr_employee_loe
             (employee_id, project_id, loe_year, effective_from_month, effective_to_month,
              loe_percent, notes, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            employeeId, r.project_id, year, r.effective_from_month, r.effective_to_month,
            r.loe_percent, r.notes, userId || null, userId || null,
          ]
        );
      }
    });

    return this.getEmployeeLoe(employeeId, year);
  }

  /**
   * Copy a year's allocations onto the next year. Saves HR re-keying the whole
   * organisation every January. Employees who already have allocations in the
   * target year are skipped rather than overwritten.
   */
  async copyLoeYear(fromYear, toYear, userId, departmentId = null) {
    const people = await this.getTimesheetPopulation(departmentId);
    let copied = 0;
    let skipped = 0;

    for (const p of people) {
      const existing = await query(
        'SELECT COUNT(*) AS n FROM hr_employee_loe WHERE employee_id = ? AND loe_year = ?',
        [p.employee_id, toYear]
      );
      if (Number(existing[0].n) > 0) { skipped += 1; continue; }

      const source = await query(
        'SELECT * FROM hr_employee_loe WHERE employee_id = ? AND loe_year = ? AND is_active = 1',
        [p.employee_id, fromYear]
      );
      if (source.length === 0) { skipped += 1; continue; }

      for (const s of source) {
        await query(
          `INSERT IGNORE INTO hr_employee_loe
             (employee_id, project_id, loe_year, effective_from_month, effective_to_month,
              loe_percent, notes, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            p.employee_id, s.project_id, toYear, s.effective_from_month, s.effective_to_month,
            s.loe_percent, s.notes, userId || null, userId || null,
          ]
        );
      }
      copied += 1;
    }

    return { copied, skipped, from_year: Number(fromYear), to_year: Number(toYear) };
  }

  // ==========================================================================
  // THE TIMESHEET ITSELF
  // ==========================================================================

  async getTimesheetRow(id) {
    const rows = await query('SELECT * FROM hr_timesheets WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async findTimesheet(employeeId, year, month) {
    const rows = await query(
      'SELECT * FROM hr_timesheets WHERE employee_id = ? AND period_year = ? AND period_month = ?',
      [employeeId, year, month]
    );
    return rows[0] || null;
  }

  /**
   * Open the timesheet for a period, creating the draft if it does not exist.
   * A new draft is seeded with one row per LOE allocation, so the employee only
   * has to fill in hours and describe the work.
   */
  async openTimesheet(employeeId, year, month, userId) {
    if (!(month >= 1 && month <= 12)) throw new Error('Month must be between 1 and 12');
    if (!(year >= 2000 && year <= 2100)) throw new Error('Year is out of range');

    let sheet = await this.findTimesheet(employeeId, year, month);
    if (!sheet) {
      const metrics = await this.getPeriodMetrics(employeeId, year, month);
      const result = await query(
        `INSERT INTO hr_timesheets
           (employee_id, period_month, period_year, total_hours, expected_hours,
            working_days, holiday_days, leave_days, daily_hours, status, created_by)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
        [
          employeeId, month, year,
          metrics.expected_hours, metrics.working_days, metrics.holiday_days,
          metrics.leave_days, metrics.daily_hours,
          TIMESHEET_STATUS.DRAFT, userId || null,
        ]
      );
      const timesheetId = result.insertId;

      const loe = await this.getEffectiveLoe(employeeId, year, month);
      let order = 0;
      for (const a of loe) {
        await query(
          `INSERT INTO hr_timesheet_lines (timesheet_id, project_id, loe_percent, sort_order)
           VALUES (?, ?, ?, ?)`,
          [timesheetId, a.project_id, a.loe_percent, order]
        );
        order += 1;
      }

      await this.logAction(timesheetId, {
        action: 'CREATED',
        from_status: TIMESHEET_STATUS.NOT_STARTED,
        to_status: TIMESHEET_STATUS.DRAFT,
        actorId: userId,
      });

      sheet = await this.getTimesheetRow(timesheetId);
    }
    return sheet;
  }

  /**
   * The full grid: header, day calendar, project rows with their cells, and the
   * LOE-versus-actual comparison.
   */
  async getTimesheetGrid(timesheetId) {
    const header = await query(
      `SELECT t.*, t.period_month AS month, t.period_year AS year,
              CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
              e.employee_number, e.position_title, e.department_id, e.user_id AS employee_user_id,
              d.department_name, d.department_code,
              u.job_title, u.email AS employee_email,
              COALESCE(r.role_name, 'GENERAL_USER') AS employee_role,
              CONCAT(rv.first_name, ' ', rv.last_name) AS reviewed_by_name,
              CONCAT(lk.first_name, ' ', lk.last_name) AS locked_by_name
         FROM hr_timesheets t
         JOIN hr_employees e     ON t.employee_id = e.id
         LEFT JOIN departments d ON e.department_id = d.id
         LEFT JOIN users u       ON e.user_id = u.id
         LEFT JOIN roles r       ON u.role_id = r.id
         LEFT JOIN users rv      ON t.reviewed_by = rv.id
         LEFT JOIN users lk      ON t.locked_by = lk.id
        WHERE t.id = ?`,
      [timesheetId]
    );
    if (header.length === 0) return null;
    const sheet = header[0];

    const metrics = await this.getPeriodMetrics(sheet.employee_id, sheet.period_year, sheet.period_month);

    const lineRows = await query(
      `SELECT l.id, l.project_id, l.activity_description, l.loe_percent, l.sort_order,
              p.project_code, p.project_name, p.donor_id,
              dn.donor_name AS partner_name, dn.donor_code AS partner_code
         FROM hr_timesheet_lines l
         LEFT JOIN projects p ON l.project_id = p.id
         LEFT JOIN donors dn  ON p.donor_id = dn.id
        WHERE l.timesheet_id = ?
        ORDER BY l.sort_order, l.id`,
      [timesheetId]
    );

    const entries = await query(
      `SELECT id, line_id, entry_date, hours, notes
         FROM hr_timesheet_entries
        WHERE timesheet_id = ?`,
      [timesheetId]
    );

    const cellsByLine = new Map();
    for (const e of entries) {
      const key = e.line_id;
      if (!cellsByLine.has(key)) cellsByLine.set(key, {});
      cellsByLine.get(key)[iso(new Date(e.entry_date))] = Number(e.hours);
    }

    const lines = lineRows.map((l) => {
      const hoursByDate = cellsByLine.get(l.id) || {};
      const totalHours = round2(Object.values(hoursByDate).reduce((s, h) => s + Number(h || 0), 0));
      return {
        ...l,
        loe_percent: Number(l.loe_percent),
        hours_by_date: hoursByDate,
        total_hours: totalHours,
        expected_hours: round2(metrics.expected_hours * (Number(l.loe_percent) / 100)),
      };
    });

    const actualTotal = round2(lines.reduce((s, l) => s + l.total_hours, 0));
    for (const l of lines) {
      l.actual_percent = pct(l.total_hours, actualTotal);
      l.variance_percent = round2(l.actual_percent - l.loe_percent);
      l.variance_hours = round2(l.total_hours - l.expected_hours);
    }

    // Column totals, so the grid foots both ways.
    const dailyTotals = {};
    for (const day of metrics.days) {
      dailyTotals[day.date] = round2(
        lines.reduce((s, l) => s + Number(l.hours_by_date[day.date] || 0), 0)
      );
    }

    return {
      ...sheet,
      status: this.displayStatus(sheet),
      stored_status: sheet.status,
      is_locked: this.isLocked(sheet),
      total_hours: actualTotal,
      expected_hours: metrics.expected_hours,
      completion_percent: pct(actualTotal, metrics.expected_hours),
      metrics,
      lines,
      daily_totals: dailyTotals,
    };
  }

  /** A locked timesheet cannot be edited by anyone below the HR Office. */
  isLocked(sheet) {
    if (!sheet) return false;
    return Boolean(sheet.locked_at) || sheet.status === TIMESHEET_STATUS.LOCKED
      || sheet.status === TIMESHEET_STATUS.APPROVED;
  }

  /** Approved sheets that have been sealed report as LOCKED. */
  displayStatus(sheet) {
    if (!sheet) return TIMESHEET_STATUS.NOT_STARTED;
    if (sheet.status === TIMESHEET_STATUS.APPROVED && sheet.locked_at) return TIMESHEET_STATUS.LOCKED;
    return sheet.status;
  }

  /**
   * Save the grid. Sent whole: the rows and cells that arrive replace what was
   * there. Only the owner may save, and only while the sheet is editable.
   */
  async saveTimesheetGrid(timesheetId, payload, user) {
    const sheet = await this.getTimesheetRow(timesheetId);
    if (!sheet) throw new Error('Timesheet not found');

    if (this.isLocked(sheet)) {
      throw new Error('This timesheet is approved and locked, and can no longer be edited');
    }
    if (!TIMESHEET_EDITABLE_STATUSES.includes(sheet.status)) {
      throw new Error(`A timesheet with status ${sheet.status} cannot be edited`);
    }

    const metrics = await this.getPeriodMetrics(sheet.employee_id, sheet.period_year, sheet.period_month);
    const validDates = new Set(metrics.days.map((d) => d.date));

    const lines = Array.isArray(payload.lines) ? payload.lines : [];
    for (const l of lines) {
      if (!l.project_id) throw new Error('Every row must name a project');
      const hours = l.hours_by_date || {};
      for (const [date, value] of Object.entries(hours)) {
        if (!validDates.has(date)) {
          throw new Error(`${date} does not fall inside ${metrics.month_name} ${metrics.year}`);
        }
        const h = Number(value);
        if (Number.isNaN(h) || h < 0) throw new Error('Hours cannot be negative');
        if (h > 24) throw new Error('A day cannot hold more than 24 hours');
      }
    }

    // No single day may exceed 24 hours across all projects.
    const perDay = {};
    for (const l of lines) {
      for (const [date, value] of Object.entries(l.hours_by_date || {})) {
        perDay[date] = round2((perDay[date] || 0) + Number(value || 0));
      }
    }
    const over = Object.entries(perDay).find(([, h]) => h > 24);
    if (over) throw new Error(`${over[0]} totals ${over[1]} hours — a day cannot exceed 24`);

    // Projects must be real.
    const projectIds = [...new Set(lines.map((l) => Number(l.project_id)))];
    if (projectIds.length > 0) {
      const found = await query(
        `SELECT id FROM projects WHERE id IN (${projectIds.map(() => '?').join(',')})`,
        projectIds
      );
      if (found.length !== projectIds.length) throw new Error('One or more projects no longer exist');
    }

    // The LOE in force is the authority on the percentages, not the client.
    const loe = await this.getEffectiveLoe(sheet.employee_id, sheet.period_year, sheet.period_month);
    const loeByProject = new Map(loe.map((a) => [Number(a.project_id), Number(a.loe_percent)]));

    await transaction(async (connection) => {
      await connection.execute('DELETE FROM hr_timesheet_lines WHERE timesheet_id = ?', [timesheetId]);
      // Entries cascade with their line, but a legacy row could predate lines.
      await connection.execute('DELETE FROM hr_timesheet_entries WHERE timesheet_id = ?', [timesheetId]);

      let order = 0;
      let grandTotal = 0;

      for (const l of lines) {
        const projectId = Number(l.project_id);
        const loePercent = loeByProject.has(projectId)
          ? loeByProject.get(projectId)
          : 0;

        const hours = l.hours_by_date || {};
        const lineTotal = round2(
          Object.values(hours).reduce((s, h) => s + Number(h || 0), 0)
        );
        grandTotal = round2(grandTotal + lineTotal);

        const [lineResult] = await connection.execute(
          `INSERT INTO hr_timesheet_lines
             (timesheet_id, project_id, activity_description, loe_percent, total_hours, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            timesheetId, projectId,
            l.activity_description ? String(l.activity_description).trim() : null,
            loePercent, lineTotal, order,
          ]
        );
        const lineId = lineResult.insertId;
        order += 1;

        for (const [date, value] of Object.entries(hours)) {
          const h = round2(value);
          if (h <= 0) continue;
          await connection.execute(
            `INSERT INTO hr_timesheet_entries
               (timesheet_id, line_id, project_id, entry_date, hours, activity_description)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              timesheetId, lineId, projectId, date, h,
              l.activity_description ? String(l.activity_description).trim() : null,
            ]
          );
        }
      }

      await connection.execute(
        `UPDATE hr_timesheets
            SET total_hours = ?, expected_hours = ?, working_days = ?, holiday_days = ?,
                leave_days = ?, daily_hours = ?, notes = ?
          WHERE id = ?`,
        [
          grandTotal, metrics.expected_hours, metrics.working_days, metrics.holiday_days,
          metrics.leave_days, metrics.daily_hours,
          payload.notes !== undefined ? payload.notes : sheet.notes,
          timesheetId,
        ]
      );
    });

    return this.getTimesheetGrid(timesheetId);
  }

  /**
   * Submit for approval. Routes to the next approver and records who that is,
   * so the queues can be built without recomputing the chain for every row.
   */
  async submitTimesheet(timesheetId, user) {
    const sheet = await this.getTimesheetRow(timesheetId);
    if (!sheet) throw new Error('Timesheet not found');
    if (this.isLocked(sheet)) throw new Error('This timesheet is already approved and locked');
    if (!TIMESHEET_EDITABLE_STATUSES.includes(sheet.status)) {
      throw new Error('Only a draft, rejected or returned timesheet can be submitted');
    }

    const employee = await this.getEmployeeContext(sheet.employee_id);
    if (!employee) throw new Error('Employee record not found');
    if (!requiresTimesheet({ role: employee.role })) {
      throw new Error('The Super Admin does not submit timesheets');
    }

    const totals = await query(
      'SELECT COALESCE(SUM(hours), 0) AS total FROM hr_timesheet_entries WHERE timesheet_id = ?',
      [timesheetId]
    );
    if (Number(totals[0].total) <= 0) {
      throw new Error('Record some hours before submitting this timesheet');
    }

    const lines = await query(
      'SELECT id, activity_description FROM hr_timesheet_lines WHERE timesheet_id = ?',
      [timesheetId]
    );
    const missing = lines.find((l) => !l.activity_description || !String(l.activity_description).trim());
    if (missing) throw new Error('Every project row needs an activity description');

    const target = await timesheetApproval.resolveApprover({
      userId: employee.user_id,
      role: employee.role,
      departmentId: employee.department_id,
    });

    await query(
      `UPDATE hr_timesheets
          SET status = ?, current_approver_role = ?, current_approver_dept_id = ?,
              submitted_at = NOW(3), rejection_reason = NULL, returned_reason = NULL
        WHERE id = ?`,
      [
        TIMESHEET_STATUS.SUBMITTED,
        target.approverRole,
        target.approverDepartmentId,
        timesheetId,
      ]
    );

    await this.logAction(timesheetId, {
      action: sheet.status === TIMESHEET_STATUS.DRAFT ? 'SUBMITTED' : 'RESUBMITTED',
      from_status: sheet.status,
      to_status: TIMESHEET_STATUS.SUBMITTED,
      actorId: user.id,
      actorRole: user.role,
      comments: target.isFallback
        ? `Routed to ${timesheetApproval.humanRole(target.approverRole)} (no direct approver available)`
        : null,
    });

    return { ...(await this.getTimesheetRow(timesheetId)), approver: target };
  }

  /** An approver has opened a submitted timesheet — mark it as being reviewed. */
  async markUnderReview(timesheetId, user) {
    const sheet = await this.getTimesheetRow(timesheetId);
    if (!sheet || sheet.status !== TIMESHEET_STATUS.SUBMITTED) return sheet;

    await query(
      'UPDATE hr_timesheets SET status = ?, reviewed_by = ?, reviewed_at = NOW(3) WHERE id = ?',
      [TIMESHEET_STATUS.UNDER_REVIEW, user.id, timesheetId]
    );
    await this.logAction(timesheetId, {
      action: 'UNDER_REVIEW',
      from_status: TIMESHEET_STATUS.SUBMITTED,
      to_status: TIMESHEET_STATUS.UNDER_REVIEW,
      actorId: user.id,
      actorRole: user.role,
    });
    return this.getTimesheetRow(timesheetId);
  }

  /**
   * Approve, reject or return. Rejected and returned sheets go back to the
   * employee, who may edit and resubmit. Approving locks the sheet.
   */
  async actOnTimesheet(timesheetId, user, action, comments) {
    const sheet = await this.getTimesheetRow(timesheetId);
    if (!sheet) throw new Error('Timesheet not found');
    if (!TIMESHEET_PENDING_STATUSES.includes(sheet.status)) {
      throw new Error('This timesheet is not awaiting approval');
    }

    const employee = await this.getEmployeeContext(sheet.employee_id);
    await timesheetApproval.assertCanApprove(user, {
      userId: employee.user_id,
      role: employee.role,
      departmentId: employee.department_id,
    });

    const normalised = String(action || '').toUpperCase();
    if (!['APPROVE', 'REJECT', 'RETURN'].includes(normalised)) {
      throw new Error('Action must be approve, reject or return');
    }
    if (normalised !== 'APPROVE' && (!comments || !String(comments).trim())) {
      throw new Error('A reason is required when rejecting or returning a timesheet');
    }

    if (normalised === 'APPROVE') {
      await query(
        `UPDATE hr_timesheets
            SET status = ?, current_approver_role = NULL, current_approver_dept_id = NULL,
                supervisor_approved_by = ?, supervisor_approved_at = NOW(3),
                locked_at = NOW(3), locked_by = ?, notes = COALESCE(?, notes)
          WHERE id = ?`,
        [TIMESHEET_STATUS.APPROVED, user.id, user.id, comments || null, timesheetId]
      );
    } else if (normalised === 'REJECT') {
      await query(
        `UPDATE hr_timesheets
            SET status = ?, current_approver_role = NULL, current_approver_dept_id = NULL,
                rejection_reason = ?, returned_reason = NULL
          WHERE id = ?`,
        [TIMESHEET_STATUS.REJECTED, String(comments).trim(), timesheetId]
      );
    } else {
      await query(
        `UPDATE hr_timesheets
            SET status = ?, current_approver_role = NULL, current_approver_dept_id = NULL,
                returned_reason = ?, rejection_reason = NULL
          WHERE id = ?`,
        [TIMESHEET_STATUS.RETURNED, String(comments).trim(), timesheetId]
      );
    }

    const toStatus = normalised === 'APPROVE' ? TIMESHEET_STATUS.APPROVED
      : normalised === 'REJECT' ? TIMESHEET_STATUS.REJECTED
        : TIMESHEET_STATUS.RETURNED;

    await this.logAction(timesheetId, {
      action: normalised === 'APPROVE' ? 'APPROVED' : normalised === 'REJECT' ? 'REJECTED' : 'RETURNED',
      from_status: sheet.status,
      to_status: toStatus,
      actorId: user.id,
      actorRole: user.role,
      comments: comments || null,
    });

    return { ...(await this.getTimesheetRow(timesheetId)), employee };
  }

  /**
   * Reopen an approved timesheet. Only the HR Office and the Super Admin, and
   * only with a reason — an approved sheet has already been relied on.
   */
  async reopenTimesheet(timesheetId, user, reason) {
    if (!hasOrgTimesheetAccess(user)) {
      throw new Error('Only the HR Office or a Super Admin can reopen an approved timesheet');
    }
    if (!reason || !String(reason).trim()) throw new Error('A reason is required to reopen a timesheet');

    const sheet = await this.getTimesheetRow(timesheetId);
    if (!sheet) throw new Error('Timesheet not found');
    if (!this.isLocked(sheet)) throw new Error('This timesheet is not locked');

    await query(
      `UPDATE hr_timesheets
          SET status = ?, locked_at = NULL, locked_by = NULL,
              returned_reason = ?, supervisor_approved_by = NULL, supervisor_approved_at = NULL
        WHERE id = ?`,
      [TIMESHEET_STATUS.RETURNED, String(reason).trim(), timesheetId]
    );
    await this.logAction(timesheetId, {
      action: 'REOPENED',
      from_status: sheet.status,
      to_status: TIMESHEET_STATUS.RETURNED,
      actorId: user.id,
      actorRole: user.role,
      comments: reason,
    });
    return this.getTimesheetRow(timesheetId);
  }

  async logAction(timesheetId, { action, from_status, to_status, actorId, actorRole, comments }) {
    try {
      await query(
        `INSERT INTO hr_timesheet_approvals
           (timesheet_id, action, from_status, to_status, actor_id, actor_role, comments)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [timesheetId, action, from_status || null, to_status || null,
          actorId || null, actorRole || null, comments || null]
      );
    } catch (err) {
      console.error('[TimesheetService] Failed to write approval trail:', err.message);
    }
  }

  async getAuditTrail(timesheetId) {
    return query(
      `SELECT a.*, CONCAT(u.first_name, ' ', u.last_name) AS actor_name, u.job_title
         FROM hr_timesheet_approvals a
         LEFT JOIN users u ON a.actor_id = u.id
        WHERE a.timesheet_id = ?
        ORDER BY a.created_at, a.id`,
      [timesheetId]
    );
  }

  // ==========================================================================
  // TRACKERS AND LISTS
  // ==========================================================================

  /**
   * January to December for one employee, with a row for every month whether or
   * not a timesheet exists. Months with no row report as NOT_STARTED.
   */
  async getYearTracker(employeeId, year) {
    const sheets = await query(
      `SELECT t.*, CONCAT(rv.first_name, ' ', rv.last_name) AS reviewed_by_name
         FROM hr_timesheets t
         LEFT JOIN users rv ON t.supervisor_approved_by = rv.id
        WHERE t.employee_id = ? AND t.period_year = ?`,
      [employeeId, year]
    );
    const byMonth = new Map(sheets.map((s) => [Number(s.period_month), s]));

    const employee = await this.getEmployeeContext(employeeId);
    const ctx = await this.loadPeriodContext(year);
    const months = [];
    let totalExpected = 0;
    let totalActual = 0;

    for (let m = 1; m <= 12; m += 1) {
      const sheet = byMonth.get(m) || null;
      const metrics = await this.getPeriodMetrics(employeeId, year, m, ctx);
      const actual = sheet ? Number(sheet.total_hours) : 0;
      totalExpected = round2(totalExpected + metrics.expected_hours);
      totalActual = round2(totalActual + actual);

      months.push({
        month: m,
        month_name: MONTH_NAMES[m - 1],
        timesheet_id: sheet ? sheet.id : null,
        status: sheet ? this.displayStatus(sheet) : TIMESHEET_STATUS.NOT_STARTED,
        expected_hours: metrics.expected_hours,
        actual_hours: actual,
        completion_percent: pct(actual, metrics.expected_hours),
        working_days: metrics.working_days,
        holiday_days: metrics.holiday_days,
        leave_days: metrics.leave_days,
        available_days: metrics.available_days,
        submitted_at: sheet ? sheet.submitted_at : null,
        approved_at: sheet ? sheet.supervisor_approved_at : null,
        approved_by_name: sheet ? sheet.reviewed_by_name : null,
        rejection_reason: sheet ? sheet.rejection_reason : null,
        returned_reason: sheet ? sheet.returned_reason : null,
        is_locked: sheet ? this.isLocked(sheet) : false,
      });
    }

    const approved = months.filter((m) => m.status === TIMESHEET_STATUS.APPROVED
      || m.status === TIMESHEET_STATUS.LOCKED).length;

    return {
      employee: employee ? {
        employee_id: employee.id,
        employee_name: employee.employee_name,
        employee_number: employee.employee_number,
        department_id: employee.department_id,
        department_name: employee.department_name,
        position_title: employee.position_title || employee.job_title || null,
        role: employee.role,
      } : null,
      year: Number(year),
      months,
      summary: {
        expected_hours: totalExpected,
        actual_hours: totalActual,
        completion_percent: pct(totalActual, totalExpected),
        approved_months: approved,
        submitted_months: months.filter((m) => m.status !== TIMESHEET_STATUS.NOT_STARTED).length,
        outstanding_months: months.filter((m) => m.status === TIMESHEET_STATUS.NOT_STARTED).length,
      },
    };
  }

  /**
   * Everyone's standing for one month — the Team and Organisation trackers.
   * Employees who have not started appear too, which is the point of a tracker.
   */
  async getPeriodTracker({ year, month, departmentId = null, status = null, employeeId = null, projectId = null }) {
    const people = await this.getTimesheetPopulation(departmentId);
    const filtered = employeeId
      ? people.filter((p) => Number(p.employee_id) === Number(employeeId))
      : people;
    if (filtered.length === 0) return [];

    const ids = filtered.map((p) => p.employee_id);
    const placeholders = ids.map(() => '?').join(',');

    const sheets = await query(
      `SELECT t.*, CONCAT(ap.first_name, ' ', ap.last_name) AS approved_by_name
         FROM hr_timesheets t
         LEFT JOIN users ap ON t.supervisor_approved_by = ap.id
        WHERE t.employee_id IN (${placeholders})
          AND t.period_year = ? AND t.period_month = ?`,
      [...ids, year, month]
    );
    const byEmployee = new Map(sheets.map((s) => [Number(s.employee_id), s]));

    // Project / partner split per timesheet, so LOE % vs Actual % is visible
    // without opening each sheet.
    const sheetIds = sheets.map((s) => s.id);
    const linesBySheet = new Map();
    if (sheetIds.length > 0) {
      const lineParams = [...sheetIds];
      let projectClause = '';
      if (projectId) {
        projectClause = ' AND l.project_id = ?';
        lineParams.push(Number(projectId));
      }
      const lines = await query(
        `SELECT l.timesheet_id, l.project_id, l.loe_percent, l.total_hours,
                p.project_code, p.project_name, dn.donor_name AS partner_name
           FROM hr_timesheet_lines l
           LEFT JOIN projects p ON l.project_id = p.id
           LEFT JOIN donors dn  ON p.donor_id = dn.id
          WHERE l.timesheet_id IN (${sheetIds.map(() => '?').join(',')})
          ${projectClause}
          ORDER BY l.sort_order`,
        lineParams
      );
      for (const l of lines) {
        if (!linesBySheet.has(l.timesheet_id)) linesBySheet.set(l.timesheet_id, []);
        linesBySheet.get(l.timesheet_id).push(l);
      }
    }

    const ctx = await this.loadPeriodContext(year);
    const leaveByEmployee = await this.getApprovedLeaveDatesFor(ids, year, month);

    const out = [];
    for (const p of filtered) {
      const sheet = byEmployee.get(Number(p.employee_id)) || null;
      const metrics = await this.getPeriodMetrics(
        p.employee_id, year, month, ctx, leaveByEmployee.get(Number(p.employee_id)) || new Map()
      );
      const actual = sheet ? Number(sheet.total_hours) : 0;
      const rawLines = sheet ? (linesBySheet.get(sheet.id) || []) : [];

      const projects = rawLines.map((l) => ({
        project_id: l.project_id,
        project_code: l.project_code,
        project_name: l.project_name,
        partner_name: l.partner_name,
        loe_percent: Number(l.loe_percent),
        actual_hours: Number(l.total_hours),
        expected_hours: round2(metrics.expected_hours * (Number(l.loe_percent) / 100)),
        actual_percent: pct(l.total_hours, actual),
      }));

      const row = {
        employee_id: p.employee_id,
        employee_name: p.employee_name,
        employee_number: p.employee_number,
        department_id: p.department_id,
        department_name: p.department_name,
        position_title: p.position_title,
        role: p.role,
        year: Number(year),
        month: Number(month),
        month_name: MONTH_NAMES[month - 1],
        timesheet_id: sheet ? sheet.id : null,
        status: sheet ? this.displayStatus(sheet) : TIMESHEET_STATUS.NOT_STARTED,
        expected_hours: metrics.expected_hours,
        actual_hours: actual,
        completion_percent: pct(actual, metrics.expected_hours),
        working_days: metrics.working_days,
        holiday_days: metrics.holiday_days,
        leave_days: metrics.leave_days,
        available_days: metrics.available_days,
        submitted_at: sheet ? sheet.submitted_at : null,
        approved_at: sheet ? sheet.supervisor_approved_at : null,
        approved_by_name: sheet ? sheet.approved_by_name : null,
        is_locked: sheet ? this.isLocked(sheet) : false,
        projects,
      };

      if (projectId && row.projects.length === 0) continue;
      if (status && row.status !== status) continue;
      out.push(row);
    }

    return out;
  }

  /**
   * The approval queue for one approver — every timesheet currently waiting on
   * them, across every period.
   */
  async getApprovalQueue(user, scope = 'all') {
    const { sql, params } = timesheetApproval.pendingForApproverWhereClause(user, scope);
    const statuses = TIMESHEET_PENDING_STATUSES;

    return query(
      `SELECT t.id, t.employee_id, t.period_month AS month, t.period_year AS year,
              t.status, t.total_hours, t.expected_hours, t.submitted_at, t.notes,
              CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
              e.employee_number, e.position_title,
              d.department_name, d.department_code, e.department_id,
              COALESCE(own_r.role_name, 'GENERAL_USER') AS employee_role
         FROM hr_timesheets t
         JOIN hr_employees e     ON t.employee_id = e.id
         LEFT JOIN departments d ON e.department_id = d.id
         LEFT JOIN users own_u   ON e.user_id = own_u.id
         LEFT JOIN roles own_r   ON own_u.role_id = own_r.id
        WHERE t.status IN (${statuses.map(() => '?').join(',')})
          AND ${sql}
        ORDER BY t.period_year DESC, t.period_month DESC, d.department_name, e.first_name`,
      [...statuses, ...params]
    );
  }

  /**
   * Flat, filtered list for the report screens and exports.
   * Only timesheets that exist — the trackers cover what is missing.
   */
  async listTimesheets(filters = {}) {
    const {
      year, month, departmentId, employeeId, status, projectId, partnerId,
      page = 1, limit = 50,
    } = filters;

    const where = ['1 = 1'];
    const params = [];

    if (year)         { where.push('t.period_year = ?');   params.push(Number(year)); }
    if (month)        { where.push('t.period_month = ?');  params.push(Number(month)); }
    if (departmentId) { where.push('e.department_id = ?'); params.push(Number(departmentId)); }
    if (employeeId)   { where.push('t.employee_id = ?');   params.push(Number(employeeId)); }
    if (status) {
      // LOCKED is stored as APPROVED + locked_at.
      if (status === TIMESHEET_STATUS.LOCKED) {
        where.push("t.status = 'APPROVED' AND t.locked_at IS NOT NULL");
      } else if (status === TIMESHEET_STATUS.APPROVED) {
        where.push("t.status = 'APPROVED'");
      } else {
        where.push('t.status = ?');
        params.push(status);
      }
    }
    if (projectId) {
      where.push('EXISTS (SELECT 1 FROM hr_timesheet_lines l WHERE l.timesheet_id = t.id AND l.project_id = ?)');
      params.push(Number(projectId));
    }
    if (partnerId) {
      where.push(`EXISTS (
        SELECT 1 FROM hr_timesheet_lines l
        JOIN projects p ON l.project_id = p.id
        WHERE l.timesheet_id = t.id AND p.donor_id = ?)`);
      params.push(Number(partnerId));
    }

    const offset = (Number(page) - 1) * Number(limit);
    const countRows = await query(
      `SELECT COUNT(*) AS total
         FROM hr_timesheets t
         JOIN hr_employees e ON t.employee_id = e.id
        WHERE ${where.join(' AND ')}`,
      params
    );

    const rows = await query(
      `SELECT t.id, t.employee_id, t.period_month AS month, t.period_year AS year,
              t.status, t.locked_at, t.total_hours, t.expected_hours,
              t.working_days, t.holiday_days, t.leave_days, t.daily_hours,
              t.submitted_at, t.supervisor_approved_at AS approved_at, t.notes,
              t.rejection_reason, t.returned_reason,
              CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
              e.employee_number, e.position_title, e.department_id,
              d.department_name, d.department_code,
              CONCAT(ap.first_name, ' ', ap.last_name) AS approved_by_name
         FROM hr_timesheets t
         JOIN hr_employees e     ON t.employee_id = e.id
         LEFT JOIN departments d ON e.department_id = d.id
         LEFT JOIN users ap      ON t.supervisor_approved_by = ap.id
        WHERE ${where.join(' AND ')}
        ORDER BY t.period_year DESC, t.period_month DESC, e.first_name
        LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      params
    );

    const data = rows.map((r) => ({
      ...r,
      status: this.displayStatus({ status: r.status, locked_at: r.locked_at }),
      month_name: MONTH_NAMES[r.month - 1],
      total_hours: Number(r.total_hours),
      expected_hours: Number(r.expected_hours),
      completion_percent: pct(r.total_hours, r.expected_hours),
      is_locked: Boolean(r.locked_at),
    }));

    return {
      data,
      total: Number(countRows[0].total),
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(Number(countRows[0].total) / Number(limit)),
    };
  }

  /**
   * Project- and partner-level roll-up for a period — the numbers a donor
   * report needs. Only approved and locked timesheets count towards it.
   */
  async getProjectSummary({ year, month = null, departmentId = null, projectId = null, partnerId = null, includeUnapproved = false }) {
    const where = ['t.period_year = ?'];
    const params = [Number(year)];

    if (month)        { where.push('t.period_month = ?');  params.push(Number(month)); }
    if (departmentId) { where.push('e.department_id = ?'); params.push(Number(departmentId)); }
    if (projectId)    { where.push('l.project_id = ?');    params.push(Number(projectId)); }
    if (partnerId)    { where.push('p.donor_id = ?');      params.push(Number(partnerId)); }
    if (!includeUnapproved) where.push("t.status = 'APPROVED'");

    const rows = await query(
      `SELECT p.id AS project_id, p.project_code, p.project_name,
              dn.id AS partner_id, dn.donor_name AS partner_name, dn.donor_code AS partner_code,
              COUNT(DISTINCT t.employee_id) AS staff_count,
              COUNT(DISTINCT t.id) AS timesheet_count,
              COALESCE(SUM(l.total_hours), 0) AS actual_hours,
              COALESCE(AVG(l.loe_percent), 0) AS average_loe_percent
         FROM hr_timesheet_lines l
         JOIN hr_timesheets t   ON l.timesheet_id = t.id
         JOIN hr_employees e    ON t.employee_id = e.id
         LEFT JOIN projects p   ON l.project_id = p.id
         LEFT JOIN donors dn    ON p.donor_id = dn.id
        WHERE ${where.join(' AND ')}
        GROUP BY p.id, p.project_code, p.project_name, dn.id, dn.donor_name, dn.donor_code
        ORDER BY actual_hours DESC`,
      params
    );

    const grandTotal = round2(rows.reduce((s, r) => s + Number(r.actual_hours), 0));
    return rows.map((r) => ({
      ...r,
      actual_hours: round2(r.actual_hours),
      average_loe_percent: round2(r.average_loe_percent),
      actual_percent: pct(r.actual_hours, grandTotal),
      staff_count: Number(r.staff_count),
      timesheet_count: Number(r.timesheet_count),
    }));
  }

  /** Headline counts for the dashboards. */
  async getPeriodStats({ year, month, departmentId = null }) {
    const rows = await this.getPeriodTracker({ year, month, departmentId });
    const counts = {};
    for (const s of Object.values(TIMESHEET_STATUS)) counts[s] = 0;
    let expected = 0;
    let actual = 0;
    for (const r of rows) {
      counts[r.status] = (counts[r.status] || 0) + 1;
      expected = round2(expected + r.expected_hours);
      actual = round2(actual + r.actual_hours);
    }
    return {
      year: Number(year),
      month: Number(month),
      month_name: MONTH_NAMES[month - 1],
      headcount: rows.length,
      status_counts: counts,
      expected_hours: expected,
      actual_hours: actual,
      completion_percent: pct(actual, expected),
    };
  }

  // ==========================================================================
  // VISIBILITY
  // ==========================================================================

  /**
   * May this user see this employee's timesheet data?
   *   ORGANISATION -> anybody
   *   DEPARTMENT   -> their own department
   *   SELF         -> only themselves
   */
  canViewEmployee(employee, user) {
    if (!employee) return false;
    if (hasOrgTimesheetAccess(user)) return true;
    if (hasTeamTimesheetAccess(user)) {
      return Number(employee.department_id) === Number(user.department_id);
    }
    return Number(employee.user_id) === Number(user.id);
  }

  /** The department a user may look at, or null for "no restriction". */
  departmentScope(user, requested = null) {
    if (hasOrgTimesheetAccess(user)) return requested ? Number(requested) : null;
    if (hasTeamTimesheetAccess(user)) return Number(user.department_id);
    return -1; // matches nothing; callers should be narrowing to self instead
  }
}

module.exports = new TimesheetService();
module.exports.MONTH_NAMES = MONTH_NAMES;
