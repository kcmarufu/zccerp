/**
 * Float requisition rules shared by the float form and purchase requests.
 *
 * A purchase request now ends in a float requisition generated from it, so the
 * same rules have to hold on both: the reference number is built from the
 * partner and project, and no request may draw more from a budget line than
 * the line has left.
 */

/** Strip a code down to the characters that are safe inside a reference number. */
const normalizeCodeSegment = (value, fallback) => {
  const cleaned = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned || fallback;
};

/**
 * Build a request's reference number from the partner and project it is
 * charged to: DONORCODE-PROJECTCODE-0000001, where the sequence is the
 * project's own counter. Falls back to REQ-YYYY-000001 when there is no
 * donor/project pair to build from.
 *
 * Shared by create and edit. It used to exist only inside createRequest, which
 * is why re-assigning a rejected request to a different partner or project left
 * the old partner's code on it: the reference is derived data, but nothing
 * re-derived it once the request existed. Anyone reading the reference — the
 * requester, an approver, Finance reconciling against the partner's ledger —
 * was then looking at a code that named the wrong partner.
 *
 * Increments the project's counter as a side effect, so call it exactly once
 * per code issued, inside the caller's transaction.
 */
async function generateRequestCode(connection, donorId, projectId) {
  if (donorId && projectId) {
    const [donorResult] = await connection.execute(
      'SELECT donor_code FROM donors WHERE id = ?', [donorId]
    );
    const [projectResult] = await connection.execute(
      'SELECT project_code FROM projects WHERE id = ?', [projectId]
    );

    if (donorResult.length > 0 && projectResult.length > 0) {
      const donorCode = normalizeCodeSegment(donorResult[0].donor_code, 'DON');
      const projCode = normalizeCodeSegment(projectResult[0].project_code, 'PRJ');

      // Atomically increment the per-project sequence counter
      await connection.execute(
        'UPDATE projects SET last_request_seq = last_request_seq + 1 WHERE id = ?',
        [projectId]
      );
      const [seqRow] = await connection.execute(
        'SELECT last_request_seq FROM projects WHERE id = ?', [projectId]
      );
      const seq = String(seqRow[0].last_request_seq).padStart(7, '0');

      return `${donorCode}-${projCode}-${seq}`;
    }
  }

  const year = new Date().getFullYear();
  const [countResult] = await connection.execute(
    'SELECT COUNT(*) + 1 as seq FROM requests WHERE YEAR(created_at) = ?', [year]
  );
  return `REQ-${year}-${String(countResult[0].seq).padStart(6, '0')}`;
}

/** Money comparisons are done in cents so repeated float addition cannot make a
 *  request that exactly fills a budget line read as one cent over it. */
const toCents = (value) => Math.round((Number(value) || 0) * 100);

const formatMoney = (cents) =>
  (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Validate a request's items against the budget lines they are charged to.
 *
 * Two rules, both of which used to be enforced nowhere on the server:
 *
 *  1. Every budget line must belong to the project the request is charged to.
 *     Without this, reassigning a rejected request to a different partner left
 *     the item rows pointing at the *old* project's lines — the request named
 *     one partner in its header and spent another partner's money.
 *
 *  2. The request's total draw on each budget line must fit that line's
 *     remaining balance. The old client-side check compared each item to the
 *     balance on its own, so a 500 line accepted a 400 item and a 200 item on
 *     the same line: each passed, the pair overspent by 100. Items are summed
 *     per budget line here, which is the only comparison that means anything
 *     when several items share a line.
 *
 * This is a check at request time, not a reservation. The balance it compares
 * against already leaves out money reserved for approved requests that have
 * not yet been dispatched or paid (budgetReservation.service) — the request
 * gets its own reservation only once Finance approves it. It stops the requester from asking for money the line plainly does
 * not have, and says by how much.
 *
 * Balances are therefore read without FOR UPDATE. Locking would buy nothing —
 * nothing here writes `spent_amount`, so two requests racing for the same line
 * would both pass the check either way — while adding a lock on `budget_lines`
 * that the approval path (which does write those rows) would have to contend
 * with. Two requests can still be raised against one balance; catching that is
 * the approver's job, and the balance is re-checked when the money moves.
 */
async function assertItemsFitBudget(connection, items, projectId, exclude = null) {
  if (!Array.isArray(items) || items.length === 0) return;

  // Sum the request's own draw per budget line before comparing to anything.
  const drawByLine = new Map();
  for (const item of items) {
    const lineId = Number(item.budgetLineId) || 0;
    if (!lineId) continue;
    const cents = toCents((item.quantity || 1) * (item.unitPrice || 0));
    drawByLine.set(lineId, (drawByLine.get(lineId) || 0) + cents);
  }
  if (drawByLine.size === 0) return;

  const lineIds = [...drawByLine.keys()];
  const placeholders = lineIds.map(() => '?').join(',');
  const [lines] = await connection.execute(
    `SELECT id, budget_code, budget_name, project_id, is_active,
            allocated_amount, spent_amount,
            (allocated_amount - spent_amount) AS balance
       FROM budget_lines
      WHERE id IN (${placeholders})`,
    lineIds
  );

  const byId = new Map(lines.map((l) => [Number(l.id), l]));
  // Money held for approved requests that have not yet been dispatched / paid
  // is not available to anyone else (see budgetReservation.service).
  const held = await require('./budgetReservation.service').reservedByLine(connection, lineIds, exclude);
  const problems = [];

  for (const lineId of lineIds) {
    const line = byId.get(lineId);
    const requested = drawByLine.get(lineId);

    if (!line) {
      problems.push(`Budget line #${lineId} no longer exists. Please choose a current budget line.`);
      continue;
    }
    if (!line.is_active) {
      problems.push(`Budget line ${line.budget_code} is no longer active and cannot be charged.`);
      continue;
    }
    // Rule 1 — the line must belong to this request's project.
    if (projectId && Number(line.project_id) !== Number(projectId)) {
      problems.push(
        `Budget line ${line.budget_code} belongs to a different project. ` +
        `After changing the partner or project you must re-select a budget line for every item.`
      );
      continue;
    }
    // Rule 2 — the request's whole draw on this line must fit the balance.
    const reserved = held.get(lineId) || 0;
    const balance = Math.max(0, toCents(line.balance) - reserved);
    if (requested > balance) {
      problems.push(
        `Budget line ${line.budget_code} (${line.budget_name}) has ${formatMoney(balance)} available` +
        (reserved > 0 ? ` (${formatMoney(reserved)} is reserved for approved requests awaiting dispatch or payment)` : '') + ', ' +
        `but this request charges ${formatMoney(requested)} to it — ` +
        `${formatMoney(requested - balance)} over. Reduce the items on this budget line or split them across another line.`
      );
    }
  }

  if (problems.length > 0) {
    const error = new Error(
      problems.length === 1
        ? problems[0]
        : `This request exceeds the available budget:\n• ${problems.join('\n• ')}`
    );
    error.budgetValidation = problems;
    throw error;
  }
}

module.exports = { generateRequestCode, assertItemsFitBudget, toCents, formatMoney };
