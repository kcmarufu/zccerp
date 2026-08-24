/**
 * HR Export Controller
 *
 * PDF and Excel exports for the Leave module:
 *   - a single leave request with its full audit trail (PDF)
 *   - the leave register, filtered (PDF + Excel)
 *   - the leave balance register (Excel)
 *
 * Visibility follows the same rules as the leave list endpoints:
 *   ADMIN / HR Office → everything
 *   HEAD_OF_PROGRAMS  → their own department
 *   everyone else     → their own records only
 */

const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const hrService = require('../services/hr.service');
const { query } = require('../config/database');
const { ROLES, isAdminHrManager } = require('../config/roles');

const BRAND = '#006064';
const INK = '#1a1a1a';
const MUTED = '#555555';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const fmtDays = (n) =>
  n === null || n === undefined || n === '' ? '—' : `${Number(n).toFixed(1)}`;

const titleise = (s) => String(s || '').replace(/_/g, ' ');

class HRExportController {

  /**
   * Resolve what slice of the leave data this caller may export.
   * Returns { departmentId, employeeId } — nulls mean "unrestricted".
   */
  async resolveExportScope(user) {
    // Super Admin and the Admin/HR department see the whole organisation.
    if (user.role === ROLES.ADMIN || isAdminHrManager(user)) {
      return { departmentId: null, employeeId: null, scopeLabel: 'Organisation-wide' };
    }

    if (user.role === ROLES.HEAD_OF_PROGRAMS) {
      return {
        departmentId: user.department_id,
        employeeId: null,
        scopeLabel: 'Department',
      };
    }

    // Everyone else: their own record only.
    const rows = await query('SELECT id FROM hr_employees WHERE user_id = ? LIMIT 1', [user.id]);
    return {
      departmentId: null,
      employeeId: rows.length ? rows[0].id : -1, // -1 matches nothing
      scopeLabel: 'Personal',
    };
  }

  /**
   * Can this caller see this specific leave request?
   */
  async canViewLeaveRequest(request, user) {
    if (!request) return false;
    if (user.role === ROLES.ADMIN || isAdminHrManager(user)) return true;
    if (user.role === ROLES.HEAD_OF_PROGRAMS) {
      return Number(request.department_id) === Number(user.department_id);
    }
    return Number(request.employee_user_id) === Number(user.id);
  }

  // ======================================================================
  // 1. SINGLE LEAVE REQUEST + AUDIT TRAIL  →  PDF
  // ======================================================================

  async generateLeaveRequestPDF(req, res) {
    try {
      const request = await hrService.getLeaveRequestById(req.params.leaveId);
      if (!request) {
        return res.status(404).json({ success: false, error: 'Leave request not found' });
      }
      if (!(await this.canViewLeaveRequest(request, req.user))) {
        return res.status(403).json({ success: false, error: 'You do not have access to this leave request' });
      }

      const trail = await hrService.getLeaveAuditTrail(request.id);

      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition',
        `attachment; filename=leave-request-${request.id}.pdf`);
      doc.pipe(res);

      const pageW = doc.page.width - 100;

      // ── Header band ──────────────────────────────────────────────────
      doc.rect(50, 40, pageW, 60).fill(BRAND);
      doc.fillColor('white').fontSize(8)
         .text('ERP Connect — Zimbabwe Council of Churches', 60, 50);
      doc.fontSize(16).font('Helvetica-Bold').text('Leave Application', 60, 62);
      doc.fontSize(9).font('Helvetica')
         .text(`Department: ${request.department_name || '—'}`, 60, 84);

      const refX = doc.page.width - 200;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('white').text('Reference:', refX, 50);
      doc.fontSize(12).font('Helvetica-Bold').text(`LV-${String(request.id).padStart(5, '0')}`, refX, 62);
      doc.fontSize(8).font('Helvetica').text(`Raised: ${fmtDate(request.created_at)}`, refX, 78);
      doc.fontSize(8).text(`Status: ${titleise(request.status)}`, refX, 90);

      doc.fillColor(INK);

      // ── Applicant / leave details ────────────────────────────────────
      let y = 120;
      const col1 = 50, col2 = 310;

      const drawField = (label, value, x, yPos) => {
        doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED)
           .text(String(label).toUpperCase(), x, yPos);
        doc.fontSize(10).font('Helvetica').fillColor(INK)
           .text(value === null || value === undefined || value === '' ? '—' : String(value), x, yPos + 12);
      };

      drawField('Employee', request.employee_name, col1, y);
      drawField('Employee No.', request.employee_number, col2, y);
      y += 34;
      drawField('Role', titleise(request.requester_role), col1, y);
      drawField('Department', request.department_name, col2, y);
      y += 34;
      drawField('Leave Type', request.leave_type_name, col1, y);
      drawField('Deductible', request.is_deductible ? 'Yes — days deducted from balance'
                                                    : 'No — balance unaffected', col2, y);
      y += 34;
      drawField('First Day', fmtDate(request.start_date), col1, y);
      drawField('Last Day', fmtDate(request.end_date), col2, y);
      y += 34;
      drawField('Days Requested', fmtDays(request.total_days), col1, y);
      drawField('Approved By', request.approved_by_name, col2, y);
      y += 40;

      // ── Balance impact panel ─────────────────────────────────────────
      doc.fontSize(11).font('Helvetica-Bold').fillColor(BRAND)
         .text('Leave Balance Impact', 50, y);
      y += 18;

      if (request.is_deductible) {
        doc.rect(50, y, pageW, 46).fillAndStroke('#f4f8f8', '#cfd8d8');
        doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold');
        doc.text('BALANCE BEFORE', 62, y + 8);
        doc.text('DAYS DEDUCTED', 62 + pageW / 3, y + 8);
        doc.text('BALANCE AFTER', 62 + (2 * pageW) / 3, y + 8);

        doc.fillColor(INK).fontSize(14).font('Helvetica-Bold');
        doc.text(fmtDays(request.balance_before), 62, y + 22);
        doc.text(
          request.status === 'APPROVED' ? `- ${fmtDays(request.total_days)}` : fmtDays(request.total_days),
          62 + pageW / 3, y + 22
        );
        doc.text(fmtDays(request.balance_after), 62 + (2 * pageW) / 3, y + 22);
        y += 60;
      } else {
        doc.rect(50, y, pageW, 30).fillAndStroke('#f4f8f8', '#cfd8d8');
        doc.fillColor(INK).fontSize(9).font('Helvetica')
           .text(`${request.leave_type_name} is a non-deductible leave type — no days are taken from the employee's balance.`,
                 62, y + 11, { width: pageW - 24 });
        y += 44;
      }

      // ── Reason ───────────────────────────────────────────────────────
      doc.fontSize(11).font('Helvetica-Bold').fillColor(BRAND).text('Reason', 50, y);
      y += 16;
      doc.fontSize(9).font('Helvetica').fillColor(INK)
         .text(request.reason || '—', 50, y, { width: pageW });
      y = doc.y + 14;

      if (request.status === 'REJECTED' && request.rejection_reason) {
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#b3261e').text('Rejection Reason', 50, y);
        y += 16;
        doc.fontSize(9).font('Helvetica').fillColor(INK)
           .text(request.rejection_reason, 50, y, { width: pageW });
        y = doc.y + 14;
      }

      // ── Audit trail ──────────────────────────────────────────────────
      if (y > doc.page.height - 200) { doc.addPage(); y = 50; }

      doc.fontSize(11).font('Helvetica-Bold').fillColor(BRAND).text('Audit Trail', 50, y);
      y += 20;

      const cols = [
        { label: 'DATE',    x: 50,  w: 95 },
        { label: 'ACTION',  x: 145, w: 70 },
        { label: 'BY',      x: 215, w: 110 },
        { label: 'ROLE',    x: 325, w: 85 },
        { label: 'BEFORE',  x: 410, w: 45 },
        { label: 'AFTER',   x: 455, w: 45 },
        { label: 'DAYS',    x: 500, w: 45 },
      ];

      doc.rect(50, y, pageW, 18).fill(BRAND);
      doc.fillColor('white').fontSize(7).font('Helvetica-Bold');
      cols.forEach((c) => doc.text(c.label, c.x + 4, y + 6, { width: c.w - 8 }));
      y += 18;

      doc.font('Helvetica').fontSize(7.5);
      if (trail.length === 0) {
        doc.fillColor(MUTED).text('No trail entries recorded.', 54, y + 6);
        y += 20;
      }

      trail.forEach((entry, i) => {
        if (y > doc.page.height - 80) {
          doc.addPage();
          y = 50;
          doc.rect(50, y, pageW, 18).fill(BRAND);
          doc.fillColor('white').fontSize(7).font('Helvetica-Bold');
          cols.forEach((c) => doc.text(c.label, c.x + 4, y + 6, { width: c.w - 8 }));
          y += 18;
          doc.font('Helvetica').fontSize(7.5);
        }

        if (i % 2 === 0) doc.rect(50, y, pageW, 16).fill('#f7f9f9');

        const values = [
          fmtDateTime(entry.created_at),
          titleise(entry.action),
          entry.actor_name || 'System',
          titleise(entry.actor_role) || '—',
          fmtDays(entry.balance_before),
          fmtDays(entry.balance_after),
          Number(entry.days_affected) ? fmtDays(entry.days_affected) : '—',
        ];

        doc.fillColor(INK);
        cols.forEach((c, ci) => doc.text(values[ci], c.x + 4, y + 5, { width: c.w - 8, ellipsis: true }));
        y += 16;
      });

      // Comments recorded against trail entries, listed below the table.
      const withComments = trail.filter((t) => t.comments);
      if (withComments.length) {
        y += 10;
        if (y > doc.page.height - 120) { doc.addPage(); y = 50; }
        doc.fontSize(9).font('Helvetica-Bold').fillColor(BRAND).text('Trail Comments', 50, y);
        y += 14;
        withComments.forEach((t) => {
          if (y > doc.page.height - 70) { doc.addPage(); y = 50; }
          doc.fontSize(7.5).font('Helvetica-Bold').fillColor(MUTED)
             .text(`${titleise(t.action)} — ${t.actor_name || 'System'}, ${fmtDateTime(t.created_at)}`, 50, y);
          y = doc.y + 2;
          doc.fontSize(8).font('Helvetica').fillColor(INK)
             .text(t.comments, 50, y, { width: pageW });
          y = doc.y + 8;
        });
      }

      // ── Footer ───────────────────────────────────────────────────────
      doc.fontSize(7).fillColor(MUTED)
         .text(`Generated ${fmtDateTime(new Date())} — ERP Connect HR Module`,
               50, doc.page.height - 60, { width: pageW, align: 'center' });

      doc.end();
    } catch (error) {
      console.error('Error generating leave request PDF:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Failed to generate leave request PDF' });
      }
    }
  }

  // ======================================================================
  // 2. LEAVE REGISTER  →  PDF
  // ======================================================================

  async generateLeaveRegisterPDF(req, res) {
    try {
      const scope = await this.resolveExportScope(req.user);
      const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();

      const rows = await hrService.getLeaveExportRows({
        year,
        departmentId: scope.departmentId ?? (req.query.departmentId ? Number(req.query.departmentId) : null),
        status: req.query.status || null,
        employeeId: scope.employeeId ?? (req.query.employeeId ? Number(req.query.employeeId) : null),
      });

      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=leave-register-${year}.pdf`);
      doc.pipe(res);

      const pageW = doc.page.width - 80;

      doc.rect(40, 30, pageW, 52).fill(BRAND);
      doc.fillColor('white').fontSize(8)
         .text('ERP Connect — Zimbabwe Council of Churches', 50, 40);
      doc.fontSize(15).font('Helvetica-Bold').text(`Leave Register ${year}`, 50, 52);
      doc.fontSize(8).font('Helvetica')
         .text(`${scope.scopeLabel} • ${rows.length} record(s)${req.query.status ? ` • ${titleise(req.query.status)}` : ''}`,
               50, 70);
      doc.fillColor(INK);

      let y = 96;
      const cols = [
        { label: 'EMPLOYEE',   key: 'employee_name',      x: 40,  w: 120 },
        { label: 'DEPARTMENT', key: 'department_name',    x: 160, w: 95 },
        { label: 'LEAVE TYPE', key: 'leave_type_name',    x: 255, w: 85 },
        { label: 'DED.',       key: '_ded',               x: 340, w: 32 },
        { label: 'FROM',       key: '_from',              x: 372, w: 62 },
        { label: 'TO',         key: '_to',                x: 434, w: 62 },
        { label: 'DAYS',       key: '_days',              x: 496, w: 36 },
        { label: 'BEFORE',     key: '_before',            x: 532, w: 42 },
        { label: 'AFTER',      key: '_after',             x: 574, w: 42 },
        { label: 'STATUS',     key: '_status',            x: 616, w: 62 },
        { label: 'APPROVER',   key: 'approved_by_name',   x: 678, w: 84 },
      ];

      const drawHeader = () => {
        doc.rect(40, y, pageW, 18).fill(BRAND);
        doc.fillColor('white').fontSize(7).font('Helvetica-Bold');
        cols.forEach((c) => doc.text(c.label, c.x + 3, y + 6, { width: c.w - 6 }));
        y += 18;
        doc.font('Helvetica').fontSize(7).fillColor(INK);
      };

      drawHeader();

      let totalDays = 0;
      rows.forEach((r, i) => {
        if (y > doc.page.height - 70) { doc.addPage(); y = 40; drawHeader(); }
        if (i % 2 === 0) doc.rect(40, y, pageW, 15).fill('#f7f9f9');
        doc.fillColor(INK);

        if (r.status === 'APPROVED') totalDays += Number(r.total_days) || 0;

        const view = {
          ...r,
          _ded:    r.is_deductible ? 'Yes' : 'No',
          _from:   fmtDate(r.start_date),
          _to:     fmtDate(r.end_date),
          _days:   fmtDays(r.total_days),
          _before: fmtDays(r.balance_before),
          _after:  fmtDays(r.balance_after),
          _status: titleise(r.status),
        };

        cols.forEach((c) =>
          doc.text(view[c.key] === null || view[c.key] === undefined || view[c.key] === '' ? '—' : String(view[c.key]),
                   c.x + 3, y + 4, { width: c.w - 6, ellipsis: true })
        );
        y += 15;
      });

      y += 8;
      if (y > doc.page.height - 60) { doc.addPage(); y = 40; }
      doc.fontSize(9).font('Helvetica-Bold').fillColor(BRAND)
         .text(`Total approved days in period: ${totalDays.toFixed(1)}`, 40, y);

      doc.fontSize(7).font('Helvetica').fillColor(MUTED)
         .text(`Generated ${fmtDateTime(new Date())} — ERP Connect HR Module`,
               40, doc.page.height - 45, { width: pageW, align: 'center' });

      doc.end();
    } catch (error) {
      console.error('Error generating leave register PDF:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Failed to generate leave register PDF' });
      }
    }
  }

  // ======================================================================
  // 3. LEAVE REGISTER + BALANCES + TRAIL  →  EXCEL
  // ======================================================================

  async generateLeaveExcel(req, res) {
    try {
      const scope = await this.resolveExportScope(req.user);
      const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
      const departmentId = scope.departmentId
        ?? (req.query.departmentId ? Number(req.query.departmentId) : null);

      const rows = await hrService.getLeaveExportRows({
        year,
        departmentId,
        status: req.query.status || null,
        employeeId: scope.employeeId ?? (req.query.employeeId ? Number(req.query.employeeId) : null),
      });

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'ERP Connect — HR Module';
      workbook.created = new Date();

      const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF006064' } };

      const styleHeader = (sheet) => {
        const row = sheet.getRow(1);
        row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        row.fill = headerFill;
        row.height = 20;
        row.alignment = { vertical: 'middle' };
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
      };

      // ── Sheet 1: Leave Requests ──────────────────────────────────────
      const reqSheet = workbook.addWorksheet('Leave Requests');
      reqSheet.columns = [
        { header: 'Ref',              key: 'ref',        width: 10 },
        { header: 'Employee No.',     key: 'empNo',      width: 14 },
        { header: 'Employee',         key: 'employee',   width: 26 },
        { header: 'Department',       key: 'department', width: 22 },
        { header: 'Role',             key: 'role',       width: 20 },
        { header: 'Leave Type',       key: 'leaveType',  width: 20 },
        { header: 'Deductible',       key: 'deductible', width: 12 },
        { header: 'From',             key: 'from',       width: 13 },
        { header: 'To',               key: 'to',         width: 13 },
        { header: 'Days',             key: 'days',       width: 9 },
        { header: 'Balance Before',   key: 'before',     width: 16 },
        { header: 'Balance After',    key: 'after',      width: 15 },
        { header: 'Status',           key: 'status',     width: 13 },
        { header: 'Approved By',      key: 'approver',   width: 24 },
        { header: 'Approved At',      key: 'approvedAt', width: 20 },
        { header: 'Submitted At',     key: 'createdAt',  width: 20 },
        { header: 'Reason',           key: 'reason',     width: 40 },
        { header: 'Rejection Reason', key: 'rejection',  width: 34 },
      ];

      rows.forEach((r) => {
        reqSheet.addRow({
          ref:        `LV-${String(r.id).padStart(5, '0')}`,
          empNo:      r.employee_number || '',
          employee:   r.employee_name,
          department: r.department_name || '',
          role:       titleise(r.requester_role),
          leaveType:  r.leave_type_name,
          deductible: r.is_deductible ? 'Yes' : 'No',
          from:       r.start_date ? new Date(r.start_date) : null,
          to:         r.end_date ? new Date(r.end_date) : null,
          days:       Number(r.total_days),
          before:     r.balance_before === null ? null : Number(r.balance_before),
          after:      r.balance_after === null ? null : Number(r.balance_after),
          status:     titleise(r.status),
          approver:   r.approved_by_name || '',
          approvedAt: r.approved_at ? new Date(r.approved_at) : null,
          createdAt:  r.created_at ? new Date(r.created_at) : null,
          reason:     r.reason || '',
          rejection:  r.rejection_reason || '',
        });
      });

      reqSheet.getColumn('from').numFmt = 'dd/mm/yyyy';
      reqSheet.getColumn('to').numFmt = 'dd/mm/yyyy';
      reqSheet.getColumn('approvedAt').numFmt = 'dd/mm/yyyy hh:mm';
      reqSheet.getColumn('createdAt').numFmt = 'dd/mm/yyyy hh:mm';
      ['days', 'before', 'after'].forEach((k) => { reqSheet.getColumn(k).numFmt = '0.0'; });
      styleHeader(reqSheet);
      reqSheet.autoFilter = { from: 'A1', to: { row: 1, column: reqSheet.columnCount } };

      // ── Sheet 2: Leave Balances ──────────────────────────────────────
      const balances = await hrService.getLeaveBalanceExportRows({ year, departmentId });
      const balSheet = workbook.addWorksheet('Leave Balances');
      balSheet.columns = [
        { header: 'Employee No.',    key: 'empNo',      width: 14 },
        { header: 'Employee',        key: 'employee',   width: 26 },
        { header: 'Department',      key: 'department', width: 22 },
        { header: 'Leave Type',      key: 'leaveType',  width: 20 },
        { header: 'Deductible',      key: 'deductible', width: 12 },
        { header: 'Year',            key: 'year',       width: 8 },
        { header: 'Entitlement',     key: 'entitle',    width: 13 },
        { header: 'Carried Forward', key: 'carried',    width: 16 },
        { header: 'Taken',           key: 'taken',      width: 10 },
        { header: 'Pending',         key: 'pending',    width: 10 },
        { header: 'Remaining',       key: 'remaining',  width: 12 },
      ];
      balances.forEach((b) => {
        balSheet.addRow({
          empNo:      b.employee_number || '',
          employee:   b.employee_name,
          department: b.department_name || '',
          leaveType:  b.leave_type_name,
          deductible: b.is_deductible ? 'Yes' : 'No',
          year:       b.fiscal_year,
          entitle:    Number(b.entitlement),
          carried:    Number(b.carried_forward),
          taken:      Number(b.taken),
          pending:    Number(b.pending),
          remaining:  Number(b.remaining_days),
        });
      });
      ['entitle', 'carried', 'taken', 'pending', 'remaining']
        .forEach((k) => { balSheet.getColumn(k).numFmt = '0.0'; });
      styleHeader(balSheet);
      balSheet.autoFilter = { from: 'A1', to: { row: 1, column: balSheet.columnCount } };

      // ── Sheet 3: Analytics summary ───────────────────────────────────
      const analytics = await hrService.getLeaveAnalytics({
        year,
        departmentId,
        highBalanceThreshold: req.query.threshold ? Number(req.query.threshold) : 30,
      });

      const sumSheet = workbook.addWorksheet('Summary');
      sumSheet.columns = [
        { header: 'Metric', key: 'metric', width: 34 },
        { header: 'Value',  key: 'value',  width: 20 },
      ];
      const s = analytics.summary || {};
      sumSheet.addRows([
        { metric: 'Fiscal year',                   value: analytics.fiscal_year },
        { metric: 'Employees with balances',       value: Number(s.employees || 0) },
        { metric: 'Total entitlement (days)',      value: Number(s.total_entitlement || 0) },
        { metric: 'Total taken (days)',            value: Number(s.total_taken || 0) },
        { metric: 'Total pending (days)',          value: Number(s.total_pending || 0) },
        { metric: 'Total remaining (days)',        value: Number(s.total_remaining || 0) },
        { metric: 'Average remaining (days)',      value: Number(s.avg_remaining || 0) },
        { metric: 'High-balance threshold (days)', value: analytics.high_balance_threshold },
        { metric: 'Employees over threshold',      value: analytics.highBalances.length },
        { metric: 'Requests awaiting approval',    value: analytics.pendingAging.length },
      ]);
      styleHeader(sumSheet);

      // ── Sheet 4: High balances (the "too many days" watch list) ──────
      const hiSheet = workbook.addWorksheet('High Balances');
      hiSheet.columns = [
        { header: 'Employee No.', key: 'empNo',      width: 14 },
        { header: 'Employee',     key: 'employee',   width: 26 },
        { header: 'Department',   key: 'department', width: 22 },
        { header: 'Leave Type',   key: 'leaveType',  width: 20 },
        { header: 'Taken',        key: 'taken',      width: 10 },
        { header: 'Remaining',    key: 'remaining',  width: 12 },
      ];
      analytics.highBalances.forEach((h) => {
        hiSheet.addRow({
          empNo:      h.employee_number || '',
          employee:   h.employee_name,
          department: h.department_name || '',
          leaveType:  h.leave_type_name,
          taken:      Number(h.taken),
          remaining:  Number(h.remaining_days),
        });
      });
      ['taken', 'remaining'].forEach((k) => { hiSheet.getColumn(k).numFmt = '0.0'; });
      styleHeader(hiSheet);

      // ── Sheet 5: Department roll-up ──────────────────────────────────
      const deptSheet = workbook.addWorksheet('By Department');
      deptSheet.columns = [
        { header: 'Department',     key: 'department', width: 28 },
        { header: 'Employees',      key: 'employees',  width: 12 },
        { header: 'Days Taken',     key: 'taken',      width: 13 },
        { header: 'Days Remaining', key: 'remaining',  width: 15 },
      ];
      analytics.byDepartment.forEach((d) => {
        deptSheet.addRow({
          department: d.department_name || 'Unassigned',
          employees:  Number(d.employees),
          taken:      Number(d.days_taken),
          remaining:  Number(d.days_remaining),
        });
      });
      ['taken', 'remaining'].forEach((k) => { deptSheet.getColumn(k).numFmt = '0.0'; });
      styleHeader(deptSheet);

      // ── Sheet 6: Accruals per department & month ─────────────────────
      const accrual = await hrService.getAccrualReport({ year, departmentId });

      const accSheet = workbook.addWorksheet('Accruals');
      accSheet.columns = [
        { header: 'Department',   key: 'department', width: 30 },
        { header: 'Employees',    key: 'employees',  width: 13 },
        { header: 'Days Accrued', key: 'days',       width: 14 },
      ];
      accrual.byDepartment.forEach((d) => {
        accSheet.addRow({
          department: d.department_name,
          employees:  Number(d.employees_credited),
          days:       Number(d.days_accrued),
        });
      });
      accSheet.addRow({});
      accSheet.addRow({
        department: 'ORGANISATION TOTAL',
        employees:  Number(accrual.totals.employees),
        days:       Number(accrual.totals.days_accrued),
      });
      accSheet.getRow(accSheet.rowCount).font = { bold: true };
      accSheet.getColumn('days').numFmt = '0.0';
      styleHeader(accSheet);

      const monthSheet = workbook.addWorksheet('Accruals by Month');
      monthSheet.columns = [
        { header: 'Month',        key: 'month',     width: 14 },
        { header: 'Employees',    key: 'employees', width: 13 },
        { header: 'Days Accrued', key: 'days',      width: 14 },
        { header: 'Last Run',     key: 'lastRun',   width: 20 },
      ];
      const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      accrual.byMonth.forEach((m) => {
        monthSheet.addRow({
          month:     `${MONTH_NAMES[m.month - 1]} ${accrual.fiscal_year}`,
          employees: Number(m.employees_credited),
          days:      Number(m.days_accrued),
          lastRun:   m.last_run ? new Date(m.last_run) : null,
        });
      });
      monthSheet.getColumn('days').numFmt = '0.0';
      monthSheet.getColumn('lastRun').numFmt = 'dd/mm/yyyy hh:mm';
      styleHeader(monthSheet);

      // ── Sheet 7: Manual adjustment log ───────────────────────────────
      const adjustments = await hrService.getLeaveAdjustments({ year, departmentId });
      const adjSheet = workbook.addWorksheet('Manual Adjustments');
      adjSheet.columns = [
        { header: 'Date',       key: 'date',       width: 20 },
        { header: 'Employee',   key: 'employee',   width: 26 },
        { header: 'Department', key: 'department', width: 22 },
        { header: 'Leave Type', key: 'leaveType',  width: 20 },
        { header: 'Change',     key: 'change',     width: 10 },
        { header: 'Before',     key: 'before',     width: 10 },
        { header: 'After',      key: 'after',      width: 10 },
        { header: 'Reason',     key: 'reason',     width: 44 },
        { header: 'Applied By', key: 'by',         width: 24 },
      ];
      adjustments.forEach((a) => {
        adjSheet.addRow({
          date:       a.created_at ? new Date(a.created_at) : null,
          employee:   a.employee_name,
          department: a.department_name || '',
          leaveType:  a.leave_type_name,
          change:     Number(a.adjustment_days),
          before:     a.balance_before === null ? null : Number(a.balance_before),
          after:      a.balance_after === null ? null : Number(a.balance_after),
          reason:     a.reason,
          by:         a.adjusted_by_name || '',
        });
      });
      adjSheet.getColumn('date').numFmt = 'dd/mm/yyyy hh:mm';
      ['change', 'before', 'after'].forEach((k) => { adjSheet.getColumn(k).numFmt = '0.0'; });
      styleHeader(adjSheet);

      res.setHeader('Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=leave-report-${year}.xlsx`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Error generating leave Excel:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Failed to generate leave Excel export' });
      }
    }
  }
}

module.exports = new HRExportController();
