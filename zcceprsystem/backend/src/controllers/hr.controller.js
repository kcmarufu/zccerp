/**
 * HR Controller
 * Handles HTTP requests for Human Resources module
 */

const hrService = require('../services/hr.service');
const { query } = require('../config/database');
const { ROLES } = require('../config/roles');

const isDeptScopedRole = (role) => [ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS].includes(role);

const canAccessEmployeeRecord = (employee, user) => {
  if (!employee) return false;
  if ([ROLES.ADMIN, ROLES.FINANCE_CLERK].includes(user.role)) return true;
  if (user.role === ROLES.GENERAL_USER) {
    return Number(employee.user_id) === Number(user.id);
  }
  if (isDeptScopedRole(user.role)) {
    return Number(employee.department_id) === Number(user.department_id);
  }
  return true;
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
      const filters = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 25,
        search: req.query.search,
        departmentId: req.query.departmentId,
        status: req.query.status,
        employmentType: req.query.employmentType
      };

      if (req.user.role === ROLES.GENERAL_USER) {
        filters.userId = req.user.id;
      } else if (isDeptScopedRole(req.user.role)) {
        filters.departmentId = req.user.department_id;
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
      const result = await hrService.updateEmployee(req.params.id, req.body, req.user.id);
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
      };

      const scope = String(req.query.scope || '').toLowerCase();

      if (scope === 'mine') {
        // Always restrict to the caller's employee record.
        const employeeId = await this.getEmployeeIdForUser(req.user.id);
        if (!employeeId) {
          return res.json({ success: true, data: [], pagination: { total: 0, page: filters.page, limit: filters.limit, totalPages: 0 } });
        }
        filters.employeeId = employeeId;
      } else if (scope === 'pending-mine') {
        // Only requests this user is the designated approver for.
        if (![ROLES.HEAD_OF_PROGRAMS, ROLES.ADMIN].includes(req.user.role)) {
          return res.status(403).json({ success: false, error: 'Not authorised to view pending approvals' });
        }
        filters.pendingForApprover = {
          id: req.user.id,
          role: req.user.role,
          department_id: req.user.department_id,
        };
      } else {
        // Default visibility model:
        //   ADMIN          → see everything (subject to query filters)
        //   HOP            → see their department
        //   everyone else  → see their own requests only
        if (req.user.role === ROLES.ADMIN) {
          // unrestricted; honour explicit filters
        } else if (req.user.role === ROLES.HEAD_OF_PROGRAMS) {
          if (!filters.departmentId) filters.departmentId = req.user.department_id;
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
      if (req.user.role === ROLES.GENERAL_USER) {
        const employeeId = await this.getEmployeeIdForUser(req.user.id);
        scoped = employeeId ? result.data.filter((row) => Number(row.employee_id) === Number(employeeId)) : [];
      } else if (isDeptScopedRole(req.user.role)) {
        scoped = result.data.filter((row) => Number(row.department_id) === Number(req.user.department_id));
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
      const departmentId = req.query.departmentId || null;
      const stats = await hrService.getDashboardStats(departmentId);
      res.json({ success: true, data: stats });
    } catch (error) {
      console.error('Error fetching HR dashboard stats:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch HR dashboard stats' });
    }
  }
}

module.exports = new HRController();
