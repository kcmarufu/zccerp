/**
 * Export Controller
 * Handles PDF and Excel generation for reports and dispatch documents
 */

const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { query } = require('../config/database');
const approvalService = require('../services/approval.service');
const notificationService = require('../services/notification.service');

/**
 * Returns the display title for an approver role, adjusted per department.
 * FOS (Finance) and AHR (Admin/HR) use department-neutral titles.
 */
function formatApprovalRole(role, deptCode) {
  const supportDepts = ['FOS', 'AHR'];
  if (supportDepts.includes(deptCode || '')) {
    if (role === 'PROGRAM_LEAD')     return 'Department Lead';
    if (role === 'HEAD_OF_PROGRAMS') return 'Head of Department';
  }
  switch (role) {
    case 'PROGRAM_LEAD':     return 'Program Lead';
    case 'HEAD_OF_PROGRAMS': return 'Head of Programs';
    case 'FINANCE_CLERK':    return 'Finance Clerk';
    case 'ADMIN':            return 'Administrator';
    default: return (role || '').replace(/_/g, ' ');
  }
}

class ExportController {

  /**
   * Generate PDF dispatch document with full audit trail
   * GET /api/export/dispatch/:requestId/pdf
   */
  async generateDispatchPDF(req, res) {
    try {
      const { requestId } = req.params;

      // Fetch complete request data including partner (donor) and project
      const requests = await query(
        `SELECT r.*,
                u.first_name as requester_first_name,
                u.last_name as requester_last_name,
                u.email as requester_email,
                u.employee_id as requester_employee_id,
                d.department_name,
                d.department_code,
                dn.donor_name as partner_name,
                dn.donor_code as partner_code,
                p.project_name,
                p.project_code
         FROM requests r
         JOIN users u ON r.requester_id = u.id
         JOIN departments d ON r.department_id = d.id
         LEFT JOIN donors dn ON r.donor_id = dn.id
         LEFT JOIN projects p ON r.project_id = p.id
         WHERE r.id = ?`,
        [requestId]
      );

      if (requests.length === 0) {
        return res.status(404).json({ success: false, error: 'Request not found' });
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

      // Create text-based PDF document
      const doc = new PDFDocument({ margin: 50, size: 'A4' });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=float-requisition-${request.request_code}.pdf`);
      doc.pipe(res);

      // ── Header band ──────────────────────────────────────────────────────────
      const pageW = doc.page.width - 100; // usable width with 50px margins each side
      doc.rect(50, 40, pageW, 60).fill('#006064');
      doc.fillColor('white').fontSize(8).text('ERP Connect — Zimbabwe Council of Churches', 60, 50);
      doc.fontSize(16).font('Helvetica-Bold').text('Float Requisition', 60, 62);
      doc.fontSize(9).font('Helvetica').text(`Department: ${request.department_name} (${request.department_code})`, 60, 84);

      // Reference block (top-right)
      const refX = doc.page.width - 200;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('white').text('Reference:', refX, 50);
      doc.fontSize(12).font('Helvetica-Bold').text(request.request_code, refX, 62);
      doc.fontSize(8).font('Helvetica').text(`Date: ${request.submitted_at ? new Date(request.submitted_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date(request.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`, refX, 78);
      doc.fontSize(8).text(`Status: ${(request.status || '').replace(/_/g, ' ')}`, refX, 90);

      doc.fillColor('#1a1a1a');

      // ── Meta Details ─────────────────────────────────────────────────────────
      let y = 120;
      const col1 = 50, col2 = 310;

      const drawField = (label, value, x, yPos) => {
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#555').text(label.toUpperCase(), x, yPos);
        doc.fontSize(10).font('Helvetica').fillColor('#1a1a1a').text(value || '—', x, yPos + 12);
      };

      drawField('Requester', `${request.requester_first_name} ${request.requester_last_name}`, col1, y);
      drawField('Employee ID', request.requester_employee_id || '—', col2, y);
      y += 34;
      drawField('Department', `${request.department_name} (${request.department_code})`, col1, y);
      drawField('Priority', request.priority || 'MEDIUM', col2, y);
      y += 34;
      drawField('Partner', request.partner_name || '—', col1, y);
      drawField('Project', request.project_name ? `${request.project_code} — ${request.project_name}` : '—', col2, y);
      y += 34;
      drawField('Total Amount', `$${parseFloat(request.total_amount || 0).toFixed(2)}`, col1, y);
      drawField('Email', request.requester_email || '—', col2, y);
      y += 34;

      if (request.justification) {
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#555').text('PURPOSE OF FLOAT', col1, y);
        doc.fontSize(10).font('Helvetica').fillColor('#1a1a1a').text(request.justification, col1, y + 12, { width: pageW });
        y += 12 + doc.heightOfString(request.justification, { width: pageW }) + 10;
      }

      // ── Separator ────────────────────────────────────────────────────────────
      y += 8;
      doc.moveTo(50, y).lineTo(doc.page.width - 50, y).lineWidth(1).strokeColor('#006064').stroke();
      y += 10;

      // ── Items Table ──────────────────────────────────────────────────────────
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#006064').text('REQUEST ITEMS', col1, y);
      y += 18;

      // Table header
      doc.rect(50, y, pageW, 18).fill('#006064');
      doc.fontSize(8).font('Helvetica-Bold').fillColor('white');
      doc.text('#', 55, y + 5);
      doc.text('Budget Code', 75, y + 5);
      doc.text('Description', 150, y + 5);
      doc.text('Qty', 330, y + 5);
      doc.text('Unit Price', 365, y + 5, { width: 65, align: 'right' });
      doc.text('Subtotal', 435, y + 5, { width: 65, align: 'right' });
      y += 18;

      doc.fillColor('#1a1a1a');
      let lineTotal = 0;
      items.forEach((item, idx) => {
        if (y > 680) { doc.addPage(); y = 50; }
        const bg = idx % 2 === 0 ? '#f7f7f7' : 'white';
        const rowH = Math.max(18, doc.heightOfString(item.item_description || '', { width: 170 }) + 8);
        doc.rect(50, y, pageW, rowH).fill(bg);
        doc.fontSize(9).font('Helvetica').fillColor('#1a1a1a');
        doc.text(String(idx + 1), 55, y + 4);
        doc.text(item.budget_code || '—', 75, y + 4, { width: 70 });
        doc.text(item.item_description || '—', 150, y + 4, { width: 170 });
        doc.text(String(item.quantity), 330, y + 4, { width: 30, align: 'center' });
        doc.text(`$${parseFloat(item.unit_price || 0).toFixed(2)}`, 365, y + 4, { width: 65, align: 'right' });
        const sub = parseFloat(item.unit_price || 0) * parseFloat(item.quantity || 0);
        doc.text(`$${sub.toFixed(2)}`, 435, y + 4, { width: 65, align: 'right' });
        lineTotal += sub;
        y += rowH;
      });

      // Totals row
      doc.rect(50, y, pageW, 20).fill('#e0f2f1');
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#006064');
      doc.text('TOTAL:', 335, y + 4, { width: 95, align: 'right' });
      doc.text(`$${lineTotal.toFixed(2)}`, 435, y + 4, { width: 65, align: 'right' });
      y += 28;

      // ── Approval Trail ───────────────────────────────────────────────────────
      if (approvalTrail.length > 0) {
        if (y > 620) { doc.addPage(); y = 50; }
        doc.moveTo(50, y).lineTo(doc.page.width - 50, y).lineWidth(1).strokeColor('#006064').stroke();
        y += 10;
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#006064').text('APPROVAL TRAIL', 50, y);
        y += 18;

        doc.rect(50, y, pageW, 16).fill('#006064');
        doc.fontSize(8).font('Helvetica-Bold').fillColor('white');
        doc.text('Action', 55, y + 4);
        doc.text('Approved By', 120, y + 4);
        doc.text('Role', 260, y + 4);
        doc.text('Comments', 370, y + 4);
        doc.text('Date', 470, y + 4);
        y += 16;

        approvalTrail.forEach((a, idx) => {
          if (y > 700) { doc.addPage(); y = 50; }
          const bg = idx % 2 === 0 ? '#f7f7f7' : 'white';
          doc.rect(50, y, pageW, 18).fill(bg);
          doc.fontSize(8).font('Helvetica').fillColor('#1a1a1a');
          const actionColor = a.action === 'APPROVED' ? '#2e7d32' : a.action === 'REJECTED' ? '#c62828' : '#1a1a1a';
          doc.font('Helvetica-Bold').fillColor(actionColor).text(a.action, 55, y + 4, { width: 60 });
          doc.font('Helvetica').fillColor('#1a1a1a');
          doc.text(`${a.approver_first_name} ${a.approver_last_name}`, 120, y + 4, { width: 135 });
          doc.text(formatApprovalRole(a.approver_role || '', a.approver_dept_code), 260, y + 4, { width: 105 });
          doc.text(a.comments || '—', 370, y + 4, { width: 95 });
          doc.text(a.created_at ? new Date(a.created_at).toLocaleDateString('en-GB') : '—', 470, y + 4, { width: 75 });
          y += 18;
        });
        y += 10;
      }

      // ── Signature Lines ───────────────────────────────────────────────────────
      if (y > 650) { doc.addPage(); y = 50; }
      y += 10;
      doc.moveTo(50, y).lineTo(doc.page.width - 50, y).lineWidth(1).strokeColor('#006064').stroke();
      y += 14;
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#006064').text('AUTHORISATION SIGNATURES', 50, y);
      y += 22;

      const sigPositions = [50, 195, 340];
      const sigLabels = [
        `Requester\n${request.requester_first_name} ${request.requester_last_name}`,
        'Programme Lead / HOP',
        'Finance Clerk'
      ];
      sigPositions.forEach((x, i) => {
        doc.moveTo(x, y + 36).lineTo(x + 130, y + 36).lineWidth(0.5).strokeColor('#333').stroke();
        doc.fontSize(8).font('Helvetica').fillColor('#555').text(sigLabels[i], x, y + 40, { width: 130 });
      });
      y += 60;

      // ── Footer ────────────────────────────────────────────────────────────────
      if (y > 720) { doc.addPage(); y = 50; }
      doc.moveTo(50, y).lineTo(doc.page.width - 50, y).lineWidth(0.5).strokeColor('#ccc').stroke();
      y += 6;
      doc.fontSize(7).font('Helvetica').fillColor('#999');
      doc.text(`Generated: ${new Date().toLocaleString('en-GB')}  |  ERP Connect — Zimbabwe Council of Churches  |  CONFIDENTIAL`, 50, y);
      doc.text('Powered By Kudakwashe C Marufu', doc.page.width - 230, y, { width: 180, align: 'right' });

      doc.end();

    } catch (error) {
      console.error('Error generating PDF:', error);
      res.status(500).json({ success: false, error: 'Failed to generate PDF' });
    }
  }

  /**
   * Generate text-based PDF reconciliation document
   * GET /api/export/reconciliation/:requestId/pdf
   */
  async generateReconciliationPDF(req, res) {
    try {
      const { requestId } = req.params;

      // Fetch request details with partner and project
      const requests = await query(
        `SELECT r.*,
                u.first_name as requester_first_name,
                u.last_name as requester_last_name,
                u.email as requester_email,
                d.department_name,
                d.department_code,
                dn.donor_name as partner_name,
                dn.donor_code as partner_code,
                p.project_name,
                p.project_code
         FROM requests r
         JOIN users u ON r.requester_id = u.id
         JOIN departments d ON r.department_id = d.id
         LEFT JOIN donors dn ON r.donor_id = dn.id
         LEFT JOIN projects p ON r.project_id = p.id
         WHERE r.id = ?`,
        [requestId]
      );

      if (requests.length === 0) {
        return res.status(404).json({ success: false, error: 'Request not found' });
      }

      const request = requests[0];

      // Fetch reconciliation
      const recons = await query(
        `SELECT * FROM reconciliations WHERE request_id = ? ORDER BY created_at DESC LIMIT 1`,
        [requestId]
      );
      const reconciliation = recons[0] || null;

      // Fetch reconciliation items
      const reconItems = reconciliation ? await query(
        `SELECT * FROM reconciliation_items WHERE reconciliation_id = ?`,
        [reconciliation.id]
      ) : [];

      // Fetch approval trail
      const approvalTrail = await approvalService.getApprovalTrail(requestId);

      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=reconciliation-${request.request_code}.pdf`);
      doc.pipe(res);

      const pageW = doc.page.width - 100;

      // ── Header ────────────────────────────────────────────────────────────────
      doc.rect(50, 40, pageW, 60).fill('#006064');
      doc.fillColor('white').fontSize(8).text('ERP Connect — Zimbabwe Council of Churches', 60, 50);
      doc.fontSize(16).font('Helvetica-Bold').text('Reconciliation', 60, 62);
      doc.fontSize(9).font('Helvetica').text(`Department: ${request.department_name} (${request.department_code})`, 60, 84);

      const refX = doc.page.width - 200;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('white').text('Reference:', refX, 50);
      doc.fontSize(12).font('Helvetica-Bold').text(request.request_code, refX, 62);
      doc.fontSize(8).font('Helvetica').text(`Status: ${(request.status || '').replace(/_/g, ' ')}`, refX, 78);
      if (reconciliation) {
        doc.text(`Submitted: ${new Date(reconciliation.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`, refX, 90);
      }

      doc.fillColor('#1a1a1a');
      let y = 120;
      const col1 = 50, col2 = 310;

      const drawField = (label, value, x, yPos) => {
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#555').text(label.toUpperCase(), x, yPos);
        doc.fontSize(10).font('Helvetica').fillColor('#1a1a1a').text(value || '—', x, yPos + 12);
      };

      drawField('Requester', `${request.requester_first_name} ${request.requester_last_name}`, col1, y);
      drawField('Department', `${request.department_name} (${request.department_code})`, col2, y);
      y += 34;
      drawField('Partner', request.partner_name || '—', col1, y);
      drawField('Project', request.project_name ? `${request.project_code} — ${request.project_name}` : '—', col2, y);
      y += 34;

      if (reconciliation) {
        drawField('Total Spent', `$${parseFloat(reconciliation.total_spent || 0).toFixed(2)}`, col1, y);
        drawField('Total Returned', `$${parseFloat(reconciliation.total_returned || 0).toFixed(2)}`, col2, y);
        y += 34;
        if (reconciliation.notes) {
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#555').text('NOTES', col1, y);
          doc.fontSize(10).font('Helvetica').fillColor('#1a1a1a').text(reconciliation.notes, col1, y + 12, { width: pageW });
          y += 12 + doc.heightOfString(reconciliation.notes, { width: pageW }) + 10;
        }
      }

      // ── Separator ────────────────────────────────────────────────────────────
      y += 6;
      doc.moveTo(50, y).lineTo(doc.page.width - 50, y).lineWidth(1).strokeColor('#006064').stroke();
      y += 10;

      // ── Reconciliation Items Table ────────────────────────────────────────────
      if (reconItems.length > 0) {
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#006064').text('RECONCILIATION ITEMS', col1, y);
        y += 18;

        doc.rect(50, y, pageW, 18).fill('#006064');
        doc.fontSize(8).font('Helvetica-Bold').fillColor('white');
        doc.text('#', 55, y + 5);
        doc.text('Description', 75, y + 5);
        doc.text('Budgeted', 295, y + 5, { width: 80, align: 'right' });
        doc.text('Actual Spent', 380, y + 5, { width: 80, align: 'right' });
        doc.text('Variance', 465, y + 5, { width: 80, align: 'right' });
        y += 18;

        let totalBudgeted = 0, totalActual = 0;
        reconItems.forEach((item, idx) => {
          if (y > 680) { doc.addPage(); y = 50; }
          const bg = idx % 2 === 0 ? '#f7f7f7' : 'white';
          const rowH = Math.max(18, doc.heightOfString(item.description || '', { width: 215 }) + 8);
          doc.rect(50, y, pageW, rowH).fill(bg);
          doc.fontSize(9).font('Helvetica').fillColor('#1a1a1a');
          doc.text(String(idx + 1), 55, y + 4);
          doc.text(item.description || '—', 75, y + 4, { width: 215 });
          const budgeted = parseFloat(item.budgeted_amount || 0);
          const actual = parseFloat(item.actual_amount || 0);
          const variance = budgeted - actual;
          doc.text(`$${budgeted.toFixed(2)}`, 295, y + 4, { width: 80, align: 'right' });
          doc.text(`$${actual.toFixed(2)}`, 380, y + 4, { width: 80, align: 'right' });
          const varColor = variance >= 0 ? '#2e7d32' : '#c62828';
          doc.font('Helvetica-Bold').fillColor(varColor).text(`$${Math.abs(variance).toFixed(2)} ${variance >= 0 ? '↓' : '↑'}`, 465, y + 4, { width: 80, align: 'right' });
          totalBudgeted += budgeted;
          totalActual += actual;
          y += rowH;
        });

        // Totals
        doc.rect(50, y, pageW, 20).fill('#e0f2f1');
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#006064');
        doc.text('TOTALS:', 75, y + 4, { width: 215 });
        doc.text(`$${totalBudgeted.toFixed(2)}`, 295, y + 4, { width: 80, align: 'right' });
        doc.text(`$${totalActual.toFixed(2)}`, 380, y + 4, { width: 80, align: 'right' });
        const totalVariance = totalBudgeted - totalActual;
        doc.fillColor(totalVariance >= 0 ? '#2e7d32' : '#c62828').text(`$${Math.abs(totalVariance).toFixed(2)} ${totalVariance >= 0 ? 'returned' : 'overspent'}`, 465, y + 4, { width: 80, align: 'right' });
        y += 28;
      }

      // ── Approval Trail ────────────────────────────────────────────────────────
      if (approvalTrail.length > 0) {
        if (y > 620) { doc.addPage(); y = 50; }
        doc.moveTo(50, y).lineTo(doc.page.width - 50, y).lineWidth(1).strokeColor('#006064').stroke();
        y += 10;
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#006064').text('APPROVAL TRAIL / AUDIT TRAIL', 50, y);
        y += 18;

        doc.rect(50, y, pageW, 16).fill('#006064');
        doc.fontSize(8).font('Helvetica-Bold').fillColor('white');
        doc.text('Action', 55, y + 4);
        doc.text('By', 120, y + 4);
        doc.text('Role', 260, y + 4);
        doc.text('Comments', 370, y + 4);
        doc.text('Date', 470, y + 4);
        y += 16;

        approvalTrail.forEach((a, idx) => {
          if (y > 700) { doc.addPage(); y = 50; }
          const bg = idx % 2 === 0 ? '#f7f7f7' : 'white';
          doc.rect(50, y, pageW, 18).fill(bg);
          doc.fontSize(8).font('Helvetica').fillColor('#1a1a1a');
          const actionColor = a.action === 'APPROVED' ? '#2e7d32' : a.action === 'REJECTED' ? '#c62828' : '#1a1a1a';
          doc.font('Helvetica-Bold').fillColor(actionColor).text(a.action, 55, y + 4, { width: 60 });
          doc.font('Helvetica').fillColor('#1a1a1a');
          doc.text(`${a.approver_first_name} ${a.approver_last_name}`, 120, y + 4, { width: 135 });
          doc.text(formatApprovalRole(a.approver_role || '', a.approver_dept_code), 260, y + 4, { width: 105 });
          doc.text(a.comments || '—', 370, y + 4, { width: 95 });
          doc.text(a.created_at ? new Date(a.created_at).toLocaleDateString('en-GB') : '—', 470, y + 4, { width: 75 });
          y += 18;
        });
        y += 10;
      }

      // ── Signature Lines ────────────────────────────────────────────────────────
      if (y > 650) { doc.addPage(); y = 50; }
      y += 10;
      doc.moveTo(50, y).lineTo(doc.page.width - 50, y).lineWidth(1).strokeColor('#006064').stroke();
      y += 14;
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#006064').text('AUTHORISATION SIGNATURES', 50, y);
      y += 22;
      const sigPositions = [50, 195, 340];
      const sigLabels = [
        `Requester\n${request.requester_first_name} ${request.requester_last_name}`,
        'Programme Lead / HOP',
        'Finance Clerk'
      ];
      sigPositions.forEach((x, i) => {
        doc.moveTo(x, y + 36).lineTo(x + 130, y + 36).lineWidth(0.5).strokeColor('#333').stroke();
        doc.fontSize(8).font('Helvetica').fillColor('#555').text(sigLabels[i], x, y + 40, { width: 130 });
      });

      // ── Footer ─────────────────────────────────────────────────────────────────
      y += 60;
      doc.moveTo(50, y).lineTo(doc.page.width - 50, y).lineWidth(0.5).strokeColor('#ccc').stroke();
      y += 6;
      doc.fontSize(7).font('Helvetica').fillColor('#999');
      doc.text(`Generated: ${new Date().toLocaleString('en-GB')}  |  ERP Connect — Zimbabwe Council of Churches  |  CONFIDENTIAL`, 50, y);
      doc.text('Powered By Kudakwashe C Marufu', doc.page.width - 230, y, { width: 180, align: 'right' });

      doc.end();

    } catch (error) {
      console.error('Error generating reconciliation PDF:', error);
      res.status(500).json({ success: false, error: 'Failed to generate reconciliation PDF' });
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

        // Update request status and record dispatch time
        await connection.execute(
          `UPDATE requests 
           SET status = 'DISPATCHED', dispatched_at = NOW(3), updated_at = NOW(), version = version + 1
           WHERE id = ?`,
          [requestId]
        );

        // Deduct each item's amount from its linked budget line's spent_amount
        const [items] = await connection.execute(
          `SELECT ri.budget_line_id, (ri.quantity * ri.unit_price) AS item_total
           FROM request_items ri
           WHERE ri.request_id = ? AND ri.budget_line_id IS NOT NULL`,
          [requestId]
        );

        // Aggregate by budget_line_id
        const lineMap = {};
        for (const item of items) {
          const blId = item.budget_line_id;
          lineMap[blId] = (lineMap[blId] || 0) + parseFloat(item.item_total);
        }

        for (const [blId, amount] of Object.entries(lineMap)) {
          const [blRows] = await connection.execute(
            'SELECT allocated_amount, spent_amount, (allocated_amount - spent_amount) AS balance, donor_id FROM budget_lines WHERE id = ? FOR UPDATE',
            [blId]
          );
          if (!blRows.length) continue;

          const balanceBefore = parseFloat(blRows[0].balance);
          const donorId = blRows[0].donor_id;

          await connection.execute(
            'UPDATE budget_lines SET spent_amount = spent_amount + ?, updated_at = NOW() WHERE id = ?',
            [amount, blId]
          );

          const [updatedBl] = await connection.execute(
            'SELECT (allocated_amount - spent_amount) AS balance FROM budget_lines WHERE id = ?',
            [blId]
          );
          const balanceAfter = parseFloat(updatedBl[0].balance);

          // Log budget transaction
          await connection.execute(
            `INSERT INTO budget_transactions
             (budget_line_id, request_id, transaction_type, amount, balance_before, balance_after, description, performed_by)
             VALUES (?, ?, 'DEDUCTION', ?, ?, ?, ?, ?)`,
            [blId, requestId, amount, balanceBefore, balanceAfter,
             `Dispatch deduction for request #${request.request_code}`, userId]
          );

          // Update donor total_spent
          if (donorId) {
            await connection.execute(
              'UPDATE donors SET total_spent = total_spent + ?, updated_at = NOW() WHERE id = ?',
              [amount, donorId]
            );
          }
        }

        await connection.execute(
          `INSERT INTO approval_logs 
           (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
           VALUES (?, ?, 'FINANCE_CLERK', 'DISPATCHED', 'APPROVED', 'DISPATCHED', 'Request dispatched', ?)`,
          [requestId, userId, ipAddress]
        );
      });

      res.json({
        success: true,
        message: 'Request marked as dispatched'
      });

      // Fire notification to requester (non-blocking)
      query('SELECT requester_id, request_code FROM requests WHERE id = ?', [requestId])
        .then(rows => {
          if (rows[0]) notificationService.onRequestDispatched(requestId, rows[0].request_code, rows[0].requester_id).catch(() => {});
        }).catch(() => {});

    } catch (error) {
      console.error('Error marking as dispatched:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to mark as dispatched'
      });
    }
  }

  /**
   * Reverse a dispatch — moves request from DISPATCHED back to APPROVED.
   * Finance Clerk / Admin only.
   * POST /api/export/dispatch/:requestId/reverse-dispatch
   */
  async reverseDispatch(req, res) {
    try {
      const { requestId } = req.params;
      const userId = req.user.id;
      const ipAddress = req.ip;
      const { reason } = req.body;
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

        if (request.status !== 'DISPATCHED') {
          throw new Error(
            `Cannot reverse dispatch. Current status: ${request.status}. Only DISPATCHED requests can be reversed.`
          );
        }

        // Revert budget line spent_amounts that were deducted at dispatch time
        const [items] = await connection.execute(
          `SELECT ri.budget_line_id, (ri.quantity * ri.unit_price) AS item_total
           FROM request_items ri
           WHERE ri.request_id = ? AND ri.budget_line_id IS NOT NULL`,
          [requestId]
        );

        // Aggregate by budget_line_id
        const lineMap = {};
        for (const item of items) {
          const blId = item.budget_line_id;
          lineMap[blId] = (lineMap[blId] || 0) + parseFloat(item.item_total);
        }

        for (const [blId, amount] of Object.entries(lineMap)) {
          const [blRows] = await connection.execute(
            'SELECT allocated_amount, spent_amount, (allocated_amount - spent_amount) AS balance, donor_id FROM budget_lines WHERE id = ? FOR UPDATE',
            [blId]
          );
          if (!blRows.length) continue;

          const balanceBefore = parseFloat(blRows[0].balance);
          const donorId = blRows[0].donor_id;

          await connection.execute(
            'UPDATE budget_lines SET spent_amount = GREATEST(spent_amount - ?, 0), updated_at = NOW() WHERE id = ?',
            [amount, blId]
          );

          const [updatedBl] = await connection.execute(
            'SELECT (allocated_amount - spent_amount) AS balance FROM budget_lines WHERE id = ?',
            [blId]
          );
          const balanceAfter = parseFloat(updatedBl[0].balance);

          // Log budget transaction for the reversal
          await connection.execute(
            `INSERT INTO budget_transactions
             (budget_line_id, request_id, transaction_type, amount, balance_before, balance_after, description, performed_by)
             VALUES (?, ?, 'REVERSAL', ?, ?, ?, ?, ?)`,
            [blId, requestId, amount, balanceBefore, balanceAfter,
             `Dispatch reversal for request #${request.request_code}${reason ? ': ' + reason : ''}`, userId]
          );

          // Reverse donor total_spent
          if (donorId) {
            await connection.execute(
              'UPDATE donors SET total_spent = GREATEST(total_spent - ?, 0), updated_at = NOW() WHERE id = ?',
              [amount, donorId]
            );
          }
        }

        // Revert request status
        await connection.execute(
          `UPDATE requests
           SET status = 'APPROVED', updated_at = NOW(), version = version + 1
           WHERE id = ?`,
          [requestId]
        );

        // Audit log
        await connection.execute(
          `INSERT INTO approval_logs
           (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
           VALUES (?, ?, 'FINANCE_CLERK', 'REVERSED', 'DISPATCHED', 'APPROVED', ?, ?)`,
          [requestId, userId, reason || 'Dispatch reversed by Finance', ipAddress]
        );
      });

      res.json({
        success: true,
        message: 'Dispatch reversed. Request is back to APPROVED status and budget balances have been restored.'
      });
    } catch (error) {
      console.error('Error reversing dispatch:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to reverse dispatch'
      });
    }
  }
}

module.exports = new ExportController();
