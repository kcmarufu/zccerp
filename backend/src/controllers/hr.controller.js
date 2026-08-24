/**
 * HR Controller
 * Handles HTTP requests for Human Resources module
 */

const hrService = require('../services/hr.service');
const { query } = require('../config/database');
const {
  ROLES, isAdminHrManager,
  hasFullHrAccess, hasDepartmentHrAccess, hasHrOversight, hrDepartmentScope,
} = require('../config/roles');
const fs = require('fs');
const { resolveStoredPath } = require('../config/uploads');

/**
 * Content types safe to render inline. SVG is deliberately excluded because it
 * can carry <script>; everything else falls back to a download.
 */
const INLINE_VIEWABLE_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/jpg', 'image/png',
  'image/gif', 'image/webp', 'image/bmp', 'image/tiff', 'text/plain',
]);

/**
 * May this user credit or debit leave balances by hand?
 * HR Office anywhere; a department HOP/Lead only within their own department
 * (enforced separately, since it needs the target employee).
 */
const canAdjustLeave = (user) => hasHrOversight(user);

const isDeptScopedRole = (role) => [ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS].includes(role);

const canAccessEmployeeRecord = (employee, user) => {
  if (!employee) return false;
  // HR Office sees every employee record.
  if (hasFullHrAccess(user)) return true;
  // A department HOP/Lead sees only their own department.
  if (hasDepartmentHrAccess(user)) {
    return Number(employee.department_id) === Number(user.department_id);
  }
  // Everyone else — including Finance Clerks — sees only their own record.
  return Number(employee.user_id) === Number(user.id);
};

/**
 * Visibility rule for a single leave request:
 *   ADMIN / Admin-HR managers -> everything
 *   HEAD_OF_PROGRAMS          -> their own department
 *   everyone else             -> only their own request
 */
const canViewLeaveRecord = (request, user) => {
  if (!request) return false;
  if (hasFullHrAccess(user)) return true;
  if (hasDepartmentHrAccess(user)) {
    return Number(request.department_id) === Number(user.department_id);
  }
  return Number(request.employee_user_id) === Number(user.id);
};

class HRController {

  async getEmployeeIdForUser(userId) {
    const rows = await query('SELECT id FROM hr_employees WHERE user_id = ? LIMIT 1', [userId]);
    return rows.length > 0 ? rows[0].id : null;
  }

  async getDepartmentEmployeeIds(departmentId) {
    const rows = await query('SELECT id FROM hr_employees WHERE department_id = ?', [departmentId]);
    return rows.map((r) => r.id);
  }

  // ========================================================================
  // EMPLOYEES
  // ========================================================================

  async getEmployees(req, res) {
    try {
      // The directory is "everyone in the system", so mirror any newly created
      // user accounts into hr_employees before listing. Cheap and idempotent.
      try {
        await hrService.syncEmployeesFromUsers();
      } catch (syncErr) {
        // A sync failure must not blank the directory — log and show what exists.
        console.error('Employee sync skipped:', syncErr.message);
      }

      const filters = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 25,
        search: req.query.search,
        departmentId: req.query.departmentId,
        status: req.query.status,
        employmentType: req.query.employmentType
      };

      // HR Office sees everyone (optionally filtered); a department HOP/Lead is
      // pinned to their own department; everyone else sees only themselves.
      if (hasFullHrAccess(req.user)) {
        // honour any explicit departmentId filter
      } else if (hasDepartmentHrAccess(req.user)) {
        filters.departmentId = req.user.department_id;
      } else {
        filters.userId = req.user.id;
      }

      const result = await hrService.getEmployees(filters);
      res.json({ success: true, data: result.data, pagination: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages } });
    } catch (error) {
      console.error('Error fetching employees:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch employees' });
    }
  }

  async getEmployeeById(req, res) {
    try {
      const employee = await hrService.getEmployeeById(req.params.id);
      if (!employee) return res.status(404).json({ success: false, error: 'Employee not found' });

      if (!canAccessEmployeeRecord(employee, req.user)) {
        return res.status(403).json({ success: false, error: 'You do not have access to this employee record' });
      }

      res.json({ success: true, data: employee });
    } catch (error) {
      console.error('Error fetching employee:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch employee' });
    }
  }

  async createEmployee(req, res) {
    try {
      const result = await hrService.createEmployee(req.body, req.user.id);
      res.status(201).json({ success: true, message: 'Employee created successfully', data: result });
    } catch (error) {
      console.error('Error creating employee:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to create employee' });
    }
  }

  async updateEmployee(req, res) {
    try {
      const employee = await hrService.getEmployeeById(req.params.id);
      if (!employee) return res.status(404).json({ success: false, error: 'Employee not found' });
      if (!canAccessEmployeeRecord(employee, req.user) || !hasHrOversight(req.user)) {
        return res.status(403).json({ success: false, error: 'You do not have access to this employee record' });
      }

      const result = await hrService.updateEmployee(
        req.params.id, req.body, { id: req.user.id, role: req.user.role }
      );
      res.json({ success: true, message: 'Employee updated successfully', data: result });
    } catch (error) {
      console.error('Error updating employee:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to update employee' });
    }
  }

  // ========================================================================
  // CONTRACTS
  // ========================================================================

  async getContracts(req, res) {
    try {
      const employee = await hrService.getEmployeeById(req.params.employeeId);
      if (!employee) return res.status(404).json({ success: false, error: 'Employee not found' });
      if (!canAccessEmployeeRecord(employee, req.user)) {
        return res.status(403).json({ success: false, error: 'You do not have access to this employee contracts' });
      }

      const contracts = await hrService.getContracts(req.params.employeeId);
      res.json({ success: true, data: contracts });
    } catch (error) {
      console.error('Error fetching contracts:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch contracts' });
    }
  }

  async createContract(req, res) {
    try {
      const result = await hrService.createContract(req.body, req.user.id);
      res.status(201).json({ success: true, message: 'Contract created successfully', data: result });
    } catch (error) {
      console.error('Error creating contract:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to create contract' });
    }
  }

  async renewContract(req, res) {
    try {
      const result = await hrService.renewContract(req.params.contractId, req.body, req.user.id);
      res.json({ success: true, message: 'Contract renewed successfully', data: result });
    } catch (error) {
      console.error('Error renewing contract:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to renew contract' });
    }
  }

  // ========================================================================
  // LEAVE MANAGEMENT
  // ========================================================================

  async getLeaveTypes(req, res) {
    try {
      const types = await hrService.getLeaveTypes();
      res.json({ success: true, data: types });
    } catch (error) {
      console.error('Error fetching leave types:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch leave types' });
    }
  }

  async updateLeaveType(req, res) {
    try {
      const updated = await hrService.updateLeaveType(req.params.id, req.body);
      res.json({ success: true, message: 'Leave type updated', data: updated });
    } catch (error) {
      console.error('Error updating leave type:', error);
      res.status(400).json({ success: false, error: error.message || 'Failed to update leave type' });
    }
  }

  async getLeaveRequests(req, res) {
    try {
      const filters = {
        page:         parseInt(req.query.page)  || 1,
        limit:        parseInt(req.query.limit) || 25,
        employeeId:   req.query.employeeId ? Number(req.query.employeeId) : undefined,
        departmentId: req.query.departmentId ? Number(req.query.departmentId) : undefined,
        status:       req.query.status || undefined,
        year:         req.query.year ? parseInt(req.query.year) : null,
        leaveTypeId:  req.query.leaveTypeId ? Number(req.query.leaveTypeId) : undefined,
        search:       req.query.search || undefined,
        startFrom:    req.query.startFrom || undefined,
        startTo:      req.query.startTo || undefined,
      };

      const scope = String(req.query.scope || '').toLowerCase();

      if (scope === 'mine') {
        // Always restrict to the caller's employee record.
        const employeeId = await this.getEmployeeIdForUser(req.user.id);
        if (!employeeId) {
          return res.json({ success: true, data: [], pagination: { total: 0, page: filters.page, limit: filters.limit, totalPages: 0 } });
        }
        filters.employeeId = employeeId;
      } else if (scope === 'pending-mine' || scope === 'pending-all') {
        // Only requests this user is the designated approver for.
        if (!hasHrOversight(req.user)) {
          return res.status(403).json({ success: false, error: 'Not authorised to view pending approvals' });
        }
        // 'pending-all' widens the queue to every department, which only the
        // HR Office may do; a department head silently stays on their own.
        filters.pendingScope =
          (scope === 'pending-all' && hasFullHrAccess(req.user)) ? 'all' : 'department';
        filters.pendingForApprover = {
          id: req.user.id,
          role: req.user.role,
          department_id: req.user.department_id,
          department_code: req.user.department_code,
        };
      } else {
        // Default visibility model:
        //   HR Office (Admin, or Admin & HR HOP/Lead) → everything
        //   Department HOP/Lead                        → their department
        //   everyone else, incl. Finance Clerks        → their own requests
        if (hasFullHrAccess(req.user)) {
          // unrestricted; honour explicit filters
        } else if (hasDepartmentHrAccess(req.user)) {
          filters.departmentId = req.user.department_id;
        } else {
          const employeeId = await this.getEmployeeIdForUser(req.user.id);
          if (!employeeId) {
            return res.json({ success: true, data: [], pagination: { total: 0, page: filters.page, limit: filters.limit, totalPages: 0 } });
          }
          filters.employeeId = employeeId;
        }
      }

      const result = await hrService.getLeaveRequests(filters);
      res.json({
        success: true,
        data: result.data,
        pagination: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages },
      });
    } catch (error) {
      console.error('Error fetching leave requests:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch leave requests' });
    }
  }

  async createLeaveRequest(req, res) {
    try {
      // Only ADMIN may submit on someone else's behalf.
      const body = { ...req.body };

      // Multipart submissions carry supporting documents. Stage them so the
      // service can enforce "Study Leave requires a document" and write the
      // attachment rows inside the same transaction as the request itself.
      if (Array.isArray(req.files) && req.files.length > 0) {
        body.attachments = req.files.map((f) => ({
          file_name: f.originalname,
          file_path: f.path,
          file_size: f.size,
          mime_type: f.mimetype,
        }));
      }

      // FormData sends everything as strings; coerce the numeric field.
      if (body.leave_type_id) body.leave_type_id = Number(body.leave_type_id);
      if (body.employee_id)   body.employee_id   = Number(body.employee_id);
      if (body.employee_id && req.user.role !== ROLES.ADMIN) {
        const myEmployeeId = await this.getEmployeeIdForUser(req.user.id);
        if (Number(body.employee_id) !== Number(myEmployeeId)) {
          return res.status(403).json({ success: false, error: 'You may only submit leave for yourself' });
        }
      }

      const result = await hrService.createLeaveRequest(body, req.user.id);
      res.status(201).json({ success: true, message: 'Leave request submitted', data: result });
    } catch (error) {
      console.error('Error creating leave request:', error);
      res.status(400).json({ success: false, error: error.message || 'Failed to create leave request' });
    }
  }

  /**
   * Edit a pending request, or resubmit a rejected one. Same endpoint: the
   * service decides which it is from the current status.
   */
  async updateLeaveRequest(req, res) {
    try {
      const body = { ...req.body };

      if (Array.isArray(req.files) && req.files.length > 0) {
        body.attachments = req.files.map((f) => ({
          file_name: f.originalname,
          file_path: f.path,
          file_size: f.size,
          mime_type: f.mimetype,
        }));
      }
      if (body.leave_type_id) body.leave_type_id = Number(body.leave_type_id);

      const result = await hrService.updateLeaveRequest(req.params.leaveId, body, {
        id: req.user.id,
        role: req.user.role,
        isHrOffice: hasFullHrAccess(req.user),
      });

      res.json({
        success: true,
        message: result.resubmitted
          ? 'Leave request resubmitted for approval'
          : 'Leave request updated and sent for approval',
        data: result,
      });
    } catch (error) {
      console.error('Error updating leave request:', error);
      res.status(400).json({ success: false, error: error.message || 'Failed to update leave request' });
    }
  }

  async approveLeaveRequest(req, res) {
    try {
      const { comments, approved } = req.body || {};
      const result = await hrService.approveLeaveRequest(
        req.params.leaveId,
        { id: req.user.id, role: req.user.role, department_id: req.user.department_id },
        { approved: approved !== false, comments: comments || null }
      );
      res.json({
        success: true,
        message: `Leave request ${result.status.toLowerCase()} successfully`,
        data: result,
      });
    } catch (error) {
      console.error('Error approving leave request:', error);
      res.status(400).json({ success: false, error: error.message || 'Failed to process leave request' });
    }
  }

  async runLeaveAccrual(req, res) {
    try {
      const result = await hrService.runMonthlyAccrual({ triggeredByUserId: req.user.id });
      res.json({ success: true, message: 'Monthly accrual processed', data: result });
    } catch (error) {
      console.error('Error running leave accrual:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to run accrual' });
    }
  }

  async getLeaveBalances(req, res) {
    try {
      const employee = await hrService.getEmployeeById(req.params.employeeId);
      if (!employee) return res.status(404).json({ success: false, error: 'Employee not found' });
      if (!canAccessEmployeeRecord(employee, req.user)) {
        return res.status(403).json({ success: false, error: 'You do not have access to this employee leave balance' });
      }

      const balances = await hrService.getLeaveBalances(req.params.employeeId, req.query.year);
      res.json({ success: true, data: balances });
    } catch (error) {
      console.error('Error fetching leave balances:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch leave balances' });
    }
  }

  /**
   * Single leave request. Used by the approver's detail drawer, which needs the
   * deductibility flag and the balance either side of the decision.
   */
  async getLeaveRequestById(req, res) {
    try {
      const request = await hrService.getLeaveRequestById(req.params.leaveId);
      if (!request) {
        return res.status(404).json({ success: false, error: 'Leave request not found' });
      }
      if (!canViewLeaveRecord(request, req.user)) {
        return res.status(403).json({ success: false, error: 'You do not have access to this leave request' });
      }
      res.json({ success: true, data: request });
    } catch (error) {
      console.error('Error fetching leave request:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch leave request' });
    }
  }

  /**
   * Immutable trail for one leave request.
   */
  async getLeaveAuditTrail(req, res) {
    try {
      const request = await hrService.getLeaveRequestById(req.params.leaveId);
      if (!request) {
        return res.status(404).json({ success: false, error: 'Leave request not found' });
      }
      if (!canViewLeaveRecord(request, req.user)) {
        return res.status(403).json({ success: false, error: 'You do not have access to this leave request' });
      }
      const trail = await hrService.getLeaveAuditTrail(req.params.leaveId);
      res.json({ success: true, data: trail });
    } catch (error) {
      console.error('Error fetching leave audit trail:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch leave audit trail' });
    }
  }

  /**
   * Leave analytics.
   *   ADMIN / Admin-HR managers -> whole organisation, may filter by department
   *   HEAD_OF_PROGRAMS          -> locked to their own department
   *   anyone else               -> 403
   */
  async getLeaveAnalytics(req, res) {
    try {
      if (!hasHrOversight(req.user)) {
        return res.status(403).json({
          success: false,
          error: 'Leave analytics are available to HR and department heads only',
        });
      }

      const departmentId = hrDepartmentScope(req.user, req.query.departmentId);

      const data = await hrService.getLeaveAnalytics({
        year: req.query.year ? Number(req.query.year) : undefined,
        departmentId,
        highBalanceThreshold: req.query.threshold ? Number(req.query.threshold) : 30,
      });

      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching leave analytics:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch leave analytics' });
    }
  }

  /**
   * How this person's leave built up over the year: accruals, manual
   * adjustments and approved deductions, with a running balance.
   *
   * Staff may read their own; anyone with oversight may read those they can
   * already see.
   */
  async getEmployeeAccrualHistory(req, res) {
    try {
      const employee = await hrService.getEmployeeById(req.params.employeeId);
      if (!employee) return res.status(404).json({ success: false, error: 'Employee not found' });
      if (!canAccessEmployeeRecord(employee, req.user)) {
        return res.status(403).json({ success: false, error: 'You do not have access to this record' });
      }

      const data = await hrService.getEmployeeAccrualHistory(req.params.employeeId, {
        year: req.query.year ? Number(req.query.year) : undefined,
      });
      res.json({ success: true, data: { ...data, employee } });
    } catch (error) {
      console.error('Error fetching accrual history:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch accrual history' });
    }
  }

  /** The caller's own accrual history, without needing their employee id. */
  async getMyAccrualHistory(req, res) {
    try {
      const employeeId = await this.getEmployeeIdForUser(req.user.id);
      if (!employeeId) {
        return res.json({
          success: true,
          data: { fiscal_year: new Date().getFullYear(), totals: { accrued: 0, adjusted: 0, taken: 0, net: 0 }, accruals: [], adjustments: [], events: [] },
        });
      }
      const data = await hrService.getEmployeeAccrualHistory(employeeId, {
        year: req.query.year ? Number(req.query.year) : undefined,
      });
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching own accrual history:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch accrual history' });
    }
  }

  // ========================================================================
  // LEAVE ATTACHMENTS
  // ========================================================================

  async getLeaveAttachments(req, res) {
    try {
      const request = await hrService.getLeaveRequestById(req.params.leaveId);
      if (!request) return res.status(404).json({ success: false, error: 'Leave request not found' });
      if (!canViewLeaveRecord(request, req.user)) {
        return res.status(403).json({ success: false, error: 'You do not have access to this leave request' });
      }
      const data = await hrService.getLeaveAttachments(req.params.leaveId);
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching leave attachments:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch attachments' });
    }
  }

  /** Attach a document to an existing request. */
  async uploadLeaveAttachment(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file was uploaded' });
      }
      const request = await hrService.getLeaveRequestById(req.params.leaveId);
      if (!request) return res.status(404).json({ success: false, error: 'Leave request not found' });

      // The owner may add documents while it is still pending; HR/Admin any time.
      const isOwner = Number(request.employee_user_id) === Number(req.user.id);
      const isOversight = req.user.role === ROLES.ADMIN || isAdminHrManager(req.user)
        || (req.user.role === ROLES.HEAD_OF_PROGRAMS
            && Number(request.department_id) === Number(req.user.department_id));
      if (!isOwner && !isOversight) {
        return res.status(403).json({ success: false, error: 'You cannot attach documents to this request' });
      }
      if (isOwner && !isOversight && request.status !== 'PENDING') {
        return res.status(400).json({ success: false, error: 'This request has already been decided' });
      }

      const result = await hrService.addLeaveAttachment(
        req.params.leaveId, req.file, req.user.id, req.body.description || null
      );
      res.status(201).json({ success: true, message: 'Document attached', data: result });
    } catch (error) {
      console.error('Error uploading leave attachment:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to attach document' });
    }
  }

  /**
   * Stream one attachment. `?inline=true` renders it in the browser tab where
   * the type allows; anything else downloads.
   */
  async downloadLeaveAttachment(req, res) {
    try {
      const att = await hrService.getLeaveAttachmentById(req.params.attachmentId);
      if (!att) return res.status(404).json({ success: false, error: 'Attachment not found' });

      const request = await hrService.getLeaveRequestById(att.leave_request_id);
      if (!canViewLeaveRecord(request, req.user)) {
        return res.status(403).json({ success: false, error: 'You do not have access to this document' });
      }

      // Re-anchor historical paths onto the current upload root before failing.
      const filePath = resolveStoredPath(att.file_path);
      if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'The stored file could not be found on disk' });
      }

      const mime = String(att.mime_type || '').toLowerCase();
      const wantsInline = String(req.query.inline || '') === 'true';
      const inline = wantsInline && INLINE_VIEWABLE_TYPES.has(mime);
      const safeName = String(att.file_name || 'document').replace(/[\r\n"\\]/g, '_');

      res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`);
      res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy',
        "default-src 'none'; img-src 'self' data:; object-src 'none'; script-src 'none'; style-src 'unsafe-inline'; sandbox");

      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      console.error('Error downloading leave attachment:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Failed to download document' });
      }
    }
  }

  async deleteLeaveAttachment(req, res) {
    try {
      const att = await hrService.getLeaveAttachmentById(req.params.attachmentId);
      if (!att) return res.status(404).json({ success: false, error: 'Attachment not found' });

      const request = await hrService.getLeaveRequestById(att.leave_request_id);
      const isOwner = Number(request.employee_user_id) === Number(req.user.id);
      const isOversight = req.user.role === ROLES.ADMIN || isAdminHrManager(req.user);
      if (!isOwner && !isOversight) {
        return res.status(403).json({ success: false, error: 'You cannot remove this document' });
      }
      if (isOwner && !isOversight && request.status !== 'PENDING') {
        return res.status(400).json({ success: false, error: 'This request has already been decided' });
      }

      await hrService.deleteLeaveAttachment(req.params.attachmentId);
      res.json({ success: true, message: 'Document removed' });
    } catch (error) {
      console.error('Error deleting leave attachment:', error);
      res.status(500).json({ success: false, error: 'Failed to remove document' });
    }
  }

  /**
   * Stream an employee document (certificate, contract, ID scan).
   * `?inline=true` renders it in the tab where the type allows.
   */
  async downloadEmployeeDocument(req, res) {
    try {
      const doc = await hrService.getDocumentById(req.params.documentId);
      if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });

      // Same visibility rule as the employee record itself.
      const employee = {
        user_id: doc.employee_user_id,
        department_id: doc.department_id,
      };
      if (!canAccessEmployeeRecord(employee, req.user)) {
        return res.status(403).json({ success: false, error: 'You do not have access to this document' });
      }

      const filePath = resolveStoredPath(doc.file_url);
      if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'The stored file could not be found on disk' });
      }

      // hr_documents has no mime column; infer from the extension.
      const ext = String(filePath).split('.').pop().toLowerCase();
      const MIME = {
        pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', webp: 'image/webp', txt: 'text/plain',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        csv: 'text/csv',
      };
      const mime = MIME[ext] || 'application/octet-stream';
      const inline = String(req.query.inline || '') === 'true' && INLINE_VIEWABLE_TYPES.has(mime);
      // Strip CR/LF/quote/backslash so the filename cannot break the header.
      const safeName = String(doc.document_name || 'document').replace(/[\r\n\"\\]/g, '_');

      res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`);
      res.setHeader('Content-Type', mime);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy',
        "default-src 'none'; img-src 'self' data:; object-src 'none'; script-src 'none'; style-src 'unsafe-inline'; sandbox");

      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      console.error('Error downloading employee document:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Failed to download document' });
      }
    }
  }

  // ========================================================================
  // EXIT CLEARANCE ATTACHMENTS
  // ------------------------------------------------------------------------
  // Stored in hr_documents against the employee, typed EXIT_CLEARANCE, so they
  // reuse the employee-document store and its download handler.
  // ========================================================================

  async getExitAttachments(req, res) {
    try {
      const rows = await query(
        `SELECT c.employee_id FROM hr_exit_clearance c WHERE c.id = ?`,
        [req.params.id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Exit clearance not found' });
      }
      const docs = await hrService.getDocuments(rows[0].employee_id);
      res.json({
        success: true,
        data: docs.filter((d) => d.document_type === 'EXIT_CLEARANCE'),
      });
    } catch (error) {
      console.error('Error fetching exit clearance attachments:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch attachments' });
    }
  }

  async uploadExitAttachment(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file was uploaded' });
      }
      if (!hasHrOversight(req.user)) {
        return res.status(403).json({ success: false, error: 'Not authorised to attach exit documents' });
      }

      const rows = await query(
        `SELECT c.employee_id, e.department_id
         FROM hr_exit_clearance c
         JOIN hr_employees e ON c.employee_id = e.id
         WHERE c.id = ?`,
        [req.params.id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Exit clearance not found' });
      }
      if (!hasFullHrAccess(req.user)
          && Number(rows[0].department_id) !== Number(req.user.department_id)) {
        return res.status(403).json({ success: false, error: 'This employee is outside your department' });
      }

      const result = await hrService.createDocument({
        employee_id:   rows[0].employee_id,
        document_type: 'EXIT_CLEARANCE',
        document_name: req.body.document_name || req.file.originalname,
        file_url:      req.file.path,
        file_size:     req.file.size,
        description:   req.body.description || null,
      }, req.user.id);

      res.status(201).json({ success: true, message: 'Document attached', data: result });
    } catch (error) {
      console.error('Error uploading exit clearance attachment:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to attach document' });
    }
  }

  /**
   * Turn monthly accrual on or off for one employee, and set their rate.
   *
   * Not everyone earns 2.5 days a month: level-of-effort and part-time staff
   * earn less, and some accounts should not accrue at all. Leaving the rate
   * blank falls back to the leave type's standard rate.
   *
   * HR Office and Super Admin only — a department head cannot change what
   * their own staff earn.
   */
  async updateAccrualSettings(req, res) {
    try {
      if (!hasFullHrAccess(req.user)) {
        return res.status(403).json({
          success: false,
          error: 'Only the HR Office and Super Admin may change accrual settings',
        });
      }

      const employee = await hrService.getEmployeeById(req.params.employeeId);
      if (!employee) return res.status(404).json({ success: false, error: 'Employee not found' });

      const { accrual_enabled, monthly_accrual_days, accrual_note } = req.body || {};

      const patch = {};
      if (accrual_enabled !== undefined) {
        patch.accrual_enabled = (accrual_enabled === true || accrual_enabled === 'true' || accrual_enabled === 1) ? 1 : 0;
      }
      if (monthly_accrual_days !== undefined) {
        if (monthly_accrual_days === null || monthly_accrual_days === '') {
          patch.monthly_accrual_days = null;   // fall back to the type default
        } else {
          const rate = Number(monthly_accrual_days);
          if (!Number.isFinite(rate) || rate < 0 || rate > 31) {
            return res.status(400).json({
              success: false,
              error: 'Monthly accrual must be between 0 and 31 days',
            });
          }
          patch.monthly_accrual_days = rate;
        }
      }
      if (accrual_note !== undefined) patch.accrual_note = accrual_note || null;

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ success: false, error: 'Nothing to update' });
      }

      const result = await hrService.updateEmployee(
        req.params.employeeId, patch, { id: req.user.id, role: req.user.role }
      );

      res.json({
        success: true,
        message: patch.accrual_enabled === 0
          ? 'Monthly accrual switched off for this employee'
          : 'Accrual settings updated',
        data: result,
      });
    } catch (error) {
      console.error('Error updating accrual settings:', error);
      res.status(400).json({ success: false, error: error.message || 'Failed to update accrual settings' });
    }
  }

  // ========================================================================
  // MANUAL BALANCE ADJUSTMENTS
  // ========================================================================

  async adjustLeaveBalance(req, res) {
    try {
      if (!canAdjustLeave(req.user)) {
        return res.status(403).json({
          success: false,
          error: 'Only HR, Super Admin, Heads of Department and Leads may adjust leave balances',
        });
      }

      const { employee_id, leave_type_id, fiscal_year, adjustment_days, reason } = req.body || {};
      if (!employee_id || !leave_type_id) {
        return res.status(400).json({ success: false, error: 'employee_id and leave_type_id are required' });
      }

      // A department HOP/Lead may only adjust their own department.
      if (!hasFullHrAccess(req.user)) {
        const employee = await hrService.getEmployeeById(employee_id);
        if (!employee) return res.status(404).json({ success: false, error: 'Employee not found' });
        if (Number(employee.department_id) !== Number(req.user.department_id)) {
          return res.status(403).json({
            success: false,
            error: 'You may only adjust leave for employees in your own department',
          });
        }
      }

      const result = await hrService.adjustLeaveBalance({
        employeeId:     Number(employee_id),
        leaveTypeId:    Number(leave_type_id),
        fiscalYear:     fiscal_year ? Number(fiscal_year) : undefined,
        adjustmentDays: Number(adjustment_days),
        reason,
        actor: { id: req.user.id, role: req.user.role },
      });

      const verb = result.adjustment_days > 0 ? 'credited' : 'deducted';
      res.json({
        success: true,
        message: `${Math.abs(result.adjustment_days)} day(s) ${verb}`,
        data: result,
      });
    } catch (error) {
      console.error('Error adjusting leave balance:', error);
      res.status(400).json({ success: false, error: error.message || 'Failed to adjust leave balance' });
    }
  }

  async getLeaveAdjustments(req, res) {
    try {
      if (!hasHrOversight(req.user)) {
        return res.status(403).json({ success: false, error: 'Not authorised to view leave adjustments' });
      }

      const data = await hrService.getLeaveAdjustments({
        employeeId:   req.query.employeeId ? Number(req.query.employeeId) : null,
        departmentId: hrDepartmentScope(req.user, req.query.departmentId),
        year: req.query.year ? Number(req.query.year) : null,
      });
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching leave adjustments:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch leave adjustments' });
    }
  }

  // ========================================================================
  // LEAVE REGISTER & ACCRUAL REPORT
  // ========================================================================

  /** Everyone's standing balance — "how many days does each person have". */
  async getLeaveRegister(req, res) {
    try {
      if (!hasHrOversight(req.user)) {
        return res.status(403).json({ success: false, error: 'Not authorised to view the leave register' });
      }

      const data = await hrService.getLeaveRegister({
        year: req.query.year ? Number(req.query.year) : undefined,
        departmentId: hrDepartmentScope(req.user, req.query.departmentId),
        search: req.query.search || null,
      });
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching leave register:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch leave register' });
    }
  }

  /** Accruals per department / per month, plus manual adjustment totals. */
  async getAccrualReport(req, res) {
    try {
      if (!hasHrOversight(req.user)) {
        return res.status(403).json({ success: false, error: 'Not authorised to view the accrual report' });
      }

      const data = await hrService.getAccrualReport({
        year: req.query.year ? Number(req.query.year) : undefined,
        departmentId: hrDepartmentScope(req.user, req.query.departmentId),
      });
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching accrual report:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch accrual report' });
    }
  }

  // ========================================================================
  // TIMESHEETS
  // ========================================================================

  async getTimesheets(req, res) {
    try {
      const filters = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 25,
        employeeId: req.query.employeeId,
        departmentId: req.query.departmentId,
        status: req.query.status,
        month: req.query.month ? parseInt(req.query.month) : null,
        year: req.query.year ? parseInt(req.query.year) : null
      };

      if (req.user.role === ROLES.GENERAL_USER) {
        const employeeId = await this.getEmployeeIdForUser(req.user.id);
        if (!employeeId) {
          return res.json({ success: true, data: [], pagination: { total: 0, page: filters.page, limit: filters.limit, totalPages: 0 } });
        }
        filters.employeeId = employeeId;
      } else if (isDeptScopedRole(req.user.role)) {
        filters.departmentId = req.user.department_id;
      }

      const result = await hrService.getTimesheets(filters);
      res.json({ success: true, data: result.data, pagination: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages } });
    } catch (error) {
      console.error('Error fetching timesheets:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch timesheets' });
    }
  }

  async getTimesheetById(req, res) {
    try {
      const timesheet = await hrService.getTimesheetById(req.params.id);
      if (!timesheet) return res.status(404).json({ success: false, error: 'Timesheet not found' });

      if ([ROLES.GENERAL_USER, ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS].includes(req.user.role)) {
        const employee = await hrService.getEmployeeById(timesheet.employee_id);
        if (!canAccessEmployeeRecord(employee, req.user)) {
          return res.status(403).json({ success: false, error: 'You do not have access to this timesheet' });
        }
      }

      res.json({ success: true, data: timesheet });
    } catch (error) {
      console.error('Error fetching timesheet:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch timesheet' });
    }
  }

  async createTimesheet(req, res) {
    try {
      const result = await hrService.createTimesheet(req.body, req.user.id);
      res.status(201).json({ success: true, message: 'Timesheet created successfully', data: result });
    } catch (error) {
      console.error('Error creating timesheet:', error);
      res.status(400).json({ success: false, error: error.message || 'Failed to create timesheet' });
    }
  }

  async submitTimesheet(req, res) {
    try {
      const result = await hrService.submitTimesheet(req.params.id, req.user.id);
      res.json({ success: true, message: 'Timesheet submitted successfully', data: result });
    } catch (error) {
      console.error('Error submitting timesheet:', error);
      res.status(400).json({ success: false, error: error.message || 'Failed to submit timesheet' });
    }
  }

  async approveTimesheet(req, res) {
    try {
      const { comments, approved } = req.body;
      const result = await hrService.approveTimesheet(
        req.params.id, req.user.id, comments, approved !== false
      );
      res.json({ success: true, message: `Timesheet ${result.status.toLowerCase()} successfully`, data: result });
    } catch (error) {
      console.error('Error approving timesheet:', error);
      res.status(400).json({ success: false, error: error.message || 'Failed to process timesheet' });
    }
  }

  // ========================================================================
  // PAYROLL
  // ========================================================================

  async getPayrollPeriods(req, res) {
    try {
      const filters = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 25,
        year: req.query.year ? parseInt(req.query.year) : null,
        status: req.query.status
      };
      const result = await hrService.getPayrollPeriods(filters);
      res.json({ success: true, data: result.data, pagination: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages } });
    } catch (error) {
      console.error('Error fetching payroll periods:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch payroll periods' });
    }
  }

  async getPayrollRecords(req, res) {
    try {
      const records = await hrService.getPayrollRecords(req.params.periodId);
      res.json({ success: true, data: records });
    } catch (error) {
      console.error('Error fetching payroll records:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch payroll records' });
    }
  }

  // ========================================================================
  // PERFORMANCE REVIEWS
  // ========================================================================

  async getPerformanceReviews(req, res) {
    try {
      const filters = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 25,
        employeeId: req.query.employeeId,
        departmentId: req.query.departmentId,
        reviewPeriod: req.query.reviewPeriod,
        status: req.query.status
      };

      if (req.user.role === ROLES.GENERAL_USER) {
        const employeeId = await this.getEmployeeIdForUser(req.user.id);
        if (!employeeId) {
          return res.json({ success: true, data: [], pagination: { total: 0, page: filters.page, limit: filters.limit, totalPages: 0 } });
        }
        filters.employeeId = employeeId;
      } else if (isDeptScopedRole(req.user.role)) {
        filters.departmentId = req.user.department_id;
      }

      const result = await hrService.getPerformanceReviews(filters);
      res.json({ success: true, data: result.data, pagination: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages } });
    } catch (error) {
      console.error('Error fetching performance reviews:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch performance reviews' });
    }
  }

  async createPerformanceReview(req, res) {
    try {
      const result = await hrService.createPerformanceReview(req.body, req.user.id);
      res.status(201).json({ success: true, message: 'Performance review created successfully', data: result });
    } catch (error) {
      console.error('Error creating performance review:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to create performance review' });
    }
  }

  async updatePerformanceReview(req, res) {
    try {
      const result = await hrService.updatePerformanceReview(req.params.id, req.body);
      res.json({ success: true, message: 'Performance review updated successfully', data: result });
    } catch (error) {
      console.error('Error updating performance review:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to update performance review' });
    }
  }

  // ========================================================================
  // TRAINING RECORDS
  // ========================================================================

  async getTrainingRecords(req, res) {
    try {
      const filters = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 25,
        employeeId: req.query.employeeId,
        departmentId: req.query.departmentId,
        status: req.query.status
      };

      if (req.user.role === ROLES.GENERAL_USER) {
        const employeeId = await this.getEmployeeIdForUser(req.user.id);
        if (!employeeId) {
          return res.json({ success: true, data: [], pagination: { total: 0, page: filters.page, limit: filters.limit, totalPages: 0 } });
        }
        filters.employeeId = employeeId;
      } else if (isDeptScopedRole(req.user.role)) {
        filters.departmentId = req.user.department_id;
      }

      const result = await hrService.getTrainingRecords(filters);
      res.json({ success: true, data: result.data, pagination: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages } });
    } catch (error) {
      console.error('Error fetching training records:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch training records' });
    }
  }

  async createTrainingRecord(req, res) {
    try {
      const result = await hrService.createTrainingRecord(req.body, req.user.id);
      res.status(201).json({ success: true, message: 'Training record created successfully', data: result });
    } catch (error) {
      console.error('Error creating training record:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to create training record' });
    }
  }

  // ========================================================================
  // DISCIPLINARY RECORDS
  // ========================================================================

  async getDisciplinaryRecords(req, res) {
    try {
      const filters = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 25,
        employeeId: req.query.employeeId,
        type: req.query.type,
        status: req.query.status
      };

      if (req.user.role === ROLES.GENERAL_USER) {
        const employeeId = await this.getEmployeeIdForUser(req.user.id);
        if (!employeeId) {
          return res.json({ success: true, data: [], pagination: { total: 0, page: filters.page, limit: filters.limit, totalPages: 0 } });
        }
        filters.employeeId = employeeId;
      } else if (isDeptScopedRole(req.user.role)) {
        const employeeIds = await this.getDepartmentEmployeeIds(req.user.department_id);
        if (employeeIds.length === 0) {
          return res.json({ success: true, data: [], pagination: { total: 0, page: filters.page, limit: filters.limit, totalPages: 0 } });
        }
        if (req.query.employeeId && !employeeIds.includes(Number(req.query.employeeId))) {
          return res.json({ success: true, data: [], pagination: { total: 0, page: filters.page, limit: filters.limit, totalPages: 0 } });
        }
        if (req.query.employeeId) {
          filters.employeeId = Number(req.query.employeeId);
        }
      }

      const result = await hrService.getDisciplinaryRecords(filters);

      let scopedData = result.data;
      if (isDeptScopedRole(req.user.role)) {
        const employeeIds = await this.getDepartmentEmployeeIds(req.user.department_id);
        scopedData = result.data.filter((row) => employeeIds.includes(Number(row.employee_id)));
      }

      res.json({
        success: true,
        data: scopedData,
        pagination: {
          total: scopedData.length,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(scopedData.length / result.limit)
        }
      });
    } catch (error) {
      console.error('Error fetching disciplinary records:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch disciplinary records' });
    }
  }

  async createDisciplinaryRecord(req, res) {
    try {
      const result = await hrService.createDisciplinaryRecord(req.body, req.user.id);
      res.status(201).json({ success: true, message: 'Disciplinary record created successfully', data: result });
    } catch (error) {
      console.error('Error creating disciplinary record:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to create disciplinary record' });
    }
  }

  // ========================================================================
  // EXIT / CLEARANCE
  // ========================================================================

  async getExitClearances(req, res) {
    try {
      const filters = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 25,
        status: req.query.status
      };
      const result = await hrService.getExitClearances(filters);

      let scoped = result.data;
      if (hasFullHrAccess(req.user)) {
        // everything
      } else if (hasDepartmentHrAccess(req.user)) {
        scoped = result.data.filter((row) => Number(row.department_id) === Number(req.user.department_id));
      } else {
        const employeeId = await this.getEmployeeIdForUser(req.user.id);
        scoped = employeeId ? result.data.filter((row) => Number(row.employee_id) === Number(employeeId)) : [];
      }

      // Free-text search over the person's name, number or system username.
      const term = String(req.query.search || '').trim().toLowerCase();
      if (term) {
        scoped = scoped.filter((row) =>
          [row.employee_name, row.employee_number, row.email, row.username]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(term))
        );
      }

      res.json({ success: true, data: scoped, pagination: { total: scoped.length, page: result.page, limit: result.limit, totalPages: Math.ceil(scoped.length / result.limit) } });
    } catch (error) {
      console.error('Error fetching exit clearances:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch exit clearances' });
    }
  }

  async initiateExitClearance(req, res) {
    try {
      const result = await hrService.initiateExitClearance(req.body, req.user.id);
      res.status(201).json({ success: true, message: 'Exit clearance initiated successfully', data: result });
    } catch (error) {
      console.error('Error initiating exit clearance:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to initiate exit clearance' });
    }
  }

  async updateExitClearance(req, res) {
    try {
      const result = await hrService.updateExitClearance(req.params.id, req.body);
      res.json({ success: true, message: 'Exit clearance updated successfully', data: result });
    } catch (error) {
      console.error('Error updating exit clearance:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to update exit clearance' });
    }
  }

  // ========================================================================
  // HR DOCUMENTS
  // ========================================================================

  async getDocuments(req, res) {
    try {
      const employee = await hrService.getEmployeeById(req.params.employeeId);
      if (!employee) return res.status(404).json({ success: false, error: 'Employee not found' });
      if (!canAccessEmployeeRecord(employee, req.user)) {
        return res.status(403).json({ success: false, error: 'You do not have access to this employee documents' });
      }

      const documents = await hrService.getDocuments(req.params.employeeId);
      res.json({ success: true, data: documents });
    } catch (error) {
      console.error('Error fetching documents:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch documents' });
    }
  }

  async createDocument(req, res) {
    try {
      const data = {
        ...req.body,
        file_url: req.file ? req.file.path : req.body.file_url,
        file_size: req.file ? req.file.size : req.body.file_size
      };
      const result = await hrService.createDocument(data, req.user.id);
      res.status(201).json({ success: true, message: 'Document uploaded successfully', data: result });
    } catch (error) {
      console.error('Error creating document:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to upload document' });
    }
  }

  async deleteDocument(req, res) {
    try {
      await hrService.deleteDocument(req.params.documentId);
      res.json({ success: true, message: 'Document deleted successfully' });
    } catch (error) {
      console.error('Error deleting document:', error);
      res.status(500).json({ success: false, error: 'Failed to delete document' });
    }
  }

  // ========================================================================
  // DASHBOARD
  // ========================================================================

  async getDashboardStats(req, res) {
    try {
      // Staff without oversight get their own leave position instead of the
      // organisation-wide figures, so the dashboard never shows tiles they
      // would only be denied when clicking through.
      if (!hasHrOversight(req.user)) {
        const personal = await hrService.getPersonalDashboard(req.user.id);
        return res.json({ success: true, data: personal });
      }

      const departmentId = hrDepartmentScope(req.user, req.query.departmentId);
      const stats = await hrService.getDashboardStats(departmentId);
      res.json({ success: true, data: { ...stats, personal: false } });
    } catch (error) {
      console.error('Error fetching HR dashboard stats:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch HR dashboard stats' });
    }
  }
}

module.exports = new HRController();
