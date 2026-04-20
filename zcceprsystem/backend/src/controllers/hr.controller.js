/**
 * HR Controller
 * Handles HTTP requests for Human Resources module
 */

const hrService = require('../services/hr.service');

class HRController {

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

  async getLeaveRequests(req, res) {
    try {
      const filters = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 25,
        employeeId: req.query.employeeId,
        departmentId: req.query.departmentId,
        status: req.query.status,
        year: req.query.year ? parseInt(req.query.year) : null
      };
      const result = await hrService.getLeaveRequests(filters);
      res.json({ success: true, data: result.data, pagination: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages } });
    } catch (error) {
      console.error('Error fetching leave requests:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch leave requests' });
    }
  }

  async createLeaveRequest(req, res) {
    try {
      const result = await hrService.createLeaveRequest(req.body, req.user.id);
      res.status(201).json({ success: true, message: 'Leave request submitted successfully', data: result });
    } catch (error) {
      console.error('Error creating leave request:', error);
      res.status(400).json({ success: false, error: error.message || 'Failed to create leave request' });
    }
  }

  async approveLeaveRequest(req, res) {
    try {
      const { comments, approved } = req.body;
      const result = await hrService.approveLeaveRequest(
        req.params.leaveId, req.user.id, comments, approved !== false
      );
      res.json({ success: true, message: `Leave request ${result.status.toLowerCase()} successfully`, data: result });
    } catch (error) {
      console.error('Error approving leave request:', error);
      res.status(400).json({ success: false, error: error.message || 'Failed to process leave request' });
    }
  }

  async getLeaveBalances(req, res) {
    try {
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
      const result = await hrService.getDisciplinaryRecords(filters);
      res.json({ success: true, data: result.data, pagination: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages } });
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
      res.json({ success: true, data: result.data, pagination: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages } });
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
