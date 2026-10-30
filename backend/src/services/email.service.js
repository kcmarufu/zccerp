/**
 * Email Service
 * Sends one formatted message through Resend. Silent like the in-app
 * notifications: a mail failure is logged and never reaches the workflow.
 *
 * With no RESEND_API_KEY nothing leaves the server; the message is only logged.
 * A scratch copy of the app runs that way, so it cannot mail real staff.
 */

const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'ZCC ERP <notifications@erpconnectzw.com>';
const DEFAULT_APP_URL = 'https://erp.erpconnectzw.com';
const RETRY_DELAY_MS = 1500;

const TONES = {
  action: { label: 'ACTION NEEDED', background: '#fef3c7', color: '#92400e' },
  approved: { label: 'APPROVED', background: '#dcfce7', color: '#166534' },
  rejected: { label: 'REJECTED', background: '#fee2e2', color: '#991b1b' },
  info: { label: 'UPDATE', background: '#e0f2f1', color: '#00695c' }
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

class EmailService {

  /**
   * @param {object}   mail
   * @param {string}   mail.to       one address
   * @param {string}   mail.subject
   * @param {string}   mail.heading  first line of the message
   * @param {string}   mail.intro    what happened and what is needed
   * @param {Array<[string, any]>} mail.details  label/value rows; empty values are dropped
   * @param {string}   mail.link     path inside the app, e.g. /finance/approvals
   * @param {string}   mail.tone     badge above the heading: action, approved, rejected or info
   */
  async send({ to, subject, heading, intro, details = [], link = null, tone = 'info' }) {
    if (!to) return false;
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.log(`[EmailService] Not sent (no RESEND_API_KEY) to=${to} subject="${subject}"`);
      return false;
    }

    const body = JSON.stringify({
      from: process.env.EMAIL_FROM || DEFAULT_FROM,
      to: [to],
      subject,
      html: this._render({ heading, intro, details, link, tone })
    });

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const res = await fetch(RESEND_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(15000)
        });
        if (res.ok) {
          console.log(`[EmailService] Sent to=${to} subject="${subject}"`);
          return true;
        }
        const detail = await res.text();
        console.error(`[EmailService] Resend ${res.status} to=${to} subject="${subject}": ${detail}`);
        if (res.status !== 429 && res.status < 500) return false;
      } catch (err) {
        console.error(`[EmailService] Failed to=${to} subject="${subject}": ${err.message}`);
      }
      if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
    return false;
  }

  _render({ heading, intro, details, link, tone }) {
    const appUrl = (process.env.APP_URL || DEFAULT_APP_URL).replace(/\/+$/, '');
    const badge = TONES[tone] || TONES.info;
    const rows = details
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([label, value], index) => `
          <tr>
            <td style="padding:12px 16px;width:34%;vertical-align:top;font-size:13px;color:#64748b;${index ? 'border-top:1px solid #e2e8f0;' : ''}">${escapeHtml(label)}</td>
            <td style="padding:12px 16px;vertical-align:top;font-size:14px;font-weight:600;color:#0f172a;${index ? 'border-top:1px solid #e2e8f0;' : ''}">${escapeHtml(value)}</td>
          </tr>`)
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:#eef2f4;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef2f4">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
          <tr>
            <td style="background-color:#006064;border-radius:14px 14px 0 0;padding:24px 32px">
              <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:.2px">ERP Connect</div>
              <div style="font-size:13px;color:#b2dfdb;padding-top:2px">Zimbabwe Council of Churches</div>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:32px">
              <span style="display:inline-block;background-color:${badge.background};color:${badge.color};font-size:12px;font-weight:700;letter-spacing:.3px;padding:5px 12px;border-radius:999px">${badge.label}</span>
              <h1 style="margin:16px 0 8px;font-size:24px;line-height:1.3;font-weight:700;color:#0f172a">${escapeHtml(heading)}</h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155">${escapeHtml(intro)}</p>
              ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f0;border-radius:10px;border-collapse:separate;background-color:#f8fafc;margin-bottom:28px">${rows}
              </table>` : ''}
              ${link ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:#006064;border-radius:8px"><a href="${escapeHtml(appUrl + link)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">Open in ERP Connect &rarr;</a></td></tr></table>` : ''}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 14px 14px;padding:24px 32px;text-align:center">
              <div style="font-size:15px;font-weight:600;color:#006064">Together, Let's Make the World a Better Place</div>
              <div style="font-size:13px;color:#475569;padding-top:6px">Made with Love by KC Marufu</div>
              <div style="font-size:12px;color:#94a3b8;padding-top:14px">This message was sent automatically by ERP Connect. Please do not reply to it.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}

module.exports = new EmailService();
