/**
 * Shared PDF download utility.
 * Uses html2pdf.js to convert HTML strings to downloadable PDFs
 * without opening a print dialog.
 */
import html2pdf from 'html2pdf.js';

/** Build a full travel-claim page HTML block (starts with a page-break div). */
export const buildTravelClaimPageHTML = (claim: any, requestCode: string, poweredBy: string): string => {
  const fmtAmt = (v: any) => '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const payable = Number(claim.amount_payable) >= 0;

  const tripRows = (claim.trip_items || []).map((t: any, _i: number) => `
    <tr>
      <td style="padding:4px 6px;border-bottom:1px solid #e0e0e0;white-space:nowrap">${t.trip_date ? new Date(t.trip_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #e0e0e0;white-space:nowrap">${t.return_date ? new Date(t.return_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #e0e0e0">${t.recipient_display_name || t.recipient_name || claim.full_name || '—'}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #e0e0e0">${t.from_location || '—'}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #e0e0e0">${t.to_location || '—'}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #e0e0e0">${t.departure_time || '—'}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #e0e0e0">${t.arrival_time || '—'}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #e0e0e0;max-width:130px">${t.purpose || '—'}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #e0e0e0;text-align:right">${Number(t.rate_breakfast     || 0) > 0 ? fmtAmt(t.rate_breakfast)     : '—'}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #e0e0e0;text-align:right">${Number(t.rate_lunch         || 0) > 0 ? fmtAmt(t.rate_lunch)         : '—'}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #e0e0e0;text-align:right">${Number(t.rate_dinner        || 0) > 0 ? fmtAmt(t.rate_dinner)        : '—'}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #e0e0e0;text-align:right">${Number(t.rate_overnight     || 0) > 0 ? fmtAmt(t.rate_overnight)     : '—'}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #e0e0e0;text-align:right">${Number(t.rate_accommodation || 0) > 0 ? fmtAmt(t.rate_accommodation) : '—'}</td>
      <td style="padding:4px 6px;border-bottom:1px solid #e0e0e0;text-align:right;font-weight:bold;color:#006064">${fmtAmt(t.line_total)}</td>
    </tr>`).join('');

  const distRows = (claim.cost_distribution || []).map((d: any, _i: number) => `
    <tr>
      <td style="padding:4px 7px;border-bottom:1px solid #e0e0e0">${d.account_name}</td>
      <td style="padding:4px 7px;border-bottom:1px solid #e0e0e0">${d.account_code}</td>
      <td style="padding:4px 7px;border-bottom:1px solid #e0e0e0">${d.partner_project || '—'}</td>
      <td style="padding:4px 7px;border-bottom:1px solid #e0e0e0;text-align:right;font-weight:bold">${fmtAmt(d.amount)}</td>
    </tr>`).join('');

  return `
<div style="page-break-before:auto"></div>
<div style="font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a;padding:24px">

  <div style="border-bottom:2px solid #006064;color:#006064;padding:10px 14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="font-size:13px;font-weight:bold;letter-spacing:0.5px;color:#006064">ERP Connect &mdash; Zimbabwe Council of Churches</div>
      <div style="font-size:15px;font-weight:bold;margin-top:2px">Travel &amp; Subsistence Claim</div>
      <div style="font-size:10px;color:#555">${requestCode} &nbsp;|&nbsp; Attached to Float Requisition</div>
    </div>
    <div style="font-size:10px;color:#555">${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:11px">
    <thead><tr style="background:#e0f2f1;color:#004d40"><th colspan="4" style="padding:6px 9px;text-align:left;border-bottom:1.5px solid #006064">A. Employee &amp; Trip Assignment</th></tr></thead>
    <tbody>
      <tr>
        <td style="padding:5px 9px;border-bottom:1px solid #e0e0e0;width:20%;font-weight:bold">Staff Name</td>
        <td style="padding:5px 9px;border-bottom:1px solid #e0e0e0;width:30%">${claim.full_name || '—'}</td>
        <td style="padding:5px 9px;border-bottom:1px solid #e0e0e0;width:20%;font-weight:bold">Designation</td>
        <td style="padding:5px 9px;border-bottom:1px solid #e0e0e0;width:30%">${claim.designation || '—'}</td>
      </tr>
      <tr>
        <td style="padding:5px 9px;border-bottom:1px solid #e0e0e0;font-weight:bold">Project</td>
        <td style="padding:5px 9px;border-bottom:1px solid #e0e0e0">${claim.project_name ? `${claim.project_code} — ${claim.project_name}` : '—'}</td>
        <td style="padding:5px 9px;border-bottom:1px solid #e0e0e0;font-weight:bold">Budget Line</td>
        <td style="padding:5px 9px;border-bottom:1px solid #e0e0e0">${claim.budget_name ? `${claim.budget_code} — ${claim.budget_name}` : '—'}</td>
      </tr>
      ${claim.strategic_focus ? `<tr><td style="padding:5px 9px;font-weight:bold">Purpose of the visit</td><td colspan="3" style="padding:5px 9px">${claim.strategic_focus}</td></tr>` : ''}
    </tbody>
  </table>

  <table style="width:100%;border-collapse:collapse;margin-bottom:14px;font-size:10px">
    <thead>
      <tr style="background:#e0f2f1;color:#004d40">
        <th colspan="14" style="padding:5px 9px;text-align:left;border-bottom:1.5px solid #006064;font-size:11px">B. Trip Items (${(claim.trip_items || []).length})</th>
      </tr>
      <tr style="background:#006064;color:white">
        <th style="padding:5px 6px;text-align:left">Depart</th>
        <th style="padding:5px 6px;text-align:left">Return</th>
        <th style="padding:5px 6px;text-align:left">Recipient</th>
        <th style="padding:5px 6px;text-align:left">From</th>
        <th style="padding:5px 6px;text-align:left">To</th>
        <th style="padding:5px 6px;text-align:left">Dep</th>
        <th style="padding:5px 6px;text-align:left">Arr</th>
        <th style="padding:5px 6px;text-align:left">Purpose</th>
        <th style="padding:5px 6px;text-align:right">B'fast</th>
        <th style="padding:5px 6px;text-align:right">Lunch</th>
        <th style="padding:5px 6px;text-align:right">Dinner</th>
        <th style="padding:5px 6px;text-align:right">O/P</th>
        <th style="padding:5px 6px;text-align:right">Accom.</th>
        <th style="padding:5px 6px;text-align:right">Line Total</th>
      </tr>
    </thead>
    <tbody>
      ${tripRows || '<tr><td colspan="14" style="padding:8px;text-align:center;color:#999;font-style:italic">No trip items recorded</td></tr>'}
      <tr style="font-weight:bold;border-top:1.5px solid #006064">
        <td colspan="13" style="padding:5px 9px;text-align:right">TOTAL CLAIMED:</td>
        <td style="padding:5px 9px;text-align:right;color:#006064;font-size:12px">${fmtAmt(claim.total_claimed)}</td>
      </tr>
    </tbody>
  </table>

  <table style="width:100%;border-collapse:collapse;margin-bottom:14px;font-size:11px">
    <thead><tr style="background:#e0f2f1;color:#004d40"><th colspan="4" style="padding:6px 9px;text-align:left;border-bottom:1.5px solid #006064">C. Financial Summary</th></tr></thead>
    <tbody>
      <tr>
        <td style="padding:5px 9px;border-bottom:1px solid #e0e0e0;width:25%;font-weight:bold">Total Claimed</td>
        <td style="padding:5px 9px;border-bottom:1px solid #e0e0e0;width:25%;font-weight:bold">${fmtAmt(claim.total_claimed)}</td>
        <td style="padding:5px 9px;border-bottom:1px solid #e0e0e0;width:25%;font-weight:bold">Less Outstanding Advance</td>
        <td style="padding:5px 9px;border-bottom:1px solid #e0e0e0;width:25%;font-weight:bold">${fmtAmt(claim.less_outstanding_advance)}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding:7px 9px;font-weight:bold;font-size:14px;color:${payable ? '#2e7d32' : '#bf360c'}">${fmtAmt(Math.abs(Number(claim.amount_payable || 0)))}</td>
        <td colspan="2" style="padding:7px 9px;font-weight:bold;color:${payable ? '#2e7d32' : '#bf360c'}">${payable ? 'Amount Payable to Employee' : 'Surplus to Refund'}</td>
      </tr>
      ${claim.advance_reconciliation_due ? `<tr><td style="padding:5px 9px;font-weight:bold">Reconciliation Due</td><td colspan="3" style="padding:5px 9px;color:#006064;font-weight:bold">${new Date(claim.advance_reconciliation_due).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td></tr>` : ''}
    </tbody>
  </table>

  ${(claim.cost_distribution || []).length > 0 ? `
  <table style="width:100%;border-collapse:collapse;margin-bottom:14px;font-size:11px">
    <thead>
      <tr style="background:#e0f2f1;color:#004d40"><th colspan="4" style="padding:6px 9px;text-align:left;border-bottom:1.5px solid #006064">D. Cost Distribution</th></tr>
      <tr style="background:#006064;color:white;font-size:10px">
        <th style="padding:4px 7px;text-align:left">Account Name</th><th style="padding:4px 7px;text-align:left">Code</th>
        <th style="padding:4px 7px;text-align:left">Partner / Project</th><th style="padding:4px 7px;text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>${distRows}</tbody>
  </table>` : ''}

  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:22px">
    <div style="border-top:1px solid #555;padding-top:5px"><div style="font-size:9px;color:#666">Staff Signature</div><div style="font-size:10px;font-weight:bold;margin-top:2px">${claim.full_name || '___________________'}</div><div style="font-size:9px;color:#999;margin-top:2px">Signature: ___________________</div></div>
    <div style="border-top:1px solid #555;padding-top:5px"><div style="font-size:9px;color:#666">Program Lead / HOP</div><div style="font-size:10px;font-weight:bold;margin-top:2px">___________________</div><div style="font-size:9px;color:#999;margin-top:2px">Signature: ___________________</div></div>
    <div style="border-top:1px solid #555;padding-top:5px"><div style="font-size:9px;color:#666">Finance Clerk</div><div style="font-size:10px;font-weight:bold;margin-top:2px">___________________</div><div style="font-size:9px;color:#999;margin-top:2px">Signature: ___________________</div></div>
  </div>

  <div style="margin-top:18px;padding-top:8px;border-top:1px solid #ccc;display:flex;justify-content:space-between">
    <div style="font-size:9px;color:#666">ERP Connect - Zimbabwe Council of Churches &nbsp;|&nbsp; CONFIDENTIAL &nbsp;|&nbsp; Generated: ${new Date().toLocaleString('en-GB')}</div>
    <div style="font-size:9px;font-weight:bold;color:#006064">${poweredBy}</div>
  </div>

</div>`;
};

/**
 * Returns an empty string — the digital watermark stamp has been disabled
 * for now in favour of clean printable signature lines on every PDF.
 * Kept exported so existing callers compile unchanged.
 */
export const buildDigitalStamp = (_status?: string): string => {
  return '';
};

/**
 * Returns the human-readable role title for the approval trail.
 * FOS (Finance) and AHR (Admin/HR) use department-neutral titles:
 *   PROGRAM_LEAD      → "Department Lead"
 *   HEAD_OF_PROGRAMS  → "Head of Department"
 * All other departments keep the programme-oriented titles.
 */
export const formatApprovalRole = (role: string, deptCode?: string): string => {
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
    case 'GENERAL_USER':     return 'General User';
    default: return (role || '').replace(/_/g, ' ');
  }
};

export const downloadHTMLAsPDF = (htmlString: string, filename: string): void => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  // Extract all <style> blocks and rewrite "body {" → ".pdf-root {"
  // so app styles aren't polluted while the element is briefly in the DOM.
  const styleContent = Array.from(doc.querySelectorAll('style'))
    .map(s => (s.textContent || '').replace(/\bbody\s*\{/g, '.pdf-root {'))
    .join('\n');

  // Extract the stamp (if any) from wherever it was injected and move it to the
  // FIRST position inside .pdf-root. Because the stamp uses position:absolute
  // relative to .pdf-root (position:relative), placing it first in the DOM ensures
  // html2canvas paints it at top:14px/right:14px on page 1 — not on a separate page.
  const stampEl = doc.querySelector('[data-stamp="true"]');
  let stampHTML = '';
  if (stampEl && stampEl.parentNode) {
    stampHTML = stampEl.outerHTML;
    stampEl.parentNode.removeChild(stampEl);
  }

  // Wrap body content.
  // html2pdf creates a <div> internally, so base styles (font, padding, bg)
  // must be applied directly on the wrapper — "body {}" won't auto-apply.
  const content = `
    <div class="pdf-root" style="font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a;background:white;padding:20px;width:780px;box-sizing:border-box;position:relative;">
      ${stampHTML}
      <style>${styleContent}</style>
      ${doc.body.innerHTML}
    </div>
  `;

  html2pdf()
    .set({
      margin: 0,
      filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        scrollY: 0,
        scrollX: 0
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: 'avoid-all' }
    })
    .from(content)
    .save();
};
