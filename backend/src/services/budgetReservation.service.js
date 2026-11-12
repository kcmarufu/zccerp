/**
 * Budget reservations.
 *
 * Once Finance approves a float requisition or a purchase request, its amount
 * is held on its budget lines for up to RESERVATION_WORKING_DAYS working days.
 * Held money is out of everyone else's available balance — it cannot be
 * requested, approved or paid against by another request — but it is not yet
 * spent: `budget_lines.spent_amount` still moves only when the money does
 * (float dispatch, purchase request payment).
 *
 *   ACTIVE    holding funds
 *   CONSUMED  the money moved (dispatch / paid in full) — the hold became a deduction
 *   RELEASED  the request left the approved state (rejected, reversed, cancelled)
 *   EXPIRED   not dispatched / paid within the window — the request was
 *             rejected automatically and the funds released
 *
 * One row per request and budget line. A purchase request's hold shrinks as
 * it is paid: each line holds only what is still to be paid on it.
 *
 * Available balance = allocated − spent − active reservations (of others).
 */

const { query, transaction, logger } = require('../config/database');

const RESERVATION_WORKING_DAYS = 10;
const POP_DEADLINE_WORKING_DAYS = 5;
const SOURCE = { FLOAT: 'FLOAT', PR: 'PR' };

const toCents = (v) => Math.round((Number(v) || 0) * 100);
const money = (cents) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** `n` working days (Mon–Fri) after `from`, same time of day. */
function addWorkingDays(from, n) {
  const d = new Date(from);
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) left--;
  }
  return d;
}

/** Working days (Mon–Fri) strictly after `from` up to and including `to`; both SQL DATEs. */
const workingDaysBetweenSql = (from, to) => `
  CAST(5 * ((TO_DAYS(${to}) - WEEKDAY(${to}) - TO_DAYS(${from}) + WEEKDAY(${from})) / 7)
       + LEAST(WEEKDAY(${to}) + 1, 5) - LEAST(WEEKDAY(${from}) + 1, 5)
       AS SIGNED)`;

/**
 * SQL for the amount held on budget line `${alias}.id` by active reservations,
 * optionally leaving out one request's own hold (so a request is never short
 * of the money it reserved for itself).
 */
const reservedSql = (alias = 'bl', exclude = null) => {
  const own = exclude
    ? ` AND NOT (br.source_type = '${exclude.type === SOURCE.PR ? 'PR' : 'FLOAT'}' AND br.source_id = ${Number(exclude.id) || 0})`
    : '';
  return `(SELECT COALESCE(SUM(br.amount), 0) FROM budget_reservations br
            WHERE br.budget_line_id = ${alias}.id AND br.status = 'ACTIVE'${own})`;
};

const runner = (conn) => (conn ? (sql, p) => conn.execute(sql, p).then((r) => r[0]) : query);

let systemUserId;
/** The deactivated System account automatic actions are logged under. */
async function getSystemUserId(conn = null) {
  if (systemUserId) return systemUserId;
  try {
    const rows = await runner(conn)("SELECT id FROM users WHERE employee_id = 'SYSTEM' LIMIT 1", []);
    if (rows.length) systemUserId = rows[0].id;
  } catch (_) { /* migration not yet run */ }
  return systemUserId || null;
}

/** Held amount per budget line, excluding `exclude` ({type, id}) when given. */
async function reservedByLine(conn, lineIds, exclude = null) {
  const ids = [...new Set((lineIds || []).map(Number).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;
  try {
    const params = [...ids];
    let own = '';
    if (exclude) {
      own = ' AND NOT (source_type = ? AND source_id = ?)';
      params.push(exclude.type, Number(exclude.id));
    }
    const rows = await runner(conn)(
      `SELECT budget_line_id, SUM(amount) AS held FROM budget_reservations
        WHERE status = 'ACTIVE' AND budget_line_id IN (${ids.map(() => '?').join(',')})${own}
        GROUP BY budget_line_id`,
      params
    );
    for (const r of rows) map.set(Number(r.budget_line_id), toCents(r.held));
  } catch (err) {
    if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
  }
  return map;
}

/** What a float takes from each budget line (cents). */
async function floatLines(conn, floatId) {
  const rows = await runner(conn)(
    `SELECT budget_line_id, SUM(quantity * unit_price) AS total
       FROM request_items WHERE request_id = ? AND budget_line_id IS NOT NULL
      GROUP BY budget_line_id`,
    [floatId]
  );
  return rows.map((r) => ({ budget_line_id: Number(r.budget_line_id), cents: toCents(r.total) }))
    .filter((l) => l.cents > 0);
}

/**
 * Refuse when any line cannot hold its share: what the line has left after
 * spending and after everyone else's holds must cover it. Locks the lines.
 */
async function assertCanReserve(conn, lines, exclude, action = 'approve this request') {
  if (!lines.length) return;
  const held = await reservedByLine(conn, lines.map((l) => l.budget_line_id), exclude);
  const problems = [];
  for (const l of lines) {
    const [bl] = await conn.execute(
      'SELECT budget_code, budget_name, (allocated_amount - spent_amount) AS balance FROM budget_lines WHERE id = ? FOR UPDATE',
      [l.budget_line_id]
    );
    if (!bl.length) continue;
    const others = held.get(Number(l.budget_line_id)) || 0;
    const available = toCents(bl[0].balance) - others;
    if (l.cents > available) {
      problems.push(
        `${bl[0].budget_code} has ${money(Math.max(0, available))} available`
        + (others > 0 ? ` (${money(others)} is reserved for other approved requests)` : '')
        + ` but this request needs ${money(l.cents)}`
      );
    }
  }
  if (problems.length) {
    const err = new Error(`Insufficient funds — you cannot ${action} until the budget is topped up. ${problems.join('; ')}.`);
    err.insufficientFunds = problems;
    throw err;
  }
}

/**
 * Make a request's hold match `lines` exactly: lines with an amount are held
 * (created, re-opened or resized), lines no longer needed are closed as
 * `closeAs`. `expiresAt` undefined keeps the current expiry; null clears it.
 * Returns the total now held, in cents.
 */
async function syncReservation(conn, type, sourceId, lines, user, { expiresAt, closeAs = 'CONSUMED', reason = null } = {}) {
  const [existing] = await conn.execute(
    'SELECT * FROM budget_reservations WHERE source_type = ? AND source_id = ? FOR UPDATE',
    [type, sourceId]
  );
  const byLine = new Map(existing.map((r) => [Number(r.budget_line_id), r]));
  const wanted = new Map(lines.filter((l) => l.cents > 0).map((l) => [Number(l.budget_line_id), l.cents]));
  let total = 0;

  for (const [lineId, cents] of wanted) {
    total += cents;
    const row = byLine.get(lineId);
    if (!row) {
      await conn.execute(
        `INSERT INTO budget_reservations (source_type, source_id, budget_line_id, amount, status, reserved_at, expires_at, reserved_by)
         VALUES (?, ?, ?, ?, 'ACTIVE', NOW(), ?, ?)`,
        [type, sourceId, lineId, cents / 100, expiresAt || null, user?.id || null]
      );
    } else if (row.status !== 'ACTIVE') {
      await conn.execute(
        `UPDATE budget_reservations
            SET amount = ?, status = 'ACTIVE', reserved_at = NOW(), expires_at = ?, reserved_by = ?,
                closed_at = NULL, closed_by = NULL, close_reason = NULL
          WHERE id = ?`,
        [cents / 100, expiresAt || null, user?.id || null, row.id]
      );
    } else {
      await conn.execute(
        `UPDATE budget_reservations SET amount = ?${expiresAt !== undefined ? ', expires_at = ?' : ''} WHERE id = ?`,
        expiresAt !== undefined ? [cents / 100, expiresAt, row.id] : [cents / 100, row.id]
      );
    }
  }
  for (const row of existing) {
    if (row.status === 'ACTIVE' && !wanted.has(Number(row.budget_line_id))) {
      await conn.execute(
        `UPDATE budget_reservations SET status = ?, closed_at = NOW(), closed_by = ?, close_reason = ? WHERE id = ?`,
        [closeAs, user?.id || null, reason, row.id]
      );
    }
  }
  return total;
}

/** Close every active hold of a request. Returns the amount that was held, in cents. */
async function closeReservation(conn, type, sourceId, status, user, reason) {
  let rows;
  try {
    [rows] = await conn.execute(
      "SELECT id, amount FROM budget_reservations WHERE source_type = ? AND source_id = ? AND status = 'ACTIVE' FOR UPDATE",
      [type, sourceId]
    );
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') return 0;
    throw err;
  }
  if (!rows.length) return 0;
  await conn.execute(
    `UPDATE budget_reservations SET status = ?, closed_at = NOW(), closed_by = ?, close_reason = ?
      WHERE source_type = ? AND source_id = ? AND status = 'ACTIVE'`,
    [status, user?.id || null, reason ? String(reason).slice(0, 255) : null, type, sourceId]
  );
  return rows.reduce((s, r) => s + toCents(r.amount), 0);
}

/** The hold on one request, for display. */
async function getReservation(type, sourceId) {
  let rows = [];
  try {
    rows = await query(
      `SELECT br.*, bl.budget_code, bl.budget_name
         FROM budget_reservations br JOIN budget_lines bl ON bl.id = br.budget_line_id
        WHERE br.source_type = ? AND br.source_id = ?
        ORDER BY bl.budget_code`,
      [type, sourceId]
    );
  } catch (err) {
    if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
  }
  if (!rows.length) return null;
  const active = rows.filter((r) => r.status === 'ACTIVE');
  const shown = active.length ? active : rows;
  const expiries = active.map((r) => r.expires_at).filter(Boolean).map((d) => new Date(d).getTime());
  return {
    status: active.length ? 'ACTIVE' : rows[0].status,
    amount: Math.round(shown.reduce((s, r) => s + Number(r.amount || 0), 0) * 100) / 100,
    reserved_at: rows[0].reserved_at,
    expires_at: expiries.length ? new Date(Math.min(...expiries)) : null,
    closed_at: active.length ? null : rows[0].closed_at,
    close_reason: active.length ? null : rows[0].close_reason,
    window_working_days: RESERVATION_WORKING_DAYS,
    lines: shown.map((r) => ({
      budget_line_id: r.budget_line_id, budget_code: r.budget_code, budget_name: r.budget_name,
      amount: Number(r.amount), status: r.status
    }))
  };
}

// ── Float requisitions ──────────────────────────────────────────────────────

const logFloat = (conn, floatId, actorId, role, action, from, to, comments) =>
  conn.execute(
    `INSERT INTO approval_logs (request_id, approver_id, approver_role, action, previous_status, new_status, comments)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [floatId, actorId, role, action, from, to, comments]
  );

const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/**
 * Hold an approved float's amount. Refuses the approval when a line cannot
 * cover it after other holds. Floats generated from a purchase request are
 * held through the purchase request instead, never twice.
 */
async function reserveFloat(conn, float, user, role) {
  if (float.source_proc_request_id) return 0;
  const lines = await floatLines(conn, float.id);
  if (!lines.length) return 0;
  await assertCanReserve(conn, lines, { type: SOURCE.FLOAT, id: float.id }, 'approve this request');
  const expires = addWorkingDays(new Date(), RESERVATION_WORKING_DAYS);
  const total = await syncReservation(conn, SOURCE.FLOAT, float.id, lines, user, { expiresAt: expires });
  await logFloat(
    conn, float.id, user.id, role || user.role, 'FUNDS_RESERVED', 'APPROVED', 'APPROVED',
    `${money(total)} reserved on the budget lines until ${fmtDate(expires)} (${RESERVATION_WORKING_DAYS} working days). `
    + 'Dispatch it before then, or it is rejected automatically and the funds released.'
  );
  return total;
}

/** The float left the approved state: give back what it held. */
async function releaseFloat(conn, floatId, user, role, reason, status = 'RELEASED') {
  const cents = await closeReservation(conn, SOURCE.FLOAT, floatId, status, user, reason);
  if (cents > 0) {
    await logFloat(
      conn, floatId, user.id, role || user.role, status === 'CONSUMED' ? 'RESERVATION_CONSUMED' : 'FUNDS_RELEASED',
      null, null,
      status === 'CONSUMED'
        ? `Reserved ${money(cents)} deducted from the budget at dispatch`
        : `Reservation of ${money(cents)} released back to the budget lines — ${reason}`
    );
  }
  return cents;
}

// ── Purchase requests ───────────────────────────────────────────────────────

/**
 * Bring a purchase request's hold in line with what is still to be paid per
 * budget line (`impact` from procurementService.getBudgetImpact). Paid in
 * full closes the hold as consumed.
 */
async function syncPrReservation(conn, prId, impact, user, opts = {}) {
  const lines = impact.map((l) => ({ budget_line_id: l.budget_line_id, cents: toCents(l.still_needed) }));
  return syncReservation(conn, SOURCE.PR, prId, lines, user, opts);
}

// ── Expiry and housekeeping (scheduler) ─────────────────────────────────────

/**
 * Reject every approved request whose hold ran out before it was dispatched
 * or paid, and release the funds. A purchase request that has started being
 * paid has no expiry — only an unpaid one can lapse.
 */
async function expireOverdue() {
  const procurementService = require('./procurement.service');
  const notificationService = require('./notification.service');
  const systemId = await getSystemUserId();
  if (!systemId) return { expired: 0 };
  const system = { id: systemId, role: 'SYSTEM' };

  let due = [];
  try {
    due = await query(
      `SELECT source_type, source_id, MIN(expires_at) AS expires_at, SUM(amount) AS amount
         FROM budget_reservations
        WHERE status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at <= NOW()
        GROUP BY source_type, source_id`
    );
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') return { expired: 0 };
    throw err;
  }

  let expired = 0;
  for (const r of due) {
    try {
      if (r.source_type === SOURCE.FLOAT) {
        const done = await transaction(async (conn) => {
          const [rows] = await conn.execute('SELECT id, status, request_code, requester_id FROM requests WHERE id = ? FOR UPDATE', [r.source_id]);
          const f = rows[0];
          if (!f || f.status !== 'APPROVED') return null;
          const reason = `Not dispatched within ${RESERVATION_WORKING_DAYS} working days of approval (reserved until ${fmtDate(r.expires_at)})`;
          await conn.execute(
            `UPDATE requests SET status = 'REJECTED', updated_at = NOW(3), version = version + 1 WHERE id = ?`, [f.id]
          );
          await logFloat(conn, f.id, system.id, 'SYSTEM', 'AUTO_REJECTED', 'APPROVED', 'REJECTED',
            `Automatically rejected: ${reason}. The requester can amend and resubmit it.`);
          await releaseFloat(conn, f.id, system, 'SYSTEM', 'the reservation expired', 'EXPIRED');
          return f;
        });
        if (done) {
          expired++;
          notificationService.onReservationExpired?.(done.id, done.request_code, done.requester_id, 'request').catch(() => {});
        }
      } else {
        const done = await procurementService.expireReservation(r.source_id, system, r.expires_at);
        if (done) expired++;
      }
    } catch (err) {
      logger.error('Reservation expiry failed', { source: r.source_type, id: r.source_id, message: err.message });
    }
  }
  return { expired };
}

/**
 * Close holds whose request has moved on by a path that did not close them
 * (an older code path, a manual database change), so a stale hold can never
 * keep money out of reach.
 */
async function closeOrphans() {
  try {
    await query(
      `UPDATE budget_reservations br JOIN requests r ON br.source_type = 'FLOAT' AND r.id = br.source_id
          SET br.status = IF(r.status IN ('DISPATCHED','RECON_PENDING_LEAD','RECON_PENDING_FINANCE','RECONCILED'), 'CONSUMED', 'RELEASED'),
              br.closed_at = NOW(), br.close_reason = CONCAT('Request is ', r.status)
        WHERE br.status = 'ACTIVE' AND r.status <> 'APPROVED'`
    );
    await query(
      `UPDATE budget_reservations br JOIN proc_requests p ON br.source_type = 'PR' AND p.id = br.source_id
          SET br.status = IF(p.status = 'COMPLETED', 'CONSUMED', 'RELEASED'),
              br.closed_at = NOW(), br.close_reason = CONCAT('Request is ', p.status)
        WHERE br.status = 'ACTIVE' AND p.status <> 'PENDING_PAYMENT'`
    );
  } catch (err) {
    if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
  }
}

/**
 * Hold what is still to be paid on purchase requests approved before
 * reservations existed. They have already been part-paid, so no expiry.
 */
async function backfillPurchaseRequests() {
  const procurementService = require('./procurement.service');
  let rows = [];
  try {
    rows = await query(
      `SELECT p.id FROM proc_requests p
        WHERE p.status = 'PENDING_PAYMENT' AND p.workflow_version = 2
          AND NOT EXISTS (SELECT 1 FROM budget_reservations br WHERE br.source_type = 'PR' AND br.source_id = p.id)`
    );
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') return;
    throw err;
  }
  const systemId = await getSystemUserId();
  for (const r of rows) {
    try {
      await transaction(async (conn) => {
        const impact = await procurementService.getBudgetImpact(r.id, conn);
        const cents = await syncPrReservation(conn, r.id, impact, { id: systemId }, { expiresAt: null });
        if (cents > 0 && systemId) {
          await conn.execute(
            `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
             VALUES (?, ?, 'SYSTEM', 'FUNDS_RESERVED', 'PENDING_PAYMENT', 'PENDING_PAYMENT', ?)`,
            [r.id, systemId, `Budget reservation introduced: the ${money(cents)} still to be paid is held on the budget lines until it is paid`]
          );
        }
      });
    } catch (err) {
      logger.error('Reservation back-fill failed', { id: r.id, message: err.message });
    }
  }
}

module.exports = {
  RESERVATION_WORKING_DAYS,
  POP_DEADLINE_WORKING_DAYS,
  SOURCE,
  addWorkingDays,
  workingDaysBetweenSql,
  reservedSql,
  reservedByLine,
  assertCanReserve,
  syncReservation,
  closeReservation,
  getReservation,
  reserveFloat,
  releaseFloat,
  syncPrReservation,
  getSystemUserId,
  expireOverdue,
  closeOrphans,
  backfillPurchaseRequests,
  floatLines
};
