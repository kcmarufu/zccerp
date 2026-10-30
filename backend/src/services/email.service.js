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
   */
  async send({ to, subject, heading, intro, details = [], link = null }) {
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
      html: this._render({ heading, intro, details, link })
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

  _render({ heading, intro, details, link }) {
    const appUrl = (process.env.APP_URL || DEFAULT_APP_URL).replace(/\/+$/, '');
    const rows = details
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([label, value]) => `
        <tr>
          <td style="padding:6px 16px 6px 0;color:#555;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td>
          <td style="padding:6px 0;color:#1a1a1a">${escapeHtml(value)}</td>
        </tr>`)
      .join('');

    return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f4f6f6;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-top:4px solid #006064;padding:24px">
    <div style="font-size:12px;font-weight:bold;color:#006064;letter-spacing:.4px">ERP Connect &mdash; Zimbabwe Council of Churches</div>
    <h1 style="font-size:18px;margin:12px 0;color:#1a1a1a">${escapeHtml(heading)}</h1>
    <p style="margin:0 0 16px;color:#1a1a1a">${escapeHtml(intro)}</p>
    ${rows ? `<table style="border-collapse:collapse;margin-bottom:16px;font-size:14px">${rows}</table>` : ''}
    ${link ? `<a href="${escapeHtml(appUrl + link)}" style="display:inline-block;background:#006064;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:4px;font-weight:bold">Open in ERP Connect</a>` : ''}
    <p style="margin:24px 0 0;font-size:12px;color:#777">This message was sent automatically by ERP Connect. Please do not reply to it.</p>
  </div>
</body></html>`;
  }
}

module.exports = new EmailService();
