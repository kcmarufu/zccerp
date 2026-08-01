/**
 * Shared PDF download utility.
 * Uses html2pdf.js to convert HTML strings to downloadable PDFs
 * without opening a print dialog.
 */
import html2pdf from 'html2pdf.js';

/** Build a full travel-claim page HTML block (starts with a page-break div). */
export const buildTravelClaimPageHTML = (claim: any, requestCode: string): string => {
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

  <div style="margin-top:18px;padding-top:8px;border-top:1px solid #ccc">
    <div style="font-size:9px;color:#666">ERP Connect - Zimbabwe Council of Churches &nbsp;|&nbsp; CONFIDENTIAL &nbsp;|&nbsp; Generated: ${new Date().toLocaleString('en-GB')}</div>
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
      // 'avoid-all' refuses to split ANY element, so a table that doesn't fit in
      // the space left on a page is pushed whole to the next one, leaving a large
      // blank gap. Let content flow instead and only keep individual rows intact.
      pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.page-footer'] }
    })
    .from(content)
    .save();
};

/**
 * Single source of truth for the Purchase Order PDF.
 * Every PO in the system renders through this so the layout cannot drift
 * between the list, the detail page and the approvals desk.
 */
export const buildPurchaseOrderHTML = (request: any): string => {
  const items: any[] = request.items || [];
  const quotations: any[] = request.quotations || [];
  const selectedQuot: any = quotations.find((q: any) => q.is_selected);
  const reqCode = request.request_code;

  const poDate = request.final_finance_approved_at
    ? new Date(request.final_finance_approved_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  const totalAmount = selectedQuot
    ? Number(selectedQuot.total_amount || 0)
    : items.reduce((s: number, it: any) => s + Number(it.quantity || 1) * Number(it.estimated_unit_price || 0), 0);

  const itemRows = items.map((item: any, i: number) => {
    const unitPrice = Number(item.estimated_unit_price || 0);
    const lineTotal = Number(item.quantity || 1) * unitPrice;
    return `<tr>
      <td>${i + 1}</td>
      <td>${item.item_description || item.description || '—'}</td>
      <td>${item.specifications || '—'}</td>
      <td align="right">${Number(item.quantity || 1)}</td>
      <td>${item.unit || item.unit_of_measure || 'pcs'}</td>
      <td align="right">$${unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      <td align="right">$${lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Purchase Order — ${reqCode}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; margin: 0; padding: 24px; background: #fff; }
  .po-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #006064; padding-bottom: 14px; margin-bottom: 20px; }
  .org-name { font-size: 11px; font-weight: bold; color: #006064; }
  .po-title { font-size: 22px; font-weight: bold; color: #006064; margin: 4px 0 2px; }
  .po-sub { font-size: 11px; color: #555; }
  .po-ref-box { text-align: right; }
  .po-ref { font-size: 15px; font-weight: bold; color: #006064; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #006064; color: #fff; padding: 7px 8px; font-size: 11px; text-align: left; }
  td { padding: 6px 8px; border-bottom: 1px solid #e0e0e0; font-size: 11px; }
  .total-row td { font-weight: bold; background: #e0f7fa; border-top: 2px solid #006064; }
  .page-footer { margin-top: 30px; border-top: 1px solid #ccc; padding-top: 6px; font-size: 10px; color: #888; }
</style></head><body>
<div class="po-header">
  <div>
    <div class="org-name">ZIMBABWE COUNCIL OF CHURCHES (ZCC)</div>
    <div class="po-title">PURCHASE ORDER</div>
    <div class="po-sub">Official Procurement Document</div>
  </div>
  <div class="po-ref-box">
    <div class="po-ref">PO-${reqCode}</div>
    <div style="font-size:11px;color:#555;">Date: ${poDate}</div>
    ${selectedQuot ? `<div style="font-size:11px;color:#555;">Supplier: ${selectedQuot.vendor_name || selectedQuot.vendor_company || '—'}</div>` : ''}
    ${selectedQuot?.quotation_number ? `<div style="font-size:11px;color:#555;">Quotation Ref: ${selectedQuot.quotation_number}</div>` : ''}
  </div>
</div>
<table><thead><tr><th>#</th><th>Description</th><th>Specifications</th><th align="right">Qty</th><th>Unit</th><th align="right">Unit Price</th><th align="right">Total</th></tr></thead>
<tbody>${itemRows}
<tr class="total-row"><td colspan="6" align="right">GRAND TOTAL:</td><td align="right">$${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
</tbody></table>
<div class="page-footer">
  <div>Generated: ${new Date().toLocaleString('en-GB')} &nbsp;|&nbsp; ERP Connect — Zimbabwe Council of Churches &nbsp;|&nbsp; OFFICIAL DOCUMENT</div>
</div>
</body></html>`;
};
