/**
 * Request Controller
 * Handles HTTP requests for procurement requests
 */

const { validationResult } = require('express-validator');
const { query, transaction } = require('../config/database');
const { REQUEST_STATUS, REQUESTER_EDITABLE_STATUSES, ROLES, isFinanceManager } = require('../config/roles');
const approvalService = require('../services/approval.service');
const notificationService = require('../services/notification.service');

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
 * This is a check at request time, not a reservation: `spent_amount` moves only
 * on final approval, so an approver remains the authority on what is actually
 * committed. It stops the requester from asking for money the line plainly does
 * not have, and says by how much.
 *
 * Balances are therefore read without FOR UPDATE. Locking would buy nothing —
 * nothing here writes `spent_amount`, so two requests racing for the same line
 * would both pass the check either way — while adding a lock on `budget_lines`
 * that the approval path (which does write those rows) would have to contend
 * with. Two requests can still be raised against one balance; catching that is
 * the approver's job, and the balance is re-checked when the money moves.
 */
async function assertItemsFitBudget(connection, items, projectId) {
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
    const balance = toCents(line.balance);
    if (requested > balance) {
      problems.push(
        `Budget line ${line.budget_code} (${line.budget_name}) has ${formatMoney(balance)} available, ` +
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

class RequestController {

  /**
   * Create a new procurement request
   * POST /api/requests
   */
  async createRequest(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { justification, items, donor_id, category, projectCode,
              is_activity_request, activity_start_date, activity_end_date } = req.body;
      const userId = req.user.id;
      const departmentId = req.user.department_id;

      const result = await transaction(async (connection) => {
        // Generate structured reference number:
        //   With donor+project: DONORCODE-PROJECTCODE-0000001
        //   Fallback:           REQ-YYYY-000001
        let validDonorId = null;
        let validProjectId = null;

        // Validate donor exists
        if (donor_id) {
          const [donorCheck] = await connection.execute(
            'SELECT id FROM donors WHERE id = ?',
            [donor_id]
          );
          if (donorCheck.length > 0) {
            validDonorId = donor_id;
          }
        }

        // Validate project exists and belongs to the donor
        const requestedProjectId = req.body.project_id || null;
        if (requestedProjectId && validDonorId) {
          const [projCheck] = await connection.execute(
            'SELECT id FROM projects WHERE id = ? AND donor_id = ?',
            [requestedProjectId, validDonorId]
          );
          if (projCheck.length > 0) {
            validProjectId = requestedProjectId;
          }
        }

        // Refuse the request before a reference number is issued: generateRequestCode
        // burns a sequence number as a side effect, so validating afterwards would
        // leave a gap in the project's numbering every time someone overspent a line.
        await assertItemsFitBudget(connection, items, validProjectId);

        const requestNumber = await generateRequestCode(
          connection,
          items.length > 0 ? validDonorId : null,
          items.length > 0 ? validProjectId : null
        );

        // Calculate total amount from items
        const totalAmount = items.reduce((sum, item) => {
          const itemTotal = (item.quantity || 1) * (item.unitPrice || 0);
          return sum + itemTotal;
        }, 0);

        // Check cross-department routing: if the selected project belongs to a different
        // department, store that department's ID so approvals are routed there.
        // Skip for Admin-donor requests — they use a shared approval queue without cross-dept routing.
        let routingDepartmentId = null;
        if (validProjectId && validDonorId) {
          // Check if this is an admin donor
          const [donorTypeRows] = await connection.execute(
            'SELECT donor_type FROM donors WHERE id = ?', [validDonorId]
          );
          const isAdminDonor = donorTypeRows.length > 0 && donorTypeRows[0].donor_type === 'ADMIN';

          if (!isAdminDonor && validProjectId) {
            // Use project's own department_id; if NULL (older projects), fall back to
            // the department on the first budget line in this request's items.
            const firstBudgetLineId = items && items.length > 0 ? (items[0].budgetLineId || 0) : 0;
            const [projRows] = await connection.execute(
              `SELECT COALESCE(
                 p.department_id,
                 (SELECT bl.department_id FROM budget_lines bl
                  WHERE bl.id = ? AND bl.department_id IS NOT NULL LIMIT 1)
               ) AS effective_dept_id
               FROM projects p WHERE p.id = ?`,
              [firstBudgetLineId, validProjectId]
            );
            const effectiveDeptId = projRows[0]?.effective_dept_id;
            if (effectiveDeptId && effectiveDeptId !== departmentId) {
              routingDepartmentId = effectiveDeptId;
            }
          }
        } else if (validProjectId) {
          const firstBudgetLineId = items && items.length > 0 ? (items[0].budgetLineId || 0) : 0;
          const [projRows] = await connection.execute(
            `SELECT COALESCE(
               p.department_id,
               (SELECT bl.department_id FROM budget_lines bl
                WHERE bl.id = ? AND bl.department_id IS NOT NULL LIMIT 1)
             ) AS effective_dept_id
             FROM projects p WHERE p.id = ?`,
            [firstBudgetLineId, validProjectId]
          );
          const effectiveDeptId = projRows[0]?.effective_dept_id;
          if (effectiveDeptId && effectiveDeptId !== departmentId) {
            routingDepartmentId = effectiveDeptId;
          }
        }

        // Insert request with validated donor_id and project_id
        const [requestResult] = await connection.execute(
          `INSERT INTO requests (request_code, requester_id, department_id, donor_id, project_id, routing_department_id, status, justification, priority, total_amount, is_activity_request, activity_start_date, activity_end_date, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [requestNumber, userId, departmentId, validDonorId, validProjectId, routingDepartmentId, REQUEST_STATUS.DRAFT, justification, 'MEDIUM', totalAmount,
           is_activity_request ? 1 : 0,
           (is_activity_request && activity_start_date) ? activity_start_date : null,
           (is_activity_request && activity_end_date)   ? activity_end_date   : null]
        );

        const requestId = requestResult.insertId;

        // Insert items with category
        for (const item of items) {
          await connection.execute(
            `INSERT INTO request_items (request_id, item_description, category, quantity, unit_of_measure, unit_price, budget_line_id, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [requestId, item.itemDescription, item.category || category || 'PROCUREMENT', item.quantity, item.unitOfMeasure || 'EACH', 
             item.unitPrice, item.budgetLineId, item.notes || null]
          );
        }

        return { requestId, requestNumber };
      });

      res.status(201).json({
        success: true,
        message: 'Request created successfully',
        data: result
      });
    } catch (error) {
      console.error('Error creating request:', error);
      // A budget rejection is the requester's to act on, so it comes back as a
      // 400 carrying the specific line and shortfall rather than the generic
      // 500 that told them only that something failed.
      if (error.budgetValidation) {
        return res.status(400).json({
          success: false,
          error: error.message,
          budgetErrors: error.budgetValidation
        });
      }
      res.status(500).json({
        success: false,
        error: 'Failed to create request'
      });
    }
  }

  /**
   * Get request by ID with items and approval trail
   * GET /api/requests/:requestId
   */
  async getRequestById(req, res) {
    try {
      const { requestId } = req.params;

      // Get request details
      const requests = await query(
        `SELECT r.*, 
                u.first_name as requester_first_name,
                u.last_name as requester_last_name,
                u.email as requester_email,
                d.department_name,
                d.department_code,
                dn.donor_name,
                dn.donor_code,
                p.project_name,
                p.project_code,
                rd.department_name as routing_department_name,
                rd.department_code as routing_department_code
         FROM requests r
         JOIN users u ON r.requester_id = u.id
         JOIN departments d ON r.department_id = d.id
         LEFT JOIN donors dn ON r.donor_id = dn.id
         LEFT JOIN projects p ON r.project_id = p.id
         LEFT JOIN departments rd ON r.routing_department_id = rd.id
         WHERE r.id = ?`,
        [requestId]
      );

      if (requests.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Request not found'
        });
      }

      const request = requests[0];
      const isOwner = Number(request.requester_id) === Number(req.user.id);

      // Only general users are restricted to their own requests
      if (req.user.role === ROLES.GENERAL_USER && !isOwner) {
        return res.status(403).json({
          success: false,
          error: 'You can only access your own requests'
        });
      }

      // Get items with budget line info.
      // LEFT JOIN so items without a matching budget_line_id still appear.
      const items = await query(
        `SELECT ri.*, 
                bl.budget_code,
                bl.budget_name,
                (bl.allocated_amount - bl.spent_amount) as budget_balance
         FROM request_items ri
         LEFT JOIN budget_lines bl ON ri.budget_line_id = bl.id
         WHERE ri.request_id = ?`,
        [requestId]
      );

      // Get approval trail
      const approvalTrail = await approvalService.getApprovalTrail(requestId);

      res.json({
        success: true,
        data: {
          ...request,
          has_per_diem_claim: Boolean(request.has_per_diem_claim),
          items,
          approvalTrail
        }
      });
    } catch (error) {
      console.error('Error fetching request:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch request'
      });
    }
  }

  /**
   * Get requests for current user (based on role)
   * GET /api/requests
   */
  async getRequests(req, res) {
    try {
      const { status, search, page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'DESC' } = req.query;
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.max(1, Math.min(1000, parseInt(limit) || 20));
      const offset = Math.max(0, (pageNum - 1) * limitNum);
      const userRole = req.user.role;
      const userId = req.user.id;
      const departmentId = req.user.department_id;

      let whereClause = '1=1';
      const params = [];

      // Role-based filtering
      if (userRole === ROLES.GENERAL_USER) {
        // General users only see their own requests.
        whereClause += ' AND r.requester_id = ?';
        params.push(userId);
      } else if (userRole === ROLES.PROGRAM_LEAD) {
        // Finance (FOS) PROGRAM_LEAD are department leaders — they must see ALL requests
        // just like HEAD_OF_PROGRAMS, FINANCE_CLERK, and ADMIN.
        // Only non-Finance leads are scoped to their own department.
        if (!isFinanceManager(req.user)) {
          // Program Leads see requests from their own department OR requests that
          // have been explicitly cross-routed to their department for approval.
          whereClause += ' AND (r.department_id = ? OR r.routing_department_id = ?)';
          params.push(departmentId, departmentId);
        }
      }
      // Finance PROGRAM_LEAD, HEAD_OF_PROGRAMS, FINANCE_CLERK and ADMIN can see all requests.

      // "My Requests" for anyone who can also see other people's — e.g. a Head
      // of Department who raises their own floats.
      if (req.query.mine === 'true' && userRole !== ROLES.GENERAL_USER) {
        whereClause += ' AND r.requester_id = ?';
        params.push(userId);
      }

      // Search filter — matches reference code, justification, or requester name
      if (search) {
        const sp = `%${search}%`;
        whereClause += ' AND (r.request_code LIKE ? OR r.justification LIKE ? OR CONCAT(u.first_name, \' \', u.last_name) LIKE ?)';
        params.push(sp, sp, sp);
      }

      // Status filter
      if (status) {
        whereClause += ' AND r.status = ?';
        params.push(status);
      }

      // Get total count — must JOIN users so the search clause on u.first_name works
      const countResult = await query(
        `SELECT COUNT(*) as total FROM requests r
         JOIN users u ON r.requester_id = u.id
         WHERE ${whereClause}`,
        params
      );

      // Validate sort order
      const validSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';
      const validSortBy = ['created_at', 'updated_at', 'submitted_at', 'total_amount', 'status', 'request_code'].includes(sortBy) ? sortBy : 'created_at';

      // Get paginated results.
      // LEFT JOIN departments so requests without a valid department_id still appear.
      const requests = await query(
        `SELECT r.*,
                u.first_name as requester_first_name,
                u.last_name as requester_last_name,
                d.department_name,
                d.department_code
         FROM requests r
         JOIN users u ON r.requester_id = u.id
         LEFT JOIN departments d ON r.department_id = d.id
         WHERE ${whereClause}
         ORDER BY r.${validSortBy} ${validSortOrder}
         LIMIT ${limitNum} OFFSET ${offset}`,
        params
      );

      res.json({
        success: true,
        data: {
          requests,
          pagination: {
            total: countResult[0].total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(countResult[0].total / limitNum)
          }
        }
      });
    } catch (error) {
      console.error('Error fetching requests:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch requests'
      });
    }
  }

  /**
   * Update request (only DRAFT status)
   * PUT /api/requests/:requestId
   */
  async updateRequest(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { requestId } = req.params;
      const { justification, priority, items, donor_id, project_id,
              is_activity_request, activity_start_date, activity_end_date } = req.body;
      const userId = req.user.id;

      let amendedWhilePending = null;
      let reissuedCodeForResponse = null;

      await transaction(async (connection) => {
        // Lock and validate
        const [requests] = await connection.execute(
          'SELECT * FROM requests WHERE id = ? FOR UPDATE',
          [requestId]
        );

        if (requests.length === 0) {
          throw new Error('Request not found');
        }

        if (requests[0].requester_id !== userId) {
          throw new Error('You can only edit your own requests');
        }

        // Editable while still awaiting the first (department-level) approval stage,
        // as well as the pre-existing DRAFT/REJECTED cases. Once a department approver
        // (Lead/HOP/Admin) has acted, the request moves to PENDING_FINANCE_APPROVAL and
        // is locked from further edits. Shared with the per diem claim handler so the
        // request and the claim attached to it are never editable on different rules.
        if (!REQUESTER_EDITABLE_STATUSES.includes(requests[0].status)) {
          throw new Error('Can only edit requests that have not yet been approved at the department level');
        }

        const previousStatus = requests[0].status;

        // ── Partner (donor) / project reassignment ──────────────────────────
        // The edit form posts donor_id and project_id, but this handler used to
        // ignore both, so correcting a rejected request moved its budget lines
        // to the new project while donor_id/project_id stayed on the original
        // pair. The request then contradicted itself everywhere downstream —
        // detail page, approvals, exports and reconciliation all read the stale
        // donor/project while the lines showed the new one.
        //
        // Only fields the client actually sent are touched, so callers that PUT
        // a partial body (justification-only edits) do not wipe the assignment.
        const donorProvided   = Object.prototype.hasOwnProperty.call(req.body, 'donor_id');
        const projectProvided = Object.prototype.hasOwnProperty.call(req.body, 'project_id');

        let validDonorId   = requests[0].donor_id;
        let validProjectId = requests[0].project_id;

        if (donorProvided) {
          validDonorId = null;
          if (donor_id) {
            const [donorCheck] = await connection.execute(
              'SELECT id FROM donors WHERE id = ?',
              [donor_id]
            );
            if (donorCheck.length === 0) {
              throw new Error('Selected partner no longer exists');
            }
            validDonorId = donor_id;
          }
        }

        // A project is only valid against the donor that owns it, so changing
        // either side forces the pair to be re-checked together.
        if (donorProvided || projectProvided) {
          const candidateProjectId = projectProvided ? project_id : requests[0].project_id;
          validProjectId = null;
          if (candidateProjectId && validDonorId) {
            const [projCheck] = await connection.execute(
              'SELECT id FROM projects WHERE id = ? AND donor_id = ?',
              [candidateProjectId, validDonorId]
            );
            if (projCheck.length === 0) {
              throw new Error('Selected project does not belong to the selected partner');
            }
            validProjectId = candidateProjectId;
          }
        }

        // Re-derive cross-department routing from the project now on the
        // request, mirroring createRequest. Without this a reassigned request
        // would keep being routed to the department that owned the old project.
        let routingDepartmentId = null;
        if (validProjectId) {
          let isAdminDonor = false;
          if (validDonorId) {
            const [donorTypeRows] = await connection.execute(
              'SELECT donor_type FROM donors WHERE id = ?', [validDonorId]
            );
            isAdminDonor = donorTypeRows.length > 0 && donorTypeRows[0].donor_type === 'ADMIN';
          }

          if (!isAdminDonor) {
            // Same fallback as on create: the project's own department, or the
            // department of this request's first budget line for older projects
            // that have no department_id.
            let firstBudgetLineId = 0;
            if (items && items.length > 0) {
              firstBudgetLineId = items[0].budgetLineId || 0;
            } else {
              const [existingItems] = await connection.execute(
                'SELECT budget_line_id FROM request_items WHERE request_id = ? ORDER BY id LIMIT 1',
                [requestId]
              );
              firstBudgetLineId = existingItems[0]?.budget_line_id || 0;
            }

            const [projRows] = await connection.execute(
              `SELECT COALESCE(
                 p.department_id,
                 (SELECT bl.department_id FROM budget_lines bl
                  WHERE bl.id = ? AND bl.department_id IS NOT NULL LIMIT 1)
               ) AS effective_dept_id
               FROM projects p WHERE p.id = ?`,
              [firstBudgetLineId, validProjectId]
            );
            const effectiveDeptId = projRows[0]?.effective_dept_id;
            if (effectiveDeptId && effectiveDeptId !== requests[0].department_id) {
              routingDepartmentId = effectiveDeptId;
            }
          }
        }

        // Same budget check as on create, against the project the request is
        // being moved to. It runs before the reference number is re-issued for
        // the reason given there — a rejected edit must not consume a sequence
        // number. When the client sends no items the stored ones are unchanged
        // and were already checked when they were saved.
        if (items && items.length > 0) {
          await assertItemsFitBudget(connection, items, validProjectId);
        }

        // ── Reference number ────────────────────────────────────────────────
        // The reference encodes the partner and project (DONOR-PROJECT-SEQ), so
        // once either of those moves the old code names the wrong partner. It
        // is re-issued here from the *new* pair, taking the next number in that
        // project's own sequence.
        //
        // Only a genuine change triggers this: re-issuing on every save would
        // burn a sequence number each time a requester fixed a typo, and would
        // change the reference under an approver who is mid-review. The old
        // code is kept in the approval trail below so anyone holding a printout
        // or an email quoting it can still find the request.
        const donorChanged   = String(validDonorId   ?? '') !== String(requests[0].donor_id   ?? '');
        const projectChanged = String(validProjectId ?? '') !== String(requests[0].project_id ?? '');
        let reissuedCode = null;

        if (donorChanged || projectChanged) {
          reissuedCode = await generateRequestCode(connection, validDonorId, validProjectId);
          reissuedCodeForResponse = reissuedCode;
          await connection.execute(
            'UPDATE requests SET request_code = ? WHERE id = ?',
            [reissuedCode, requestId]
          );
        }

        // Update request
        await connection.execute(
          `UPDATE requests SET justification = ?, priority = ?,
            donor_id = ?, project_id = ?, routing_department_id = ?,
            is_activity_request = ?,
            activity_start_date = ?,
            activity_end_date   = ?,
            updated_at = NOW() WHERE id = ?`,
          [justification || requests[0].justification, priority || requests[0].priority,
           validDonorId, validProjectId, routingDepartmentId,
           is_activity_request !== undefined ? (is_activity_request ? 1 : 0) : requests[0].is_activity_request,
           (is_activity_request && activity_start_date) ? activity_start_date : (is_activity_request === 0 ? null : requests[0].activity_start_date),
           (is_activity_request && activity_end_date)   ? activity_end_date   : (is_activity_request === 0 ? null : requests[0].activity_end_date),
           requestId]
        );

        // Update items if provided
        if (items && items.length > 0) {
          // Delete existing items
          await connection.execute('DELETE FROM request_items WHERE request_id = ?', [requestId]);

          // Insert new items with category
          for (const item of items) {
            await connection.execute(
              `INSERT INTO request_items (request_id, item_description, category, quantity, unit_of_measure, unit_price, budget_line_id, notes, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
              [requestId, item.itemDescription, item.category || 'PROCUREMENT', item.quantity, item.unitOfMeasure || 'EACH',
               item.unitPrice, item.budgetLineId, item.notes || null]
            );
          }

          // Recalculate total_amount from the updated items — previously this was
          // left stale after an edit, so edited/resubmitted requests kept showing
          // the pre-edit total everywhere (lists, PDFs, reconciliation).
          const totalAmount = items.reduce((sum, item) => {
            return sum + (item.quantity || 1) * (item.unitPrice || 0);
          }, 0);
          await connection.execute(
            'UPDATE requests SET total_amount = ? WHERE id = ?',
            [totalAmount, requestId]
          );
        }

        // Logged separately from the edit itself, and for DRAFT too: a changed
        // reference number is the one edit that invalidates anything printed or
        // emailed earlier, so the old code has to remain findable.
        if (reissuedCode) {
          await connection.execute(
            `INSERT INTO approval_logs
             (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
             VALUES (?, ?, ?, 'EDITED_AFTER_SUBMISSION', ?, ?, ?, ?)`,
            [requestId, userId, req.user.role || ROLES.GENERAL_USER, previousStatus, previousStatus,
             `Partner/project reassigned — reference number changed from ${requests[0].request_code} to ${reissuedCode}`,
             req.ip]
          );
        }

        if (previousStatus === REQUEST_STATUS.REJECTED) {
          await connection.execute(
            `INSERT INTO approval_logs
             (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
             VALUES (?, ?, ?, 'EDITED_AFTER_REJECTION', ?, ?, ?, ?)`,
            [requestId, userId, req.user.role || ROLES.GENERAL_USER, REQUEST_STATUS.REJECTED, REQUEST_STATUS.REJECTED, 'Requester updated rejected request', req.ip]
          );
        } else if (previousStatus !== REQUEST_STATUS.DRAFT) {
          // The request is sitting on an approver's desk and its contents just
          // changed. The reviewer must be able to see that from the trail —
          // otherwise they approve figures the requester has since altered.
          await connection.execute(
            `INSERT INTO approval_logs
             (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
             VALUES (?, ?, ?, 'EDITED_AFTER_SUBMISSION', ?, ?, ?, ?)`,
            [requestId, userId, req.user.role || ROLES.GENERAL_USER, previousStatus, previousStatus,
             'Requester amended the request while it was awaiting approval', req.ip]
          );
          amendedWhilePending = {
            requestCode: reissuedCode || requests[0].request_code,
            deptId: requests[0].department_id,
            routingDeptId: routingDepartmentId || requests[0].routing_department_id || null,
            gsOnly: previousStatus === REQUEST_STATUS.PENDING_GS_APPROVAL
          };
        }
      });

      // Outside the transaction, and silent — a failed notification must never
      // roll back or fail an edit that has already been committed.
      if (amendedWhilePending) {
        notificationService.onRequestAmended(
          Number(requestId), amendedWhilePending.requestCode, userId,
          amendedWhilePending.deptId, amendedWhilePending.routingDeptId,
          amendedWhilePending.gsOnly
        ).catch(() => {});
      }

      res.json({
        success: true,
        message: reissuedCodeForResponse
          ? `Request updated. Reference number is now ${reissuedCodeForResponse}.`
          : 'Request updated successfully',
        data: reissuedCodeForResponse ? { requestCode: reissuedCodeForResponse } : undefined
      });
    } catch (error) {
      console.error('Error updating request:', error);
      res.status(error.message.includes('not found') ? 404 : 400).json({
        success: false,
        error: error.message || 'Failed to update request',
        ...(error.budgetValidation ? { budgetErrors: error.budgetValidation } : {})
      });
    }
  }

  /**
   * Submit request for approval
   * POST /api/requests/:requestId/submit
   */
  async submitRequest(req, res) {
    try {
      const { requestId } = req.params;
      const userId = req.user.id;
      const ipAddress = req.ip;

      const result = await approvalService.submitRequest(requestId, userId, ipAddress);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Error submitting request:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to submit request'
      });
    }
  }

  /**
   * Delete request (only DRAFT status)
   * DELETE /api/requests/:requestId
   */
  async deleteRequest(req, res) {
    try {
      const { requestId } = req.params;
      const userId = req.user.id;

      await transaction(async (connection) => {
        const [requests] = await connection.execute(
          'SELECT * FROM requests WHERE id = ? FOR UPDATE',
          [requestId]
        );

        if (requests.length === 0) {
          throw new Error('Request not found');
        }

        if (requests[0].requester_id !== userId) {
          throw new Error('You can only delete your own requests');
        }

        if (requests[0].status !== REQUEST_STATUS.DRAFT) {
          throw new Error('Can only delete requests in DRAFT status');
        }

        await connection.execute('DELETE FROM request_items WHERE request_id = ?', [requestId]);
        await connection.execute('DELETE FROM requests WHERE id = ?', [requestId]);
      });

      res.json({
        success: true,
        message: 'Request deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting request:', error);
      res.status(error.message.includes('not found') ? 404 : 400).json({
        success: false,
        error: error.message || 'Failed to delete request'
      });
    }
  }

  /**
   * Get budget impact preview before approval
   * GET /api/requests/:requestId/budget-impact
   */
  async getBudgetImpact(req, res) {
    try {
      const { requestId } = req.params;

      const impact = await approvalService.getBudgetImpactPreview(requestId);

      res.json({
        success: true,
        data: impact
      });
    } catch (error) {
      console.error('Error fetching budget impact:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch budget impact'
      });
    }
  }
}

module.exports = new RequestController();
