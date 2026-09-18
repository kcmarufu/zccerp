/**
 * Timesheet Controller
 *
 * Visibility throughout follows the ladder in config/roles.js:
 *   ORGANISATION — Super Admin and the HR Office (Admin & HR HOP/Lead)
 *   DEPARTMENT   — a HOP/Lead of any other department
 *   SELF         — everyone else
 *
 * Every endpoint resolves the caller's own employee record before falling back
 * to a wider scope, so a Head of Department opening "My Timesheets" sees their
 * own sheet, not their team's.
 */

const timesheetService = require('../services/timesheet.service');
const timesheetApproval = require('../services/timesheetApproval.service');
const notificationService = require('../services/notification.service');
const { query } = require('../config/database');
const {
  ROLES,
  TIMESHEET_STATUS,
  hasOrgTimesheetAccess,
  hasTeamTimesheetAccess,
  canManageLoe,
  canManageHolidays,
  requiresTimesheet,
} = require('../config/roles');

const MONTH_NAMES = timesheetService.MONTH_NAMES;

const fail = (res, code, error) => res.status(code).json({ success: false, error });

const parseIntOr = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
};

class TimesheetController {

  // ==========================================================================
  // REFERENCE DATA
  // ==========================================================================

  /**
   * Projects the caller may book time against, each with its partner.
   * Straight from the Float Requisition register — nothing is duplicated here.
   */
  async getProjects(req, res) {
    try {
      const rows = await query(
        `SELECT p.id, p.project_code, p.project_name, p.department_id, p.is_active,
                p.start_date, p.end_date,
                d.department_name,
                dn.id AS partner_id, dn.donor_name AS partner_name, dn.donor_code AS partner_code
           FROM projects p
           LEFT JOIN donors dn      ON p.donor_id = dn.id
           LEFT JOIN departments d  ON p.department_id = d.id
          WHERE p.is_active = 1
          ORDER BY p.project_code`
      );
      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('Error fetching timesheet projects:', error);
      fail(res, 500, 'Failed to fetch projects');
    }
  }

  /** Partners (donors) that have at least one live project. */
  async getPartners(req, res) {
    try {
      const rows = await query(
        `SELECT dn.id, dn.donor_code AS partner_code, dn.donor_name AS partner_name,
                COUNT(p.id) AS project_count
           FROM donors dn
           JOIN projects p ON p.donor_id = dn.id AND p.is_active = 1
          WHERE dn.is_active = 1
          GROUP BY dn.id, dn.donor_code, dn.donor_name
          ORDER BY dn.donor_name`
      );
      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('Error fetching timesheet partners:', error);
      fail(res, 500, 'Failed to fetch partners');
    }
  }

  /** Who the caller is, in timesheet terms — drives what the UI offers. */
  async getMyContext(req, res) {
    try {
      const mustFile = requiresTimesheet(req.user);
      let employeeId = null;
      if (mustFile) {
        employeeId = await timesheetService.ensureEmployeeForUser(req.user.id);
      }

      const settings = await timesheetService.getSettings();
      res.json({
        success: true,
        data: {
          employee_id: employeeId,
          requires_timesheet: mustFile,
          access_level: hasOrgTimesheetAccess(req.user) ? 'ORGANISATION'
            : hasTeamTimesheetAccess(req.user) ? 'DEPARTMENT' : 'SELF',
          can_manage_loe: canManageLoe(req.user),
          can_manage_holidays: canManageHolidays(req.user),
          department_id: req.user.department_id,
          department_name: req.user.department_name,
          role: req.user.role,
          settings,
        },
      });
    } catch (error) {
      console.error('Error building timesheet context:', error);
      fail(res, 500, 'Failed to load timesheet context');
    }
  }

  // ==========================================================================
  // SETTINGS AND HOLIDAYS
  // ==========================================================================

  async getSettings(req, res) {
    try {
      res.json({ success: true, data: await timesheetService.getSettings() });
    } catch (error) {
      console.error('Error fetching timesheet settings:', error);
      fail(res, 500, 'Failed to fetch settings');
    }
  }

  async updateSettings(req, res) {
    try {
      if (!hasOrgTimesheetAccess(req.user)) {
        return fail(res, 403, 'Only the HR Office or a Super Admin can change timesheet settings');
      }
      const data = await timesheetService.updateSettings(req.body, req.user.id);
      res.json({ success: true, message: 'Settings updated', data });
    } catch (error) {
      fail(res, 400, error.message || 'Failed to update settings');
    }
  }

  async getHolidays(req, res) {
    try {
      const year = req.query.year ? parseIntOr(req.query.year, null) : null;
      const data = req.query.effective === 'true'
        ? await timesheetService.getHolidaysForYear(year || new Date().getFullYear())
        : await timesheetService.listHolidays(year);
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching holidays:', error);
      fail(res, 500, 'Failed to fetch public holidays');
    }
  }

  async createHoliday(req, res) {
    try {
      if (!canManageHolidays(req.user)) {
        return fail(res, 403, 'Only the HR Office or a Super Admin can manage public holidays');
      }
      const data = await timesheetService.createHoliday(req.body, req.user.id);
      res.status(201).json({ success: true, message: 'Public holiday added', data });
    } catch (error) {
      fail(res, 400, error.message || 'Failed to add public holiday');
    }
  }

  async updateHoliday(req, res) {
    try {
      if (!canManageHolidays(req.user)) {
        return fail(res, 403, 'Only the HR Office or a Super Admin can manage public holidays');
      }
      const data = await timesheetService.updateHoliday(req.params.id, req.body);
      res.json({ success: true, message: 'Public holiday updated', data });
    } catch (error) {
      fail(res, 400, error.message || 'Failed to update public holiday');
    }
  }

  async deleteHoliday(req, res) {
    try {
      if (!canManageHolidays(req.user)) {
        return fail(res, 403, 'Only the HR Office or a Super Admin can manage public holidays');
      }
      await timesheetService.deleteHoliday(req.params.id);
      res.json({ success: true, message: 'Public holiday removed' });
    } catch (error) {
      fail(res, 400, error.message || 'Failed to remove public holiday');
    }
  }

  // ==========================================================================
  // LEVEL OF EFFORT
  // ==========================================================================

  /**
   * The LOE register. The HR Office sees the organisation (and may narrow to a
   * department); a department HOP/Lead sees their own department, read-only.
   */
  async getLoeRegister(req, res) {
    try {
      if (!hasTeamTimesheetAccess(req.user)) {
        return fail(res, 403, 'You do not have access to the allocation register');
      }
      const departmentId = timesheetService.departmentScope(req.user, req.query.departmentId);
      const data = await timesheetService.getLoeRegister({
        year: parseIntOr(req.query.year, new Date().getFullYear()),
        month: req.query.month ? parseIntOr(req.query.month, null) : null,
        departmentId,
        employeeId: req.query.employeeId ? parseIntOr(req.query.employeeId, null) : null,
        projectId: req.query.projectId ? parseIntOr(req.query.projectId, null) : null,
      });
      res.json({ success: true, data, can_edit: canManageLoe(req.user) });
    } catch (error) {
      console.error('Error fetching LOE register:', error);
      fail(res, 500, 'Failed to fetch the allocation register');
    }
  }

  /** One employee's allocations for a year. */
  async getEmployeeLoe(req, res) {
    try {
      const employeeId = parseIntOr(req.params.employeeId, null);
      const employee = await timesheetService.getEmployeeContext(employeeId);
      if (!employee) return fail(res, 404, 'Employee not found');
      if (!timesheetService.canViewEmployee(employee, req.user)) {
        return fail(res, 403, 'You do not have access to this employee');
      }

      const year = parseIntOr(req.query.year, new Date().getFullYear());
      const data = await timesheetService.getEmployeeLoe(employeeId, year);
      res.json({
        success: true,
        data,
        can_edit: canManageLoe(req.user),
        employee: {
          employee_id: employee.id,
          employee_name: employee.employee_name,
          employee_number: employee.employee_number,
          department_name: employee.department_name,
          position_title: employee.position_title || employee.job_title || null,
        },
      });
    } catch (error) {
      console.error('Error fetching employee LOE:', error);
      fail(res, 500, 'Failed to fetch allocations');
    }
  }

  /**
   * Replace an employee's allocations for a year.
   * HR-controlled: the HR Office and Super Admin only.
   */
  async saveEmployeeLoe(req, res) {
    try {
      if (!canManageLoe(req.user)) {
        return fail(res, 403, 'Level of effort is controlled by the HR Office. Ask them to make this change.');
      }
      const employeeId = parseIntOr(req.params.employeeId, null);
      const year = parseIntOr(req.body.year, new Date().getFullYear());
      const data = await timesheetService.saveEmployeeLoe(
        employeeId, year, req.body.allocations || [], req.user.id
      );
      res.json({ success: true, message: 'Allocation saved', data });
    } catch (error) {
      fail(res, 400, error.message || 'Failed to save allocation');
    }
  }

  async copyLoeYear(req, res) {
    try {
      if (!canManageLoe(req.user)) {
        return fail(res, 403, 'Only the HR Office or a Super Admin can roll allocations forward');
      }
      const fromYear = parseIntOr(req.body.from_year, null);
      const toYear = parseIntOr(req.body.to_year, null);
      if (!fromYear || !toYear || fromYear === toYear) {
        return fail(res, 400, 'Give a different source and target year');
      }
      const data = await timesheetService.copyLoeYear(
        fromYear, toYear, req.user.id,
        req.body.departmentId ? parseIntOr(req.body.departmentId, null) : null
      );
      res.json({
        success: true,
        message: `Copied ${data.copied} allocation set(s) from ${fromYear} to ${toYear}`,
        data,
      });
    } catch (error) {
      fail(res, 400, error.message || 'Failed to copy allocations');
    }
  }

  // ==========================================================================
  // MY TIMESHEETS
  // ==========================================================================

  /** January to December for the signed-in user. */
  async getMyYear(req, res) {
    try {
      if (!requiresTimesheet(req.user)) {
        return res.json({
          success: true,
          data: null,
          message: 'The Super Admin does not complete timesheets',
        });
      }
      const employeeId = await timesheetService.ensureEmployeeForUser(req.user.id);
      const year = parseIntOr(req.query.year, new Date().getFullYear());
      const data = await timesheetService.getYearTracker(employeeId, year);
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching my timesheet year:', error);
      fail(res, 500, error.message || 'Failed to load your timesheets');
    }
  }

  /** The same tracker for somebody else — scoped by the access ladder. */
  async getEmployeeYear(req, res) {
    try {
      const employeeId = parseIntOr(req.params.employeeId, null);
      const employee = await timesheetService.getEmployeeContext(employeeId);
      if (!employee) return fail(res, 404, 'Employee not found');
      if (!timesheetService.canViewEmployee(employee, req.user)) {
        return fail(res, 403, 'You do not have access to this employee');
      }
      const year = parseIntOr(req.query.year, new Date().getFullYear());
      res.json({ success: true, data: await timesheetService.getYearTracker(employeeId, year) });
    } catch (error) {
      console.error('Error fetching employee timesheet year:', error);
      fail(res, 500, 'Failed to load timesheets');
    }
  }

  /**
   * Open (creating if needed) the caller's timesheet for a period, and return
   * the whole grid.
   */
  async openMyTimesheet(req, res) {
    try {
      if (!requiresTimesheet(req.user)) {
        return fail(res, 400, 'The Super Admin does not complete timesheets');
      }
      const year = parseIntOr(req.params.year, null);
      const month = parseIntOr(req.params.month, null);
      const employeeId = await timesheetService.ensureEmployeeForUser(req.user.id);

      const sheet = await timesheetService.openTimesheet(employeeId, year, month, req.user.id);
      const grid = await timesheetService.getTimesheetGrid(sheet.id);
      const loe = await timesheetService.getEffectiveLoe(employeeId, year, month);

      res.json({
        success: true,
        data: { ...grid, allocations: loe, can_edit: !grid.is_locked, is_owner: true },
      });
    } catch (error) {
      console.error('Error opening timesheet:', error);
      fail(res, 400, error.message || 'Failed to open timesheet');
    }
  }

  /** Read one timesheet by id. */
  async getTimesheet(req, res) {
    try {
      const grid = await timesheetService.getTimesheetGrid(req.params.id);
      if (!grid) return fail(res, 404, 'Timesheet not found');

      const employee = await timesheetService.getEmployeeContext(grid.employee_id);
      if (!timesheetService.canViewEmployee(employee, req.user)) {
        return fail(res, 403, 'You do not have access to this timesheet');
      }

      const isOwner = Number(employee.user_id) === Number(req.user.id);

      // An approver opening a submitted sheet moves it to Under Review, which
      // is what the employee sees on their tracker.
      let refreshed = grid;
      if (!isOwner && grid.stored_status === TIMESHEET_STATUS.SUBMITTED) {
        let mayApprove = true;
        try {
          await timesheetApproval.assertCanApprove(req.user, {
            userId: employee.user_id,
            role: employee.role,
            departmentId: employee.department_id,
          });
        } catch (_) {
          mayApprove = false;
        }
        if (mayApprove) {
          await timesheetService.markUnderReview(grid.id, req.user);
          refreshed = await timesheetService.getTimesheetGrid(grid.id);
        }
      }

      const [allocations, trail] = await Promise.all([
        timesheetService.getEffectiveLoe(grid.employee_id, grid.period_year, grid.period_month),
        timesheetService.getAuditTrail(grid.id),
      ]);

      let canApprove = false;
      if (!isOwner) {
        try {
          await timesheetApproval.assertCanApprove(req.user, {
            userId: employee.user_id,
            role: employee.role,
            departmentId: employee.department_id,
          });
          canApprove = true;
        } catch (_) { canApprove = false; }
      }

      res.json({
        success: true,
        data: {
          ...refreshed,
          allocations,
          audit_trail: trail,
          is_owner: isOwner,
          can_edit: isOwner && !refreshed.is_locked,
          can_approve: canApprove,
          can_reopen: hasOrgTimesheetAccess(req.user) && refreshed.is_locked,
        },
      });
    } catch (error) {
      console.error('Error fetching timesheet:', error);
      fail(res, 500, 'Failed to fetch timesheet');
    }
  }

  /** Save the grid. Owner only, and only while editable. */
  async saveTimesheet(req, res) {
    try {
      const sheet = await timesheetService.getTimesheetRow(req.params.id);
      if (!sheet) return fail(res, 404, 'Timesheet not found');

      const employee = await timesheetService.getEmployeeContext(sheet.employee_id);
      if (Number(employee.user_id) !== Number(req.user.id)) {
        return fail(res, 403, 'Only the employee can fill in their own timesheet');
      }

      const data = await timesheetService.saveTimesheetGrid(req.params.id, req.body, req.user);
      res.json({ success: true, message: 'Timesheet saved', data });
    } catch (error) {
      fail(res, 400, error.message || 'Failed to save timesheet');
    }
  }

  /** Submit for approval. */
  async submitTimesheet(req, res) {
    try {
      const sheet = await timesheetService.getTimesheetRow(req.params.id);
      if (!sheet) return fail(res, 404, 'Timesheet not found');

      const employee = await timesheetService.getEmployeeContext(sheet.employee_id);
      if (Number(employee.user_id) !== Number(req.user.id)) {
        return fail(res, 403, 'Only the employee can submit their own timesheet');
      }

      const result = await timesheetService.submitTimesheet(req.params.id, req.user);
      await this.notifyApprovers(result, employee, req.user);

      res.json({ success: true, message: 'Timesheet submitted for approval', data: result });
    } catch (error) {
      fail(res, 400, error.message || 'Failed to submit timesheet');
    }
  }

  /** Approve, reject or return. */
  async actOnTimesheet(req, res) {
    try {
      const { action, comments } = req.body;
      const result = await timesheetService.actOnTimesheet(
        req.params.id, req.user, action, comments
      );

      const verb = String(action).toUpperCase();
      await this.notifyOwner(result, req.user, verb, comments);

      res.json({
        success: true,
        message: verb === 'APPROVE' ? 'Timesheet approved and locked'
          : verb === 'REJECT' ? 'Timesheet rejected' : 'Timesheet returned for amendment',
        data: result,
      });
    } catch (error) {
      fail(res, 400, error.message || 'Failed to process timesheet');
    }
  }

  async reopenTimesheet(req, res) {
    try {
      const data = await timesheetService.reopenTimesheet(
        req.params.id, req.user, req.body.reason
      );
      res.json({ success: true, message: 'Timesheet reopened for amendment', data });
    } catch (error) {
      fail(res, 400, error.message || 'Failed to reopen timesheet');
    }
  }

  async getAuditTrail(req, res) {
    try {
      const sheet = await timesheetService.getTimesheetRow(req.params.id);
      if (!sheet) return fail(res, 404, 'Timesheet not found');
      const employee = await timesheetService.getEmployeeContext(sheet.employee_id);
      if (!timesheetService.canViewEmployee(employee, req.user)) {
        return fail(res, 403, 'You do not have access to this timesheet');
      }
      res.json({ success: true, data: await timesheetService.getAuditTrail(req.params.id) });
    } catch (error) {
      console.error('Error fetching timesheet trail:', error);
      fail(res, 500, 'Failed to fetch the approval trail');
    }
  }

  // ==========================================================================
  // TEAM AND ORGANISATION TRACKERS
  // ==========================================================================

  /**
   * One month across a department (Team) or the whole organisation.
   * A department HOP/Lead is pinned to their own department by the service.
   */
  async getPeriodTracker(req, res) {
    try {
      if (!hasTeamTimesheetAccess(req.user)) {
        return fail(res, 403, 'You do not have access to other people\'s timesheets');
      }
      const now = new Date();
      const data = await timesheetService.getPeriodTracker({
        year: parseIntOr(req.query.year, now.getFullYear()),
        month: parseIntOr(req.query.month, now.getMonth() + 1),
        departmentId: timesheetService.departmentScope(req.user, req.query.departmentId),
        status: req.query.status || null,
        employeeId: req.query.employeeId ? parseIntOr(req.query.employeeId, null) : null,
        projectId: req.query.projectId ? parseIntOr(req.query.projectId, null) : null,
      });
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching period tracker:', error);
      fail(res, 500, 'Failed to load the tracker');
    }
  }

  async getPeriodStats(req, res) {
    try {
      if (!hasTeamTimesheetAccess(req.user)) {
        return fail(res, 403, 'You do not have access to these statistics');
      }
      const now = new Date();
      const data = await timesheetService.getPeriodStats({
        year: parseIntOr(req.query.year, now.getFullYear()),
        month: parseIntOr(req.query.month, now.getMonth() + 1),
        departmentId: timesheetService.departmentScope(req.user, req.query.departmentId),
      });
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching timesheet stats:', error);
      fail(res, 500, 'Failed to load statistics');
    }
  }

  async getApprovalQueue(req, res) {
    try {
      const scope = req.query.scope === 'department' ? 'department' : 'all';
      const data = await timesheetService.getApprovalQueue(req.user, scope);
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching approval queue:', error);
      fail(res, 500, 'Failed to load the approval queue');
    }
  }

  /** Filtered list, for reports. */
  async listTimesheets(req, res) {
    try {
      const filters = {
        year: req.query.year ? parseIntOr(req.query.year, null) : null,
        month: req.query.month ? parseIntOr(req.query.month, null) : null,
        status: req.query.status || null,
        projectId: req.query.projectId ? parseIntOr(req.query.projectId, null) : null,
        partnerId: req.query.partnerId ? parseIntOr(req.query.partnerId, null) : null,
        employeeId: req.query.employeeId ? parseIntOr(req.query.employeeId, null) : null,
        page: parseIntOr(req.query.page, 1),
        limit: Math.min(parseIntOr(req.query.limit, 50), 500),
      };

      if (hasOrgTimesheetAccess(req.user)) {
        filters.departmentId = req.query.departmentId ? parseIntOr(req.query.departmentId, null) : null;
      } else if (hasTeamTimesheetAccess(req.user)) {
        filters.departmentId = req.user.department_id;
      } else {
        // Ordinary staff see only their own, whatever else they ask for.
        filters.departmentId = null;
        filters.employeeId = await timesheetService.getEmployeeIdForUser(req.user.id);
        if (!filters.employeeId) {
          return res.json({
            success: true,
            data: [],
            pagination: { total: 0, page: 1, limit: filters.limit, totalPages: 0 },
          });
        }
      }

      const result = await timesheetService.listTimesheets(filters);
      res.json({
        success: true,
        data: result.data,
        pagination: {
          total: result.total, page: result.page,
          limit: result.limit, totalPages: result.totalPages,
        },
      });
    } catch (error) {
      console.error('Error listing timesheets:', error);
      fail(res, 500, 'Failed to list timesheets');
    }
  }

  /** Project and partner roll-up. */
  async getProjectSummary(req, res) {
    try {
      if (!hasTeamTimesheetAccess(req.user)) {
        return fail(res, 403, 'You do not have access to this report');
      }
      const data = await timesheetService.getProjectSummary({
        year: parseIntOr(req.query.year, new Date().getFullYear()),
        month: req.query.month ? parseIntOr(req.query.month, null) : null,
        departmentId: timesheetService.departmentScope(req.user, req.query.departmentId),
        projectId: req.query.projectId ? parseIntOr(req.query.projectId, null) : null,
        partnerId: req.query.partnerId ? parseIntOr(req.query.partnerId, null) : null,
        includeUnapproved: req.query.includeUnapproved === 'true',
      });
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error building project summary:', error);
      fail(res, 500, 'Failed to build the project summary');
    }
  }

  /** Staff list for the filter dropdowns, scoped to what the caller may see. */
  async getEmployees(req, res) {
    try {
      if (!hasTeamTimesheetAccess(req.user)) {
        return fail(res, 403, 'You do not have access to the staff list');
      }
      const departmentId = timesheetService.departmentScope(req.user, req.query.departmentId);
      res.json({ success: true, data: await timesheetService.getTimesheetPopulation(departmentId) });
    } catch (error) {
      console.error('Error fetching timesheet employees:', error);
      fail(res, 500, 'Failed to fetch the staff list');
    }
  }

  // ==========================================================================
  // NOTIFICATIONS
  // ==========================================================================

  /** Tell whoever now has to act that a timesheet is waiting. */
  async notifyApprovers(result, employee, submitter) {
    try {
      const target = result.approver;
      if (!target) return;

      const params = [target.approverRole];
      let sql = `SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id
                  WHERE r.role_name = ? AND u.is_active = 1`;
      if (target.approverDepartmentId) {
        sql += ' AND u.department_id = ?';
        params.push(target.approverDepartmentId);
      }
      sql += ' AND u.id <> ?';
      params.push(submitter.id);

      const recipients = await query(sql, params);
      const period = `${MONTH_NAMES[result.period_month - 1]} ${result.period_year}`;
      for (const r of recipients) {
        await notificationService._create(
          r.id,
          `Timesheet awaiting approval: ${employee.employee_name}`,
          `${employee.employee_name} submitted their ${period} timesheet for your approval.`,
          'approval_pending',
          'timesheet',
          result.id,
          '/timesheets/approvals'
        );
      }
    } catch (err) {
      console.error('[Timesheet] Failed to notify approvers:', err.message);
    }
  }

  /** Tell the employee what happened to their timesheet. */
  async notifyOwner(result, actor, verb, comments) {
    try {
      const employee = result.employee;
      if (!employee || !employee.user_id) return;

      const period = `${MONTH_NAMES[result.period_month - 1]} ${result.period_year}`;
      const actorName = `${actor.first_name} ${actor.last_name}`.trim();

      const copy = verb === 'APPROVE'
        ? {
          title: `Timesheet approved: ${period}`,
          message: `${actorName} approved your ${period} timesheet. It is now locked.`,
          type: 'success',
        }
        : verb === 'REJECT'
          ? {
            title: `Timesheet rejected: ${period}`,
            message: `${actorName} rejected your ${period} timesheet. Reason: ${comments}`,
            type: 'error',
          }
          : {
            title: `Timesheet returned: ${period}`,
            message: `${actorName} returned your ${period} timesheet for amendment. Reason: ${comments}`,
            type: 'error',
          };

      await notificationService._create(
        employee.user_id, copy.title, copy.message, copy.type,
        'timesheet', result.id, `/timesheets/${result.id}`
      );
    } catch (err) {
      console.error('[Timesheet] Failed to notify owner:', err.message);
    }
  }
}

module.exports = new TimesheetController();
