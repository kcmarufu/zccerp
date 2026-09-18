/**
 * Timesheet Export Controller
 *
 * PDF and Excel output for the Timesheet module:
 *   - one employee's monthly timesheet, as a signed-off PDF
 *   - the same timesheet as a workbook
 *   - a department or organisation report as a workbook
 *
 * Visibility is the same ladder the API uses everywhere else, so an export can
 * never widen what a person is allowed to see.
 */

const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const timesheetService = require('../services/timesheet.service');
const { query } = require('../config/database');
const { formatRoleLabel } = require('../config/roleLabels');
const {
  TIMESHEET_STATUS,
  hasOrgTimesheetAccess,
  hasTeamTimesheetAccess,
} = require('../config/roles');

const BRAND = '#006064';
const INK = '#1a1a1a';
const MUTED = '#555555';
const RULE = '#cccccc';

const MONTH_NAMES = timesheetService.MONTH_NAMES;

const fmtDate = (d) =>
  (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const fmtDateTime = (d) =>
  (d ? new Date(d).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '—');

const num = (n, dp = 2) =>
  (n === null || n === undefined || n === '' ? '—' : Number(n).toFixed(dp));

const titleise = (s) => String(s || '').replace(/_/g, ' ');

const parseIntOr = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
};

class TimesheetExportController {

  /**
   * What slice of the data may this caller export?
   * Returns { departmentId, employeeId } — null means unrestricted.
   */
  async resolveScope(user, requestedDepartmentId = null) {
    if (hasOrgTimesheetAccess(user)) {
      return {
        departmentId: requestedDepartmentId ? Number(requestedDepartmentId) : null,
        employeeId: null,
        scopeLabel: 'Organisation-wide',
      };
    }
    if (hasTeamTimesheetAccess(user)) {
      return {
        departmentId: Number(user.department_id),
        employeeId: null,
        scopeLabel: user.department_name || 'Department',
      };
    }
    const employeeId = await timesheetService.getEmployeeIdForUser(user.id);
    return {
      departmentId: null,
      employeeId: employeeId || -1,
      scopeLabel: 'Personal',
    };
  }

  /** Load a timesheet and check the caller may see it. */
  async loadViewableTimesheet(timesheetId, user) {
    const grid = await timesheetService.getTimesheetGrid(timesheetId);
    if (!grid) return { error: 404, message: 'Timesheet not found' };

    const employee = await timesheetService.getEmployeeContext(grid.employee_id);
    if (!timesheetService.canViewEmployee(employee, user)) {
      return { error: 403, message: 'You do not have access to this timesheet' };
    }
    return { grid, employee };
  }

  // ==========================================================================
  // 1. ONE TIMESHEET -> PDF
  // ==========================================================================

  async generateTimesheetPDF(req, res) {
    try {
      const { grid, employee, error, message } = await this.loadViewableTimesheet(req.params.id, req.user);
      if (error) return res.status(error).json({ success: false, error: message });

      const trail = await timesheetService.getAuditTrail(grid.id);
      const period = `${MONTH_NAMES[grid.period_month - 1]} ${grid.period_year}`;
      const fileName = `timesheet-${employee.employee_number || employee.id}-${grid.period_year}-${String(grid.period_month).padStart(2, '0')}.pdf`;

      // Landscape: a month of days needs the width.
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      doc.pipe(res);

      const left = doc.page.margins.left;
      const right = doc.page.width - doc.page.margins.right;
      const width = right - left;

      // ── Header ──────────────────────────────────────────────────────────
      doc.fillColor(BRAND).fontSize(16).font('Helvetica-Bold')
        .text('MONTHLY TIMESHEET', left, 30);
      doc.fillColor(MUTED).fontSize(9).font('Helvetica')
        .text(period, left, 50);
      doc.fillColor(MUTED).fontSize(8)
        .text(`Generated ${fmtDateTime(new Date())}`, left, 30, { width, align: 'right' });

      doc.moveTo(left, 66).lineTo(right, 66).strokeColor(BRAND).lineWidth(1.5).stroke();

      // ── Employee block ──────────────────────────────────────────────────
      let y = 76;
      const col = width / 4;
      const field = (label, value, i, row = 0) => {
        const x = left + (i * col);
        const yy = y + (row * 26);
        doc.fillColor(MUTED).fontSize(7).font('Helvetica').text(label.toUpperCase(), x, yy);
        doc.fillColor(INK).fontSize(9).font('Helvetica-Bold')
          .text(String(value || '—'), x, yy + 9, { width: col - 8 });
      };

      field('Employee', employee.employee_name, 0);
      field('Employee No.', employee.employee_number, 1);
      field('Department', employee.department_name, 2);
      field('Position', employee.position_title || formatRoleLabel(employee.role, employee.job_title), 3);

      field('Status', titleise(grid.status), 0, 1);
      field('Expected hours', num(grid.expected_hours), 1, 1);
      field('Actual hours', num(grid.total_hours), 2, 1);
      field('Completion', `${num(grid.completion_percent)}%`, 3, 1);

      y += 56;
      doc.fillColor(MUTED).fontSize(7).font('Helvetica')
        .text(
          `Working days ${num(grid.metrics.working_days, 0)}   ·   `
          + `Public holidays ${num(grid.metrics.holiday_days, 0)}   ·   `
          + `Approved leave ${num(grid.metrics.leave_days, 0)}   ·   `
          + `Available days ${num(grid.metrics.available_days, 0)}   ·   `
          + `Standard day ${num(grid.metrics.daily_hours)}h`,
          left, y
        );
      y += 16;

      // ── The grid ────────────────────────────────────────────────────────
      const days = grid.metrics.days;
      const labelW = 150;
      const partnerW = 90;
      const tailW = 132; // Total + LOE% + Actual%
      const dayW = Math.max(11, (width - labelW - partnerW - tailW) / days.length);

      // Day header
      doc.fontSize(6).font('Helvetica-Bold').fillColor(INK);
      doc.rect(left, y, width, 22).fillColor('#f0f4f5').fill();
      doc.fillColor(INK).fontSize(7).font('Helvetica-Bold')
        .text('PROJECT', left + 3, y + 7, { width: labelW - 6 })
        .text('PARTNER', left + labelW + 3, y + 7, { width: partnerW - 6 });

      days.forEach((d, i) => {
        const x = left + labelW + partnerW + (i * dayW);
        doc.fillColor(d.is_expected ? INK : '#9aa5a8').fontSize(5.5).font('Helvetica-Bold')
          .text(String(d.day), x, y + 4, { width: dayW, align: 'center' });
        doc.fontSize(4.5).font('Helvetica')
          .text(['M', 'T', 'W', 'T', 'F', 'S', 'S'][d.weekday - 1], x, y + 12, { width: dayW, align: 'center' });
      });

      const tailX = left + labelW + partnerW + (days.length * dayW);
      doc.fillColor(INK).fontSize(6).font('Helvetica-Bold')
        .text('TOTAL', tailX, y + 7, { width: 44, align: 'right' })
        .text('LOE %', tailX + 44, y + 7, { width: 44, align: 'right' })
        .text('ACT %', tailX + 88, y + 7, { width: 44, align: 'right' });

      y += 22;

      // Rows
      for (const line of grid.lines) {
        if (y > doc.page.height - 90) { doc.addPage(); y = 40; }
        const rowH = 24;

        doc.rect(left, y, width, rowH).fillColor('#ffffff').fill();
        doc.fillColor(INK).fontSize(6.5).font('Helvetica-Bold')
          .text(`${line.project_code || '—'}`, left + 3, y + 3, { width: labelW - 6 });
        doc.fillColor(MUTED).fontSize(5.5).font('Helvetica')
          .text(String(line.project_name || '').slice(0, 60), left + 3, y + 11, { width: labelW - 6 });
        doc.fillColor(MUTED).fontSize(5.5)
          .text(String(line.activity_description || '').slice(0, 60), left + 3, y + 17, { width: labelW - 6 });
        doc.fillColor(INK).fontSize(6)
          .text(String(line.partner_name || '—').slice(0, 30), left + labelW + 3, y + 8, { width: partnerW - 6 });

        days.forEach((d, i) => {
          const x = left + labelW + partnerW + (i * dayW);
          if (!d.is_expected) {
            doc.rect(x, y, dayW, rowH).fillColor('#f5f7f7').fill();
          }
          const h = line.hours_by_date[d.date];
          if (h) {
            doc.fillColor(INK).fontSize(5.5).font('Helvetica')
              .text(Number(h).toFixed(1), x, y + 9, { width: dayW, align: 'center' });
          }
        });

        doc.fillColor(INK).fontSize(6.5).font('Helvetica-Bold')
          .text(num(line.total_hours, 1), tailX, y + 9, { width: 44, align: 'right' })
          .text(`${num(line.loe_percent, 1)}%`, tailX + 44, y + 9, { width: 44, align: 'right' });
        doc.fillColor(Math.abs(line.variance_percent) > 10 ? '#b34700' : INK)
          .text(`${num(line.actual_percent, 1)}%`, tailX + 88, y + 9, { width: 44, align: 'right' });

        doc.moveTo(left, y + rowH).lineTo(right, y + rowH).strokeColor(RULE).lineWidth(0.4).stroke();
        y += rowH;
      }

      // Daily totals
      if (y > doc.page.height - 70) { doc.addPage(); y = 40; }
      doc.rect(left, y, width, 16).fillColor('#eef3f4').fill();
      doc.fillColor(INK).fontSize(6.5).font('Helvetica-Bold')
        .text('DAILY TOTAL', left + 3, y + 5, { width: labelW + partnerW - 6 });
      days.forEach((d, i) => {
        const x = left + labelW + partnerW + (i * dayW);
        const t = grid.daily_totals[d.date];
        if (t) {
          doc.fillColor(t > grid.metrics.daily_hours ? '#b34700' : INK).fontSize(5.5)
            .text(Number(t).toFixed(1), x, y + 5, { width: dayW, align: 'center' });
        }
      });
      doc.fillColor(INK).fontSize(7).font('Helvetica-Bold')
        .text(num(grid.total_hours, 1), tailX, y + 5, { width: 44, align: 'right' })
        .text('100%', tailX + 44, y + 5, { width: 44, align: 'right' })
        .text('100%', tailX + 88, y + 5, { width: 44, align: 'right' });
      y += 26;

      // ── Approval trail ──────────────────────────────────────────────────
      if (y > doc.page.height - 120) { doc.addPage(); y = 40; }
      doc.fillColor(BRAND).fontSize(9).font('Helvetica-Bold').text('APPROVAL TRAIL', left, y);
      y += 14;
      doc.fontSize(7).font('Helvetica');
      for (const t of trail) {
        if (y > doc.page.height - 50) { doc.addPage(); y = 40; }
        doc.fillColor(INK).font('Helvetica-Bold')
          .text(titleise(t.action), left, y, { width: 90, continued: false });
        doc.fillColor(MUTED).font('Helvetica')
          .text(t.actor_name || 'System', left + 95, y, { width: 140, continued: false });
        doc.text(fmtDateTime(t.created_at), left + 240, y, { width: 130 });
        if (t.comments) {
          doc.fillColor(MUTED).text(String(t.comments).slice(0, 150), left + 375, y, { width: width - 380 });
        }
        y += 12;
      }

      // ── Signatures ──────────────────────────────────────────────────────
      if (y > doc.page.height - 90) { doc.addPage(); y = 40; }
      y += 16;
      const sigW = (width - 40) / 2;
      doc.moveTo(left, y + 24).lineTo(left + sigW, y + 24).strokeColor(RULE).lineWidth(0.6).stroke();
      doc.moveTo(left + sigW + 40, y + 24).lineTo(right, y + 24).stroke();
      doc.fillColor(MUTED).fontSize(7).font('Helvetica')
        .text(`Employee: ${employee.employee_name}`, left, y + 28, { width: sigW })
        .text(
          `Approved by: ${grid.locked_by_name || grid.reviewed_by_name || '—'}`
          + (grid.supervisor_approved_at ? `  (${fmtDate(grid.supervisor_approved_at)})` : ''),
          left + sigW + 40, y + 28, { width: sigW }
        );

      doc.end();
    } catch (error) {
      console.error('Error generating timesheet PDF:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Failed to generate the timesheet PDF' });
      }
    }
  }

  // ==========================================================================
  // 2. ONE TIMESHEET -> EXCEL
  // ==========================================================================

  async generateTimesheetExcel(req, res) {
    try {
      const { grid, employee, error, message } = await this.loadViewableTimesheet(req.params.id, req.user);
      if (error) return res.status(error).json({ success: false, error: message });

      const period = `${MONTH_NAMES[grid.period_month - 1]} ${grid.period_year}`;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'ZCC ERP';
      wb.created = new Date();

      const ws = wb.addWorksheet(period.slice(0, 28));

      ws.addRow(['MONTHLY TIMESHEET']).font = { bold: true, size: 14 };
      ws.addRow([period]);
      ws.addRow([]);
      ws.addRow(['Employee', employee.employee_name, '', 'Department', employee.department_name || '—']);
      ws.addRow(['Employee No.', employee.employee_number || '—', '', 'Position',
        employee.position_title || formatRoleLabel(employee.role, employee.job_title)]);
      ws.addRow(['Status', titleise(grid.status), '', 'Standard day', Number(grid.metrics.daily_hours)]);
      ws.addRow(['Working days', Number(grid.metrics.working_days), '', 'Public holidays', Number(grid.metrics.holiday_days)]);
      ws.addRow(['Approved leave', Number(grid.metrics.leave_days), '', 'Available days', Number(grid.metrics.available_days)]);
      ws.addRow(['Expected hours', Number(grid.expected_hours), '', 'Actual hours', Number(grid.total_hours)]);
      ws.addRow(['Completion %', Number(grid.completion_percent)]);
      ws.addRow([]);

      const days = grid.metrics.days;
      const headerRow = [
        'Project code', 'Project', 'Partner', 'Activity description',
        ...days.map((d) => d.day),
        'Total hours', 'Expected hours', 'LOE %', 'Actual %', 'Variance %',
      ];
      const header = ws.addRow(headerRow);
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF006064' } };
      header.alignment = { vertical: 'middle', horizontal: 'center' };

      for (const line of grid.lines) {
        ws.addRow([
          line.project_code || '',
          line.project_name || '',
          line.partner_name || '',
          line.activity_description || '',
          ...days.map((d) => Number(line.hours_by_date[d.date] || 0)),
          Number(line.total_hours),
          Number(line.expected_hours),
          Number(line.loe_percent),
          Number(line.actual_percent),
          Number(line.variance_percent),
        ]);
      }

      const totals = ws.addRow([
        'TOTAL', '', '', '',
        ...days.map((d) => Number(grid.daily_totals[d.date] || 0)),
        Number(grid.total_hours),
        Number(grid.expected_hours),
        100, 100, 0,
      ]);
      totals.font = { bold: true };

      // Shade the days nobody is expected to work.
      const headerRowNumber = header.number;
      days.forEach((d, i) => {
        if (d.is_expected) return;
        const colIndex = 5 + i;
        for (let r = headerRowNumber; r <= totals.number; r += 1) {
          ws.getCell(r, colIndex).fill = {
            type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDF1F2' },
          };
        }
      });

      ws.getColumn(1).width = 14;
      ws.getColumn(2).width = 40;
      ws.getColumn(3).width = 26;
      ws.getColumn(4).width = 44;
      days.forEach((_, i) => { ws.getColumn(5 + i).width = 5; });
      for (let i = 0; i < 5; i += 1) ws.getColumn(5 + days.length + i).width = 14;

      // A second sheet with the day-by-day classification, so the expected
      // hours can be checked against holidays and leave.
      const cal = wb.addWorksheet('Calendar');
      cal.addRow(['Date', 'Weekday', 'Working day', 'Public holiday', 'Approved leave', 'Counts towards expected'])
        .font = { bold: true };
      for (const d of days) {
        cal.addRow([
          d.date,
          ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][d.weekday - 1],
          d.is_work_day ? 'Yes' : 'No',
          d.holiday_name || '',
          d.leave_type || '',
          d.is_expected ? 'Yes' : 'No',
        ]);
      }
      cal.getColumn(1).width = 14;
      cal.getColumn(2).width = 12;
      cal.getColumn(3).width = 14;
      cal.getColumn(4).width = 30;
      cal.getColumn(5).width = 22;
      cal.getColumn(6).width = 24;

      const fileName = `timesheet-${employee.employee_number || employee.id}-${grid.period_year}-${String(grid.period_month).padStart(2, '0')}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      await wb.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Error generating timesheet Excel:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Failed to generate the timesheet workbook' });
      }
    }
  }

  // ==========================================================================
  // 3. DEPARTMENT / ORGANISATION REPORT -> EXCEL
  // ==========================================================================

  async generateReportExcel(req, res) {
    try {
      if (!hasTeamTimesheetAccess(req.user)) {
        return res.status(403).json({ success: false, error: 'You do not have access to this report' });
      }

      const now = new Date();
      const year = parseIntOr(req.query.year, now.getFullYear());
      const month = req.query.month ? parseIntOr(req.query.month, null) : null;
      const scope = await this.resolveScope(req.user, req.query.departmentId);

      const filters = {
        year,
        month,
        departmentId: scope.departmentId,
        employeeId: req.query.employeeId ? parseIntOr(req.query.employeeId, null) : null,
        status: req.query.status || null,
        projectId: req.query.projectId ? parseIntOr(req.query.projectId, null) : null,
        partnerId: req.query.partnerId ? parseIntOr(req.query.partnerId, null) : null,
      };

      const wb = new ExcelJS.Workbook();
      wb.creator = 'ZCC ERP';
      wb.created = new Date();

      const headerStyle = (row) => {
        row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF006064' } };
      };

      // ── Sheet 1: completion tracker for the month ───────────────────────
      // Includes people who have not started, which is the whole point.
      if (month) {
        const tracker = await timesheetService.getPeriodTracker({
          year,
          month,
          departmentId: filters.departmentId,
          status: filters.status,
          employeeId: filters.employeeId,
          projectId: filters.projectId,
        });

        const ws = wb.addWorksheet('Completion tracker');
        ws.addRow([`Timesheet completion — ${MONTH_NAMES[month - 1]} ${year}`]).font = { bold: true, size: 13 };
        ws.addRow([`Scope: ${scope.scopeLabel}`]);
        ws.addRow([]);
        headerStyle(ws.addRow([
          'Employee', 'Employee No.', 'Department', 'Position', 'Role', 'Status',
          'Working days', 'Holidays', 'Leave days', 'Available days',
          'Expected hours', 'Actual hours', 'Completion %',
          'Submitted', 'Approved', 'Approved by',
        ]));

        for (const r of tracker) {
          ws.addRow([
            r.employee_name, r.employee_number || '', r.department_name || '',
            r.position_title || '', formatRoleLabel(r.role, null), titleise(r.status),
            Number(r.working_days), Number(r.holiday_days), Number(r.leave_days),
            Number(r.available_days),
            Number(r.expected_hours), Number(r.actual_hours), Number(r.completion_percent),
            r.submitted_at ? fmtDate(r.submitted_at) : '',
            r.approved_at ? fmtDate(r.approved_at) : '',
            r.approved_by_name || '',
          ]);
        }
        ws.columns.forEach((c, i) => { c.width = i < 5 ? 26 : 14; });
      }

      // ── Sheet 2: the timesheets themselves ──────────────────────────────
      const list = await timesheetService.listTimesheets({ ...filters, page: 1, limit: 5000 });
      const ws2 = wb.addWorksheet('Timesheets');
      ws2.addRow([`Timesheets — ${month ? `${MONTH_NAMES[month - 1]} ` : ''}${year}`])
        .font = { bold: true, size: 13 };
      ws2.addRow([`Scope: ${scope.scopeLabel}`]);
      ws2.addRow([]);
      headerStyle(ws2.addRow([
        'Employee', 'Employee No.', 'Department', 'Month', 'Year', 'Status',
        'Expected hours', 'Actual hours', 'Completion %',
        'Working days', 'Holidays', 'Leave days',
        'Submitted', 'Approved', 'Approved by', 'Rejection / return reason',
      ]));
      for (const r of list.data) {
        ws2.addRow([
          r.employee_name, r.employee_number || '', r.department_name || '',
          r.month_name, r.year, titleise(r.status),
          Number(r.expected_hours), Number(r.total_hours), Number(r.completion_percent),
          Number(r.working_days), Number(r.holiday_days), Number(r.leave_days),
          r.submitted_at ? fmtDate(r.submitted_at) : '',
          r.approved_at ? fmtDate(r.approved_at) : '',
          r.approved_by_name || '',
          r.rejection_reason || r.returned_reason || '',
        ]);
      }
      ws2.columns.forEach((c, i) => { c.width = i < 3 ? 26 : 15; });

      // ── Sheet 3: LOE % vs Actual % by project line ──────────────────────
      const lineParams = [year];
      const lineWhere = ['t.period_year = ?'];
      if (month)                { lineWhere.push('t.period_month = ?');  lineParams.push(month); }
      if (filters.departmentId) { lineWhere.push('e.department_id = ?'); lineParams.push(filters.departmentId); }
      if (filters.employeeId)   { lineWhere.push('t.employee_id = ?');   lineParams.push(filters.employeeId); }
      if (filters.projectId)    { lineWhere.push('l.project_id = ?');    lineParams.push(filters.projectId); }
      if (filters.partnerId)    { lineWhere.push('p.donor_id = ?');      lineParams.push(filters.partnerId); }
      if (filters.status) {
        if (filters.status === TIMESHEET_STATUS.LOCKED) {
          lineWhere.push("t.status = 'APPROVED' AND t.locked_at IS NOT NULL");
        } else {
          lineWhere.push('t.status = ?');
          lineParams.push(filters.status);
        }
      }

      const lines = await query(
        `SELECT CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
                e.employee_number, d.department_name,
                t.period_month, t.period_year, t.status, t.locked_at,
                t.expected_hours, t.total_hours,
                p.project_code, p.project_name,
                dn.donor_name AS partner_name, dn.donor_code AS partner_code,
                l.loe_percent, l.total_hours AS line_hours, l.activity_description
           FROM hr_timesheet_lines l
           JOIN hr_timesheets t    ON l.timesheet_id = t.id
           JOIN hr_employees e     ON t.employee_id = e.id
           LEFT JOIN departments d ON e.department_id = d.id
           LEFT JOIN projects p    ON l.project_id = p.id
           LEFT JOIN donors dn     ON p.donor_id = dn.id
          WHERE ${lineWhere.join(' AND ')}
          ORDER BY d.department_name, e.first_name, t.period_month, l.sort_order`,
        lineParams
      );

      const ws3 = wb.addWorksheet('Project allocation');
      headerStyle(ws3.addRow([
        'Employee', 'Employee No.', 'Department', 'Month', 'Year', 'Status',
        'Project code', 'Project', 'Partner', 'Activity description',
        'LOE %', 'Expected hours', 'Actual hours', 'Actual %', 'Variance %',
      ]));
      for (const r of lines) {
        const expectedLine = Number(r.expected_hours) * (Number(r.loe_percent) / 100);
        const actualPct = Number(r.total_hours) > 0
          ? (Number(r.line_hours) / Number(r.total_hours)) * 100 : 0;
        ws3.addRow([
          r.employee_name, r.employee_number || '', r.department_name || '',
          MONTH_NAMES[r.period_month - 1], r.period_year,
          titleise(timesheetService.displayStatus(r)),
          r.project_code || '', r.project_name || '', r.partner_name || '',
          r.activity_description || '',
          Number(r.loe_percent),
          Math.round(expectedLine * 100) / 100,
          Number(r.line_hours),
          Math.round(actualPct * 100) / 100,
          Math.round((actualPct - Number(r.loe_percent)) * 100) / 100,
        ]);
      }
      ws3.columns.forEach((c, i) => { c.width = i < 3 || i === 7 || i === 9 ? 30 : 14; });

      // ── Sheet 4: project and partner roll-up ────────────────────────────
      const summary = await timesheetService.getProjectSummary({
        year,
        month,
        departmentId: filters.departmentId,
        projectId: filters.projectId,
        partnerId: filters.partnerId,
        includeUnapproved: req.query.includeUnapproved === 'true',
      });
      const ws4 = wb.addWorksheet('Project summary');
      ws4.addRow([
        req.query.includeUnapproved === 'true'
          ? 'All timesheets, including those not yet approved'
          : 'Approved timesheets only',
      ]).font = { italic: true };
      ws4.addRow([]);
      headerStyle(ws4.addRow([
        'Project code', 'Project', 'Partner', 'Partner code',
        'Staff', 'Timesheets', 'Average LOE %', 'Actual hours', 'Share of hours %',
      ]));
      for (const r of summary) {
        ws4.addRow([
          r.project_code || '', r.project_name || '', r.partner_name || '', r.partner_code || '',
          r.staff_count, r.timesheet_count,
          Number(r.average_loe_percent), Number(r.actual_hours), Number(r.actual_percent),
        ]);
      }
      ws4.columns.forEach((c, i) => { c.width = i === 1 || i === 2 ? 40 : 16; });

      const fileName = `timesheet-report-${year}${month ? `-${String(month).padStart(2, '0')}` : ''}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      await wb.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Error generating timesheet report:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Failed to generate the report' });
      }
    }
  }
}

module.exports = new TimesheetExportController();
