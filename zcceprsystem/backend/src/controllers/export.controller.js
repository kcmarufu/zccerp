/**
 * Export Controller
 * Handles PDF and Excel generation for reports and dispatch documents
 */

const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { query } = require('../config/database');
const approvalService = require('../services/approval.service');

class ExportController {

  /**
   * Generate PDF dispatch document with full audit trail
   * GET /api/export/dispatch/:requestId/pdf
   */
  async generateDispatchPDF(req, res) {
    try {
      const { requestId } = req.params;

      // Fetch complete request data
      const requests = await query(
        `SELECT r.*, 
                u.first_name as requester_first_name,
                u.last_name as requester_last_name,
                u.email as requester_email,
                u.employee_id as requester_employee_id,
                d.department_name,
                d.department_code
         FROM requests r
         JOIN users u ON r.requester_id = u.id
         JOIN departments d ON r.department_id = d.id
         WHERE r.id = ?`,
        [requestId]
      );

      if (requests.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Request not found'
        });
      }

      const request = requests[0];

      // Get items
      const items = await query(
        `SELECT ri.*, bl.budget_code, bl.budget_name
         FROM request_items ri
         JOIN budget_lines bl ON ri.budget_line_id = bl.id
         WHERE ri.request_id = ?`,
        [requestId]
      );

      // Get approval trail
      const approvalTrail = await approvalService.getApprovalTrail(requestId);

      // Create PDF document
      const doc = new PDFDocument({ margin: 50 });

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=dispatch-${request.request_code}.pdf`);

      // Pipe to response
      doc.pipe(res);

      // Header
      doc.fontSize(20).text('PROCUREMENT REQUEST - DISPATCH DOCUMENT', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Request Number: ${request.request_code}`, { align: 'center' });
      doc.text(`Status: ${request.status}`, { align: 'center' });
      doc.moveDown(2);

      // Request Details Section
      doc.fontSize(14).text('REQUEST DETAILS', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      doc.text(`Requester: ${request.requester_first_name} ${request.requester_last_name}`);
      doc.text(`Employee ID: ${request.requester_employee_id}`);
      doc.text(`Email: ${request.requester_email}`);
      doc.text(`Department: ${request.department_name} (${request.department_code})`);
      doc.text(`Priority: ${request.priority}`);
      doc.text(`Submitted: ${request.submitted_at ? new Date(request.submitted_at).toLocaleString() : 'N/A'}`);
      doc.text(`Total Amount: $${parseFloat(request.total_amount).toFixed(2)}`);
      doc.moveDown();
      doc.text(`Justification: ${request.justification || 'N/A'}`);
      doc.moveDown(2);

      // Items Table
      doc.fontSize(14).text('REQUEST ITEMS', { underline: true });
      doc.moveDown(0.5);

      // Table header
      const tableTop = doc.y;
      const itemX = 50;
      const qtyX = 250;
      const priceX = 300;
      const totalX = 370;
      const budgetX = 440;

      doc.fontSize(9);
      doc.text('Description', itemX, tableTop);
      doc.text('Qty', qtyX, tableTop);
      doc.text('Unit Price', priceX, tableTop);
      doc.text('Total', totalX, tableTop);
      doc.text('Budget Line', budgetX, tableTop);

      doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

      let currentY = tableTop + 25;
      items.forEach((item, index) => {
        if (currentY > 700) {
          doc.addPage();
          currentY = 50;
        }

        doc.text(item.item_description.substring(0, 35), itemX, currentY);
        doc.text(item.quantity.toString(), qtyX, currentY);
        doc.text(`$${parseFloat(item.unit_price).toFixed(2)}`, priceX, currentY);
        doc.text(`$${parseFloat(item.total_price).toFixed(2)}`, totalX, currentY);
        doc.text(item.budget_code, budgetX, currentY);
        currentY += 20;
      });

      doc.moveTo(50, currentY).lineTo(550, currentY).stroke();
      currentY += 10;
      doc.fontSize(10).text(`Total: $${parseFloat(request.total_amount).toFixed(2)}`, totalX, currentY);
      doc.moveDown(3);

      // Approval Trail Section
      if (doc.y > 600) doc.addPage();
      doc.fontSize(14).text('APPROVAL TRAIL / SIGNATURES', { underline: true });
      doc.moveDown(0.5);

      if (approvalTrail.length === 0) {
        doc.fontSize(10).text('No approvals recorded yet.');
      } else {
        approvalTrail.forEach((approval) => {
          doc.fontSize(10);
          doc.text(`${approval.approver_role.replace(/_/g, ' ')}: ${approval.action}`);
          doc.fontSize(9);
          doc.text(`  Name: ${approval.approver_first_name} ${approval.approver_last_name}`);
          doc.text(`  Date/Time: ${new Date(approval.created_at).toLocaleString()}`);
          if (approval.comments) {
            doc.text(`  Comments: ${approval.comments}`);
          }
          doc.moveDown(0.5);
        });
      }

      // Signature Lines
      doc.moveDown(2);
      if (doc.y > 650) doc.addPage();

      doc.fontSize(12).text('SIGNATURES', { underline: true });
      doc.moveDown(2);

      const sigY = doc.y;
      doc.fontSize(10);
      
      // Requester Signature
      doc.text('_______________________', 50, sigY);
      doc.text('Requester', 50, sigY + 15);
      doc.text(`${request.requester_first_name} ${request.requester_last_name}`, 50, sigY + 30);

      // Program Lead Signature
      const leadApproval = approvalTrail.find(a => a.approver_role === 'PROGRAM_LEAD' && a.action === 'APPROVED');
      doc.text('_______________________', 200, sigY);
      doc.text('Program Lead', 200, sigY + 15);
      if (leadApproval) {
        doc.text(`${leadApproval.approver_first_name} ${leadApproval.approver_last_name}`, 200, sigY + 30);
        doc.fontSize(8).text(new Date(leadApproval.created_at).toLocaleDateString(), 200, sigY + 42);
      }

      // HOP Signature
      const hopApproval = approvalTrail.find(a => a.approver_role === 'HEAD_OF_PROGRAMS' && a.action === 'APPROVED');
      doc.fontSize(10).text('_______________________', 350, sigY);
      doc.text('Head of Programs', 350, sigY + 15);
      if (hopApproval) {
        doc.text(`${hopApproval.approver_first_name} ${hopApproval.approver_last_name}`, 350, sigY + 30);
        doc.fontSize(8).text(new Date(hopApproval.created_at).toLocaleDateString(), 350, sigY + 42);
      }

      // Finance Signature
      const financeApproval = approvalTrail.find(a => a.approver_role === 'FINANCE_CLERK' && a.action === 'APPROVED');
      doc.fontSize(10).text('_______________________', 500, sigY);
      doc.text('Finance', 500, sigY + 15);
      if (financeApproval) {
        doc.text(`${financeApproval.approver_first_name} ${financeApproval.approver_last_name}`, 500, sigY + 30);
        doc.fontSize(8).text(new Date(financeApproval.created_at).toLocaleDateString(), 500, sigY + 42);
      }

      // Footer
      doc.fontSize(8);
      doc.text(
        `Generated on ${new Date().toLocaleString()} | Document ID: ${request.request_code}`,
        50,
        750,
        { align: 'center' }
      );

      doc.end();

    } catch (error) {
      console.error('Error generating PDF:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate PDF'
      });
    }
  }

  /**
   * Generate Excel export with full audit trail
   * GET /api/export/dispatch/:requestId/excel
   */
  async generateDispatchExcel(req, res) {
    try {
      const { requestId } = req.params;

      // Fetch complete request data
      const requests = await query(
        `SELECT r.*, 
                u.first_name as requester_first_name,
                u.last_name as requester_last_name,
                u.email as requester_email,
                u.employee_id as requester_employee_id,
                d.department_name,
                d.department_code
         FROM requests r
         JOIN users u ON r.requester_id = u.id
         JOIN departments d ON r.department_id = d.id
         WHERE r.id = ?`,
        [requestId]
      );

      if (requests.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Request not found'
        });
      }

      const request = requests[0];

      // Get items
      const items = await query(
        `SELECT ri.*, bl.budget_code, bl.budget_name
         FROM request_items ri
         JOIN budget_lines bl ON ri.budget_line_id = bl.id
         WHERE ri.request_id = ?`,
        [requestId]
      );

      // Get approval trail
      const approvalTrail = await approvalService.getApprovalTrail(requestId);

      // Create workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Finance ERP System';
      workbook.created = new Date();

      // Request Details Sheet
      const detailsSheet = workbook.addWorksheet('Request Details');
      
      detailsSheet.columns = [
        { header: 'Field', key: 'field', width: 25 },
        { header: 'Value', key: 'value', width: 50 }
      ];

      detailsSheet.addRows([
        { field: 'Request Number', value: request.request_code },
        { field: 'Status', value: request.status },
        { field: 'Requester Name', value: `${request.requester_first_name} ${request.requester_last_name}` },
        { field: 'Employee ID', value: request.requester_employee_id },
        { field: 'Email', value: request.requester_email },
        { field: 'Department', value: `${request.department_name} (${request.department_code})` },
        { field: 'Priority', value: request.priority },
        { field: 'Total Amount', value: parseFloat(request.total_amount) },
        { field: 'Justification', value: request.justification || 'N/A' },
        { field: 'Created Date', value: new Date(request.created_at).toLocaleString() },
        { field: 'Submitted Date', value: request.submitted_at ? new Date(request.submitted_at).toLocaleString() : 'N/A' },
        { field: 'Completed Date', value: request.completed_at ? new Date(request.completed_at).toLocaleString() : 'N/A' }
      ]);

      // Style header row
      detailsSheet.getRow(1).font = { bold: true };
      detailsSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // Items Sheet
      const itemsSheet = workbook.addWorksheet('Request Items');
      
      itemsSheet.columns = [
        { header: '#', key: 'index', width: 5 },
        { header: 'Description', key: 'description', width: 40 },
        { header: 'Quantity', key: 'quantity', width: 12 },
        { header: 'Unit', key: 'unit', width: 10 },
        { header: 'Unit Price', key: 'unitPrice', width: 15 },
        { header: 'Total Price', key: 'totalPrice', width: 15 },
        { header: 'Budget Code', key: 'budgetCode', width: 15 },
        { header: 'Budget Name', key: 'budgetName', width: 30 },
        { header: 'Notes', key: 'notes', width: 30 }
      ];

      items.forEach((item, index) => {
        itemsSheet.addRow({
          index: index + 1,
          description: item.item_description,
          quantity: item.quantity,
          unit: item.unit_of_measure,
          unitPrice: parseFloat(item.unit_price),
          totalPrice: parseFloat(item.total_price),
          budgetCode: item.budget_code,
          budgetName: item.budget_name,
          notes: item.notes || ''
        });
      });

      // Add total row
      itemsSheet.addRow({
        index: '',
        description: 'TOTAL',
        quantity: '',
        unit: '',
        unitPrice: '',
        totalPrice: parseFloat(request.total_amount),
        budgetCode: '',
        budgetName: '',
        notes: ''
      });

      // Style header and total rows
      itemsSheet.getRow(1).font = { bold: true };
      itemsSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
      itemsSheet.getRow(items.length + 2).font = { bold: true };

      // Format currency columns
      itemsSheet.getColumn('unitPrice').numFmt = '$#,##0.00';
      itemsSheet.getColumn('totalPrice').numFmt = '$#,##0.00';

      // Approval Trail Sheet
      const approvalSheet = workbook.addWorksheet('Approval Trail');
      
      approvalSheet.columns = [
        { header: 'Stage', key: 'stage', width: 20 },
        { header: 'Action', key: 'action', width: 12 },
        { header: 'Approver Name', key: 'approverName', width: 25 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Date/Time', key: 'timestamp', width: 22 },
        { header: 'Previous Status', key: 'prevStatus', width: 25 },
        { header: 'New Status', key: 'newStatus', width: 25 },
        { header: 'Comments', key: 'comments', width: 40 }
      ];

      approvalTrail.forEach(approval => {
        approvalSheet.addRow({
          stage: approval.approver_role.replace(/_/g, ' '),
          action: approval.action,
          approverName: `${approval.approver_first_name} ${approval.approver_last_name}`,
          email: approval.approver_email,
          timestamp: new Date(approval.created_at).toLocaleString(),
          prevStatus: approval.previous_status || '',
          newStatus: approval.new_status || '',
          comments: approval.comments || ''
        });
      });

      approvalSheet.getRow(1).font = { bold: true };
      approvalSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // Set response headers
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=dispatch-${request.request_code}.xlsx`);

      // Write to response
      await workbook.xlsx.write(res);
      res.end();

    } catch (error) {
      console.error('Error generating Excel:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate Excel'
      });
    }
  }

  /**
   * Generate bulk export of multiple requests
   * POST /api/export/bulk
   */
  async generateBulkExport(req, res) {
    try {
      const { requestIds, format = 'excel' } = req.body;

      if (!requestIds || requestIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Request IDs are required'
        });
      }

      const placeholders = requestIds.map(() => '?').join(',');

      const requests = await query(
        `SELECT r.*, 
                u.first_name as requester_first_name,
                u.last_name as requester_last_name,
                d.department_name
         FROM requests r
         JOIN users u ON r.requester_id = u.id
         JOIN departments d ON r.department_id = d.id
         WHERE r.id IN (${placeholders})`,
        requestIds
      );

      // Create Excel workbook with all requests
      const workbook = new ExcelJS.Workbook();
      
      const summarySheet = workbook.addWorksheet('Summary');
      summarySheet.columns = [
        { header: 'Request #', key: 'requestNumber', width: 20 },
        { header: 'Requester', key: 'requester', width: 25 },
        { header: 'Department', key: 'department', width: 20 },
        { header: 'Status', key: 'status', width: 25 },
        { header: 'Total Amount', key: 'totalAmount', width: 15 },
        { header: 'Priority', key: 'priority', width: 12 },
        { header: 'Submitted', key: 'submitted', width: 20 },
        { header: 'Completed', key: 'completed', width: 20 }
      ];

      requests.forEach(req => {
        summarySheet.addRow({
          requestNumber: req.request_code,
          requester: `${req.requester_first_name} ${req.requester_last_name}`,
          department: req.department_name,
          status: req.status,
          totalAmount: parseFloat(req.total_amount),
          priority: req.priority,
          submitted: req.submitted_at ? new Date(req.submitted_at).toLocaleString() : 'N/A',
          completed: req.completed_at ? new Date(req.completed_at).toLocaleString() : 'N/A'
        });
      });

      summarySheet.getRow(1).font = { bold: true };
      summarySheet.getColumn('totalAmount').numFmt = '$#,##0.00';

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=requests-export-${Date.now()}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();

    } catch (error) {
      console.error('Error generating bulk export:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate bulk export'
      });
    }
  }

  /**
   * Mark a request as dispatched
   * POST /api/export/dispatch/:requestId/mark-dispatched
   */
  async markAsDispatched(req, res) {
    try {
      const { requestId } = req.params;
      const userId = req.user.id;
      const ipAddress = req.ip;
      const { transaction: transactionFn } = require('../config/database');

      await transactionFn(async (connection) => {
        const [requests] = await connection.execute(
          'SELECT * FROM requests WHERE id = ? FOR UPDATE',
          [requestId]
        );

        if (requests.length === 0) {
          throw new Error('Request not found');
        }

        const request = requests[0];

        if (request.status !== 'APPROVED') {
          throw new Error(`Cannot mark as dispatched. Current status: ${request.status}`);
        }

        await connection.execute(
          `UPDATE requests 
           SET status = 'DISPATCHED', updated_at = NOW(), version = version + 1
           WHERE id = ?`,
          [requestId]
        );

        await connection.execute(
          `INSERT INTO approval_logs 
           (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
           VALUES (?, ?, 'FINANCE_CLERK', 'APPROVED', 'APPROVED', 'DISPATCHED', 'Request dispatched', ?)`,
          [requestId, userId, ipAddress]
        );
      });

      res.json({
        success: true,
        message: 'Request marked as dispatched'
      });
    } catch (error) {
      console.error('Error marking as dispatched:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to mark as dispatched'
      });
    }
  }
}

module.exports = new ExportController();
