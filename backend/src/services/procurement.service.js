/**
 * Procurement Service
 * Business logic for the full procurement lifecycle:
 * Draft → Dept Approval (HOP/Lead) → Procurement (upload quotations) → Committee (3 seats) → Final Finance → Completed
 */

const { query, transaction } = require('../config/database');
const { ROLES, isAdminHrManager, isFinanceManager, FINANCE_DEPT_CODE, isGsTrackRole } = require('../config/roles');
const notificationService = require('./notification.service');
const workflowEmail = require('./workflowEmail.service');
const reconciliationService = require('./reconciliation.service');
const { resolveProcItemCategory, inferProcItemCategory } = require('../config/procItemCategories');
const { generateRequestCode, assertItemsFitBudget, toCents } = require('./floatRules');
const reservations = require('./budgetReservation.service');

const PROC_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_DEPT_APPROVAL: 'PENDING_DEPT_APPROVAL',
  // A Head of Department's request: the General Secretary approves it in place
  // of a departmental Lead/HOD. Everything after is the ordinary flow.
  PENDING_GS_APPROVAL: 'PENDING_GS_APPROVAL',
  PENDING_FINANCE_APPROVAL: 'PENDING_FINANCE_APPROVAL',
  PENDING_PROCUREMENT: 'PENDING_PROCUREMENT',
  PENDING_COMMITTEE: 'PENDING_COMMITTEE',
  PENDING_HIGH_VALUE_APPROVAL: 'PENDING_HIGH_VALUE_APPROVAL',
  // Workflow v2: after the Committee, the department checks the award against
  // what it asked for before the request reaches Finance.
  PENDING_DEPT_CONFIRMATION: 'PENDING_DEPT_CONFIRMATION',
  PENDING_FINAL_FINANCE: 'PENDING_FINAL_FINANCE',
  // Workflow v2: sent back to Procurement to amend after the Committee stage.
  RETURNED_TO_PROCUREMENT: 'RETURNED_TO_PROCUREMENT',
  // Workflow v2: Finance approved and paid part; further batches outstanding.
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED'
};

// ── High-value procurement rule ──────────────────────────────────────────────
// When the SELECTED quotation is at or above this USD amount, the Procurement
// Committee does not decide the request — it recommends it. The request then
// needs two further approvals, granted independently and in either order:
//
//   SUPER_ADMIN  — any ADMIN account
//   FINANCE      — the Lead OR Head of Department of Finance (FOS); either one
//                  suffices. Every high-value request crosses the same Finance
//                  desk regardless of which department raised it, so the
//                  organisation's money is signed off in one place.
//
// Only when BOTH have approved does it move on to the Finance desk for the
// final approval. A rejection by either sends it back to be amended; on
// resubmission it returns to this same stage.
//
// Everything below the threshold keeps the ordinary "any 3 committee members"
// flow, decided by the committee alone.
const HIGH_VALUE_THRESHOLD_USD = 5000;

// Approving committee votes required to recommend a request onward. Applies to
// both the ordinary flow and the high-value recommendation stage.
const COMMITTEE_APPROVALS_REQUIRED = 3;

const HV_SEAT = { SUPER_ADMIN: 'SUPER_ADMIN', FINANCE: 'FINANCE' };

// Below this USD value a request skips the Committee and goes straight to Finance.
const COMMITTEE_BYPASS_THRESHOLD_USD = 500;

// getVendors category filter for suppliers with no category yet.
const UNCATEGORIZED = '__UNCATEGORIZED__';

// What a selected quotation is worth on its request. A request may be split
// across several suppliers, each awarded only some items — awarded_amount is
// then the sum of those lines. NULL means the whole quotation was selected.
const AWARDED_VALUE_SQL = (alias = 'q') => `COALESCE(${alias}.awarded_amount, ${alias}.total_amount)`;

// The stages Procurement may recall a request from, to amend the quotations or
// the award and send it through again.
const RECALLABLE_STATUSES = [
  'PENDING_COMMITTEE',
  'PENDING_HIGH_VALUE_APPROVAL',
  'PENDING_DEPT_CONFIRMATION',
  'PENDING_FINAL_FINANCE'
];

// ── Workflow v2: one chain from purchase request to float requisition ───────
//
//   Supervisor (Lead/HOD) → Procurement → Committee (+ high-value rule)
//     → Department confirmation → Finance approval + payment batches
//
// Finance approval generates the linked float requisition, carrying the PR's
// approval trail, and every payment batch deducts its amount from the budget.
// Requests raised before this flow existed keep workflow_version 1 and finish
// on the old route.
const WORKFLOW_V2 = 2;
const isV2 = (req) => Number(req?.workflow_version) === WORKFLOW_V2;

// Stages from which a rejection asks who amends the request: Procurement or
// the requester. A resubmission returns it to the stage that sent it back.
const POST_COMMITTEE_STAGES = [
  'PENDING_HIGH_VALUE_APPROVAL',
  'PENDING_DEPT_CONFIRMATION',
  'PENDING_FINAL_FINANCE'
];
const RETURN_TO = { PROCUREMENT: 'PROCUREMENT', REQUESTER: 'REQUESTER' };

// How Finance paid a batch. A bank payment also names the bank it went from.
const PAYMENT_METHODS = { BANK: 'Bank transfer', CASH: 'Cash', MOBILE_MONEY: 'Mobile money' };
const paymentMethodLabel = (method, bank) =>
  method ? `${PAYMENT_METHODS[method] || method}${method === 'BANK' && bank ? ` (${bank})` : ''}` : null;

// The requester may change a request while it is theirs (draft, rejected) and
// while it still waits at the first approval desk - the same rule as a float
// requisition. Once the department / General Secretary has approved it, it
// belongs to Procurement and the approvers.
const REQUESTER_EDITABLE_STATUSES = ['DRAFT', 'REJECTED', 'PENDING_DEPT_APPROVAL', 'PENDING_GS_APPROVAL'];

// Where Procurement may add, edit or remove quotations.
const QUOTATION_EDITABLE_STATUSES = ['PENDING_PROCUREMENT', 'PENDING_COMMITTEE', 'RETURNED_TO_PROCUREMENT'];

const STAGE_LABELS = {
  PENDING_DEPT_APPROVAL: 'department approval',
  PENDING_GS_APPROVAL: 'General Secretary approval',
  PENDING_PROCUREMENT: 'Procurement',
  PENDING_COMMITTEE: 'the Committee',
  PENDING_HIGH_VALUE_APPROVAL: 'high-value approval',
  PENDING_DEPT_CONFIRMATION: 'department confirmation',
  PENDING_FINAL_FINANCE: 'Finance approval'
};
const stageLabel = (status) => STAGE_LABELS[status] || String(status || '').replace(/_/g, ' ').toLowerCase();

/** Finance Clerk, or the Finance Lead / Head of Department, or a Super Admin. */
const canActAsProcFinance = (user) =>
  user.role === ROLES.FINANCE_CLERK || isFinanceManager(user);

class ProcurementService {

  /**
   * Returns the awarded value — every selected quotation together, since a
   * request may be split across suppliers — and whether it crosses the
   * high-value threshold. Only USD awards are evaluated; anything else falls
   * back to the normal committee flow.
   */
  async isHighValueRequest(requestId) {
    const rows = await query(
      `SELECT ${AWARDED_VALUE_SQL()} AS amount, q.currency FROM proc_quotations q
        WHERE q.request_id = ? AND q.is_selected = TRUE`,
      [requestId]
    );
    if (!rows.length) return { isHighValue: false, amount: 0, currency: null };
    const amount = rows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const currency = rows[0].currency || 'USD';
    return {
      isHighValue: currency === 'USD' && amount >= HIGH_VALUE_THRESHOLD_USD,
      amount: Math.round(amount * 100) / 100,
      currency
    };
  }

  // ============================================================
  // PURCHASE REQUESTS
  // ============================================================

  /**
   * Resolve the department that owns the selected project. This — not the
   * requester's department — decides which Lead/HOD gives the first approval.
   *
   * Falls back to the department on the request's budget lines for older
   * projects that were created before projects.department_id existed, and
   * finally to the requester's own department so a request is never left
   * without an approver.
   */
  async _resolveOwningDepartmentId(conn, projectId, requestId, fallbackDepartmentId) {
    const run = conn ? (sql, p) => conn.execute(sql, p).then(r => r[0]) : query;

    const projRows = await run(
      'SELECT department_id FROM projects WHERE id = ?',
      [projectId]
    );
    if (projRows.length && projRows[0].department_id) {
      return projRows[0].department_id;
    }

    if (requestId) {
      const blRows = await run(
        `SELECT bl.department_id
         FROM proc_request_items pri
         JOIN budget_lines bl ON bl.id = pri.budget_line_id
         WHERE pri.request_id = ? AND bl.department_id IS NOT NULL
         LIMIT 1`,
        [requestId]
      );
      if (blRows.length && blRows[0].department_id) {
        return blRows[0].department_id;
      }
    }

    return fallbackDepartmentId || null;
  }

  /**
   * Donor and Project are mandatory on a purchase request — the project is what
   * determines the approval route, so a request cannot exist without one.
   */
  async _validateDonorAndProject(conn, donorId, projectId) {
    const run = conn ? (sql, p) => conn.execute(sql, p).then(r => r[0]) : query;

    if (!donorId) throw new Error('Donor is required');
    if (!projectId) throw new Error('Project is required');

    const projRows = await run(
      'SELECT id, donor_id FROM projects WHERE id = ?',
      [projectId]
    );
    if (!projRows.length) throw new Error('Selected project does not exist');
    if (Number(projRows[0].donor_id) !== Number(donorId)) {
      throw new Error('Selected project does not belong to the selected donor');
    }
  }

  // ============================================================
  // AUDIT TRAIL
  // ------------------------------------------------------------
  // Every request-level event goes through _logEvent, so nothing that changes a
  // request can be added without also showing up in its approval trail. Status
  // transitions were always logged; content changes — edits, quotations,
  // attachments — were not, which left an amended request looking untouched.
  // ============================================================

  /**
   * Writes one row to the approval trail. `conn` is the enclosing transaction
   * where there is one, so the log cannot survive a rolled-back change; pass
   * null for the handful of single-statement paths that have no transaction.
   *
   * An event that does not move the request carries the same status on both
   * sides, which is what marks it as a content change rather than a decision.
   */
  async _logEvent(conn, requestId, user, action, previousStatus, newStatus, comments) {
    const sql = `INSERT INTO proc_approval_logs
        (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
       VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const params = [
      requestId, user.id, user.role, action,
      previousStatus || null, newStatus || null, comments || null
    ];
    if (conn) await conn.execute(sql, params);
    else await query(sql, params);
  }

  /** Collapses whitespace and caps length, so one long justification cannot bury the trail. */
  _short(value, max = 140) {
    const s = value == null || value === '' ? '—' : String(value).replace(/\s+/g, ' ').trim();
    return s.length > max ? `${s.slice(0, max)}…` : s;
  }

  /**
   * Currency is a free-text field on the quotation form, and a stray keystroke
   * once left "USD150" on a $150 quote — which the Purchase Order then printed
   * as a prefix, giving "USD150 150.00". Only a bare ISO-style code is accepted;
   * anything else falls back to USD rather than reaching a printed document.
   */
  _normalizeCurrency(value, fallback = 'USD') {
    const code = String(value ?? '').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : fallback;
  }

  async _nameOf(conn, table, column, id) {
    if (!id) return '—';
    const [rows] = await conn.execute(`SELECT ${column} AS name FROM ${table} WHERE id = ?`, [id]);
    return rows[0]?.name || `#${id}`;
  }

  /**
   * Field-by-field account of what an edit changed. updatePurchaseRequest
   * rewrites the row and deletes and re-inserts its items, so this string is
   * the ONLY record of the pre-edit values — it has to read on its own years
   * later, which is why partners and projects are named rather than numbered.
   */
  async _describeRequestEdit(conn, before, after, beforeItems, afterItems) {
    const parts = [];
    const money = (v) => `$${Number(v || 0).toFixed(2)}`;
    const qty = (v) => String(Number(v || 0));
    const day = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : '—');

    for (const [label, key, fmt] of [
      ['Title', 'title', (v) => this._short(v)],
      ['Justification', 'justification', (v) => this._short(v)],
      ['Priority', 'priority', (v) => this._short(v)],
      ['Expected delivery', 'expected_delivery_date', day],
      ['Estimated total', 'total_estimated_amount', money]
    ]) {
      const was = fmt(before[key]);
      const now = fmt(after[key]);
      if (was !== now) parts.push(`${label}: "${was}" → "${now}"`);
    }

    if (Number(before.donor_id || 0) !== Number(after.donor_id || 0)) {
      parts.push(`Partner: ${await this._nameOf(conn, 'donors', 'donor_name', before.donor_id)}`
        + ` → ${await this._nameOf(conn, 'donors', 'donor_name', after.donor_id)}`);
    }
    if (Number(before.project_id || 0) !== Number(after.project_id || 0)) {
      parts.push(`Project: ${await this._nameOf(conn, 'projects', 'project_name', before.project_id)}`
        + ` → ${await this._nameOf(conn, 'projects', 'project_name', after.project_id)}`);
    }

    // Items arrive as a whole replacement set, so they are matched on
    // description to tell an actual change from the delete-and-reinsert.
    if (afterItems) {
      const keyOf = (it) => String(it.item_description || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const line = (it) => `${qty(it.quantity)} × ${money(it.estimated_unit_price)}`;
      const beforeMap = new Map((beforeItems || []).map((it) => [keyOf(it), it]));
      const afterMap = new Map((afterItems || []).map((it) => [keyOf(it), it]));

      for (const [k, it] of beforeMap) {
        if (!afterMap.has(k)) parts.push(`Item removed: "${this._short(it.item_description, 60)}" (${line(it)})`);
      }
      for (const [k, it] of afterMap) {
        const was = beforeMap.get(k);
        if (!was) {
          parts.push(`Item added: "${this._short(it.item_description, 60)}" (${line(it)})`);
          continue;
        }
        if (line(was) !== line(it)) {
          parts.push(`Item repriced: "${this._short(it.item_description, 60)}" ${line(was)} → ${line(it)}`);
        }
        if (Number(was.budget_line_id || 0) !== Number(it.budget_line_id || 0)) {
          parts.push(`Budget line changed on "${this._short(it.item_description, 60)}"`);
        }
        if (String(was.specifications || '') !== String(it.specifications || '')) {
          parts.push(`Specifications changed on "${this._short(it.item_description, 60)}"`);
        }
      }
    }

    return parts;
  }

  // ============================================================
  // FLOAT RULES ON A PURCHASE REQUEST (workflow v2)
  // ------------------------------------------------------------
  // A v2 request ends in a float requisition, so it is held to the float
  // form's rules from the start: partner and project are required (see
  // _validateDonorAndProject), every item is charged to a budget line of that
  // project, and no budget line is asked for more than it has left.
  // ============================================================

  _assertItemsHaveBudgetLines(items) {
    const missing = (items || [])
      .map((it, idx) => (Number(it.budget_line_id) ? null : idx + 1))
      .filter(Boolean);
    if (missing.length) {
      throw new Error(
        `Choose a budget line for every item — missing on item${missing.length === 1 ? '' : 's'} ${missing.join(', ')}`
      );
    }
  }

  /** Request items in the shape floatRules.assertItemsFitBudget reads. */
  _toBudgetItems(items, useActuals = false) {
    return (items || [])
      .filter((it) => !useActuals || it.is_available === undefined || Number(it.is_available) === 1)
      .map((it) => ({
        budgetLineId: it.budget_line_id,
        quantity: Number(it.quantity || 1),
        unitPrice: useActuals && it.actual_unit_price != null
          ? Number(it.actual_unit_price)
          : Number(it.estimated_unit_price || 0)
      }));
  }

  /**
   * Re-check the request's stored items against the budget. Before the award
   * the estimates are what is asked for; from department confirmation on, the
   * awarded prices are what will actually be paid.
   */
  async _assertPrFitsBudget(conn, requestId, projectId, useActuals = false) {
    const [rows] = await conn.execute(
      `SELECT budget_line_id, quantity, estimated_unit_price, actual_unit_price, is_available
         FROM proc_request_items WHERE request_id = ?`,
      [requestId]
    );
    this._assertItemsHaveBudgetLines(rows);
    await assertItemsFitBudget(conn, this._toBudgetItems(rows, useActuals), projectId, { type: 'PR', id: Number(requestId) });
  }

  async createPurchaseRequest(data, user) {
    return transaction(async (conn) => {
      await this._validateDonorAndProject(conn, data.donor_id, data.project_id);

      // Every new request follows the unified flow and the float rules.
      this._assertItemsHaveBudgetLines(data.items);
      await assertItemsFitBudget(conn, this._toBudgetItems(data.items), data.project_id);

      const year = new Date().getFullYear();
      const [seq] = await conn.execute(
        'SELECT COUNT(*) + 1 AS seq FROM proc_requests WHERE YEAR(created_at) = ?',
        [year]
      );
      const requestCode = `PR-${year}-${String(seq[0].seq).padStart(5, '0')}`;

      const totalEstimated = (data.items || []).reduce((sum, item) => {
        return sum + ((item.quantity || 1) * (item.estimated_unit_price || 0));
      }, 0);

      // Approval routing is always driven by the department that owns the selected
      // project, regardless of which department the requester belongs to.
      const routingDepartmentId = await this._resolveOwningDepartmentId(
        conn, data.project_id, null, user.department_id
      );

      const [result] = await conn.execute(
        `INSERT INTO proc_requests 
          (request_code, requester_id, department_id, donor_id, project_id, title, justification, 
           expected_delivery_date, priority, total_estimated_amount, routing_department_id, status, workflow_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ${WORKFLOW_V2}, NOW(), NOW())`,
        [
          requestCode,
          user.id,
          user.department_id,
          data.donor_id || null,
          data.project_id || null,
          data.title,
          data.justification,
          data.expected_delivery_date || null,
          data.priority || 'MEDIUM',
          totalEstimated,
          routingDepartmentId
        ]
      );

      const requestId = result.insertId;

      // Insert items
      if (data.items && data.items.length > 0) {
        for (const item of data.items) {
          await conn.execute(
            `INSERT INTO proc_request_items 
              (request_id, budget_line_id, category, item_description, specifications, quantity, 
               unit_of_measure, estimated_unit_price, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              requestId,
              item.budget_line_id || null,
              resolveProcItemCategory(item, data.title),
              item.item_description,
              item.specifications || null,
              item.quantity || 1,
              item.unit_of_measure || 'unit',
              item.estimated_unit_price || 0,
              item.notes || null
            ]
          );
        }
      }

      // Projects created before projects.department_id existed resolve their owner
      // from the budget lines, which are only known once the items are inserted.
      const resolvedRoutingId = await this._resolveOwningDepartmentId(
        conn, data.project_id, requestId, user.department_id
      );
      if (Number(resolvedRoutingId) !== Number(routingDepartmentId)) {
        await conn.execute(
          'UPDATE proc_requests SET routing_department_id = ? WHERE id = ?',
          [resolvedRoutingId, requestId]
        );
      }

      // Logged as CREATED, not SUBMITTED: the draft has not been sent anywhere
      // yet, and calling it a submission made every request look as though it
      // had been submitted twice. Rows written before this keep the old label.
      await this._logEvent(
        conn, requestId, user, 'CREATED', null, 'DRAFT',
        `Purchase request created with ${(data.items || []).length} item(s), `
        + `estimated $${Number(totalEstimated || 0).toFixed(2)}`
      );

      return { requestId, requestCode };
    });
  }

  async getPurchaseRequests(user, filters = {}) {
    let where = '';
    const params = [];

    // Role-based visibility
    if (user.role === ROLES.GENERAL_USER) {
      where = 'WHERE pr.requester_id = ?';
      params.push(user.id);
    } else if ([ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS].includes(user.role)) {
      if (isAdminHrManager(user)) {
        // Admin/HR LEAD/HOD sees all PRs org-wide (same visibility as procurement officer / admin),
        // except at the dept-approval stage, which belongs to the project-owning department.
        where = `WHERE (
          pr.status <> 'PENDING_DEPT_APPROVAL' OR
          COALESCE(pr.routing_department_id, pr.department_id) = ?
        )`;
        params.push(user.department_id);
      } else {
        // HOPs and Program Leads see:
        //   1. Requests awaiting dept approval ONLY where their department owns the
        //      selected project — this is the queue they can actually act on
        //   2. At every other stage, requests originating from their own department
        //      or routed to it (for follow-up and reporting)
        //   3. Any request they have personally acted on (history)
        //   4. Finance's Lead/HOD additionally sees every high-value request
        //      awaiting the dual approval, whichever department raised it —
        //      they hold one of the two seats, so it has to reach their desk
        //   5. Finance's Lead/HOD also sees Heads of Department's requests
        //      awaiting the General Secretary — view only; the GS decides them
        //   6. Finance's Lead/HOD sees every request at the Finance desk, and
        //      the completed ones, with the Finance Clerk's powers over them
        const financeSeat = user.department_code === FINANCE_DEPT_CODE
          ? `OR pr.status IN ('PENDING_HIGH_VALUE_APPROVAL', 'PENDING_GS_APPROVAL', 'PENDING_FINAL_FINANCE', 'PENDING_PAYMENT', 'COMPLETED')`
          : '';
        where = `WHERE (
          (pr.status = 'PENDING_DEPT_APPROVAL' AND COALESCE(pr.routing_department_id, pr.department_id) = ?) OR
          (pr.status <> 'PENDING_DEPT_APPROVAL' AND (pr.department_id = ? OR pr.routing_department_id = ?)) OR
          pr.id IN (SELECT DISTINCT pal.request_id FROM proc_approval_logs pal WHERE pal.actor_id = ?)
          ${financeSeat}
        )`;
        params.push(user.department_id, user.department_id, user.department_id, user.id);
      }
    } else if (user.role === ROLES.PROCUREMENT_OFFICER) {
      // Procurement officer sees everything from finance-approved stage onwards + rejected
      where = "WHERE pr.status IN ('PENDING_PROCUREMENT','RETURNED_TO_PROCUREMENT','PENDING_COMMITTEE','PENDING_HIGH_VALUE_APPROVAL','PENDING_DEPT_CONFIRMATION','PENDING_FINAL_FINANCE','PENDING_PAYMENT','COMPLETED','REJECTED')";
    } else if (user.role === ROLES.PROCUREMENT_COMMITTEE) {
      // Committee sees requests sent to them + completed/rejected for reference
      where = "WHERE pr.status IN ('PENDING_COMMITTEE','PENDING_HIGH_VALUE_APPROVAL','PENDING_DEPT_CONFIRMATION','PENDING_FINAL_FINANCE','PENDING_PAYMENT','COMPLETED','REJECTED')";
    } else {
      // ADMIN, FINANCE_CLERK see all
      where = 'WHERE 1=1';
    }

    if (filters.status) {
      where += ` AND pr.status = ?`;
      params.push(filters.status);
    }
    if (filters.priority) {
      where += ` AND pr.priority = ?`;
      params.push(filters.priority);
    }
    if (filters.search) {
      where += ` AND (pr.request_code LIKE ? OR pr.title LIKE ? OR CONCAT(u.first_name,' ',u.last_name) LIKE ?)`;
      const s = `%${filters.search}%`;
      params.push(s, s, s);
    }

    const sql = `
      SELECT pr.*,
        u.first_name, u.last_name, u.email AS requester_email,
        d.department_name, d.department_code,
        dn.donor_name, dn.donor_code,
        (SELECT COUNT(*) FROM proc_quotations q WHERE q.request_id = pr.id) AS quotation_count,
        (SELECT SUM(${AWARDED_VALUE_SQL()}) FROM proc_quotations q
          WHERE q.request_id = pr.id AND q.is_selected = TRUE) AS selected_quotation_amount,
        (SELECT COUNT(*) FROM proc_quotations q
          WHERE q.request_id = pr.id AND q.is_selected = TRUE) AS selected_supplier_count,
        (SELECT CASE WHEN MIN(q.currency) = 'USD' AND SUM(${AWARDED_VALUE_SQL()}) >= ${HIGH_VALUE_THRESHOLD_USD} THEN 1 ELSE 0 END
           FROM proc_quotations q
          WHERE q.request_id = pr.id AND q.is_selected = TRUE) AS is_high_value
      FROM proc_requests pr
      JOIN users u ON pr.requester_id = u.id
      LEFT JOIN departments d ON pr.department_id = d.id
      LEFT JOIN donors dn ON pr.donor_id = dn.id
      ${where}
      ORDER BY pr.created_at DESC
      LIMIT ${parseInt(filters.limit) || 50} OFFSET ${parseInt(filters.offset) || 0}
    `;

    return query(sql, params);
  }

  async getPurchaseRequestById(requestId) {
    const [requests] = await Promise.all([
      query(
        `SELECT pr.*,
          u.first_name, u.last_name, u.email AS requester_email,
          rr.role_name AS requester_role,
          d.department_name, d.department_code,
          dn.donor_name, dn.donor_code,
          p.project_name, p.project_code
         FROM proc_requests pr
         JOIN users u ON pr.requester_id = u.id
         LEFT JOIN roles rr ON rr.id = u.role_id
         LEFT JOIN departments d ON pr.department_id = d.id
         LEFT JOIN donors dn ON pr.donor_id = dn.id
         LEFT JOIN projects p ON pr.project_id = p.id
         WHERE pr.id = ?`,
        [requestId]
      )
    ]);

    if (!requests.length) return null;

    const request = requests[0];
    request.is_gs_track = isGsTrackRole(request.requester_role) ? 1 : 0;

    // Flag high-value requests so the UI can mark them for special approval.
    const highValue = await this.isHighValueRequest(requestId);
    request.is_high_value = highValue.isHighValue ? 1 : 0;
    request.selected_quotation_amount = highValue.amount || null;
    request.high_value_threshold = HIGH_VALUE_THRESHOLD_USD;
    // Who must approve a high-value request, and what each has decided so far.
    request.high_value_approvals = highValue.isHighValue
      ? await this.getHighValueApprovals(requestId)
      : [];

    const [items, logs, rawQuotations] = await Promise.all([
      query(
        `SELECT pri.*, bl.budget_code, bl.budget_name,
          (bl.allocated_amount - bl.spent_amount) AS budget_balance
         FROM proc_request_items pri
         LEFT JOIN budget_lines bl ON pri.budget_line_id = bl.id
         WHERE pri.request_id = ?
         ORDER BY pri.id ASC`,
        [requestId]
      ),
      query(
        `SELECT pal.*,
          u.first_name AS actor_first_name, u.last_name AS actor_last_name
         FROM proc_approval_logs pal
         JOIN users u ON pal.actor_id = u.id
         WHERE pal.request_id = ?
         ORDER BY pal.created_at ASC, pal.id ASC`,
        [requestId]
      ),
      query(
        `SELECT pq.*,
          v.company_name AS vendor_company, v.is_prequalified, v.category AS vendor_category,
          v.antiterror_verified,
          u.first_name AS created_by_first_name, u.last_name AS created_by_last_name
         FROM proc_quotations pq
         LEFT JOIN proc_vendors v ON pq.vendor_id = v.id
         LEFT JOIN users u ON pq.created_by = u.id
         WHERE pq.request_id = ?
         ORDER BY pq.total_amount ASC`,
        [requestId]
      )
    ]);

    // Each quotation carries its own priced breakdown, which is what the
    // comparison the Committee, Finance and the Super Admin read is built from.
    const quotations = await this.attachQuotationItems(rawQuotations);

    // Fetch committee votes for vote-progress display
    let committeeVotes = [];
    try {
      committeeVotes = await query(
        `SELECT cv.id, cv.committee_seat, cv.vote, cv.justification, cv.voted_at,
           u.first_name, u.last_name
         FROM proc_committee_votes cv
         JOIN users u ON cv.voter_id = u.id
         WHERE cv.request_id = ?
         ORDER BY cv.voted_at ASC`,
        [requestId]
      );
    } catch (_) { /* table may not exist yet — safe to ignore */ }

    if (isV2(request)) {
      Object.assign(request, await this._paymentSummary(requestId, request));
      request.award_comparison = this._awardComparison(items);
      request.budget_impact = await this.getBudgetImpact(requestId);
      request.reservation = await reservations.getReservation('PR', Number(requestId));
      if (request.final_finance_approved_by) {
        const [approver] = await query('SELECT first_name, last_name FROM users WHERE id = ?', [request.final_finance_approved_by]);
        request.final_finance_approver_name = approver ? `${approver.first_name} ${approver.last_name}` : null;
      }
      const nothingPaid = !(request.payment_batches || []).some((b) => !b.reversed_at);
      request.pop_pending = request.status === PROC_STATUS.PENDING_PAYMENT && nothingPaid && Boolean(request.pop_due_at);
      request.pop_overdue = request.pop_pending && new Date(request.pop_due_at) < new Date();
      request.pop_deadline_working_days = reservations.POP_DEADLINE_WORKING_DAYS;
    }

    return { ...request, items, approvalTrail: logs, quotations, committeeVotes };
  }

  async updatePurchaseRequest(requestId, data, user) {
    const existing = await this.getPurchaseRequestById(requestId);
    if (!existing) throw new Error('Request not found');
    // Only the person who raised the request edits it, and only while it is
    // theirs (a draft, or one sent back to them) or while it still waits at
    // the first approval desk, as a float requisition can be. Once the
    // department has approved it, it belongs to Procurement and the approvers:
    // an edit replaces the item list, which would cut the link between the
    // items and the prices on the quotations Procurement captures.
    if (!REQUESTER_EDITABLE_STATUSES.includes(existing.status)) {
      throw new Error('A purchase request can only be edited while it is a draft, while it is awaiting its first (department or General Secretary) approval, or after it has been rejected');
    }
    if (Number(existing.requester_id) !== Number(user.id)) {
      throw new Error('Only the person who raised this purchase request can edit it');
    }

    const donorId = data.donor_id || existing.donor_id;
    const projectId = data.project_id || existing.project_id;

    // A draft that has never been submitted joins the unified flow; a request
    // already under way keeps the flow it started on.
    const upgradeToV2 = !isV2(existing) && existing.status === PROC_STATUS.DRAFT && !existing.submitted_at;
    const followsV2 = isV2(existing) || upgradeToV2;

    return transaction(async (conn) => {
      await this._validateDonorAndProject(conn, donorId, projectId);

      if (followsV2) {
        const itemsToCheck = data.items && data.items.length ? data.items : existing.items;
        this._assertItemsHaveBudgetLines(itemsToCheck);
        await assertItemsFitBudget(conn, this._toBudgetItems(itemsToCheck), projectId);
        if (upgradeToV2) {
          await conn.execute('UPDATE proc_requests SET workflow_version = ? WHERE id = ?', [WORKFLOW_V2, requestId]);
        }
      }

      const totalEstimated = (data.items || []).reduce((sum, item) => {
        return sum + ((item.quantity || 1) * (item.estimated_unit_price || 0));
      }, 0);

      await conn.execute(
        `UPDATE proc_requests SET title=?, justification=?, donor_id=?, project_id=?, expected_delivery_date=?,
          priority=?, total_estimated_amount=?, updated_at=NOW() WHERE id=?`,
        [
          data.title || existing.title,
          data.justification || existing.justification,
          donorId,
          projectId,
          data.expected_delivery_date || existing.expected_delivery_date,
          data.priority || existing.priority,
          totalEstimated || existing.total_estimated_amount,
          requestId
        ]
      );

      // When the items themselves are unchanged — same lines, quantities and
      // estimates, in the same order — they are updated in place. Deleting and
      // re-inserting them would cut the link to the supplier's priced lines and
      // the awarded prices, which a request sent back after the Committee
      // still needs.
      const sameItems = (data.items || []).length > 0 &&
        (existing.items || []).length === data.items.length &&
        data.items.every((it, idx) => {
          const was = existing.items[idx];
          return String(was.item_description || '').trim() === String(it.item_description || '').trim() &&
            Number(was.quantity) === Number(it.quantity || 1) &&
            toCents(was.estimated_unit_price) === toCents(it.estimated_unit_price || 0);
        });

      if (sameItems) {
        for (const [idx, item] of data.items.entries()) {
          await conn.execute(
            `UPDATE proc_request_items
                SET budget_line_id = ?, category = ?, specifications = ?, unit_of_measure = ?, notes = ?
              WHERE id = ? AND request_id = ?`,
            [item.budget_line_id || null,
             resolveProcItemCategory(item, data.title || existing.title),
             item.specifications || null, item.unit_of_measure || 'unit', item.notes || null,
             existing.items[idx].id, requestId]
          );
        }
      } else if (data.items && data.items.length > 0) {
        await conn.execute('DELETE FROM proc_request_items WHERE request_id = ?', [requestId]);
        for (const item of data.items) {
          await conn.execute(
            `INSERT INTO proc_request_items 
              (request_id, budget_line_id, category, item_description, specifications, quantity, unit_of_measure, estimated_unit_price, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [requestId, item.budget_line_id || null,
             resolveProcItemCategory(item, data.title || existing.title),
             item.item_description, item.specifications || null,
             item.quantity || 1, item.unit_of_measure || 'unit', item.estimated_unit_price || 0, item.notes || null]
          );
        }
      }

      // Re-resolve routing: changing the project changes which Lead/HOD approves.
      const routingDepartmentId = await this._resolveOwningDepartmentId(
        conn, projectId, requestId, existing.department_id
      );
      await conn.execute(
        'UPDATE proc_requests SET routing_department_id = ? WHERE id = ?',
        [routingDepartmentId, requestId]
      );

      // The edit itself goes on the trail. Nothing else records it: the header is
      // updated in place and the items above are deleted and re-inserted, so
      // without this the pre-edit request is gone without trace.
      const changes = await this._describeRequestEdit(
        conn,
        existing,
        {
          title: data.title || existing.title,
          justification: data.justification || existing.justification,
          priority: data.priority || existing.priority,
          expected_delivery_date: data.expected_delivery_date || existing.expected_delivery_date,
          total_estimated_amount: totalEstimated || existing.total_estimated_amount,
          donor_id: donorId,
          project_id: projectId
        },
        existing.items || [],
        data.items || null
      );

      if (changes.length) {
        // An amendment made after the request left the requester's desk is the
        // case an auditor actually looks for — reviewers further down the line
        // may have signed off on the earlier version, so it is called out.
        const inFlight = ![PROC_STATUS.DRAFT, PROC_STATUS.REJECTED].includes(existing.status);
        const prefix = existing.status === PROC_STATUS.PENDING_COMMITTEE
          ? 'Edited while under Committee review — '
          : inFlight
            ? `Edited by the requester while awaiting ${stageLabel(existing.status)} — `
            : 'Edited — ';
        await this._logEvent(
          conn, requestId, user, 'EDITED', existing.status, existing.status,
          prefix + changes.join('; ')
        );
      }

      return { success: true, amended: changes.length > 0 };
    }).then((result) => {
      // The desk holding the request is told it changed, so nobody approves
      // figures the requester has since altered.
      if (result.amended && [PROC_STATUS.PENDING_DEPT_APPROVAL, PROC_STATUS.PENDING_GS_APPROVAL].includes(existing.status)) {
        notificationService.onProcurementAmended(
          existing.id, existing.request_code, existing.requester_id, existing.department_id,
          existing.routing_department_id, existing.status === PROC_STATUS.PENDING_GS_APPROVAL
        ).catch(() => {});
      }
      return { success: true };
    });
  }

  async submitPurchaseRequest(requestId, user) {
    const existing = await this.getPurchaseRequestById(requestId);
    if (!existing) throw new Error('Request not found');
    if (!['DRAFT', 'REJECTED'].includes(existing.status)) throw new Error('Only DRAFT or REJECTED requests can be submitted');
    if (existing.requester_id !== user.id && user.role !== ROLES.ADMIN) {
      throw new Error('You can only submit your own requests');
    }
    if (!existing.items || existing.items.length === 0) {
      throw new Error('At least one item is required before submitting');
    }

    const isResubmission = existing.status === 'REJECTED';

    // Same reconciliation gate as float requests: 2+ overdue reconciliations,
    // or a rejected one left uncorrected for more than 3 working days, bars a
    // NEW request. Resubmitting a rejected request stays open.
    if (!isResubmission) {
      await reconciliationService.assertCanRaiseRequest(existing.requester_id);
    }

    // A draft that has never been submitted joins the unified flow.
    const upgradeToV2 = !isV2(existing) && existing.status === PROC_STATUS.DRAFT && !existing.submitted_at;
    const followsV2 = isV2(existing) || upgradeToV2;

    return transaction(async (conn) => {
      await this._validateDonorAndProject(conn, existing.donor_id, existing.project_id);

      if (upgradeToV2) {
        await conn.execute('UPDATE proc_requests SET workflow_version = ? WHERE id = ?', [WORKFLOW_V2, requestId]);
      }

      // Recompute the owning department at submission so routing reflects the
      // project selected right now, not whatever was on the request when drafted.
      const routingDepartmentId = await this._resolveOwningDepartmentId(
        conn, existing.project_id, requestId, existing.department_id
      );

      // A Head of Department's request is approved by the General Secretary in
      // place of a departmental Lead/HOD — judged on who raised it, since an
      // Admin may submit on the requester's behalf.
      const firstDesk = existing.is_gs_track
        ? PROC_STATUS.PENDING_GS_APPROVAL
        : PROC_STATUS.PENDING_DEPT_APPROVAL;

      // A resubmission returns to the desk that rejected it — a request rejected by
      // Finance goes back to Finance, not through the whole pipeline again. Only a
      // first-time submission starts at the first approval desk.
      let targetStatus = firstDesk;
      if (isResubmission) {
        // rejected_from_status is recorded when a high-value approver rejects;
        // fall back to the approval trail for rejections logged before it existed.
        let rejectedFrom = existing.rejected_from_status;
        if (!rejectedFrom) {
          const [rejectionLogs] = await conn.execute(
            `SELECT previous_status FROM proc_approval_logs
             WHERE request_id = ? AND action IN ('REJECTED', 'HIGH_VALUE_REJECTED')
             ORDER BY created_at DESC, id DESC LIMIT 1`,
            [requestId]
          );
          rejectedFrom = rejectionLogs[0]?.previous_status;
        }
        const resumable = [
          PROC_STATUS.PENDING_DEPT_APPROVAL,
          PROC_STATUS.PENDING_GS_APPROVAL,
          PROC_STATUS.PENDING_PROCUREMENT,
          PROC_STATUS.PENDING_COMMITTEE,
          PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL,
          PROC_STATUS.PENDING_DEPT_CONFIRMATION,
          PROC_STATUS.PENDING_FINAL_FINANCE
        ];
        if (resumable.includes(rejectedFrom)) {
          targetStatus = rejectedFrom;
        }
        // The first desk is decided by the requester, not by the trail — a
        // request rejected at the departmental stage before this route existed
        // still goes to the General Secretary if a Head of Department raised it.
        if ([PROC_STATUS.PENDING_DEPT_APPROVAL, PROC_STATUS.PENDING_GS_APPROVAL].includes(targetStatus)) {
          targetStatus = firstDesk;
        }

        // Returning to the high-value stage means both approvers assess the
        // amended request afresh — an approval given for the old version says
        // nothing about the new one. If the revision dropped the selected
        // quotation below the threshold, it is no longer a high-value request
        // and rejoins the ordinary flow at Finance.
        if (targetStatus === PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL) {
          await conn.execute('DELETE FROM proc_high_value_approvals WHERE request_id = ?', [requestId]);
          const stillHighValue = await this.isHighValueRequest(requestId);
          if (!stillHighValue.isHighValue) {
            targetStatus = isV2(existing) ? PROC_STATUS.PENDING_DEPT_CONFIRMATION : PROC_STATUS.PENDING_FINAL_FINANCE;
          }
        }

        // A request sent back to its requester after the Committee returns to
        // the stage that sent it back — unless the requester changed the items
        // themselves, which leaves them without the awarded prices. Procurement
        // then has to price and award them again before anyone can approve.
        if (followsV2 && POST_COMMITTEE_STAGES.includes(targetStatus)) {
          const [unpriced] = await conn.execute(
            `SELECT COUNT(*) AS cnt FROM proc_request_items
              WHERE request_id = ? AND is_available = 1 AND actual_unit_price IS NULL`,
            [requestId]
          );
          if (Number(unpriced[0].cnt) > 0) {
            targetStatus = PROC_STATUS.PENDING_PROCUREMENT;
            await conn.execute('DELETE FROM proc_committee_votes WHERE request_id = ?', [requestId]);
            await conn.execute('DELETE FROM proc_high_value_approvals WHERE request_id = ?', [requestId]);
            await conn.execute('UPDATE proc_quotations SET is_selected = FALSE, awarded_amount = NULL WHERE request_id = ?', [requestId]);
          }
        }
      }

      // The float rule: no budget line may be asked for more than it has left.
      // Past the Committee the awarded prices are what will be paid.
      if (followsV2) {
        await this._assertPrFitsBudget(
          conn, requestId, existing.project_id, POST_COMMITTEE_STAGES.includes(targetStatus)
        );
      }

      await conn.execute(
        `UPDATE proc_requests SET status=?, routing_department_id=?, submitted_at=IF(submitted_at IS NULL, NOW(), submitted_at), rejection_reason=NULL, rejected_from_status=NULL, returned_to=NULL, updated_at=NOW() WHERE id=?`,
        [targetStatus, routingDepartmentId, requestId]
      );
      await conn.execute(
        `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [requestId, user.id, user.role,
          isResubmission ? 'RESUBMITTED' : 'SUBMITTED',
          existing.status,
          targetStatus,
          isResubmission ? 'Request resubmitted after revision' : 'Request submitted for approval'
        ]
      );
      return { success: true, status: targetStatus, _notif: { requestCode: existing.request_code, requesterId: user.id, deptId: existing.department_id, routingDeptId: routingDepartmentId, targetStatus } };
    }).then(result => {
      if (result._notif) {
        const n = result._notif; delete result._notif;
        // Only the department-approval stage notifies department Leads; a resubmission
        // that resumes further down the pipeline must not ping them again.
        if (n.targetStatus === PROC_STATUS.PENDING_DEPT_APPROVAL) {
          notificationService.onProcurementSubmitted(requestId, n.requestCode, n.requesterId, n.deptId, n.routingDeptId).catch(() => {});
        } else if (n.targetStatus === PROC_STATUS.PENDING_GS_APPROVAL) {
          notificationService.onRequestAwaitingGs(requestId, n.requestCode, n.requesterId, 'proc_request').catch(() => {});
        }
      }
      return result;
    });
  }

  // ============================================================
  // PROOF-OF-PAYMENT DEADLINE
  // ------------------------------------------------------------
  // Whoever approves a purchase request for payment must see its proof of
  // payment attached within 5 working days. Until every overdue one has a
  // payment recorded, that account cannot approve further purchase requests.
  // ============================================================

  /** Requests `userId` approved for payment with nothing paid yet (only overdue ones unless includePending). */
  async getOverduePops(userId, { includePending = false } = {}) {
    try {
      return await query(
        `SELECT pr.id, pr.request_code, pr.title, pr.final_finance_approved_at, pr.pop_due_at, pr.payable_amount,
                (pr.pop_due_at < NOW()) AS is_overdue
           FROM proc_requests pr
          WHERE pr.final_finance_approved_by = ? AND pr.status = 'PENDING_PAYMENT'
            AND pr.pop_due_at IS NOT NULL ${includePending ? '' : 'AND pr.pop_due_at < NOW()'}
            AND NOT EXISTS (SELECT 1 FROM proc_payment_batches b WHERE b.request_id = pr.id AND b.reversed_at IS NULL)
          ORDER BY pr.pop_due_at`,
        [userId]
      );
    } catch (err) {
      if (err.code === 'ER_BAD_FIELD_ERROR') return []; // migration not yet run
      throw err;
    }
  }

  /** For the UI: what this user owes, and whether it blocks them. */
  async getPopObligations(user) {
    const rows = await this.getOverduePops(user.id, { includePending: true });
    const overdue = rows.filter((r) => Number(r.is_overdue) === 1);
    return {
      blocked: overdue.length > 0,
      deadline_working_days: reservations.POP_DEADLINE_WORKING_DAYS,
      overdue,
      due: rows.filter((r) => Number(r.is_overdue) !== 1)
    };
  }

  async _assertNoOverduePop(user) {
    const overdue = await this.getOverduePops(user.id);
    if (!overdue.length) return;
    const list = overdue.slice(0, 5).map((r) => r.request_code).join(', ') + (overdue.length > 5 ? ` and ${overdue.length - 5} more` : '');
    const err = new Error(
      `You cannot approve purchase requests until the proof of payment is attached for ${list}. `
      + `You approved ${overdue.length === 1 ? 'it' : 'them'} for payment more than ${reservations.POP_DEADLINE_WORKING_DAYS} working days ago `
      + 'and no payment has been recorded yet.'
    );
    err.popOverdue = overdue;
    throw err;
  }

  // ============================================================
  // APPROVAL ACTIONS
  // ============================================================

  async approveDeptLevel(requestId, user, comments = '') {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    await this._assertNoOverduePop(user);

    // General Secretary stage (a Head of Department's request). Same outcome as a
    // departmental approval — on to Procurement — but only a Super Admin decides it.
    if (req.status === PROC_STATUS.PENDING_GS_APPROVAL) {
      if (user.role !== ROLES.ADMIN) {
        throw new Error("A Head of Department's purchase request is approved by the General Secretary");
      }
      return transaction(async (conn) => {
        await this._assertFundsAvailable(conn, req);
        await conn.execute(
          `UPDATE proc_requests SET status='PENDING_PROCUREMENT', dept_approved_at=NOW(), updated_at=NOW() WHERE id=?`,
          [requestId]
        );
        await conn.execute(
          `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
           VALUES (?, ?, ?, 'APPROVED', 'PENDING_GS_APPROVAL', 'PENDING_PROCUREMENT', ?)`,
          [requestId, user.id, user.role, comments || 'Approved by the General Secretary — forwarded to procurement']
        );
        return { success: true };
      });
    }

    if (req.status !== 'PENDING_DEPT_APPROVAL') {
      throw new Error('Request is not pending department approval');
    }
    if (![ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.ADMIN].includes(user.role)) {
      throw new Error('Only a Department Lead or Head of Department can approve at this stage');
    }

    // The first approval belongs to the Lead/HOD of the department that owns the
    // selected project — never the requester's own department Lead/HOD.
    // routing_department_id is set from the project; department_id is only a
    // fallback for legacy requests created before project-based routing.
    if (user.role !== ROLES.ADMIN) {
      const owningDepartmentId = Number(req.routing_department_id || req.department_id);
      if (owningDepartmentId !== Number(user.department_id)) {
        throw new Error('This request must be approved by the Department Lead / Head of Department of the department that owns the selected project');
      }
    }

    return transaction(async (conn) => {
      await this._assertFundsAvailable(conn, req);
      // New flow: dept approval goes directly to PENDING_PROCUREMENT (no intermediate finance step)
      await conn.execute(
        `UPDATE proc_requests SET status='PENDING_PROCUREMENT', dept_approved_at=NOW(), updated_at=NOW() WHERE id=?`,
        [requestId]
      );
      await conn.execute(
        `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, 'APPROVED', 'PENDING_DEPT_APPROVAL', 'PENDING_PROCUREMENT', ?)`,
        [requestId, user.id, user.role, comments || 'Approved by department — forwarded to procurement']
      );
      return { success: true };
    });
  }

  async reverseDeptApproval(requestId, user) {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (req.status !== 'PENDING_PROCUREMENT') {
      throw new Error('Can only reverse department approval when request is at Pending Procurement stage');
    }
    if (![ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS, ROLES.ADMIN].includes(user.role)) {
      throw new Error('Only the approving role (Department Lead, Head of Department, or Admin) can reverse a department approval');
    }
    // Enforce 12-hour reversal window
    if (req.dept_approved_at) {
      const hoursSince = (Date.now() - new Date(req.dept_approved_at).getTime()) / (1000 * 60 * 60);
      if (hoursSince > 12) {
        throw new Error('Reversal window has expired (12 hours after department approval)');
      }
    }
    // Prevent reversal if quotations have already been added
    const quotations = await query('SELECT id FROM proc_quotations WHERE request_id = ?', [requestId]);
    if (quotations.length > 0) {
      throw new Error('Cannot reverse — the Procurement team has already added quotations. Contact an Admin.');
    }
    // An approval given at the General Secretary stage goes back there, and only
    // a Super Admin may undo it.
    const revertTo = req.is_gs_track ? PROC_STATUS.PENDING_GS_APPROVAL : PROC_STATUS.PENDING_DEPT_APPROVAL;
    if (revertTo === PROC_STATUS.PENDING_GS_APPROVAL && user.role !== ROLES.ADMIN) {
      throw new Error("Only the General Secretary can reverse the approval of a Head of Department's request");
    }
    await query(
      `UPDATE proc_requests SET status=?, dept_approved_at=NULL, updated_at=NOW() WHERE id=?`,
      [revertTo, requestId]
    );
    await query(
      `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
       VALUES (?, ?, ?, 'REVERSED', 'PENDING_PROCUREMENT', ?, ?)`,
      [requestId, user.id, user.role, revertTo,
       revertTo === PROC_STATUS.PENDING_GS_APPROVAL ? 'General Secretary approval reversed' : 'Department approval reversed']
    );
    return { success: true };
  }

  async approveFinanceLevel(requestId, user, comments = '') {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (req.status !== 'PENDING_FINANCE_APPROVAL') {
      throw new Error('Request is not pending finance approval');
    }
    if (!canActAsProcFinance(user)) {
      throw new Error('Only Finance (the Finance Clerk or the Finance Lead / Head of Department) can approve at this stage');
    }

    return transaction(async (conn) => {
      await conn.execute(
        `UPDATE proc_requests SET status='PENDING_PROCUREMENT', finance_approved_at=NOW(), updated_at=NOW() WHERE id=?`,
        [requestId]
      );
      await conn.execute(
        `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, 'APPROVED', 'PENDING_FINANCE_APPROVAL', 'PENDING_PROCUREMENT', ?)`,
        [requestId, user.id, user.role, comments || 'Approved by finance']
      );
      return { success: true };
    });
  }

  async rejectRequest(requestId, user, comments = '', returnTo = null) {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');

    const allowedStatuses = [
      'PENDING_DEPT_APPROVAL', 'PENDING_GS_APPROVAL',
      'PENDING_PROCUREMENT', 'PENDING_DEPT_CONFIRMATION', 'PENDING_FINAL_FINANCE', 'PENDING_PAYMENT'
    ];
    if (!allowedStatuses.includes(req.status)) {
      if (req.status === 'PENDING_COMMITTEE') {
        throw new Error('At committee stage, use the Committee Vote action to record a rejection — not the Reject button');
      }
      throw new Error('Request cannot be rejected at this stage');
    }

    if (req.status === PROC_STATUS.PENDING_GS_APPROVAL && user.role !== ROLES.ADMIN) {
      throw new Error("A Head of Department's purchase request is actioned by the General Secretary");
    }

    if (req.status === PROC_STATUS.PENDING_FINAL_FINANCE && !canActAsProcFinance(user)) {
      throw new Error('Only Finance (the Finance Clerk or the Finance Lead / Head of Department) can reject at this stage');
    }

    if (req.status === PROC_STATUS.PENDING_DEPT_CONFIRMATION) {
      this._assertDeptDesk(req, user);
    }

    // Approved for payment but nothing paid yet: Finance may withdraw its
    // approval and send the request back. The reserved funds are released.
    if (req.status === PROC_STATUS.PENDING_PAYMENT) {
      if (!isV2(req) || !canActAsProcFinance(user)) {
        throw new Error('Only Finance can send back a request approved for payment');
      }
      if ((req.payment_batches || []).some((b) => !b.reversed_at)) {
        throw new Error('Payments have been recorded on this request — reverse them before sending it back');
      }
      return transaction(async (conn) => {
        await this._undoFinanceApproval(conn, req, user, 'Finance withdrew its approval');
        const result = await this._sendBack(
          conn, req, user, PROC_STATUS.PENDING_FINAL_FINANCE, returnTo,
          `Finance approval withdrawn: ${comments || 'no reason given'}`
        );
        return { success: true, ...result };
      });
    }

    // v2: past the Committee the approver says who amends the request.
    if (isV2(req) && POST_COMMITTEE_STAGES.includes(req.status)) {
      return transaction(async (conn) => {
        const result = await this._sendBack(
          conn, req, user, req.status, returnTo, comments || 'Rejected (no reason given)'
        );
        return { success: true, ...result };
      });
    }

    // The dept-approval decision — approve or reject — belongs to the Lead/HOD of the
    // department that owns the selected project.
    if (
      req.status === 'PENDING_DEPT_APPROVAL' &&
      [ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS].includes(user.role)
    ) {
      const owningDepartmentId = Number(req.routing_department_id || req.department_id);
      if (owningDepartmentId !== Number(user.department_id)) {
        throw new Error('This request must be actioned by the Department Lead / Head of Department of the department that owns the selected project');
      }
    }

    return transaction(async (conn) => {
      const prev = req.status;
      // rejected_from_status is what a resubmission uses to return the request to
      // the desk that rejected it. Only the high-value path used to set it, so an
      // ordinary rejection had to be reconstructed from the trail.
      await conn.execute(
        `UPDATE proc_requests SET status='REJECTED', rejection_reason=?, rejected_from_status=?, updated_at=NOW() WHERE id=?`,
        [comments, prev, requestId]
      );
      await this._logEvent(
        conn, requestId, user, 'REJECTED', prev, 'REJECTED',
        comments || 'Rejected (no reason given)'
      );
      return { success: true };
    });
  }

  // ============================================================
  // PROCUREMENT TEAM ACTIONS
  // ============================================================

  /**
   * @param awards optional split award — [{ request_item_id, quotation_id }]
   *   for every requested item. When given it replaces selectedQuotationId.
   */
  async submitToCommittee(requestId, selectedQuotationId, user, comments = '', awards = null) {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (req.status !== 'PENDING_PROCUREMENT') {
      throw new Error('Request is not in procurement stage');
    }
    if (![ROLES.PROCUREMENT_OFFICER, ROLES.ADMIN].includes(user.role)) {
      throw new Error('Only Procurement Officers can submit to committee');
    }

    // Check quotation exists
    const quotations = await query('SELECT id FROM proc_quotations WHERE request_id = ?', [requestId]);
    if (!quotations.length) {
      throw new Error('At least one quotation must be uploaded before submitting to committee');
    }

    // The Committee decides on fully priced bids. Without a chosen quotation —
    // or, for a split award, a supplier for every item — there is nothing to
    // turn the estimated figures into actual ones, so the choice is mandatory.
    const award = await this._resolveAward(
      requestId, selectedQuotationId, awards,
      'Choose the recommended quotation before submitting to the Committee'
    );

    // Below the USD 500 threshold the Committee is skipped. A split award is
    // judged on everything awarded, not on any one supplier's share.
    const bypassCommittee = award.currency === 'USD' && award.amount < COMMITTEE_BYPASS_THRESHOLD_USD;

    return transaction(async (conn) => {
      // Mark the selected quotation(s) and carry the suppliers' prices onto the
      // requested items, so everyone from the Committee onward reads the
      // actual cost rather than the estimate.
      await this._applyAward(conn, requestId, award, user);

      if (bypassCommittee) {
        // v2: the department confirms the award before Finance sees it.
        const next = isV2(req) ? PROC_STATUS.PENDING_DEPT_CONFIRMATION : PROC_STATUS.PENDING_FINAL_FINANCE;
        await conn.execute(
          `UPDATE proc_requests SET status=?, procurement_assigned_at=NOW(), committee_reviewed_at=NOW(), updated_at=NOW() WHERE id=?`,
          [next, requestId]
        );
        await conn.execute(
          `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
           VALUES (?, ?, ?, 'COMMITTEE_BYPASSED', 'PENDING_PROCUREMENT', ?, ?)`,
          [requestId, user.id, user.role, next,
           `${award.split ? 'Awarded total' : 'Quotation total'} (USD ${award.amount.toFixed(2)}) is below the USD ${COMMITTEE_BYPASS_THRESHOLD_USD} threshold — Committee review bypassed, forwarded directly to `
           + (isV2(req) ? 'the department for confirmation' : 'Finance')
           + (award.split ? `. ${award.summary}` : '')]
        );
        if (isV2(req)) this._notifyDeptConfirmation(req);
        return { success: true, bypassed: true, status: next };
      }

      // Standard flow — send to committee
      await conn.execute(
        `UPDATE proc_requests SET status='PENDING_COMMITTEE', procurement_assigned_at=NOW(), updated_at=NOW() WHERE id=?`,
        [requestId]
      );
      await conn.execute(
        `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, 'SUBMITTED_TO_COMMITTEE', 'PENDING_PROCUREMENT', 'PENDING_COMMITTEE', ?)`,
        [requestId, user.id, user.role,
         (comments || 'Submitted to procurement committee') + (award.split ? `. ${award.summary}` : '')]
      );
      return { success: true, bypassed: false };
    });
  }

  /**
   * Take a request back from the Committee, the high-value approvers or the
   * Finance desk so Procurement can amend the quotations or the award. It
   * returns to Pending Procurement; votes and high-value approvals given on the
   * old version are cleared, since they say nothing about the new one, and the
   * next submission decides afresh whether it needs the Committee.
   *
   * A request that already carries proof of payment is not recalled — money
   * has moved against the current award.
   */
  async recallToProcurement(requestId, user, reason = '') {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (![ROLES.PROCUREMENT_OFFICER, ROLES.ADMIN].includes(user.role)) {
      throw new Error('Only Procurement Officers can recall a request to procurement');
    }
    if (!RECALLABLE_STATUSES.includes(req.status)) {
      throw new Error('Only a request with the Committee, the high-value approvers or Finance can be recalled');
    }
    if (!String(reason || '').trim()) {
      throw new Error('Give a reason for recalling the request');
    }
    const [pops] = await query(
      'SELECT COUNT(*) AS cnt FROM proc_request_pops WHERE request_id = ?', [requestId]
    );
    if (Number(pops.cnt) > 0) {
      throw new Error('Proof of payment has already been attached to this request, so it can no longer be recalled');
    }

    return transaction(async (conn) => {
      await conn.execute('DELETE FROM proc_committee_votes WHERE request_id = ?', [requestId]);
      await conn.execute('DELETE FROM proc_high_value_approvals WHERE request_id = ?', [requestId]);
      await conn.execute(
        `UPDATE proc_requests SET status='PENDING_PROCUREMENT', committee_reviewed_at=NULL, dept_confirmed_at=NULL,
           rejected_from_status=NULL, returned_to=NULL, updated_at=NOW() WHERE id=?`,
        [requestId]
      );
      await this._logEvent(
        conn, requestId, user, 'RECALLED_TO_PROCUREMENT', req.status, PROC_STATUS.PENDING_PROCUREMENT,
        `Recalled to Procurement from ${req.status.replace(/_/g, ' ').toLowerCase()}: ${String(reason).trim()}`
      );
      await this._refreshFloatTrail(conn, req);
      return { success: true, status: PROC_STATUS.PENDING_PROCUREMENT };
    });
  }

  // ============================================================
  // COMMITTEE ACTIONS
  // ============================================================

  async committeeDecision(requestId, decision, selectedQuotationId, user, justification = '') {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (req.status !== 'PENDING_COMMITTEE') {
      throw new Error('Request is not pending committee review');
    }
    if (![ROLES.PROCUREMENT_COMMITTEE, ROLES.ADMIN].includes(user.role)) {
      throw new Error('Only Procurement Committee members can make this decision');
    }
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      throw new Error('Decision must be APPROVED or REJECTED');
    }
    if (decision === 'APPROVED') await this._assertNoOverduePop(user);

    // Fetch user's department code for informational/audit purposes only
    const [userRow] = await query(
      `SELECT d.department_code FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = ?`,
      [user.id]
    );
    const seat = userRow?.department_code || null;

    // High-value requests are no longer decided here — the committee recommends
    // them onward to the Super Admin and the owning department's Lead/HOP. Every
    // committee member may therefore vote regardless of the amount.
    const highValue = await this.isHighValueRequest(requestId);

    return transaction(async (conn) => {
      if (decision === 'APPROVED') await this._assertFundsAvailable(conn, req, 'vote to approve this request');
      // Check if this voter has already cast a vote on this request
      const [existingVote] = await conn.execute(
        'SELECT id FROM proc_committee_votes WHERE request_id = ? AND voter_id = ?',
        [requestId, user.id]
      );

      if (existingVote.length > 0) {
        // Same voter — allow updating their own vote
        await conn.execute(
          `UPDATE proc_committee_votes SET vote = ?, justification = ?, voted_at = NOW()
           WHERE request_id = ? AND voter_id = ?`,
          [decision, justification || null, requestId, user.id]
        );
      } else {
        // First vote from this member — insert
        await conn.execute(
          `INSERT INTO proc_committee_votes (request_id, voter_id, committee_seat, vote, justification)
           VALUES (?, ?, ?, ?, ?)`,
          [requestId, user.id, seat, decision, justification || null]
        );
      }

      // Log in approval trail
      await conn.execute(
        `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, ?, 'PENDING_COMMITTEE', 'PENDING_COMMITTEE', ?)`,
        [requestId, user.id, user.role,
         decision === 'APPROVED' ? 'COMMITTEE_VOTE_APPROVED' : 'COMMITTEE_VOTE_REJECTED',
         `[${seat || 'N/A'}] ${decision}${justification ? ': ' + justification : ''}`]
      );

      // Now check the current vote tally for this request
      const [allVotes] = await conn.execute(
        `SELECT voter_id, vote FROM proc_committee_votes WHERE request_id = ?`,
        [requestId]
      );

      const totalApproved = allVotes.filter(v => v.vote === 'APPROVED').length;
      const totalRejected = allVotes.filter(v => v.vote === 'REJECTED').length;
      const totalVotes = allVotes.length;

      // Where the request goes once the committee has spoken. Below the
      // threshold the committee's approval is the decision, so it goes straight
      // to Finance. At or above it, the committee only recommends: the request
      // still needs the Super Admin and the owning department's Lead/HOP.
      const onwardStatus = highValue.isHighValue
        ? PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL
        : isV2(req) ? PROC_STATUS.PENDING_DEPT_CONFIRMATION : PROC_STATUS.PENDING_FINAL_FINANCE;

      const advance = async (logComment, resultMessage) => {
        await conn.execute(
          `UPDATE proc_requests SET status=?, committee_reviewed_at=NOW(), updated_at=NOW() WHERE id=?`,
          [onwardStatus, requestId]
        );
        await conn.execute(
          `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
           VALUES (?, ?, ?, ?, 'PENDING_COMMITTEE', ?, ?)`,
          [requestId, user.id, user.role,
           highValue.isHighValue ? 'COMMITTEE_RECOMMENDED' : 'COMMITTEE_APPROVED',
           onwardStatus, logComment]
        );
        if (highValue.isHighValue) {
          // Fire-and-forget: a notification failure must not roll back the vote.
          notificationService.onProcurementHighValuePending(
            requestId, req.request_code, highValue.amount
          ).catch(() => {});
        } else if (onwardStatus === PROC_STATUS.PENDING_DEPT_CONFIRMATION) {
          this._notifyDeptConfirmation(req);
        }
        return { success: true, status: onwardStatus, highValue: highValue.isHighValue, message: resultMessage };
      };

      const onwardLabel = highValue.isHighValue
        ? 'the Super Admin and the Finance Head of Department for approval'
        : isV2(req) ? 'the department for confirmation' : 'Finance for final approval';

      // An ADMIN acting at the committee stage carries the committee outright.
      if (user.role === ROLES.ADMIN && decision === 'APPROVED') {
        return advance(
          `Admin override — forwarded to ${onwardLabel}`,
          `Admin override approved. Forwarded to ${onwardLabel}.`
        );
      }

      if (totalApproved >= COMMITTEE_APPROVALS_REQUIRED) {
        return advance(
          `${COMMITTEE_APPROVALS_REQUIRED} Procurement Committee votes received — forwarded to ${onwardLabel}`,
          highValue.isHighValue
            ? `${COMMITTEE_APPROVALS_REQUIRED} Procurement Committee approvals received. This request is USD ${highValue.amount.toFixed(2)} — recommended for approval and forwarded to the Super Admin and the Finance Head of Department.`
            : `${COMMITTEE_APPROVALS_REQUIRED} Procurement Committee approvals received. Request forwarded to ${onwardLabel}.`
        );
      }

      // Not enough approvals yet — stay at PENDING_COMMITTEE
      const remaining = COMMITTEE_APPROVALS_REQUIRED - totalApproved;
      return {
        success: true,
        status: PROC_STATUS.PENDING_COMMITTEE,
        highValue: highValue.isHighValue,
        votedCount: totalApproved,
        totalRequired: COMMITTEE_APPROVALS_REQUIRED,
        totalVotes,
        totalRejected,
        message: decision === 'REJECTED'
          ? `Vote recorded as REJECTED. You may update your vote to Approve when ready. (${totalApproved}/${COMMITTEE_APPROVALS_REQUIRED} approved)`
          : `Vote recorded (${totalApproved}/${COMMITTEE_APPROVALS_REQUIRED} approved). ${remaining} more approval${remaining > 1 ? 's' : ''} needed.`
      };
    });
  }

  // ============================================================
  // HIGH-VALUE DUAL APPROVAL (Super Admin + Finance Lead/HOP)
  // ============================================================

  /**
   * Which seat, if any, this user occupies for the given request.
   * Returns null when the user has no standing to act at this stage.
   *
   * The second seat used to follow the department that owns the project. It is
   * now Finance's, wherever the request came from: high-value spending is
   * signed off by the Super Admin and the Finance Lead / Head of Department
   * together, and only then does it reach the Finance desk for final approval.
   */
  _highValueSeatFor(user, request) {
    if (user.role === ROLES.ADMIN) return HV_SEAT.SUPER_ADMIN;

    // Only Finance's Head of Department fills the second seat. Finance's Lead,
    // and every other Lead / Head of Department — Admin & HR included — may
    // view a high-value request but not decide it.
    if (user.role === ROLES.HEAD_OF_PROGRAMS && user.department_code === FINANCE_DEPT_CODE) {
      return HV_SEAT.FINANCE;
    }
    return null;
  }

  async getHighValueApprovals(requestId) {
    return query(
      `SELECT a.*, u.first_name, u.last_name, u.email, d.department_code
         FROM proc_high_value_approvals a
         JOIN users u ON u.id = a.approver_id
         LEFT JOIN departments d ON d.id = a.department_id
        WHERE a.request_id = ?
        ORDER BY a.created_at ASC`,
      [requestId]
    );
  }

  /**
   * Record one of the two parallel high-value approvals.
   * Both seats must approve before the request reaches Finance; a rejection by
   * either sends it back to be amended and resubmitted.
   */
  async highValueDecision(requestId, decision, user, comments = '', returnTo = null) {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (req.status !== PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL) {
      throw new Error('Request is not pending high-value approval');
    }
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      throw new Error('Decision must be APPROVED or REJECTED');
    }
    if (decision === 'APPROVED') await this._assertNoOverduePop(user);

    const seat = this._highValueSeatFor(user, req);
    if (!seat) {
      throw new Error(
        'Only the Super Admin or the Finance Head of Department may approve or reject a high-value request'
      );
    }
    if (decision === 'REJECTED' && !String(comments || '').trim()) {
      throw new Error('A reason is required when rejecting');
    }

    return transaction(async (conn) => {
      await conn.execute(
        `INSERT INTO proc_high_value_approvals
           (request_id, seat, approver_id, approver_role, department_id, decision, comments)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           approver_id=VALUES(approver_id), approver_role=VALUES(approver_role),
           department_id=VALUES(department_id), decision=VALUES(decision),
           comments=VALUES(comments), updated_at=NOW()`,
        [requestId, seat, user.id, user.role, user.department_id || null, decision, comments || null]
      );

      const seatLabel = seat === HV_SEAT.SUPER_ADMIN ? 'Super Admin' : 'Finance Head of Department';

      // ── Rejection: stop here. The request goes back to be amended. ──────────
      if (decision === 'REJECTED' && isV2(req)) {
        // v2: the approver says who amends it — Procurement or the requester.
        const result = await this._sendBack(
          conn, req, user, PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL, returnTo,
          `${seatLabel} rejected: ${comments}`, 'HIGH_VALUE_REJECTED'
        );
        return { success: true, ...result };
      }
      if (decision === 'REJECTED') {
        await conn.execute(
          `UPDATE proc_requests
              SET status=?, rejection_reason=?, rejected_from_status=?, updated_at=NOW()
            WHERE id=?`,
          [PROC_STATUS.REJECTED, comments, PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL, requestId]
        );
        await conn.execute(
          `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
           VALUES (?, ?, ?, 'HIGH_VALUE_REJECTED', ?, 'REJECTED', ?)`,
          [requestId, user.id, user.role, PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL,
           `${seatLabel} rejected: ${comments}`]
        );
        return {
          success: true,
          status: PROC_STATUS.REJECTED,
          message: 'Request rejected and returned for amendment. Once corrected and resubmitted it will come back to this approval stage.'
        };
      }

      // ── Approval: advance only when BOTH seats have approved. ──────────────
      await this._assertFundsAvailable(conn, req);
      const [rows] = await conn.execute(
        `SELECT seat, decision FROM proc_high_value_approvals WHERE request_id = ?`,
        [requestId]
      );
      const approvedSeats = new Set(rows.filter(r => r.decision === 'APPROVED').map(r => r.seat));
      const bothApproved = approvedSeats.has(HV_SEAT.SUPER_ADMIN) && approvedSeats.has(HV_SEAT.FINANCE);
      const afterHighValue = isV2(req) ? PROC_STATUS.PENDING_DEPT_CONFIRMATION : PROC_STATUS.PENDING_FINAL_FINANCE;

      await conn.execute(
        `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, 'HIGH_VALUE_APPROVED', ?, ?, ?)`,
        [requestId, user.id, user.role, PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL,
         bothApproved ? afterHighValue : PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL,
         `${seatLabel} approved${comments ? `: ${comments}` : ''}`]
      );

      if (!bothApproved) {
        const waitingOn = approvedSeats.has(HV_SEAT.SUPER_ADMIN)
          ? 'the Finance Head of Department'
          : 'the Super Admin';
        return {
          success: true,
          status: PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL,
          approvedSeats: [...approvedSeats],
          message: `Approval recorded. Still awaiting ${waitingOn}.`
        };
      }

      await conn.execute(
        `UPDATE proc_requests SET status=?, updated_at=NOW() WHERE id=?`,
        [afterHighValue, requestId]
      );
      if (isV2(req)) this._notifyDeptConfirmation(req);
      return {
        success: true,
        status: afterHighValue,
        approvedSeats: [...approvedSeats],
        message: 'Both the Super Admin and the Finance Head of Department have approved. Forwarded to '
          + (isV2(req) ? 'the department for confirmation.' : 'Finance for final approval.')
      };
    });
  }

  async getCommitteeVotes(requestId) {
    return query(
      `SELECT cv.id, cv.committee_seat, cv.vote, cv.justification, cv.voted_at,
         u.first_name, u.last_name, u.email
       FROM proc_committee_votes cv
       JOIN users u ON cv.voter_id = u.id
       WHERE cv.request_id = ?
       ORDER BY cv.voted_at ASC`,
      [requestId]
    );
  }

  // ============================================================
  // FINAL FINANCE APPROVAL
  // ============================================================

  /**
   * Final finance approval.
   *
   * `popFiles` is a list of uploaded Proof of Payment documents — payments are
   * often settled in batches, so more than one may be attached here, and further
   * batches can be added afterwards via addProofOfPayment().
   */
  async finalFinanceApproval(requestId, user, comments = '', popFiles = [], payment = {}) {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (req.status !== 'PENDING_FINAL_FINANCE') {
      throw new Error('Request is not pending final finance approval');
    }
    if (!canActAsProcFinance(user)) {
      throw new Error('Only Finance (the Finance Clerk or the Finance Lead / Head of Department) can give final approval');
    }
    // v2: Finance approves first; the payment and its proof follow.
    if (isV2(req)) {
      await this._assertNoOverduePop(user);
      return this._financeApproveV2(req, user, comments, popFiles, payment);
    }
    if (!popFiles.length) {
      throw new Error('At least one Proof of Payment (POP) document must be uploaded before final approval');
    }

    return transaction(async (conn) => {
      // The legacy single-POP columns still mirror the first document so older
      // reads (the /pop/download endpoint, exports) keep working unchanged.
      const [first] = popFiles;
      await conn.execute(
        `UPDATE proc_requests SET status='COMPLETED', final_finance_approved_at=NOW(), completed_at=NOW(),
          pop_file_path=?, pop_file_name=?, pop_file_size=?, updated_at=NOW() WHERE id=?`,
        [first.path, first.originalname, first.size, requestId]
      );
      for (const f of popFiles) {
        await conn.execute(
          `INSERT INTO proc_request_pops (request_id, file_path, file_name, file_size, uploaded_by)
           VALUES (?, ?, ?, ?, ?)`,
          [requestId, f.path, f.originalname, f.size, user.id]
        );
      }
      await conn.execute(
        `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, 'FINAL_APPROVED', 'PENDING_FINAL_FINANCE', 'COMPLETED', ?)`,
        [requestId, user.id, user.role, comments || 'Final finance approval granted. Payment authorised.']
      );

      // A supplier's star rating is Procurement's assessment of how well they
      // perform, set on the vendor record. It used to go up by one star on
      // every payment, which put every regular supplier at five stars however
      // they had performed, so it is no longer changed here.

      return { success: true };
    });
  }

  // ============================================================
  // WORKFLOW V2 — department confirmation, send-backs, payment
  // ============================================================

  /**
   * The department desk: the Lead / Head of Department of the department that
   * owns the project — the same people who approved the request first — or
   * the General Secretary for a Head of Department's own request.
   */
  _assertDeptDesk(req, user) {
    if (req.is_gs_track) {
      if (user.role !== ROLES.ADMIN) {
        throw new Error("A Head of Department's purchase request is confirmed by the General Secretary");
      }
      return;
    }
    // Decided by the department the partner's project belongs to — not the
    // requester's department, and not anyone else's Lead / Head of Department,
    // whatever their other powers (Finance, Admin & HR, Super Admin).
    if (![ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS].includes(user.role)) {
      throw new Error('Only the Department Lead or Head of Department of the department that owns the project can act at this stage');
    }
    const owningDepartmentId = Number(req.routing_department_id || req.department_id);
    if (owningDepartmentId !== Number(user.department_id)) {
      throw new Error('This request must be confirmed by the Department Lead / Head of Department of the department that owns the selected project');
    }
  }

  _notifyDeptConfirmation(req) {
    notificationService.onProcurementAwaitingDeptConfirmation(
      req.id, req.request_code, req.requester_id,
      Number(req.routing_department_id || req.department_id), Boolean(req.is_gs_track)
    ).catch(() => {});
  }

  /**
   * What the award changed against what the department asked for, item by
   * item. The department reads this at confirmation: when nothing changed it
   * simply confirms; when something did, it confirms the change or sends the
   * request back.
   */
  _awardComparison(items) {
    const awarded = (items || []).some((i) => i.actual_quotation_id != null || i.actual_unit_price != null);
    if (!awarded) return null;
    const money = (v) => `$${Number(v || 0).toFixed(2)}`;
    const changes = [];
    let estimated = 0;
    let actual = 0;
    for (const it of items) {
      const est = Number(it.quantity || 0) * Number(it.estimated_unit_price || 0);
      estimated += est;
      if (Number(it.is_available) !== 1) {
        changes.push(`"${this._short(it.item_description, 60)}" is not being supplied (estimated ${money(est)})`);
        continue;
      }
      const act = it.actual_total != null ? Number(it.actual_total) : est;
      actual += act;
      if (toCents(it.actual_unit_price ?? it.estimated_unit_price) !== toCents(it.estimated_unit_price)) {
        changes.push(`"${this._short(it.item_description, 60)}": ${money(it.estimated_unit_price)} each estimated → ${money(it.actual_unit_price)} awarded`);
      }
    }
    return {
      estimated_total: Math.round(estimated * 100) / 100,
      awarded_total: Math.round(actual * 100) / 100,
      has_changes: changes.length > 0,
      changes
    };
  }

  /** Paid, outstanding and the linked float, for a v2 request. */
  async _paymentSummary(requestId, request) {
    let batches = [];
    try {
      batches = await this.getPaymentBatches(requestId);
    } catch (_) { /* migration not yet run */ }
    const paid = batches.filter((b) => !b.reversed_at).reduce((sum, b) => sum + Number(b.amount || 0), 0);
    const payable = request.payable_amount != null ? Number(request.payable_amount) : null;
    let floatRequest = null;
    if (request.float_request_id) {
      const rows = await query(
        'SELECT id, request_code, status, total_amount FROM requests WHERE id = ?',
        [request.float_request_id]
      );
      floatRequest = rows[0] || null;
    }
    return {
      payment_batches: batches,
      paid_amount: Math.round(paid * 100) / 100,
      outstanding_amount: payable != null ? Math.round((payable - paid) * 100) / 100 : null,
      float_request: floatRequest
    };
  }

  async getPaymentBatches(requestId) {
    return query(
      `SELECT b.*, u.first_name, u.last_name,
              ru.first_name AS reversed_by_first_name, ru.last_name AS reversed_by_last_name,
              (SELECT COUNT(*) FROM proc_request_pops p WHERE p.batch_id = b.id) AS pop_count
         FROM proc_payment_batches b
         LEFT JOIN users u ON u.id = b.paid_by
         LEFT JOIN users ru ON ru.id = b.reversed_by
        WHERE b.request_id = ?
        ORDER BY b.batch_no ASC`,
      [requestId]
    );
  }

  /**
   * Send a request back from a post-Committee stage. The approver chooses who
   * amends it: Procurement (quotations or award) or the requester (the request
   * itself). Either way, once the fix is resubmitted it returns to `fromStage`.
   */
  async _sendBack(conn, req, user, fromStage, returnTo, reason, action = 'REJECTED') {
    const target = String(returnTo || '').toUpperCase();
    if (!Object.values(RETURN_TO).includes(target)) {
      throw new Error('Say who should amend this request: the Procurement team or the requester');
    }
    const toProcurement = target === RETURN_TO.PROCUREMENT;
    const newStatus = toProcurement ? PROC_STATUS.RETURNED_TO_PROCUREMENT : PROC_STATUS.REJECTED;

    await conn.execute(
      `UPDATE proc_requests
          SET status=?, rejection_reason=?, rejected_from_status=?, returned_to=?, updated_at=NOW()
        WHERE id=?`,
      [newStatus, reason, fromStage, target, req.id]
    );
    await this._logEvent(
      conn, req.id, user, action, fromStage, newStatus,
      `${reason} — returned to ${toProcurement ? 'the Procurement team' : 'the requester'} to amend; `
      + `it comes back to ${stageLabel(fromStage)} once resubmitted`
    );

    await this._refreshFloatTrail(conn, req);

    notificationService.onProcurementReturned(
      req.id, req.request_code, req.requester_id, toProcurement, stageLabel(fromStage), reason
    ).catch(() => {});

    return {
      status: newStatus,
      message: toProcurement
        ? `Returned to the Procurement team to amend. It will come back to ${stageLabel(fromStage)} once they resubmit it.`
        : `Returned to the requester to amend. It will come back to ${stageLabel(fromStage)} once they resubmit it.`
    };
  }

  /**
   * Department confirmation: the department that asked for the purchase checks
   * the award. Confirming sends it to Finance; the request must still fit the
   * budget at the awarded prices.
   */
  async confirmDepartment(requestId, user, comments = '') {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (req.status !== PROC_STATUS.PENDING_DEPT_CONFIRMATION) {
      throw new Error('Request is not awaiting department confirmation');
    }
    this._assertDeptDesk(req, user);
    await this._assertNoOverduePop(user);

    const comparison = req.award_comparison;
    const award = await this.isHighValueRequest(requestId);
    return transaction(async (conn) => {
      await this._assertFundsAvailable(conn, req, 'confirm this award');
      await conn.execute(
        `UPDATE proc_requests SET status=?, dept_confirmed_at=NOW(), updated_at=NOW() WHERE id=?`,
        [PROC_STATUS.PENDING_FINAL_FINANCE, requestId]
      );
      const summary = comparison && comparison.has_changes
        ? `Award confirmed with changes from the original request — ${comparison.changes.join('; ')}`
        : 'Award confirmed — no changes from the original request';
      await this._logEvent(
        conn, requestId, user, 'DEPT_CONFIRMED', PROC_STATUS.PENDING_DEPT_CONFIRMATION, PROC_STATUS.PENDING_FINAL_FINANCE,
        comments ? `${summary}. ${comments}` : summary
      );
      // The float requisition exists from here on — the document Finance and
      // the other teams process the payment from. It waits on Finance.
      const float = await this._syncFloat(
        conn, { ...req, status: PROC_STATUS.PENDING_FINAL_FINANCE }, user, award.amount, 'PENDING_FINANCE_APPROVAL'
      );
      return { success: true, status: PROC_STATUS.PENDING_FINAL_FINANCE, float_request_id: float.id, float_request_code: float.code };
    });
  }

  /**
   * Procurement has amended a request sent back to it after the Committee and
   * sends it on. It returns to the stage that sent it back — except that a
   * high-value approval only counts for the award it was given on, so a
   * changed award at or above the threshold goes to the high-value approvers
   * again, and one that dropped below it no longer needs them.
   */
  async resubmitFromProcurement(requestId, selectedQuotationId, user, comments = '', awards = null) {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (req.status !== PROC_STATUS.RETURNED_TO_PROCUREMENT) {
      throw new Error('This request has not been returned to Procurement');
    }
    if (![ROLES.PROCUREMENT_OFFICER, ROLES.ADMIN].includes(user.role)) {
      throw new Error('Only Procurement Officers can resubmit a returned request');
    }
    const quotations = await query('SELECT id FROM proc_quotations WHERE request_id = ?', [requestId]);
    if (!quotations.length) throw new Error('At least one quotation must exist before resubmitting');

    let quotationId = selectedQuotationId;
    let itemAwards = Array.isArray(awards) && awards.length ? awards : null;
    if (!quotationId && !itemAwards) {
      const existing = await this._currentAward(requestId);
      quotationId = existing?.quotationId || null;
      itemAwards = existing?.awards || null;
    }
    const award = await this._resolveAward(
      requestId, quotationId, itemAwards, 'Choose the quotation to award before resubmitting'
    );
    const isHighValue = award.currency === 'USD' && award.amount >= HIGH_VALUE_THRESHOLD_USD;
    const awardChanged = toCents(award.amount) !== toCents(req.selected_quotation_amount || 0);

    return transaction(async (conn) => {
      await this._applyAward(conn, requestId, award, user);

      let target = POST_COMMITTEE_STAGES.includes(req.rejected_from_status)
        ? req.rejected_from_status
        : PROC_STATUS.PENDING_DEPT_CONFIRMATION;

      if (target === PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL || (isHighValue && awardChanged)) {
        await conn.execute('DELETE FROM proc_high_value_approvals WHERE request_id = ?', [requestId]);
      }
      if (target === PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL && !isHighValue) {
        target = PROC_STATUS.PENDING_DEPT_CONFIRMATION;
      } else if (target !== PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL && isHighValue) {
        const [hv] = await conn.execute(
          `SELECT COUNT(DISTINCT seat) AS seats FROM proc_high_value_approvals
            WHERE request_id = ? AND decision = 'APPROVED'`,
          [requestId]
        );
        if (Number(hv[0].seats) < 2) target = PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL;
      }

      await conn.execute(
        `UPDATE proc_requests
            SET status=?, rejected_from_status=NULL, returned_to=NULL, rejection_reason=NULL, updated_at=NOW()
          WHERE id=?`,
        [target, requestId]
      );
      await this._logEvent(
        conn, requestId, user, 'RESUBMITTED_BY_PROCUREMENT', PROC_STATUS.RETURNED_TO_PROCUREMENT, target,
        `${comments || 'Amended by Procurement'} — sent back to ${stageLabel(target)}`
        + (award.split ? `. ${award.summary}` : '')
      );

      if (target === PROC_STATUS.PENDING_HIGH_VALUE_APPROVAL) {
        notificationService.onProcurementHighValuePending(requestId, req.request_code, award.amount).catch(() => {});
      } else if (target === PROC_STATUS.PENDING_DEPT_CONFIRMATION) {
        this._notifyDeptConfirmation(req);
      }
      return { success: true, status: target, message: `Resubmitted — back with ${stageLabel(target)}` };
    });
  }

  /** Payment details Finance enters, checked and normalised. */
  _parsePayment(payment, outstandingCents, { allowFull = true } = {}) {
    const mode = String(payment.payment_mode || 'FULL').toUpperCase();
    if (!['FULL', 'BATCH'].includes(mode)) throw new Error('Payment mode must be FULL or BATCH');
    let amountCents;
    if (mode === 'FULL' && allowFull) {
      amountCents = outstandingCents;
    } else {
      const amount = parseFloat(payment.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter the amount paid in this batch');
      amountCents = toCents(amount);
    }
    if (amountCents > outstandingCents) {
      throw new Error(
        `This payment of $${(amountCents / 100).toFixed(2)} is more than the $${(outstandingCents / 100).toFixed(2)} still to be paid`
      );
    }
    const date = String(payment.payment_date || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
      throw new Error('Payment date is not a valid date');
    }
    const reference = String(payment.payment_reference || '').trim().slice(0, 100) || null;
    const method = String(payment.payment_method || '').trim().toUpperCase();
    if (!PAYMENT_METHODS[method]) {
      throw new Error('Choose how this payment was made: bank transfer, cash or mobile money');
    }
    const bank = String(payment.bank_name || '').trim().slice(0, 100) || null;
    if (method === 'BANK' && !bank) throw new Error('Enter the bank this payment was made from');
    return { mode, amountCents, date, reference, method, bank: method === 'BANK' ? bank : null };
  }

  /**
   * Finance approval of a v2 request. Approval and payment are separate steps:
   * Finance approves the awarded amount, which generates (or approves) the
   * linked float requisition and reserves the money on the budget lines for
   * 10 working days. The payments follow, each with its amount, method and
   * proof of payment; the first must come within 5 working days or the
   * approver cannot approve further purchase requests.
   *
   * A payment sent with the approval (popFiles + payment details) is still
   * recorded straight away, so a one-step approve-and-pay keeps working.
   */
  async _financeApproveV2(req, user, comments, popFiles, payment) {
    const requestId = req.id;
    const award = await this.isHighValueRequest(requestId);
    const payableCents = toCents(award.amount);
    if (payableCents <= 0) throw new Error('This request has no awarded amount to pay');
    const payNow = popFiles.length ? this._parsePayment({ ...payment, payment_mode: 'BATCH', amount: payment.amount || payableCents / 100 }, payableCents) : null;

    const now = new Date();
    const popDue = reservations.addWorkingDays(now, reservations.POP_DEADLINE_WORKING_DAYS);
    const reservedUntil = reservations.addWorkingDays(now, reservations.RESERVATION_WORKING_DAYS);
    const day = (d) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const usd = (cents) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const result = await transaction(async (conn) => {
      const [locked] = await conn.execute('SELECT status FROM proc_requests WHERE id = ? FOR UPDATE', [requestId]);
      if (locked[0]?.status !== PROC_STATUS.PENDING_FINAL_FINANCE) {
        throw new Error('Request is no longer pending final finance approval — refresh and try again');
      }
      await this._assertFundsAvailable(conn, req, 'approve this request');

      await conn.execute(
        `UPDATE proc_requests
            SET status=?, final_finance_approved_at=NOW(), final_finance_approved_by=?, pop_due_at=?,
                payment_mode=NULL, payable_amount=?, updated_at=NOW()
          WHERE id=?`,
        [PROC_STATUS.PENDING_PAYMENT, user.id, popDue, payableCents / 100, requestId]
      );
      await this._logEvent(
        conn, requestId, user, 'FINAL_APPROVED', PROC_STATUS.PENDING_FINAL_FINANCE, PROC_STATUS.PENDING_PAYMENT,
        `${comments || 'Finance approval granted.'} Approved for payment: ${usd(payableCents)}. `
        + `Proof of payment due by ${day(popDue)} (${reservations.POP_DEADLINE_WORKING_DAYS} working days).`
      );

      // The float was generated at department confirmation (or is created now
      // for a request confirmed before that existed). Finance's approval moves
      // it to Approved, after the approval is logged so its trail includes it.
      const float = await this._syncFloat(conn, req, user, payableCents / 100, 'APPROVED');

      // Hold the money until it is paid.
      const impact = await this.getBudgetImpact(requestId, conn);
      const heldCents = await reservations.syncPrReservation(conn, requestId, impact, user, { expiresAt: reservedUntil });
      await this._logEvent(
        conn, requestId, user, 'FUNDS_RESERVED', PROC_STATUS.PENDING_PAYMENT, PROC_STATUS.PENDING_PAYMENT,
        `${usd(heldCents)} reserved on ${impact.filter((l) => l.still_needed > 0).map((l) => `${l.budget_code} (${usd(toCents(l.still_needed))})`).join(', ')} `
        + `until ${day(reservedUntil)} (${reservations.RESERVATION_WORKING_DAYS} working days). Each payment is deducted from the budget as it is recorded; `
        + 'if nothing is paid by then the request is rejected automatically and the funds released.'
      );
      await this._refreshFloatTrail(conn, req);

      let batch = {};
      if (payNow) {
        batch = await this._recordPaymentBatch(
          conn, { ...req, status: PROC_STATUS.PENDING_PAYMENT }, float, payNow, comments, popFiles, user, payableCents
        );
      }
      return {
        success: true,
        status: batch.status || PROC_STATUS.PENDING_PAYMENT,
        float_request_id: float.id,
        float_request_code: float.code,
        payable_amount: payableCents / 100,
        outstanding_amount: batch.outstanding_amount ?? payableCents / 100,
        completed: Boolean(batch.completed),
        pop_due_at: popDue,
        reserved_until: reservedUntil,
        ...batch
      };
    });

    notificationService.onProcurementApprovedForPayment(
      requestId, req.request_code, req.requester_id, user.id, popDue, reservedUntil
    ).catch(() => {});
    if (payNow) {
      notificationService.onProcurementPaid(
        requestId, req.request_code, req.requester_id, result.float_request_code, result.completed
      ).catch(() => {});
    }
    return result;
  }

  /**
   * Withdraw Finance's approval (sent back, or the reservation expired): the
   * hold is closed, the approval stamps cleared and the float returns to
   * awaiting Finance. Only valid while nothing has been paid.
   */
  async _undoFinanceApproval(conn, req, user, reason, closeAs = 'RELEASED') {
    const cents = await reservations.closeReservation(conn, 'PR', req.id, closeAs, user, reason);
    await conn.execute(
      `UPDATE proc_requests
          SET final_finance_approved_at=NULL, final_finance_approved_by=NULL, pop_due_at=NULL,
              payable_amount=NULL, payment_mode=NULL, updated_at=NOW()
        WHERE id=?`,
      [req.id]
    );
    if (cents > 0) {
      await this._logEvent(
        conn, req.id, user, 'FUNDS_RELEASED', req.status, req.status,
        `Reservation of $${(cents / 100).toFixed(2)} released back to the budget lines — ${reason}`
      );
    }
    if (req.float_request_id) {
      const [rows] = await conn.execute('SELECT status FROM requests WHERE id = ?', [req.float_request_id]);
      if (rows.length && rows[0].status === 'APPROVED') {
        await conn.execute(
          `UPDATE requests SET status='PENDING_FINANCE_APPROVAL', finance_approved_at=NULL, updated_at=NOW(3), version=version+1 WHERE id=?`,
          [req.float_request_id]
        );
        await conn.execute(
          `INSERT INTO approval_logs (request_id, approver_id, approver_role, action, previous_status, new_status, comments)
           VALUES (?, ?, ?, 'APPROVAL_WITHDRAWN', 'APPROVED', 'PENDING_FINANCE_APPROVAL', ?)`,
          [req.float_request_id, user.id, user.role, `Finance approval of ${req.request_code} withdrawn — ${reason}`]
        );
      }
    }
    return cents;
  }

  /**
   * Called by the reservation scheduler once a request's 10 working days have
   * run out. A request already being paid has no expiry; one with nothing paid
   * is rejected back to its requester and the funds released. Returns true
   * when it was rejected.
   */
  async expireReservation(requestId, system, expiresAt) {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req || req.status !== PROC_STATUS.PENDING_PAYMENT) return false;
    if ((req.payment_batches || []).some((b) => !b.reversed_at)) {
      await query(
        "UPDATE budget_reservations SET expires_at = NULL WHERE source_type = 'PR' AND source_id = ? AND status = 'ACTIVE'",
        [requestId]
      );
      return false;
    }
    const until = new Date(expiresAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const reason = `Not paid within ${reservations.RESERVATION_WORKING_DAYS} working days of Finance approval (funds were reserved until ${until})`;

    const done = await transaction(async (conn) => {
      const [locked] = await conn.execute('SELECT status FROM proc_requests WHERE id = ? FOR UPDATE', [requestId]);
      if (locked[0]?.status !== PROC_STATUS.PENDING_PAYMENT) return false;
      const [paid] = await conn.execute(
        'SELECT COUNT(*) AS n FROM proc_payment_batches WHERE request_id = ? AND reversed_at IS NULL', [requestId]
      );
      if (Number(paid[0].n) > 0) return false;

      await this._undoFinanceApproval(conn, req, system, 'the reservation expired', 'EXPIRED');
      await conn.execute(
        `UPDATE proc_requests
            SET status='REJECTED', rejection_reason=?, rejected_from_status=?, returned_to=?, updated_at=NOW()
          WHERE id=?`,
        [reason, PROC_STATUS.PENDING_FINAL_FINANCE, RETURN_TO.REQUESTER, requestId]
      );
      await this._logEvent(
        conn, requestId, system, 'AUTO_REJECTED', PROC_STATUS.PENDING_PAYMENT, PROC_STATUS.REJECTED,
        `Automatically rejected by the system: ${reason}. The reserved funds were released. `
        + 'Once the requester resubmits it, it returns to Finance for approval.'
      );
      if (req.float_request_id) {
        await conn.execute(
          `UPDATE requests SET status='REJECTED', updated_at=NOW(3), version=version+1 WHERE id=?`, [req.float_request_id]
        );
        await conn.execute(
          `INSERT INTO approval_logs (request_id, approver_id, approver_role, action, previous_status, new_status, comments)
           VALUES (?, ?, 'SYSTEM', 'AUTO_REJECTED', 'PENDING_FINANCE_APPROVAL', 'REJECTED', ?)`,
          [req.float_request_id, system.id, `Automatically rejected with ${req.request_code}: ${reason}`]
        );
      }
      await this._refreshFloatTrail(conn, req);
      return true;
    });

    if (done) {
      notificationService.onReservationExpired(
        requestId, req.request_code, req.requester_id, 'proc_request', req.final_finance_approved_by
      ).catch(() => {});
    }
    return done;
  }

  /** A further payment batch on a request Finance has already approved. */
  async recordPaymentBatch(requestId, user, payment = {}, popFiles = []) {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (!isV2(req) || req.status !== PROC_STATUS.PENDING_PAYMENT) {
      throw new Error('Payments can only be recorded on an approved request that still has an amount outstanding');
    }
    if (!canActAsProcFinance(user)) {
      throw new Error('Only Finance (the Finance Clerk or the Finance Lead / Head of Department) can record a payment');
    }
    if (!popFiles.length) throw new Error('Attach the proof of payment for this batch');

    const result = await transaction(async (conn) => {
      const [locked] = await conn.execute(
        'SELECT status, payable_amount, float_request_id FROM proc_requests WHERE id = ? FOR UPDATE', [requestId]
      );
      if (locked[0]?.status !== PROC_STATUS.PENDING_PAYMENT) {
        throw new Error('This request is no longer awaiting payment — refresh and try again');
      }
      const [floats] = await conn.execute(
        'SELECT id, request_code FROM requests WHERE id = ?', [locked[0].float_request_id]
      );
      if (!floats.length) throw new Error('The float requisition for this request could not be found');

      const [paidRows] = await conn.execute(
        'SELECT COALESCE(SUM(amount), 0) AS paid FROM proc_payment_batches WHERE request_id = ? AND reversed_at IS NULL', [requestId]
      );
      const payableCents = toCents(locked[0].payable_amount);
      const outstandingCents = payableCents - toCents(paidRows[0].paid);
      if (outstandingCents <= 0) throw new Error('Nothing is outstanding on this request');
      const pay = this._parsePayment({ ...payment, payment_mode: 'BATCH' }, outstandingCents, { allowFull: false });

      return this._recordPaymentBatch(
        conn, req, { id: floats[0].id, code: floats[0].request_code }, pay,
        payment.notes || '', popFiles, user, payableCents
      );
    });

    notificationService.onProcurementPaid(
      requestId, req.request_code, req.requester_id, req.float_request?.request_code, result.completed
    ).catch(() => {});
    return { success: true, ...result };
  }

  /**
   * Finance reverses one payment batch: the money it took from each budget
   * line goes back (a REVERSAL transaction against the same float, line by
   * line, exactly as the batch deducted it), the batch is marked reversed —
   * never deleted, so the trail keeps it — and the request is reopened for
   * payment. A request that had been paid in full returns to Pending payment
   * and its float requisition reopens.
   */
  async reversePaymentBatch(requestId, batchId, user, reason = '') {
    if (!canActAsProcFinance(user)) {
      throw new Error('Only Finance (the Finance Clerk or the Finance Lead / Head of Department) can reverse a payment');
    }
    if (!String(reason || '').trim()) throw new Error('Give a reason for reversing this payment');
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (!isV2(req) || ![PROC_STATUS.PENDING_PAYMENT, PROC_STATUS.COMPLETED].includes(req.status)) {
      throw new Error('Only a payment on an approved purchase request can be reversed');
    }

    const result = await transaction(async (conn) => {
      await conn.execute('SELECT id FROM proc_requests WHERE id = ? FOR UPDATE', [requestId]);
      const [batches] = await conn.execute(
        'SELECT * FROM proc_payment_batches WHERE id = ? AND request_id = ? FOR UPDATE', [batchId, requestId]
      );
      const batch = batches[0];
      if (!batch) throw new Error('Payment batch not found');
      if (batch.reversed_at) throw new Error(`Payment batch ${batch.batch_no} has already been reversed`);

      const [floats] = await conn.execute('SELECT id, request_code, status FROM requests WHERE id = ?', [batch.float_request_id]);
      const float = floats[0];
      if (!float) throw new Error('The float requisition for this payment could not be found');

      // The deductions this batch made, one per budget line.
      const [deductions] = await conn.execute(
        `SELECT id, budget_line_id, amount FROM budget_transactions
          WHERE request_id = ? AND transaction_type = 'DEDUCTION' AND description LIKE ?`,
        [float.id, `Payment batch ${batch.batch_no} for ${req.request_code} %`]
      );
      const deductedCents = deductions.reduce((s, d) => s + toCents(d.amount), 0);
      if (deductedCents !== toCents(batch.amount)) {
        throw new Error(
          `The budget deductions for payment batch ${batch.batch_no} do not add up to its amount — reverse it manually with Finance support`
        );
      }

      for (const d of deductions) {
        const amount = Number(d.amount);
        const [bl] = await conn.execute(
          'SELECT (allocated_amount - spent_amount) AS balance, donor_id FROM budget_lines WHERE id = ? FOR UPDATE',
          [d.budget_line_id]
        );
        if (!bl.length) continue;
        const balanceBefore = parseFloat(bl[0].balance);
        await conn.execute(
          'UPDATE budget_lines SET spent_amount = spent_amount - ?, updated_at = NOW() WHERE id = ?',
          [amount, d.budget_line_id]
        );
        await conn.execute(
          `INSERT INTO budget_transactions
             (budget_line_id, request_id, transaction_type, amount, balance_before, balance_after, description, performed_by)
           VALUES (?, ?, 'REVERSAL', ?, ?, ?, ?, ?)`,
          [d.budget_line_id, float.id, amount, balanceBefore, Math.round((balanceBefore + amount) * 100) / 100,
           `Reversal of payment batch ${batch.batch_no} for ${req.request_code} (float ${float.request_code}): ${String(reason).trim().slice(0, 200)}`,
           user.id]
        );
        if (bl[0].donor_id) {
          await conn.execute(
            'UPDATE donors SET total_spent = total_spent - ?, updated_at = NOW() WHERE id = ?',
            [amount, bl[0].donor_id]
          );
        }
      }

      await conn.execute(
        'UPDATE proc_payment_batches SET reversed_at = NOW(), reversed_by = ?, reversal_reason = ? WHERE id = ?',
        [user.id, String(reason).trim().slice(0, 500), batch.id]
      );

      const [paidRows] = await conn.execute(
        'SELECT COALESCE(SUM(amount), 0) AS paid FROM proc_payment_batches WHERE request_id = ? AND reversed_at IS NULL',
        [requestId]
      );
      const paidCents = toCents(paidRows[0].paid);
      const outstandingCents = toCents(req.payable_amount) - paidCents;

      // Nothing paid any more: the request is back to approved-and-unpaid, so
      // the reservation window and the proof-of-payment deadline start again.
      const nothingPaid = paidCents <= 0;
      const popDue = nothingPaid ? reservations.addWorkingDays(new Date(), reservations.POP_DEADLINE_WORKING_DAYS) : null;
      await conn.execute(
        `UPDATE proc_requests SET status = ?, completed_at = NULL${nothingPaid ? ', pop_due_at = ?' : ''}, updated_at = NOW() WHERE id = ?`,
        nothingPaid ? [PROC_STATUS.PENDING_PAYMENT, popDue, requestId] : [PROC_STATUS.PENDING_PAYMENT, requestId]
      );
      const impact = await this.getBudgetImpact(requestId, conn);
      const reservedUntil = nothingPaid ? reservations.addWorkingDays(new Date(), reservations.RESERVATION_WORKING_DAYS) : null;
      const heldCents = await reservations.syncPrReservation(conn, requestId, impact, user, { expiresAt: reservedUntil });
      await this._logEvent(
        conn, requestId, user, 'PAYMENT_REVERSED', req.status, PROC_STATUS.PENDING_PAYMENT,
        `Payment batch ${batch.batch_no} ($${Number(batch.amount).toFixed(2)}) reversed and returned to the budget: ${String(reason).trim()}. `
        + `$${(outstandingCents / 100).toFixed(2)} now outstanding and reserved again ($${(heldCents / 100).toFixed(2)} held`
        + (nothingPaid
          ? ` until ${reservedUntil.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}; proof of payment due by ${popDue.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}).`
          : ').')
      );

      // A float closed by the last payment reopens.
      if (float.status === 'RECONCILED') {
        await conn.execute(
          `UPDATE requests SET status = 'APPROVED', completed_at = NULL, updated_at = NOW(3), version = version + 1 WHERE id = ?`,
          [float.id]
        );
      }
      await conn.execute(
        `INSERT INTO approval_logs (request_id, approver_id, approver_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, 'PAYMENT_REVERSED', ?, 'APPROVED', ?)`,
        [float.id, user.id, user.role, float.status,
         `Payment batch ${batch.batch_no} of ${req.request_code} ($${Number(batch.amount).toFixed(2)}) reversed: ${String(reason).trim()}`]
      );

      return {
        batch_no: batch.batch_no,
        amount: Number(batch.amount),
        paid_amount: paidCents / 100,
        outstanding_amount: outstandingCents / 100,
        status: PROC_STATUS.PENDING_PAYMENT
      };
    });
    return { success: true, ...result };
  }

  /**
   * Create the float requisition for a Finance-approved purchase request. It is
   * born approved — the PR's approvals are its approvals, copied onto its trail
   * — and carries a reference built from the same partner and project.
   */
  async _generateFloat(conn, req, user, payable, status = 'APPROVED') {
    const code = await generateRequestCode(conn, req.donor_id, req.project_id);
    const justification =
      `Float requisition generated from purchase request ${req.request_code} — ${req.title}\n\n${req.justification || ''}`.trim();

    const [ins] = await conn.execute(
      `INSERT INTO requests
         (request_code, requester_id, department_id, donor_id, project_id, routing_department_id,
          status, total_amount, justification, priority,
          submitted_at, lead_approved_at, finance_approved_at,
          created_at, updated_at, version, source_proc_request_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${status === 'APPROVED' ? 'NOW(3)' : 'NULL'}, NOW(3), NOW(3), 1, ?)`,
      [code, req.requester_id, req.department_id, req.donor_id, req.project_id,
       req.routing_department_id || null, status, payable, justification, req.priority || 'MEDIUM',
       req.submitted_at || null, req.dept_approved_at || null, req.id]
    );
    const floatId = ins.insertId;
    await this._writeFloatItems(conn, floatId, req);
    await this._copyTrailToFloat(conn, floatId, req);
    await conn.execute(
      `INSERT INTO approval_logs (request_id, approver_id, approver_role, action, previous_status, new_status, comments)
       VALUES (?, ?, ?, 'GENERATED_FROM_PR', NULL, ?, ?)`,
      [floatId, user.id, user.role, status,
       `Float requisition generated from purchase request ${req.request_code} when the department confirmed the award. `
       + 'It is approved and paid through the purchase request — no reconciliation is required.']
    );
    return { id: floatId, code };
  }

  /** The float's items are the PR's awarded items, at the awarded prices. */
  async _writeFloatItems(conn, floatId, req) {
    await conn.execute('DELETE FROM request_items WHERE request_id = ?', [floatId]);
    const [items] = await conn.execute(
      'SELECT * FROM proc_request_items WHERE request_id = ? AND is_available = 1 ORDER BY id', [req.id]
    );
    if (!items.length) throw new Error('No awarded items to pay for on this request');
    for (const it of items) {
      if (!it.budget_line_id) {
        throw new Error(`"${this._short(it.item_description, 60)}" has no budget line — it cannot be paid`);
      }
      await conn.execute(
        `INSERT INTO request_items
           (request_id, item_description, category, quantity, unit_of_measure, unit_price, budget_line_id, notes, created_at, updated_at)
         VALUES (?, ?, 'PROCUREMENT', ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
        [floatId, it.item_description, it.quantity, it.unit_of_measure || 'unit',
         it.actual_unit_price != null ? it.actual_unit_price : it.estimated_unit_price,
         it.budget_line_id, `Purchase request ${req.request_code}, item #${it.id}`]
      );
    }
  }

  /**
   * The PR's trail, mirrored onto its float. Actions are prefixed PR_ so float
   * statistics (rejections, approver counts) do not count PR decisions twice.
   * Re-run whenever the PR moves, so the float's trail is always current; the
   * float's own entries (generation, payments) are left alone.
   */
  async _copyTrailToFloat(conn, floatId, req) {
    await conn.execute("DELETE FROM approval_logs WHERE request_id = ? AND action LIKE 'PR\\_%'", [floatId]);
    await conn.execute(
      `INSERT INTO approval_logs
         (request_id, approver_id, approver_role, action, previous_status, new_status, comments, created_at)
       SELECT ?, actor_id, actor_role, LEFT(CONCAT('PR_', action), 50), previous_status, new_status,
              CONCAT('[', ?, '] ', COALESCE(comments, '')), created_at
         FROM proc_approval_logs
        WHERE request_id = ?
        ORDER BY created_at ASC, id ASC`,
      [floatId, req.request_code, req.id]
    );
  }

  /**
   * The PR's float requisition, created on first confirmation and brought up
   * to date afterwards — a request confirmed again after being sent back keeps
   * its float and reference number; only the items, amount and status change.
   *
   *   PENDING_FINANCE_APPROVAL — confirmed by the department, with Finance
   *   APPROVED                 — Finance approved; being paid
   *   RECONCILED               — paid in full (set by the last payment)
   */
  async _syncFloat(conn, req, user, payable, status) {
    const [rows] = await conn.execute(
      'SELECT id, request_code, status FROM requests WHERE source_proc_request_id = ?', [req.id]
    );
    if (!rows.length) {
      const float = await this._generateFloat(conn, req, user, payable, status);
      await conn.execute('UPDATE proc_requests SET float_request_id = ? WHERE id = ?', [float.id, req.id]);
      return float;
    }
    const float = { id: rows[0].id, code: rows[0].request_code };
    await this._writeFloatItems(conn, float.id, req);
    await conn.execute(
      `UPDATE requests
          SET status = ?, total_amount = ?, finance_approved_at = ${status === 'APPROVED' ? 'NOW(3)' : 'NULL'},
              updated_at = NOW(3), version = version + 1
        WHERE id = ?`,
      [status, payable, float.id]
    );
    await this._copyTrailToFloat(conn, float.id, req);
    await conn.execute('UPDATE proc_requests SET float_request_id = ? WHERE id = ?', [float.id, req.id]);
    return float;
  }

  /** Keep the float's copy of the trail current after a PR event (send-back, recall). */
  async _refreshFloatTrail(conn, req) {
    const [rows] = await conn.execute('SELECT id FROM requests WHERE source_proc_request_id = ?', [req.id]);
    if (rows.length) await this._copyTrailToFloat(conn, rows[0].id, req);
  }

  // ============================================================
  // BUDGET IMPACT — funds must be there before anyone approves
  // ============================================================

  /**
   * Per budget line: what this request takes from it, what the line has left,
   * and whether that is enough. Before the award the estimates are what is
   * asked for; after it, the awarded prices. Whatever has already been paid on
   * the request's float is already out of the balance, so only the unpaid part
   * still has to fit.
   */
  async getBudgetImpact(requestId, conn = null) {
    const run = conn ? (sql, p) => conn.execute(sql, p).then(r => r[0]) : query;
    const others = reservations.reservedSql('bl', { type: 'PR', id: Number(requestId) });
    const lines = await run(
      `SELECT bl.id AS budget_line_id, bl.budget_code, bl.budget_name, bl.allocated_amount, bl.spent_amount,
              (bl.allocated_amount - bl.spent_amount - ${others}) AS balance,
              ${others} AS reserved_by_others,
              SUM(CASE WHEN pri.is_available = 1
                       THEN pri.quantity * COALESCE(pri.actual_unit_price, pri.estimated_unit_price)
                       ELSE 0 END) AS request_amount
         FROM proc_request_items pri
         JOIN budget_lines bl ON bl.id = pri.budget_line_id
        WHERE pri.request_id = ?
        GROUP BY bl.id
        ORDER BY bl.budget_code`,
      [requestId]
    );
    const paidByLine = new Map();
    const paid = await run(
      `SELECT bt.budget_line_id,
              SUM(CASE WHEN bt.transaction_type = 'DEDUCTION' THEN bt.amount
                       WHEN bt.transaction_type = 'REVERSAL' THEN -bt.amount ELSE 0 END) AS paid
         FROM budget_transactions bt
         JOIN requests r ON r.id = bt.request_id
        WHERE r.source_proc_request_id = ?
        GROUP BY bt.budget_line_id`,
      [requestId]
    );
    for (const p of paid) paidByLine.set(Number(p.budget_line_id), Number(p.paid || 0));
    return lines.map((l) => {
      const requestCents = toCents(l.request_amount);
      const paidCents = toCents(paidByLine.get(Number(l.budget_line_id)) || 0);
      const stillNeededCents = Math.max(0, requestCents - paidCents);
      const balanceCents = toCents(l.balance);
      return {
        budget_line_id: l.budget_line_id,
        budget_code: l.budget_code,
        budget_name: l.budget_name,
        allocated_amount: Number(l.allocated_amount),
        spent_amount: Number(l.spent_amount),
        reserved_by_others: Number(l.reserved_by_others || 0),
        balance: balanceCents / 100,
        request_amount: requestCents / 100,
        already_paid: paidCents / 100,
        still_needed: stillNeededCents / 100,
        balance_after: (balanceCents - stillNeededCents) / 100,
        sufficient: stillNeededCents <= balanceCents
      };
    });
  }

  /**
   * Refuse an approval while any budget line is short. The approver cannot
   * approve their way past it: Finance must top the line up first.
   */
  async _assertFundsAvailable(conn, req, action = 'approve this request') {
    if (!isV2(req)) return;
    const impact = await this.getBudgetImpact(req.id, conn);
    const short = impact.filter((l) => !l.sufficient);
    if (!short.length) return;
    const money = (v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const err = new Error(
      `Insufficient funds — you cannot ${action} until the budget is topped up. `
      + short.map((l) => `${l.budget_code} has ${money(l.balance)} available but this request needs ${money(l.still_needed)} (short by ${money(l.still_needed - l.balance)})`).join('; ')
      + '.'
    );
    err.insufficientFunds = short;
    throw err;
  }

  /**
   * Record one payment and deduct it from the budget. The amount is spread over
   * the request's budget lines in proportion to what each line is charged on
   * the float, so a part-payment draws on every line fairly. Paying the last of
   * the amount completes the request and closes its float.
   */
  async _recordPaymentBatch(conn, req, float, pay, notes, popFiles, user, payableCents) {
    // Batch numbers stay unique across reversals; the amount paid does not
    // count a reversed batch.
    const [agg] = await conn.execute(
      `SELECT COALESCE(SUM(CASE WHEN reversed_at IS NULL THEN amount ELSE 0 END), 0) AS paid,
              COALESCE(MAX(batch_no), 0) AS n
         FROM proc_payment_batches WHERE request_id = ?`,
      [req.id]
    );
    const paidBeforeCents = toCents(agg[0].paid);
    const batchNo = Number(agg[0].n) + 1;
    const amount = pay.amountCents / 100;

    const [ins] = await conn.execute(
      `INSERT INTO proc_payment_batches
         (request_id, float_request_id, batch_no, amount, payment_date, payment_reference, payment_method, bank_name, notes, paid_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.id, float.id, batchNo, amount, pay.date, pay.reference, pay.method || null, pay.bank || null,
       notes ? String(notes).slice(0, 500) : null, user.id]
    );
    const batchId = ins.insertId;
    for (const f of popFiles) {
      await conn.execute(
        `INSERT INTO proc_request_pops (request_id, file_path, file_name, file_size, note, uploaded_by, batch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.id, f.path, f.originalname, f.size, `Payment batch ${batchNo}`, user.id, batchId]
      );
    }

    await this._deductFromBudget(conn, float, req.request_code, batchNo, pay.amountCents, user, req.id);

    const paidCents = paidBeforeCents + pay.amountCents;
    const outstandingCents = payableCents - paidCents;
    const completed = outstandingCents <= 0;
    const via = paymentMethodLabel(pay.method, pay.bank);
    const ref = `${via ? ` by ${via}` : ''}${pay.reference ? ` (ref ${pay.reference})` : ''}`;

    // The reservation now holds only what is still to be paid, and — the
    // request being under way — no longer expires. Paid in full, it closes.
    const impact = await this.getBudgetImpact(req.id, conn);
    const stillHeld = await reservations.syncPrReservation(conn, req.id, impact, user, {
      expiresAt: null, closeAs: 'CONSUMED', reason: `paid through batch ${batchNo}`
    });

    await conn.execute(
      `INSERT INTO approval_logs (request_id, approver_id, approver_role, action, previous_status, new_status, comments)
       VALUES (?, ?, ?, ?, 'APPROVED', 'APPROVED', ?)`,
      [float.id, user.id, user.role, batchNo === 1 ? 'DISPATCHED' : 'PAYMENT_BATCH',
       `Payment batch ${batchNo}: $${amount.toFixed(2)} paid on ${pay.date}${ref} through ${req.request_code}`]
    );
    if (batchNo === 1) {
      await conn.execute('UPDATE requests SET dispatched_at = NOW(3), updated_at = NOW(3) WHERE id = ?', [float.id]);
    }

    const prStatus = completed ? PROC_STATUS.COMPLETED : PROC_STATUS.PENDING_PAYMENT;
    await conn.execute(
      `UPDATE proc_requests SET status=?, completed_at=${completed ? 'NOW()' : 'NULL'}, updated_at=NOW() WHERE id=?`,
      [prStatus, req.id]
    );
    await this._logEvent(
      conn, req.id, user, 'PAYMENT_RECORDED', req.status, prStatus,
      `Payment batch ${batchNo}: $${amount.toFixed(2)} paid on ${pay.date}${ref}, with ${popFiles.length} proof of payment document${popFiles.length === 1 ? '' : 's'}, `
      + `deducted from the budget through float ${float.code}. `
      + (completed
        ? 'Paid in full — the reservation is closed.'
        : `$${(outstandingCents / 100).toFixed(2)} still to be paid and stays reserved ($${(stillHeld / 100).toFixed(2)} held).`)
    );

    if (completed) {
      // Paid to the supplier in exact amounts — nothing to reconcile.
      await conn.execute(
        `UPDATE requests SET status='RECONCILED', completed_at=NOW(3), updated_at=NOW(3), version=version+1 WHERE id=?`,
        [float.id]
      );
      await conn.execute(
        `INSERT INTO approval_logs (request_id, approver_id, approver_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, 'PAID_IN_FULL', 'APPROVED', 'RECONCILED', ?)`,
        [float.id, user.id, user.role,
         `Paid in full through ${req.request_code} in ${batchNo} batch${batchNo === 1 ? '' : 'es'}. Closed without reconciliation — the supplier was paid the exact amount.`]
      );
    }

    return {
      batch_no: batchNo,
      amount,
      paid_amount: paidCents / 100,
      outstanding_amount: Math.max(0, outstandingCents) / 100,
      completed,
      status: prStatus
    };
  }

  /** Deduct one payment from the float's budget lines, as dispatch does for an ordinary float. */
  async _deductFromBudget(conn, float, prCode, batchNo, amountCents, user, prId = null) {
    const [rows] = await conn.execute(
      `SELECT budget_line_id, SUM(quantity * unit_price) AS line_total
         FROM request_items WHERE request_id = ? GROUP BY budget_line_id ORDER BY budget_line_id`,
      [float.id]
    );
    const lines = rows.map((r) => ({ id: r.budget_line_id, weight: toCents(r.line_total) })).filter((l) => l.weight > 0);
    const totalWeight = lines.reduce((sum, l) => sum + l.weight, 0);
    if (!totalWeight) throw new Error('The float requisition has no priced budget lines to charge');

    // Proportional split in whole cents; the rounding remainder goes to the
    // largest line so the deductions always add up to the payment exactly.
    let allocated = 0;
    for (const l of lines) {
      l.cents = Math.floor((amountCents * l.weight) / totalWeight);
      allocated += l.cents;
    }
    lines.reduce((max, l) => (l.weight > max.weight ? l : max), lines[0]).cents += amountCents - allocated;

    // Every line must have the money for its share before anything moves.
    // Money this request reserved for itself is its own; other requests'
    // reservations are not available to it.
    const heldByOthers = await reservations.reservedByLine(
      conn, lines.map((l) => l.id), prId ? { type: 'PR', id: prId } : null
    );
    const short = [];
    for (const l of lines) {
      const [bl] = await conn.execute(
        'SELECT budget_code, (allocated_amount - spent_amount) AS balance FROM budget_lines WHERE id = ? FOR UPDATE', [l.id]
      );
      const availableCents = bl.length ? toCents(bl[0].balance) - (heldByOthers.get(Number(l.id)) || 0) : 0;
      if (bl.length && l.cents > availableCents) {
        short.push(`${bl[0].budget_code} has $${(Math.max(0, availableCents) / 100).toFixed(2)} available but this payment needs $${(l.cents / 100).toFixed(2)}`);
      }
    }
    if (short.length) {
      throw new Error(`Insufficient funds — top up the budget before recording this payment. ${short.join('; ')}.`);
    }

    for (const l of lines) {
      if (l.cents <= 0) continue;
      const amount = l.cents / 100;
      const [bl] = await conn.execute(
        'SELECT (allocated_amount - spent_amount) AS balance, donor_id FROM budget_lines WHERE id = ? FOR UPDATE',
        [l.id]
      );
      if (!bl.length) continue;
      const balanceBefore = parseFloat(bl[0].balance);
      await conn.execute(
        'UPDATE budget_lines SET spent_amount = spent_amount + ?, updated_at = NOW() WHERE id = ?',
        [amount, l.id]
      );
      await conn.execute(
        `INSERT INTO budget_transactions
           (budget_line_id, request_id, transaction_type, amount, balance_before, balance_after, description, performed_by)
         VALUES (?, ?, 'DEDUCTION', ?, ?, ?, ?, ?)`,
        [l.id, float.id, amount, balanceBefore, Math.round((balanceBefore - amount) * 100) / 100,
         `Payment batch ${batchNo} for ${prCode} (float ${float.code})`, user.id]
      );
      if (bl[0].donor_id) {
        await conn.execute(
          'UPDATE donors SET total_spent = total_spent + ?, updated_at = NOW() WHERE id = ?',
          [amount, bl[0].donor_id]
        );
      }
    }
  }

  /**
   * The requester's open v2 purchase requests on a project, for the float
   * form: their float is generated automatically, so a separate float must not
   * be raised for the same purchase.
   */
  async getOpenRequestsForProject(user, projectId) {
    if (!projectId) return [];
    return query(
      `SELECT id, request_code, title, status, total_estimated_amount
         FROM proc_requests
        WHERE requester_id = ? AND project_id = ? AND workflow_version = ?
          AND status NOT IN ('COMPLETED', 'CANCELLED', 'DRAFT')
        ORDER BY created_at DESC`,
      [user.id, projectId, WORKFLOW_V2]
    );
  }

  // ============================================================
  // PROOF OF PAYMENT (multiple documents per request)
  // ============================================================

  async getProofOfPayments(requestId) {
    return query(
      `SELECT p.*, u.first_name, u.last_name
       FROM proc_request_pops p
       LEFT JOIN users u ON u.id = p.uploaded_by
       WHERE p.request_id = ?
       ORDER BY p.created_at ASC, p.id ASC`,
      [requestId]
    );
  }

  /**
   * Attach further POP documents after final approval — used when a payment is
   * settled in batches and the later instalments are paid separately.
   */
  async addProofOfPayment(requestId, user, files = [], note = null, batchId = null) {
    if (!canActAsProcFinance(user)) {
      throw new Error('Only Finance or Admin can attach proof of payment');
    }
    if (!files.length) throw new Error('No files were uploaded');

    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (!['PENDING_FINAL_FINANCE', 'PENDING_PAYMENT', 'COMPLETED'].includes(req.status)) {
      throw new Error('Proof of payment can only be attached once a request has reached final finance approval');
    }

    // v2: a proof of payment always belongs to a payment. A new payment is
    // recorded with its amount, method and proof together (Add Payment); here
    // only further documents for a payment already recorded can be added.
    if (isV2(req)) {
      const batch = (req.payment_batches || []).find((b) => Number(b.id) === Number(batchId));
      if (!batch) {
        throw new Error('Record the payment with Add Payment — enter the amount, how it was paid and the proof of payment together');
      }
      if (batch.reversed_at) throw new Error(`Payment batch ${batch.batch_no} has been reversed`);
      return transaction(async (conn) => {
        for (const f of files) {
          await conn.execute(
            `INSERT INTO proc_request_pops (request_id, file_path, file_name, file_size, note, uploaded_by, batch_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [requestId, f.path, f.originalname, f.size, note || `Payment batch ${batch.batch_no}`, user.id, batch.id]
          );
        }
        await this._logEvent(
          conn, requestId, user, 'POP_ATTACHED', req.status, req.status,
          `${files.length} further proof of payment document(s) attached to payment batch ${batch.batch_no} `
          + `($${Number(batch.amount).toFixed(2)}): ${files.map((f) => this._short(f.originalname, 60)).join(', ')}${note ? ` — ${note}` : ''}`
        );
        return { success: true, added: files.length };
      });
    }

    return transaction(async (conn) => {
      for (const f of files) {
        await conn.execute(
          `INSERT INTO proc_request_pops (request_id, file_path, file_name, file_size, note, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [requestId, f.path, f.originalname, f.size, note || null, user.id]
        );
      }
      // Keep the legacy mirror populated if it was empty.
      await conn.execute(
        `UPDATE proc_requests SET pop_file_path=COALESCE(pop_file_path, ?),
           pop_file_name=COALESCE(pop_file_name, ?), pop_file_size=COALESCE(pop_file_size, ?),
           updated_at=NOW() WHERE id=?`,
        [files[0].path, files[0].originalname, files[0].size, requestId]
      );
      await conn.execute(
        `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, 'POP_ATTACHED', ?, ?, ?)`,
        [requestId, user.id, user.role, req.status, req.status,
         `${files.length} proof of payment document(s) attached${note ? `: ${note}` : ''}`]
      );
      return { success: true, added: files.length };
    });
  }

  async deleteProofOfPayment(requestId, popId, user) {
    if (!canActAsProcFinance(user)) {
      throw new Error('Only Finance or Admin can remove proof of payment');
    }
    const rows = await query(
      'SELECT * FROM proc_request_pops WHERE id = ? AND request_id = ?', [popId, requestId]
    );
    if (!rows.length) throw new Error('Proof of payment not found');

    const remaining = await query(
      'SELECT COUNT(*) AS cnt FROM proc_request_pops WHERE request_id = ?', [requestId]
    );
    const req = await this.getPurchaseRequestById(requestId);
    if (req && req.status === 'COMPLETED' && Number(remaining[0].cnt) <= 1) {
      throw new Error('A completed request must keep at least one proof of payment');
    }
    if (rows[0].batch_id) {
      const [sameBatch] = await query(
        'SELECT COUNT(*) AS cnt FROM proc_request_pops WHERE batch_id = ?', [rows[0].batch_id]
      );
      if (Number(sameBatch.cnt) <= 1) {
        throw new Error('Every payment batch must keep at least one proof of payment — upload the replacement first');
      }
    }

    await query('DELETE FROM proc_request_pops WHERE id = ?', [popId]);

    // If the legacy mirror pointed at the deleted file, repoint it at whatever remains.
    const [next] = await this.getProofOfPayments(requestId);
    await query(
      `UPDATE proc_requests SET pop_file_path=?, pop_file_name=?, pop_file_size=?, updated_at=NOW()
       WHERE id=? AND pop_file_path=?`,
      [next?.file_path ?? null, next?.file_name ?? null, next?.file_size ?? null, requestId, rows[0].file_path]
    );
    await this._logEvent(
      null, requestId, user, 'POP_REMOVED', req?.status || null, req?.status || null,
      `Proof of payment "${this._short(rows[0].file_name, 80)}" removed`
    );
    return { success: true };
  }

  async reverseFinalApproval(requestId, user, reason = '') {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (req.status !== 'COMPLETED') {
      throw new Error('Only COMPLETED requests can have their final approval reversed');
    }
    if (!canActAsProcFinance(user)) {
      throw new Error('Only Finance or Admin can reverse final approval');
    }
    if (isV2(req)) {
      throw new Error(
        'Payments on this request have already been deducted from the budget through its float requisition, so its final approval cannot be reversed'
      );
    }
    await query(
      `UPDATE proc_requests SET status='PENDING_FINAL_FINANCE', final_finance_approved_at=NULL, completed_at=NULL,
        pop_file_path=NULL, pop_file_name=NULL, pop_file_size=NULL, updated_at=NOW() WHERE id=?`,
      [requestId]
    );
    // The uploaded documents themselves are kept: reversing an approval does not
    // unmake a payment that was already proven, and Finance needs the history.
    await query(
      `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
       VALUES (?, ?, ?, 'REVERSED', 'COMPLETED', 'PENDING_FINAL_FINANCE', ?)`,
      [requestId, user.id, user.role, reason || 'Final approval reversed']
    );
    return { success: true };
  }

  // ============================================================
  // QUOTATIONS
  // ============================================================

  // ── Quotation line items ─────────────────────────────────────
  //
  // A quotation is a supplier's answer to the requested items, so it is priced
  // line by line rather than as one lump sum. Each line either maps back to a
  // proc_request_items row (request_item_id set) or is one the Procurement team
  // keyed in themselves (is_manual = 1) — a substitute, or something the
  // supplier proposes in place of a line they cannot fill. A line the supplier
  // cannot supply at all is kept with is_available = 0 so the gap stays visible
  // to the Committee instead of silently disappearing.

  /**
   * Accept the items either as an array or as the JSON string a multipart form
   * sends, and coerce every field. Returns null when the caller sent nothing at
   * all, which means "leave the existing lines alone".
   */
  parseQuotationItems(raw) {
    if (raw === undefined || raw === null || raw === '') return null;
    let items = raw;
    if (typeof raw === 'string') {
      try {
        items = JSON.parse(raw);
      } catch (_) {
        throw new Error('Quotation items are not valid JSON');
      }
    }
    if (!Array.isArray(items)) throw new Error('Quotation items must be a list');

    return items.map((it, idx) => {
      const available = it.is_available === undefined
        ? true
        : [true, 1, '1', 'true'].includes(it.is_available);
      const description = String(it.description || it.item_description || '').trim();
      if (!description) throw new Error(`Line ${idx + 1}: a description is required`);

      const quantity = it.quantity === undefined || it.quantity === null || it.quantity === ''
        ? 1 : parseFloat(it.quantity);
      if (Number.isNaN(quantity) || quantity <= 0) {
        throw new Error(`Line ${idx + 1} (${description}): quantity must be greater than zero`);
      }

      let unitPrice = null;
      if (available) {
        if (it.unit_price === undefined || it.unit_price === null || it.unit_price === '') {
          throw new Error(`Line ${idx + 1} (${description}): a unit price is required, or mark the line as not available`);
        }
        unitPrice = parseFloat(it.unit_price);
        if (Number.isNaN(unitPrice) || unitPrice < 0) {
          throw new Error(`Line ${idx + 1} (${description}): the unit price must be a number of zero or more`);
        }
      }

      const requestItemId = it.request_item_id ? Number(it.request_item_id) : null;
      return {
        request_item_id: requestItemId,
        description,
        quantity,
        unit_of_measure: it.unit_of_measure || 'unit',
        unit_price: unitPrice,
        is_available: available ? 1 : 0,
        // A line with no requested item behind it is, by definition, one the
        // team added by hand.
        is_manual: requestItemId ? 0 : 1,
        notes: it.notes || null,
        sort_order: idx,
      };
    });
  }

  /** The quotation total implied by its priced, available lines. */
  quotationItemsTotal(items) {
    const total = items.reduce(
      (sum, it) => sum + (it.is_available ? it.quantity * (it.unit_price || 0) : 0),
      0
    );
    return Math.round(total * 100) / 100;
  }

  /** Replace a quotation's lines wholesale. Caller supplies the transaction. */
  async replaceQuotationItems(conn, quotationId, items) {
    await conn.execute('DELETE FROM proc_quotation_items WHERE quotation_id = ?', [quotationId]);
    for (const it of items) {
      await conn.execute(
        `INSERT INTO proc_quotation_items
          (quotation_id, request_item_id, description, quantity, unit_of_measure,
           unit_price, is_available, is_manual, notes, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          quotationId, it.request_item_id, it.description, it.quantity,
          it.unit_of_measure, it.unit_price, it.is_available, it.is_manual,
          it.notes, it.sort_order,
        ]
      );
    }
  }

  /** Attach `items` to each quotation in the list, in one extra round trip. */
  async attachQuotationItems(quotations) {
    if (!quotations.length) return quotations;
    const ids = quotations.map((q) => q.id);
    const rows = await query(
      `SELECT qi.*, ri.item_description AS request_item_description,
              ri.quantity AS requested_quantity,
              ri.estimated_unit_price AS requested_unit_price
       FROM proc_quotation_items qi
       LEFT JOIN proc_request_items ri ON qi.request_item_id = ri.id
       WHERE qi.quotation_id IN (${ids.map(() => '?').join(',')})
       ORDER BY qi.is_manual ASC, qi.sort_order ASC, qi.id ASC`,
      ids
    );
    const byQuotation = new Map(ids.map((id) => [id, []]));
    for (const row of rows) {
      const bucket = byQuotation.get(row.quotation_id);
      if (bucket) bucket.push(row);
    }
    return quotations.map((q) => ({ ...q, items: byQuotation.get(q.id) || [] }));
  }

  /**
   * Guard for "this quotation is complete enough to put in front of the
   * Committee": every requested item must have been answered, either with a
   * price or with an explicit "not available". Throws with the offending items
   * named, so the officer knows exactly what to go back and fill in.
   */
  async assertQuotationIsPriced(requestId, quotationId) {
    const missing = await query(
      `SELECT ri.id, ri.item_description
       FROM proc_request_items ri
       WHERE ri.request_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM proc_quotation_items qi
           WHERE qi.quotation_id = ? AND qi.request_item_id = ri.id
         )
       ORDER BY ri.id`,
      [requestId, quotationId]
    );
    if (missing.length) {
      const names = missing.map((m) => m.item_description).join(', ');
      throw new Error(
        'Every requested item must be priced on the selected quotation before it goes to the '
        + `Committee. Still outstanding: ${names}`
      );
    }
  }

  /**
   * Copy the selected quotation's prices onto the requested items as the
   * actuals. This is what turns "what we asked for" into "what it will cost",
   * and it is what the Committee, Finance and the Super Admin read afterwards.
   * Caller supplies the transaction.
   */
  async applyQuotationActuals(conn, requestId, quotationId) {
    const [lines] = await conn.execute(
      `SELECT request_item_id, quantity, unit_price, is_available
       FROM proc_quotation_items
       WHERE quotation_id = ? AND request_item_id IS NOT NULL`,
      [quotationId]
    );
    for (const line of lines) {
      const available = Number(line.is_available) === 1;
      await conn.execute(
        `UPDATE proc_request_items
            SET actual_unit_price = ?, actual_total = ?, actual_quotation_id = ?, is_available = ?
          WHERE id = ? AND request_id = ?`,
        [
          available ? line.unit_price : null,
          available ? Number(line.quantity) * Number(line.unit_price || 0) : null,
          quotationId,
          available ? 1 : 0,
          line.request_item_id, requestId,
        ]
      );
    }
  }

  // ── Awards: one supplier, or a different supplier per item ───────────────
  //
  // A request is normally awarded to one quotation in full. When suppliers are
  // each best on different items, Procurement makes a split award instead:
  // every requested item names the quotation it goes to. Each quotation that
  // wins anything is marked selected, with awarded_amount holding the value of
  // its winning lines, and each item's actuals come from its own supplier.

  /**
   * Validate what is being awarded and price it. Throws `missingMessage` when
   * nothing was chosen.
   *
   * Returns { split, amount, currency, summary, ... } — `amount` is the total
   * awarded across every supplier, which is what the Committee bypass and the
   * high-value rule are judged on.
   */
  async _resolveAward(requestId, quotationId, awards, missingMessage) {
    if (Array.isArray(awards) && awards.length) {
      return this._resolveSplitAward(requestId, awards);
    }
    if (!quotationId) throw new Error(missingMessage);

    const rows = await query(
      'SELECT id, vendor_name, total_amount, currency FROM proc_quotations WHERE id = ? AND request_id = ?',
      [quotationId, requestId]
    );
    if (!rows.length) {
      throw new Error('The selected quotation does not belong to this request');
    }
    await this.assertQuotationIsPriced(requestId, quotationId);
    return {
      split: false,
      quotationId: rows[0].id,
      amount: parseFloat(rows[0].total_amount) || 0,
      currency: rows[0].currency || 'USD',
      summary: `Awarded to ${this._short(rows[0].vendor_name, 80)}`
    };
  }

  /**
   * A split award must place every requested item: with a supplier whose
   * quotation prices it as available, or with nobody (quotation_id null) when
   * no supplier can provide it. All suppliers must quote in one currency, or
   * the total — and with it every threshold — would be meaningless.
   */
  async _resolveSplitAward(requestId, awards) {
    const items = await query(
      'SELECT id, item_description FROM proc_request_items WHERE request_id = ? ORDER BY id',
      [requestId]
    );
    const itemIds = new Set(items.map((i) => i.id));
    const choice = new Map();
    for (const a of awards) {
      const itemId = Number(a.request_item_id);
      if (!itemIds.has(itemId)) {
        throw new Error('The award names an item that is not on this request');
      }
      if (choice.has(itemId)) {
        throw new Error('Each item can be awarded to only one supplier');
      }
      choice.set(itemId, a.quotation_id ? Number(a.quotation_id) : null);
    }
    const unplaced = items.filter((i) => !choice.has(i.id));
    if (unplaced.length) {
      throw new Error(
        `Choose a supplier for every item. Still to place: ${unplaced.map((i) => i.item_description).join(', ')}`
      );
    }

    const quotationIds = [...new Set([...choice.values()].filter(Boolean))];
    if (!quotationIds.length) {
      throw new Error('At least one item must be awarded to a supplier');
    }
    const marks = quotationIds.map(() => '?').join(',');
    const quots = await query(
      `SELECT id, vendor_name, currency FROM proc_quotations WHERE request_id = ? AND id IN (${marks})`,
      [requestId, ...quotationIds]
    );
    if (quots.length !== quotationIds.length) {
      throw new Error('A chosen quotation does not belong to this request');
    }
    const currencies = new Set(quots.map((q) => q.currency || 'USD'));
    if (currencies.size > 1) {
      throw new Error(
        `Every supplier in a split award must be quoted in the same currency (found ${[...currencies].join(', ')})`
      );
    }
    const vendorOf = new Map(quots.map((q) => [q.id, this._short(q.vendor_name, 60)]));

    const lines = await query(
      `SELECT quotation_id, request_item_id, quantity, unit_price, is_available
       FROM proc_quotation_items
       WHERE quotation_id IN (${marks}) AND request_item_id IS NOT NULL`,
      quotationIds
    );

    const perItem = [];
    const amountByQuotation = new Map(quotationIds.map((id) => [id, 0]));
    const itemsByVendor = new Map();
    const notAwarded = [];
    for (const item of items) {
      const qid = choice.get(item.id);
      if (!qid) {
        perItem.push({ itemId: item.id, quotationId: null });
        notAwarded.push(item.item_description);
        continue;
      }
      const line = lines.find((l) => l.quotation_id === qid && l.request_item_id === item.id);
      if (!line) {
        throw new Error(
          `${vendorOf.get(qid)} has not priced "${item.item_description}". Price it on that quotation or choose another supplier`
        );
      }
      if (Number(line.is_available) !== 1) {
        throw new Error(
          `${vendorOf.get(qid)} marked "${item.item_description}" as not available. Choose another supplier for it`
        );
      }
      const unitPrice = Number(line.unit_price || 0);
      const lineTotal = Math.round(Number(line.quantity) * unitPrice * 100) / 100;
      amountByQuotation.set(qid, amountByQuotation.get(qid) + lineTotal);
      perItem.push({ itemId: item.id, quotationId: qid, unitPrice, lineTotal });
      if (!itemsByVendor.has(qid)) itemsByVendor.set(qid, []);
      itemsByVendor.get(qid).push(item.item_description);
    }
    for (const [qid, amt] of amountByQuotation) {
      amountByQuotation.set(qid, Math.round(amt * 100) / 100);
    }
    const amount = Math.round([...amountByQuotation.values()].reduce((s, v) => s + v, 0) * 100) / 100;
    const currency = [...currencies][0];

    const parts = [...itemsByVendor].map(([qid, names]) =>
      `${vendorOf.get(qid)} (${currency} ${amountByQuotation.get(qid).toFixed(2)}): ${names.map((n) => this._short(n, 60)).join(', ')}`
    );
    if (notAwarded.length) {
      parts.push(`not awarded: ${notAwarded.map((n) => this._short(n, 60)).join(', ')}`);
    }

    return {
      split: true,
      quotationIds,
      perItem,
      amountByQuotation,
      amount,
      currency,
      summary: `Split award — ${parts.join('; ')}`
    };
  }

  /** Record an award resolved by _resolveAward. Caller supplies the transaction. */
  async _applyAward(conn, requestId, award, user) {
    await conn.execute(
      'UPDATE proc_quotations SET is_selected=FALSE, awarded_amount=NULL WHERE request_id=?',
      [requestId]
    );

    if (!award.split) {
      await conn.execute(
        'UPDATE proc_quotations SET is_selected=TRUE, selected_at=NOW(), selected_by=? WHERE id=? AND request_id=?',
        [user.id, award.quotationId, requestId]
      );
      await this.applyQuotationActuals(conn, requestId, award.quotationId);
      return;
    }

    for (const [qid, amt] of award.amountByQuotation) {
      await conn.execute(
        'UPDATE proc_quotations SET is_selected=TRUE, awarded_amount=?, selected_at=NOW(), selected_by=? WHERE id=? AND request_id=?',
        [amt, user.id, qid, requestId]
      );
    }
    for (const p of award.perItem) {
      await conn.execute(
        `UPDATE proc_request_items
            SET actual_unit_price = ?, actual_total = ?, actual_quotation_id = ?, is_available = ?
          WHERE id = ? AND request_id = ?`,
        p.quotationId
          ? [p.unitPrice, p.lineTotal, p.quotationId, 1, p.itemId, requestId]
          : [null, null, null, 0, p.itemId, requestId]
      );
    }
  }

  /**
   * The award as it stands, in the shape _resolveAward takes — used when a
   * resubmission keeps the existing choice. Returns null when there is none,
   * or when an item points at a quotation that is no longer selected (it was
   * deleted), so the officer is made to choose again.
   */
  async _currentAward(requestId) {
    const selected = await query(
      'SELECT id, awarded_amount FROM proc_quotations WHERE request_id = ? AND is_selected = TRUE',
      [requestId]
    );
    if (!selected.length) return null;
    if (selected.length === 1 && selected[0].awarded_amount == null) {
      return { quotationId: selected[0].id };
    }
    const selectedIds = new Set(selected.map((q) => q.id));
    const items = await query(
      'SELECT id, actual_quotation_id FROM proc_request_items WHERE request_id = ?',
      [requestId]
    );
    if (items.some((i) => i.actual_quotation_id != null && !selectedIds.has(i.actual_quotation_id))) {
      return null;
    }
    return {
      awards: items.map((i) => ({ request_item_id: i.id, quotation_id: i.actual_quotation_id }))
    };
  }

  /**
   * After a quotation in a split award is amended, restate the items it won
   * from its new lines and re-total its share. A line it no longer offers
   * leaves the item unpriced rather than carrying a superseded figure.
   */
  async _refreshSplitAwardLines(conn, requestId, quotationId) {
    const [items] = await conn.execute(
      'SELECT id FROM proc_request_items WHERE request_id = ? AND actual_quotation_id = ?',
      [requestId, quotationId]
    );
    const [lines] = await conn.execute(
      `SELECT request_item_id, quantity, unit_price, is_available
       FROM proc_quotation_items WHERE quotation_id = ? AND request_item_id IS NOT NULL`,
      [quotationId]
    );
    let total = 0;
    for (const item of items) {
      const line = lines.find((l) => l.request_item_id === item.id);
      const available = line && Number(line.is_available) === 1;
      const lineTotal = available
        ? Math.round(Number(line.quantity) * Number(line.unit_price || 0) * 100) / 100
        : null;
      if (available) total += lineTotal;
      await conn.execute(
        `UPDATE proc_request_items SET actual_unit_price = ?, actual_total = ?, is_available = ?
          WHERE id = ? AND request_id = ?`,
        [available ? line.unit_price : null, lineTotal, available ? 1 : 0, item.id, requestId]
      );
    }
    await conn.execute(
      'UPDATE proc_quotations SET awarded_amount = ? WHERE id = ?',
      [Math.round(total * 100) / 100, quotationId]
    );
  }

  /**
   * A quotation names a supplier from the register, never free text, and only
   * once the register says what the supplier does and whether the
   * anti-terrorism check has been recorded.
   */
  async _vendorForQuotation(vendorId) {
    const [vendor] = vendorId
      ? await query('SELECT * FROM proc_vendors WHERE id = ? AND is_active = 1', [vendorId])
      : [];
    if (!vendor) throw new Error('Choose the supplier from the vendor list');
    if (!vendor.category || vendor.antiterror_verified === null) {
      throw new Error(`Record the category and anti-terrorism check for ${vendor.company_name} before using this supplier`);
    }
    return vendor;
  }

  async addQuotation(requestId, data, user) {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (!QUOTATION_EDITABLE_STATUSES.includes(req.status)) {
      throw new Error('Quotations can only be added when request is in procurement or committee review stage');
    }

    const vendor = await this._vendorForQuotation(data.vendor_id);

    const items = this.parseQuotationItems(data.items);
    // When lines are supplied the total is their sum — a header figure that
    // disagrees with its own breakdown is worse than no figure at all.
    const totalAmount = items && items.length
      ? this.quotationItemsTotal(items)
      : data.total_amount;

    return transaction(async (conn) => {
      const [result] = await conn.execute(
        `INSERT INTO proc_quotations
          (request_id, vendor_id, vendor_name, vendor_email, vendor_phone, quotation_number,
           total_amount, currency, validity_date, delivery_timeline, terms_and_conditions,
           notes, file_path, file_name, file_size, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          requestId,
          vendor.id,
          vendor.company_name,
          data.vendor_email || vendor.email || null,
          data.vendor_phone || vendor.phone || null,
          data.quotation_number || null,
          totalAmount,
          this._normalizeCurrency(data.currency),
          data.validity_date || null,
          data.delivery_timeline || null,
          data.terms_and_conditions || null,
          data.notes || null,
          data.file_path || null,
          data.file_name || null,
          data.file_size || null,
          user.id
        ]
      );

      if (items && items.length) {
        await this.replaceQuotationItems(conn, result.insertId, items);
      }
      await this._logEvent(
        conn, requestId, user, 'QUOTATION_ADDED', req.status, req.status,
        `Quotation from ${this._short(vendor.company_name, 80)} added at `
        + `${this._normalizeCurrency(data.currency)} ${Number(totalAmount || 0).toFixed(2)}`
        + `${data.quotation_number ? ` (Ref ${this._short(data.quotation_number, 40)})` : ''}`
        + `${items && items.length ? ` — ${items.length} priced line(s)` : ''}`
      );
      return { quotationId: result.insertId, total_amount: totalAmount };
    });
  }

  async getQuotations(requestId) {
    const quotations = await query(
      `SELECT pq.*,
        v.company_name AS vendor_company, v.is_prequalified, v.rating AS vendor_rating,
        v.category AS vendor_category, v.antiterror_verified,
        u.first_name AS created_by_first_name, u.last_name AS created_by_last_name
       FROM proc_quotations pq
       LEFT JOIN proc_vendors v ON pq.vendor_id = v.id
       LEFT JOIN users u ON pq.created_by = u.id
       WHERE pq.request_id = ?
       ORDER BY pq.total_amount ASC`,
      [requestId]
    );
    return this.attachQuotationItems(quotations);
  }

  async deleteQuotation(quotationId, user) {
    const rows = await query('SELECT * FROM proc_quotations WHERE id = ?', [quotationId]);
    if (!rows.length) throw new Error('Quotation not found');
    if (![ROLES.PROCUREMENT_OFFICER, ROLES.ADMIN].includes(user.role)) {
      throw new Error('Only Procurement Officers can delete quotations');
    }
    const quot = rows[0];
    const [parent] = await query('SELECT status FROM proc_requests WHERE id = ?', [quot.request_id]);
    // Same window as editing: once a request has left Procurement and the
    // Committee, its bids are the record of what was decided. Recall it to
    // Procurement first to change them.
    if (!QUOTATION_EDITABLE_STATUSES.includes(parent?.status)) {
      throw new Error('Quotations can only be deleted while the request is in the procurement or committee-review stage');
    }
    await query('DELETE FROM proc_quotations WHERE id = ?', [quotationId]);
    // No transaction on this path, so the log is written after the delete — a
    // failed delete must not leave a phantom entry on the trail.
    await this._logEvent(
      null, quot.request_id, user, 'QUOTATION_DELETED', parent?.status || null, parent?.status || null,
      `Quotation from ${this._short(quot.vendor_name, 80)} `
      + `(${this._normalizeCurrency(quot.currency)} ${Number(quot.total_amount || 0).toFixed(2)})`
      + `${Number(quot.is_selected) === 1 ? ' — this was the SELECTED bid' : ''} removed`
    );
    return { success: true };
  }

  async updateQuotation(quotationId, data, user) {
    const rows = await query('SELECT pq.*, pr.status as request_status FROM proc_quotations pq JOIN proc_requests pr ON pq.request_id = pr.id WHERE pq.id = ?', [quotationId]);
    if (!rows.length) throw new Error('Quotation not found');
    const quot = rows[0];
    if (![ROLES.PROCUREMENT_OFFICER, ROLES.ADMIN].includes(user.role)) {
      throw new Error('Only Procurement Officers can edit quotations');
    }
    if (!QUOTATION_EDITABLE_STATUSES.includes(quot.request_status)) {
      throw new Error('Quotations can only be edited while the request is in the procurement or committee-review stage. Recall it to Procurement first to amend it');
    }
    // Amended lines replace the previous ones wholesale, and the header total
    // follows them. Sending no `items` at all leaves the existing lines alone,
    // which is what an edit that only touches the vendor details means.
    // Changing the supplier goes through the register like a new quotation;
    // correcting a price on the existing supplier does not.
    const vendorChanged = data.vendor_id && Number(data.vendor_id) !== Number(quot.vendor_id);
    const vendor = vendorChanged ? await this._vendorForQuotation(data.vendor_id) : null;
    data.vendor_name = vendor ? vendor.company_name : null;

    const items = this.parseQuotationItems(data.items);
    const totalAmount = items && items.length
      ? this.quotationItemsTotal(items)
      : (data.total_amount ? parseFloat(data.total_amount) : null);

    // Build dynamic update — include file fields only when a new file is provided
    const hasNewFile = data.file_path != null;
    const sql = hasNewFile
      ? `UPDATE proc_quotations SET
          vendor_id=COALESCE(?,vendor_id), vendor_name=COALESCE(?,vendor_name), vendor_email=COALESCE(?,vendor_email), vendor_phone=COALESCE(?,vendor_phone),
          quotation_number=COALESCE(?,quotation_number), total_amount=COALESCE(?,total_amount),
          currency=COALESCE(?,currency), validity_date=COALESCE(?,validity_date),
          delivery_timeline=COALESCE(?,delivery_timeline), notes=COALESCE(?,notes),
          file_path=?, file_name=?, file_size=?, updated_at=NOW()
         WHERE id=?`
      : `UPDATE proc_quotations SET
          vendor_id=COALESCE(?,vendor_id), vendor_name=COALESCE(?,vendor_name), vendor_email=COALESCE(?,vendor_email), vendor_phone=COALESCE(?,vendor_phone),
          quotation_number=COALESCE(?,quotation_number), total_amount=COALESCE(?,total_amount),
          currency=COALESCE(?,currency), validity_date=COALESCE(?,validity_date),
          delivery_timeline=COALESCE(?,delivery_timeline), notes=COALESCE(?,notes), updated_at=NOW()
         WHERE id=?`;

    const params = [
      vendor ? vendor.id : null, data.vendor_name, data.vendor_email || null, data.vendor_phone || null,
      data.quotation_number || null, totalAmount,
      data.currency ? this._normalizeCurrency(data.currency, quot.currency) : null,
      data.validity_date || null, data.delivery_timeline || null,
      data.notes || null,
      ...(hasNewFile ? [data.file_path, data.file_name || null, data.file_size || null] : []),
      quotationId
    ];

    return transaction(async (conn) => {
      await conn.execute(sql, params);
      if (items) {
        await this.replaceQuotationItems(conn, quotationId, items);
        // If this quotation is already selected, the actuals carried on the
        // requested items were taken from the lines just replaced, so they are
        // restated here rather than left pointing at superseded prices. In a
        // split award only the items this supplier won are touched.
        if (quot.is_selected && quot.awarded_amount != null) {
          await this._refreshSplitAwardLines(conn, quot.request_id, quotationId);
        } else if (quot.is_selected) {
          await this.applyQuotationActuals(conn, quot.request_id, quotationId);
        }
      }

      // A bid amended after the comparison was drawn up is the change a reviewer
      // most needs to see, so the old figures are spelled out, not just replaced.
      const changed = [];
      if (data.vendor_name && data.vendor_name !== quot.vendor_name) {
        changed.push(`supplier "${this._short(quot.vendor_name, 60)}" → "${this._short(data.vendor_name, 60)}"`);
      }
      if (totalAmount != null && Number(totalAmount).toFixed(2) !== Number(quot.total_amount || 0).toFixed(2)) {
        changed.push(`amount ${Number(quot.total_amount || 0).toFixed(2)} → ${Number(totalAmount).toFixed(2)}`);
      }
      if (data.currency && this._normalizeCurrency(data.currency, quot.currency) !== quot.currency) {
        changed.push(`currency ${quot.currency} → ${this._normalizeCurrency(data.currency, quot.currency)}`);
      }
      if (data.quotation_number && data.quotation_number !== quot.quotation_number) {
        changed.push(`reference ${this._short(quot.quotation_number, 40)} → ${this._short(data.quotation_number, 40)}`);
      }
      if (items) changed.push(`${items.length} priced line(s) replaced`);

      if (changed.length) {
        await this._logEvent(
          conn, quot.request_id, user, 'QUOTATION_UPDATED', quot.request_status, quot.request_status,
          `Quotation from ${this._short(quot.vendor_name, 60)}`
          + `${Number(quot.is_selected) === 1 ? ' (the SELECTED bid)' : ''} amended: ${changed.join('; ')}`
        );
      }

      return { success: true, total_amount: totalAmount };
    });
  }

  async resubmitToCommittee(requestId, selectedQuotationId, user, comments = '', awards = null) {
    const req = await this.getPurchaseRequestById(requestId);
    if (!req) throw new Error('Request not found');
    if (req.status !== 'PENDING_COMMITTEE') {
      throw new Error('Only requests currently under committee review can be resubmitted');
    }
    if (![ROLES.PROCUREMENT_OFFICER, ROLES.ADMIN].includes(user.role)) {
      throw new Error('Only Procurement Officers can resubmit to the committee');
    }

    // Check at least one quotation exists
    const quotations = await query('SELECT id FROM proc_quotations WHERE request_id = ?', [requestId]);
    if (!quotations.length) {
      throw new Error('At least one quotation must exist before resubmitting');
    }

    // Leaving the choice out means "keep the award already made" — an
    // amendment usually corrects a price, not the supplier. Either way the
    // Committee must be given fully priced bids, exactly as on first
    // submission.
    let quotationId = selectedQuotationId;
    let itemAwards = Array.isArray(awards) && awards.length ? awards : null;
    if (!quotationId && !itemAwards) {
      const existing = await this._currentAward(requestId);
      quotationId = existing?.quotationId || null;
      itemAwards = existing?.awards || null;
    }
    const award = await this._resolveAward(
      requestId, quotationId, itemAwards,
      'Choose the recommended quotation before resubmitting to the Committee'
    );

    return transaction(async (conn) => {
      // Reset existing committee votes so members can vote afresh on the revised quotations
      await conn.execute('DELETE FROM proc_committee_votes WHERE request_id = ?', [requestId]);

      await this._applyAward(conn, requestId, award, user);

      // Keep status as PENDING_COMMITTEE but log the amendment
      await conn.execute(
        `UPDATE proc_requests SET updated_at=NOW() WHERE id=?`,
        [requestId]
      );
      await conn.execute(
        `INSERT INTO proc_approval_logs (request_id, actor_id, actor_role, action, previous_status, new_status, comments)
         VALUES (?, ?, ?, 'RESUBMITTED_TO_COMMITTEE', 'PENDING_COMMITTEE', 'PENDING_COMMITTEE', ?)`,
        [requestId, user.id, user.role,
         (comments || 'Quotations amended and resubmitted to committee for review') + (award.split ? `. ${award.summary}` : '')]
      );
      return { success: true };
    });
  }

  // ============================================================
  // VENDORS
  // ============================================================

  async getVendors(filters = {}) {
    let where = 'WHERE 1=1';
    const params = [];

    if (filters.search) {
      where += ' AND (v.company_name LIKE ? OR v.vendor_code LIKE ? OR v.contact_person LIKE ?)';
      const s = `%${filters.search}%`;
      params.push(s, s, s);
    }
    if (filters.category === UNCATEGORIZED) {
      where += " AND (v.category IS NULL OR v.category = '')";
    } else if (filters.category) {
      where += ' AND v.category = ?';
      params.push(filters.category);
    }
    if (filters.antiterror === 'verified') where += ' AND v.antiterror_verified = 1';
    if (filters.antiterror === 'not_verified') where += ' AND v.antiterror_verified = 0';
    if (filters.antiterror === 'not_recorded') where += ' AND v.antiterror_verified IS NULL';
    if (filters.is_prequalified !== undefined) {
      where += ' AND v.is_prequalified = ?';
      params.push(filters.is_prequalified === 'true' ? 1 : 0);
    }
    // Star rating bands: good 4–5, average 2.5–3.5, poor below 2.5, or none yet.
    if (filters.rating === 'good') where += ' AND v.rating >= 4';
    if (filters.rating === 'average') where += ' AND v.rating >= 2.5 AND v.rating < 4';
    if (filters.rating === 'poor') where += ' AND v.rating > 0 AND v.rating < 2.5';
    if (filters.rating === 'unrated') where += ' AND (v.rating IS NULL OR v.rating = 0)';
    if (filters.is_active !== undefined) {
      where += ' AND v.is_active = ?';
      params.push(filters.is_active === 'false' ? 0 : 1);
    } else {
      where += ' AND v.is_active = 1';
    }

    return query(
      `SELECT v.*,
        (SELECT COUNT(*) FROM proc_quotations pq WHERE pq.vendor_id = v.id) AS quotation_count,
        u.first_name AS created_by_first_name, u.last_name AS created_by_last_name
       FROM proc_vendors v
       LEFT JOIN users u ON v.created_by = u.id
       ${where}
       ORDER BY ${filters.sort === 'rating' ? 'COALESCE(v.rating, 0) DESC, v.company_name ASC' : 'v.company_name ASC'}
       LIMIT ${parseInt(filters.limit) || 5000}`,
      params
    );
  }

  /** Every supplier has a category and a recorded anti-terrorism check, and one entry. */
  async _assertVendorComplete(data, vendorId = null) {
    const name = String(data.company_name || '').trim();
    if (!name) throw new Error('Company name is required');
    if (!String(data.category || '').trim()) throw new Error('Choose a category for this supplier');
    if (![true, false, 1, 0, '1', '0'].includes(data.antiterror_verified)) {
      throw new Error('Record whether this supplier has passed the anti-terrorism check');
    }
    const [twin] = await query(
      'SELECT company_name FROM proc_vendors WHERE LOWER(TRIM(company_name)) = LOWER(?) AND id <> ?',
      [name, vendorId || 0]
    );
    if (twin) throw new Error(`${twin.company_name} is already in the vendor list`);
    return { name, verified: [true, 1, '1'].includes(data.antiterror_verified) ? 1 : 0 };
  }

  /** A star rating from 0.5 to 5 in half stars, or null for "not rated". */
  _parseRating(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 5) throw new Error('A rating must be between 0 and 5 stars');
    return n === 0 ? null : Math.round(n * 2) / 2;
  }

  async createVendor(data, user) {
    const { name, verified } = await this._assertVendorComplete(data);

    // Auto-generate vendor code
    const seqRows = await query('SELECT COUNT(*) + 1 AS seq FROM proc_vendors');
    const vendorCode = `VND-${String(seqRows[0].seq).padStart(3, '0')}`;

    const result = await query(
      `INSERT INTO proc_vendors 
        (vendor_code, company_name, contact_person, email, phone, address, tin_number,
         registration_number, category, is_prequalified, prequalification_expiry, notes,
         antiterror_verified, antiterror_checked_by, antiterror_checked_at, created_by, rating, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, NOW())`,
      [
        vendorCode,
        name,
        data.contact_person || null,
        data.email || null,
        data.phone || null,
        data.address || null,
        data.tin_number || null,
        data.registration_number || null,
        data.category || null,
        data.is_prequalified ? 1 : 0,
        data.prequalification_expiry || null,
        data.notes || null,
        verified,
        user.id,
        user.id,
        this._parseRating(data.rating)
      ]
    );

    return { vendorId: result.insertId, vendorCode };
  }

  async updateVendor(vendorId, data, user) {
    const vendors = await query('SELECT id, antiterror_verified FROM proc_vendors WHERE id = ?', [vendorId]);
    if (!vendors.length) throw new Error('Vendor not found');
    const { name, verified } = await this._assertVendorComplete(data, vendorId);
    const checkChanged = verified !== vendors[0].antiterror_verified ? 1 : 0;

    await query(
      `UPDATE proc_vendors SET
        company_name=?, contact_person=?, email=?, phone=?, address=?, tin_number=?,
        registration_number=?, category=?, is_prequalified=?, prequalification_expiry=?,
        notes=?, is_active=?, antiterror_verified=?, rating=?,
        antiterror_checked_by=IF(?, ?, antiterror_checked_by),
        antiterror_checked_at=IF(?, NOW(), antiterror_checked_at),
        updated_at=NOW()
       WHERE id=?`,
      [
        name,
        data.contact_person || null,
        data.email || null,
        data.phone || null,
        data.address || null,
        data.tin_number || null,
        data.registration_number || null,
        data.category || null,
        data.is_prequalified ? 1 : 0,
        data.prequalification_expiry || null,
        data.notes || null,
        data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
        verified,
        this._parseRating(data.rating),
        checkChanged, user.id,
        checkChanged,
        vendorId
      ]
    );

    return { success: true };
  }

  async getVendorById(vendorId) {
    const vendors = await query(
      `SELECT v.*,
        u.first_name AS created_by_first_name, u.last_name AS created_by_last_name,
        (SELECT COUNT(*) FROM proc_quotations pq WHERE pq.vendor_id = v.id) AS quotation_count,
        (SELECT SUM(${AWARDED_VALUE_SQL('pq')}) FROM proc_quotations pq
         JOIN proc_requests pr ON pq.request_id = pr.id
         WHERE pq.vendor_id = v.id AND pq.is_selected = TRUE AND pr.status = 'COMPLETED') AS total_awarded
       FROM proc_vendors v
       LEFT JOIN users u ON v.created_by = u.id
       WHERE v.id = ?`,
      [vendorId]
    );
    return vendors[0] || null;
  }

  async deleteVendor(vendorId, user) {
    const vendors = await query('SELECT id FROM proc_vendors WHERE id = ?', [vendorId]);
    if (!vendors.length) throw new Error('Vendor not found');
    // Check if vendor is linked to any active/in-progress procurement requests
    const activeLinks = await query(
      `SELECT COUNT(*) AS cnt FROM proc_quotations pq
       JOIN proc_requests pr ON pq.request_id = pr.id
       WHERE pq.vendor_id = ? AND pr.status NOT IN ('COMPLETED','REJECTED','CANCELLED')`,
      [vendorId]
    );
    if (activeLinks[0].cnt > 0) {
      throw new Error('Cannot delete vendor: they are linked to active procurement requests');
    }
    // Soft delete
    await query(`UPDATE proc_vendors SET is_active=0, updated_at=NOW() WHERE id=?`, [vendorId]);
    return { success: true };
  }

  // ============================================================
  // DASHBOARD STATS
  // ============================================================

  async getDashboardStats(user) {
    let requestFilter = '';
    const params = [];

    if (user.role === ROLES.GENERAL_USER) {
      requestFilter = 'WHERE pr.requester_id = ?';
      params.push(user.id);
    } else if ([ROLES.PROGRAM_LEAD, ROLES.HEAD_OF_PROGRAMS].includes(user.role)) {
      if (isAdminHrManager(user)) {
        // Admin/HR LEAD/HOD sees full org-wide stats
        requestFilter = 'WHERE 1=1';
      } else {
        // Include own-dept requests AND cross-dept requests explicitly routed to their dept
        requestFilter = 'WHERE (pr.department_id = ? OR pr.routing_department_id = ?)';
        params.push(user.department_id, user.department_id);
      }
    } else if (user.role === ROLES.PROCUREMENT_OFFICER) {
      requestFilter = "WHERE pr.status IN ('PENDING_PROCUREMENT','RETURNED_TO_PROCUREMENT','PENDING_COMMITTEE','PENDING_HIGH_VALUE_APPROVAL','PENDING_DEPT_CONFIRMATION','PENDING_FINAL_FINANCE','PENDING_PAYMENT','COMPLETED')";
    } else if (user.role === ROLES.PROCUREMENT_COMMITTEE) {
      requestFilter = "WHERE pr.status IN ('PENDING_COMMITTEE','PENDING_HIGH_VALUE_APPROVAL','PENDING_DEPT_CONFIRMATION','PENDING_PAYMENT','COMPLETED')";
    } else {
      requestFilter = 'WHERE 1=1';
    }

    const [statusCounts] = await Promise.all([
      query(
        `SELECT status, COUNT(*) AS count 
         FROM proc_requests pr 
         ${requestFilter}
         GROUP BY status`,
        params
      )
    ]);

    const statusMap = {};
    statusCounts.forEach(r => { statusMap[r.status] = parseInt(r.count); });

    const [totalSpend] = await query(
      `SELECT COALESCE(SUM(${AWARDED_VALUE_SQL('pq')}),0) AS total
       FROM proc_quotations pq
       JOIN proc_requests pr ON pq.request_id = pr.id
       WHERE pq.is_selected = TRUE AND pr.status = 'COMPLETED'
       ${requestFilter.replace('WHERE', 'AND')}`,
      params
    );

    // Only count requests this department actually approves — i.e. those whose
    // selected project is owned by it.
    const [pendingMine] = await query(
      `SELECT COUNT(*) AS count FROM proc_requests pr
       WHERE pr.status = 'PENDING_DEPT_APPROVAL'
         AND COALESCE(pr.routing_department_id, pr.department_id) = ?`,
      [user.department_id]
    );

    const recentRequests = await query(
      `SELECT pr.id, pr.request_code, pr.title, pr.status, pr.priority, pr.total_estimated_amount, pr.created_at,
        u.first_name, u.last_name
       FROM proc_requests pr
       JOIN users u ON pr.requester_id = u.id
       ${requestFilter}
       ORDER BY pr.created_at DESC LIMIT 5`,
      params
    );

    return {
      statusSummary: statusMap,
      totalCompleted: statusMap['COMPLETED'] || 0,
      totalPending: (statusMap['PENDING_DEPT_APPROVAL'] || 0) + (statusMap['PENDING_GS_APPROVAL'] || 0) + (statusMap['PENDING_FINANCE_APPROVAL'] || 0) + (statusMap['PENDING_DEPT_CONFIRMATION'] || 0),
      totalInProcurement: (statusMap['PENDING_PROCUREMENT'] || 0) + (statusMap['RETURNED_TO_PROCUREMENT'] || 0),
      totalAwaitingCommittee: statusMap['PENDING_COMMITTEE'] || 0,
      totalFinalFinance: (statusMap['PENDING_FINAL_FINANCE'] || 0) + (statusMap['PENDING_PAYMENT'] || 0),
      totalRejected: statusMap['REJECTED'] || 0,
      totalSpend: parseFloat(totalSpend?.total || 0),
      pendingDeptApproval: parseInt(pendingMine?.count || 0),
      recentRequests
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PROCUREMENT REPORTS & ANALYTICS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Who sees the whole organisation's procurement, and who sees only their own
   * department. Deliberately the same rule the financial reports use
   * (canViewAllBudgetLines in budget.controller.js): Finance managers, Finance
   * Clerks, Admin/HR managers and Admin read across every department; everyone
   * else is scoped to theirs.
   *
   * Procurement Officers and Committee members are added to the org-wide side
   * because the pipeline they already work is org-wide — both roles see every
   * request from the procurement stage onward in the request list, so scoping
   * their report to one department would report less than the queue they
   * action daily.
   */
  canViewAllProcurement(user) {
    if (!user) return false;
    if (user.role === ROLES.ADMIN) return true;
    if (user.role === ROLES.FINANCE_CLERK) return true;
    if (user.role === ROLES.PROCUREMENT_OFFICER) return true;
    if (user.role === ROLES.PROCUREMENT_COMMITTEE) return true;
    if (isAdminHrManager(user)) return true;
    // Finance's own HOP/Lead — the finance-manager seat.
    return [ROLES.HEAD_OF_PROGRAMS, ROLES.PROGRAM_LEAD].includes(user.role) &&
      user.department_code === FINANCE_DEPT_CODE;
  }

  /**
   * Procurement reports and analytics.
   *
   * Scope rules, in one place so every section below agrees with the others:
   *   - org-wide readers  → no department restriction
   *   - department readers→ requests raised by, or routed to, their department
   *   - GENERAL_USER      → only the requests they raised themselves, matching
   *                         what they can already open in the request list
   *
   * A report that showed a general user department-wide figures would leak
   * spending they cannot see request-by-request, so the narrowest rule wins.
   */
  async getProcurementReports(user, filters = {}) {
    const { dateFrom, dateTo, donorId, projectId, departmentId, status } = filters;

    // ── Scope ────────────────────────────────────────────────────────────────
    const scopeClauses = [];
    const scopeParams = [];
    const orgWide = this.canViewAllProcurement(user);

    if (user.role === ROLES.GENERAL_USER) {
      scopeClauses.push('pr.requester_id = ?');
      scopeParams.push(user.id);
    } else if (!orgWide) {
      scopeClauses.push('(pr.department_id = ? OR pr.routing_department_id = ?)');
      scopeParams.push(user.department_id, user.department_id);
    }

    // An org-wide reader may narrow to one department; a scoped reader cannot
    // widen past their own, so the filter is only honoured for the former.
    if (departmentId && orgWide) {
      scopeClauses.push('(pr.department_id = ? OR pr.routing_department_id = ?)');
      scopeParams.push(parseInt(departmentId), parseInt(departmentId));
    }
    if (dateFrom) { scopeClauses.push('pr.created_at >= ?'); scopeParams.push(`${dateFrom} 00:00:00`); }
    if (dateTo)   { scopeClauses.push('pr.created_at <= ?'); scopeParams.push(`${dateTo} 23:59:59`); }
    if (donorId)   { scopeClauses.push('pr.donor_id = ?');   scopeParams.push(parseInt(donorId)); }
    if (projectId) { scopeClauses.push('pr.project_id = ?'); scopeParams.push(parseInt(projectId)); }
    if (status)    { scopeClauses.push('pr.status = ?');     scopeParams.push(status); }

    const where = scopeClauses.length ? `WHERE ${scopeClauses.join(' AND ')}` : '';
    const P = () => [...scopeParams];

    // ── 1. Headline totals ───────────────────────────────────────────────────
    // `awarded_amount` follows the selected quotation where one exists and the
    // estimate otherwise: reporting the estimate on a completed purchase would
    // overstate or understate what was actually committed.
    const [totals] = await query(
      `SELECT
         COUNT(*)                                                   AS total_requests,
         COALESCE(SUM(pr.total_estimated_amount), 0)                AS total_estimated,
         COALESCE(SUM(CASE WHEN pr.status = 'COMPLETED'
                           THEN pr.total_estimated_amount END), 0)  AS completed_value,
         COALESCE(SUM(CASE WHEN pr.status = 'REJECTED'
                           THEN pr.total_estimated_amount END), 0)  AS rejected_value,
         COALESCE(SUM(CASE WHEN pr.status NOT IN ('COMPLETED','REJECTED','CANCELLED','DRAFT')
                           THEN pr.total_estimated_amount END), 0)  AS in_flight_value,
         SUM(pr.status = 'COMPLETED')                               AS completed_count,
         SUM(pr.status = 'REJECTED')                                AS rejected_count,
         SUM(pr.status = 'DRAFT')                                   AS draft_count,
         SUM(pr.status NOT IN ('COMPLETED','REJECTED','CANCELLED','DRAFT')) AS in_flight_count,
         ROUND(AVG(CASE WHEN pr.completed_at IS NOT NULL AND pr.submitted_at IS NOT NULL
                        THEN TIMESTAMPDIFF(HOUR, pr.submitted_at, pr.completed_at) / 24 END), 1)
                                                                    AS avg_cycle_days
       FROM proc_requests pr ${where}`,
      P()
    );

    // ── 2. Pipeline by status ────────────────────────────────────────────────
    const statusSummary = await query(
      `SELECT pr.status,
              COUNT(*) AS request_count,
              COALESCE(SUM(pr.total_estimated_amount), 0) AS total_value,
              ROUND(AVG(TIMESTAMPDIFF(HOUR, pr.updated_at, NOW()) / 24), 1) AS avg_days_in_status
         FROM proc_requests pr ${where}
        GROUP BY pr.status
        ORDER BY total_value DESC`,
      P()
    );

    // ── 3. By department ─────────────────────────────────────────────────────
    const departmentSummary = await query(
      `SELECT d.id AS department_id, d.department_code, d.department_name,
              COUNT(*) AS request_count,
              COALESCE(SUM(pr.total_estimated_amount), 0) AS total_value,
              SUM(pr.status = 'COMPLETED')  AS completed_count,
              SUM(pr.status = 'REJECTED')   AS rejected_count,
              ROUND(COALESCE(SUM(pr.status = 'REJECTED') / NULLIF(COUNT(*), 0) * 100, 0), 1) AS rejection_rate,
              ROUND(AVG(CASE WHEN pr.completed_at IS NOT NULL AND pr.submitted_at IS NOT NULL
                             THEN TIMESTAMPDIFF(HOUR, pr.submitted_at, pr.completed_at) / 24 END), 1) AS avg_cycle_days
         FROM proc_requests pr
         JOIN departments d ON d.id = COALESCE(pr.routing_department_id, pr.department_id)
         ${where}
        GROUP BY d.id, d.department_code, d.department_name
        ORDER BY total_value DESC`,
      P()
    );

    // ── 4. By partner (donor) ────────────────────────────────────────────────
    const donorSummary = await query(
      `SELECT don.id AS donor_id, don.donor_code, don.donor_name, don.currency_code,
              COUNT(*) AS request_count,
              COALESCE(SUM(pr.total_estimated_amount), 0) AS total_value,
              SUM(pr.status = 'COMPLETED') AS completed_count,
              SUM(pr.status = 'REJECTED')  AS rejected_count
         FROM proc_requests pr
         JOIN donors don ON don.id = pr.donor_id
         ${where}
        GROUP BY don.id, don.donor_code, don.donor_name, don.currency_code
        ORDER BY total_value DESC`,
      P()
    );

    // ── 5. By project ────────────────────────────────────────────────────────
    const projectSummary = await query(
      `SELECT p.id AS project_id, p.project_code, p.project_name,
              don.donor_code,
              COUNT(*) AS request_count,
              COALESCE(SUM(pr.total_estimated_amount), 0) AS total_value,
              SUM(pr.status = 'COMPLETED') AS completed_count
         FROM proc_requests pr
         JOIN projects p ON p.id = pr.project_id
         LEFT JOIN donors don ON don.id = p.donor_id
         ${where}
        GROUP BY p.id, p.project_code, p.project_name, don.donor_code
        ORDER BY total_value DESC
        LIMIT 50`,
      P()
    );

    // ── 6. What is actually being bought ─────────────────────────────────────
    // Grouped by the item's own category (proc_request_items.category). This
    // used to group by budget_lines.category, a field almost nobody fills in,
    // so most of the money read "Uncategorised". An item saved before the
    // category existed (or by an old client) is classified from its
    // description on the fly, so nothing can fall back into "Uncategorised".
    const categoryItems = await query(
      `SELECT pr.id AS request_id, pr.title,
              pri.category, pri.item_description, pri.specifications,
              COALESCE(pri.quantity * pri.estimated_unit_price, 0) AS line_value
         FROM proc_requests pr
         JOIN proc_request_items pri ON pri.request_id = pr.id
         ${where}`,
      P()
    );
    const byCategory = new Map();
    for (const it of categoryItems) {
      const category = (it.category && String(it.category).trim())
        || inferProcItemCategory(it.item_description, it.specifications, it.title);
      let g = byCategory.get(category);
      if (!g) { g = { category, requests: new Set(), item_count: 0, total_value: 0 }; byCategory.set(category, g); }
      g.requests.add(it.request_id);
      g.item_count += 1;
      g.total_value += Number(it.line_value) || 0;
    }
    const categorySummary = [...byCategory.values()]
      .map(g => ({
        category: g.category,
        request_count: g.requests.size,
        item_count: g.item_count,
        total_value: Math.round(g.total_value * 100) / 100
      }))
      .sort((a, b) => b.total_value - a.total_value);

    // ── 7. Vendor performance ────────────────────────────────────────────────
    // Win rate is the point of this table: how often a vendor that is asked for
    // a quotation actually gets the business, and what that business is worth.
    const vendorSummary = await query(
      `SELECT q.vendor_name,
              v.vendor_code,
              v.is_prequalified,
              v.rating,
              COUNT(*)                                        AS quotations_submitted,
              SUM(q.is_selected = 1)                          AS quotations_won,
              ROUND(COALESCE(SUM(q.is_selected = 1) / NULLIF(COUNT(*), 0) * 100, 0), 1) AS win_rate,
              COALESCE(SUM(CASE WHEN q.is_selected = 1 THEN ${AWARDED_VALUE_SQL()} END), 0) AS awarded_value,
              ROUND(AVG(q.total_amount), 2)                   AS avg_quotation_value
         FROM proc_quotations q
         JOIN proc_requests pr  ON pr.id = q.request_id
         LEFT JOIN proc_vendors v ON v.id = q.vendor_id
         ${where}
        GROUP BY q.vendor_name, v.vendor_code, v.is_prequalified, v.rating
        ORDER BY awarded_value DESC, quotations_submitted DESC
        LIMIT 50`,
      P()
    );

    // ── 8. Competition check ─────────────────────────────────────────────────
    // Requests that reached the procurement stage with fewer than three
    // quotations — the figure an auditor asks for first.
    const [competition] = await query(
      `SELECT
         COUNT(*) AS sourced_requests,
         SUM(quote_count >= 3) AS with_three_or_more,
         SUM(quote_count = 0)  AS with_none,
         ROUND(AVG(quote_count), 2) AS avg_quotations_per_request,
         COALESCE(SUM(CASE WHEN quote_count > 0 AND quote_count < 3 THEN 1 ELSE 0 END), 0) AS under_three
       FROM (
         SELECT pr.id, COUNT(q.id) AS quote_count
           FROM proc_requests pr
           LEFT JOIN proc_quotations q ON q.request_id = pr.id
           ${where}
           ${where ? 'AND' : 'WHERE'} pr.status IN
             ('PENDING_COMMITTEE','PENDING_HIGH_VALUE_APPROVAL','PENDING_DEPT_CONFIRMATION','PENDING_FINAL_FINANCE','PENDING_PAYMENT','COMPLETED')
          GROUP BY pr.id
       ) t`,
      P()
    );

    // ── 9. Savings against estimate ──────────────────────────────────────────
    // Awarded value vs. the requester's estimate, per request. A split award
    // is one row: its suppliers' shares added together.
    const savings = await query(
      `SELECT pr.id, pr.request_code, pr.title,
              pr.total_estimated_amount AS estimated,
              aw.awarded,
              aw.vendor_name,
              (pr.total_estimated_amount - aw.awarded) AS variance
         FROM proc_requests pr
         JOIN (SELECT q.request_id,
                      SUM(${AWARDED_VALUE_SQL()}) AS awarded,
                      GROUP_CONCAT(q.vendor_name ORDER BY q.vendor_name SEPARATOR ', ') AS vendor_name
                 FROM proc_quotations q
                WHERE q.is_selected = 1
                GROUP BY q.request_id) aw ON aw.request_id = pr.id
         ${where}
        ORDER BY ABS(pr.total_estimated_amount - aw.awarded) DESC
        LIMIT 25`,
      P()
    );

    // ── 10. Monthly trend ────────────────────────────────────────────────────
    const monthlyTrend = await query(
      `SELECT DATE_FORMAT(pr.created_at, '%Y-%m') AS period,
              COUNT(*) AS request_count,
              COALESCE(SUM(pr.total_estimated_amount), 0) AS total_value,
              SUM(pr.status = 'COMPLETED') AS completed_count
         FROM proc_requests pr ${where}
        GROUP BY DATE_FORMAT(pr.created_at, '%Y-%m')
        ORDER BY period`,
      P()
    );

    // ── 11. Stage cycle times ────────────────────────────────────────────────
    // Where requests actually sit. Each leg is measured only on requests that
    // have passed it, so an empty pipeline stage reports no time rather than
    // dragging the average toward zero.
    const [cycleTimes] = await query(
      `SELECT
         ROUND(AVG(CASE WHEN pr.dept_approved_at IS NOT NULL AND pr.submitted_at IS NOT NULL
                        THEN TIMESTAMPDIFF(HOUR, pr.submitted_at, pr.dept_approved_at) / 24 END), 1) AS submit_to_dept,
         ROUND(AVG(CASE WHEN pr.finance_approved_at IS NOT NULL AND pr.dept_approved_at IS NOT NULL
                        THEN TIMESTAMPDIFF(HOUR, pr.dept_approved_at, pr.finance_approved_at) / 24 END), 1) AS dept_to_finance,
         ROUND(AVG(CASE WHEN pr.committee_reviewed_at IS NOT NULL AND pr.procurement_assigned_at IS NOT NULL
                        THEN TIMESTAMPDIFF(HOUR, pr.procurement_assigned_at, pr.committee_reviewed_at) / 24 END), 1) AS sourcing_to_committee,
         ROUND(AVG(CASE WHEN pr.final_finance_approved_at IS NOT NULL AND pr.committee_reviewed_at IS NOT NULL
                        THEN TIMESTAMPDIFF(HOUR, pr.committee_reviewed_at, pr.final_finance_approved_at) / 24 END), 1) AS committee_to_final,
         ROUND(AVG(CASE WHEN pr.completed_at IS NOT NULL AND pr.submitted_at IS NOT NULL
                        THEN TIMESTAMPDIFF(HOUR, pr.submitted_at, pr.completed_at) / 24 END), 1) AS end_to_end
       FROM proc_requests pr ${where}`,
      P()
    );

    // ── 12. Ageing pipeline ──────────────────────────────────────────────────
    // Open requests ordered by how long they have been untouched — the working
    // list for whoever is chasing the backlog.
    const ageingRequests = await query(
      `SELECT pr.id, pr.request_code, pr.title, pr.status, pr.priority,
              pr.total_estimated_amount,
              d.department_code, don.donor_code,
              CONCAT(u.first_name, ' ', u.last_name) AS requester_name,
              DATEDIFF(NOW(), pr.updated_at) AS days_in_current_stage,
              DATEDIFF(NOW(), COALESCE(pr.submitted_at, pr.created_at)) AS days_since_submission
         FROM proc_requests pr
         JOIN users u        ON u.id = pr.requester_id
         JOIN departments d  ON d.id = pr.department_id
         LEFT JOIN donors don ON don.id = pr.donor_id
         ${where}
         ${where ? 'AND' : 'WHERE'} pr.status NOT IN ('COMPLETED','REJECTED','CANCELLED','DRAFT')
        ORDER BY days_in_current_stage DESC
        LIMIT 50`,
      P()
    );

    // ── 13. Rejections ───────────────────────────────────────────────────────
    const rejectionSummary = await query(
      `SELECT pal.actor_role AS rejected_by_role,
              pal.previous_status AS rejected_at_stage,
              COUNT(*) AS rejection_count,
              COALESCE(SUM(pr.total_estimated_amount), 0) AS total_value
         FROM proc_approval_logs pal
         JOIN proc_requests pr ON pr.id = pal.request_id
         ${where}
         ${where ? 'AND' : 'WHERE'} pal.action = 'REJECTED'
        GROUP BY pal.actor_role, pal.previous_status
        ORDER BY rejection_count DESC`,
      P()
    );

    // ── 14. High-value requests ──────────────────────────────────────────────
    // The USD 5,000 threshold that triggers dual Super Admin + department approval.
    const highValueRequests = await query(
      `SELECT pr.id, pr.request_code, pr.title, pr.status,
              pr.total_estimated_amount,
              aw.awarded AS selected_quotation_amount,
              aw.vendor_name,
              d.department_code, don.donor_code
         FROM proc_requests pr
         LEFT JOIN (SELECT q.request_id,
                           SUM(${AWARDED_VALUE_SQL()}) AS awarded,
                           GROUP_CONCAT(q.vendor_name ORDER BY q.vendor_name SEPARATOR ', ') AS vendor_name
                      FROM proc_quotations q
                     WHERE q.is_selected = 1
                     GROUP BY q.request_id) aw ON aw.request_id = pr.id
         JOIN departments d ON d.id = pr.department_id
         LEFT JOIN donors don ON don.id = pr.donor_id
         ${where}
         ${where ? 'AND' : 'WHERE'} COALESCE(aw.awarded, pr.total_estimated_amount) >= 5000
        ORDER BY COALESCE(aw.awarded, pr.total_estimated_amount) DESC
        LIMIT 50`,
      P()
    );

    return {
      scope: {
        orgWide,
        ownRequestsOnly: user.role === ROLES.GENERAL_USER,
        departmentId: orgWide ? null : user.department_id
      },
      totals: totals || {},
      statusSummary,
      departmentSummary,
      donorSummary,
      projectSummary,
      categorySummary,
      vendorSummary,
      competition: competition || {},
      savings,
      monthlyTrend,
      cycleTimes: cycleTimes || {},
      ageingRequests,
      rejectionSummary,
      highValueRequests
    };
  }

}

// Every action that can move a request is followed by its emails, so a new
// route to a stage cannot be added and forget them. Mail goes out after the
// transaction and cannot undo a step that has been committed.
for (const action of [
  'submitPurchaseRequest', 'approveDeptLevel', 'rejectRequest', 'submitToCommittee',
  'committeeDecision', 'highValueDecision', 'finalFinanceApproval'
]) {
  const step = ProcurementService.prototype[action];
  ProcurementService.prototype[action] = async function emailingStep(requestId, ...args) {
    const [before] = await query('SELECT status FROM proc_requests WHERE id = ?', [requestId]);
    const result = await step.call(this, requestId, ...args);
    workflowEmail.procurementStepTaken(requestId, before?.status)
      .catch((err) => console.error('[Procurement] email error:', err.message));
    return result;
  };
}

module.exports = new ProcurementService();
module.exports.PROC_STATUS = PROC_STATUS;
