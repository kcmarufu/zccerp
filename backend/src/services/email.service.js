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

// The Resend plan allows 50,000 emails a month. The caps stop well short of
// it, so a fault (a loop, a bulk job) cannot use up the month's allowance.
// Both can be changed in .env without a code change.
const DEFAULT_MONTHLY_CAP = 45000;
const DEFAULT_DAILY_CAP = 3000;
// The same subject to the same person within this window is a double click or
// a repeated step, not news: it is not sent twice.
const DUPLICATE_WINDOW_MINUTES = 10;
// Resend refuses bursts; messages leave one at a time with this gap.
const MIN_GAP_MS = 600;
// Domains whose mailboxes do not receive mail. zcc-eco.org mailboxes are not
// working; gmail.org is a mistyped gmail.com. Override with EMAIL_SKIP_DOMAINS.
const DEFAULT_SKIP_DOMAINS = 'zcc-eco.org,gmail.org';
const ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

const listFromEnv = (name, fallback) => String(process.env[name] ?? fallback)
  .split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);

class EmailService {

  constructor() {
    this._queue = Promise.resolve();
    this._lastSentAt = 0;
  }

  /** Why this address gets no mail, or null when it may be sent to. */
  _skipReason(to) {
    const address = String(to || '').trim().toLowerCase();
    if (!ADDRESS_PATTERN.test(address)) return 'invalid address';
    const domain = address.split('@')[1];
    if (listFromEnv('EMAIL_SKIP_DOMAINS', DEFAULT_SKIP_DOMAINS).includes(domain)) return `domain ${domain} is skipped`;
    if (listFromEnv('EMAIL_SKIP_ADDRESSES', '').includes(address)) return 'address is skipped';
    return null;
  }

  /** Every attempt is recorded; a missing log table must not stop mail. */
  async _log(to, subject, status, detail = null) {
    try {
      const { query } = require('../config/database');
      await query(
        'INSERT INTO email_log (to_email, subject, status, detail) VALUES (?, ?, ?, ?)',
        [String(to).slice(0, 255), String(subject).slice(0, 255), status, detail ? String(detail).slice(0, 500) : null]
      );
    } catch (err) {
      console.error(`[EmailService] Could not log email: ${err.message}`);
    }
  }

  /** Null when sending is allowed; otherwise why it is held back. */
  async _quotaRefusal(to, subject) {
    try {
      const { query } = require('../config/database');
      const [row] = await query(
        `SELECT COUNT(*) AS month_sent,
                COALESCE(SUM(created_at >= CURDATE()), 0) AS day_sent,
                COALESCE(SUM(to_email = ? AND subject = ? AND created_at >= NOW() - INTERVAL ${DUPLICATE_WINDOW_MINUTES} MINUTE), 0) AS duplicates
           FROM email_log
          WHERE status = 'SENT' AND created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
        [String(to).slice(0, 255), String(subject).slice(0, 255)]
      );
      const monthlyCap = Number(process.env.EMAIL_MONTHLY_CAP) || DEFAULT_MONTHLY_CAP;
      const dailyCap = Number(process.env.EMAIL_DAILY_CAP) || DEFAULT_DAILY_CAP;
      if (Number(row.duplicates) > 0) return { status: 'DUPLICATE', detail: `already sent within ${DUPLICATE_WINDOW_MINUTES} minutes` };
      if (Number(row.month_sent) >= monthlyCap) return { status: 'CAPPED', detail: `monthly cap of ${monthlyCap} reached` };
      if (Number(row.day_sent) >= dailyCap) return { status: 'CAPPED', detail: `daily cap of ${dailyCap} reached` };
      return null;
    } catch (err) {
      console.error(`[EmailService] Could not check the sending caps: ${err.message}`);
      return null;
    }
  }

  /** Messages leave one at a time, spaced out, in the order they were asked for. */
  send(mail) {
    const run = this._queue.then(() => this._send(mail));
    this._queue = run.catch(() => {});
    return run;
  }

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
  async _send({ to, subject, heading, intro, details = [], link = null, tone = 'info' }) {
    if (!to) return false;
    const skip = this._skipReason(to);
    if (skip) {
      console.log(`[EmailService] Skipped (${skip}) to=${to} subject="${subject}"`);
      await this._log(to, subject, 'SKIPPED', skip);
      return false;
    }
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.log(`[EmailService] Not sent (no RESEND_API_KEY) to=${to} subject="${subject}"`);
      await this._log(to, subject, 'NO_KEY');
      return false;
    }
    const refusal = await this._quotaRefusal(to, subject);
    if (refusal) {
      console.log(`[EmailService] Not sent (${refusal.detail}) to=${to} subject="${subject}"`);
      await this._log(to, subject, refusal.status, refusal.detail);
      return false;
    }
    const wait = this._lastSentAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));

    const body = JSON.stringify({
      from: process.env.EMAIL_FROM || DEFAULT_FROM,
      to: [to],
      subject,
      html: this._render({ heading, intro, details, link, tone })
    });

    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const res = await fetch(RESEND_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(15000)
        });
        this._lastSentAt = Date.now();
        if (res.ok) {
          console.log(`[EmailService] Sent to=${to} subject="${subject}"`);
          await this._log(to, subject, 'SENT');
          return true;
        }
        lastError = `Resend ${res.status}: ${await res.text()}`;
        console.error(`[EmailService] ${lastError} to=${to} subject="${subject}"`);
        if (res.status !== 429 && res.status < 500) break;
      } catch (err) {
        lastError = err.message;
        console.error(`[EmailService] Failed to=${to} subject="${subject}": ${err.message}`);
      }
      if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
    await this._log(to, subject, 'FAILED', lastError);
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
