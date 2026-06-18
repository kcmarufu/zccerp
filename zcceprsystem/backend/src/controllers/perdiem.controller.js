/**
 * Per Diem / Travel & Subsistence Claim Controller
 * Handles create, read, update operations for claim data linked to a request.
 *
 * Visibility rules (mirrored from request access):
 *   - Owner (requester) : can create / update while request is DRAFT or REJECTED
 *   - Approvers (PROGRAM_LEAD, HEAD_OF_PROGRAMS, ADMIN, FINANCE_CLERK) : read-only
 */

const { query, transaction } = require('../config/database');
const { ROLES } = require('../config/roles');

// ── Rate defaults (configurable via env so Finance can adjust without a deploy) ──
const DEFAULT_RATES = {
  breakfast:     parseFloat(process.env.PERDIEM_RATE_BREAKFAST     || '10'),
  lunch:         parseFloat(process.env.PERDIEM_RATE_LUNCH         || '10'),
  dinner:        parseFloat(process.env.PERDIEM_RATE_DINNER        || '10'),
  overnight:     parseFloat(process.env.PERDIEM_RATE_OVERNIGHT     || '70'),
  accommodation: parseFloat(process.env.PERDIEM_RATE_ACCOMMODATION || '100'),
};

class PerDiemController {

  /**
   * GET /api/requests/:requestId/per-diem
   * Returns the claim attached to a request (if any).
   * Visible to: owner, approvers, finance, admin.
   */
  async getClaim(req, res) {
    try {
      const requestId = parseInt(req.params.requestId, 10);
      const userId    = req.user.id;
      const userRole  = req.user.role;

      // Verify the request exists and apply ownership check for GENERAL_USER
      const [reqRows] = await query(
        'SELECT id, requester_id, has_per_diem_claim FROM requests WHERE id = ?',
        [requestId]
      );
      if (!reqRows) {
        return res.status(404).json({ success: false, error: 'Request not found' });
      }
      if (userRole === ROLES.GENERAL_USER && reqRows.requester_id !== userId) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      if (!reqRows.has_per_diem_claim) {
        return res.status(404).json({ success: false, error: 'No per diem claim on this request' });
      }

      const claims = await query(
        `SELECT c.*,
                p.project_name, p.project_code,
                bl.budget_code, bl.budget_name
         FROM per_diem_claims c
         LEFT JOIN projects    p  ON c.project_id     = p.id
         LEFT JOIN budget_lines bl ON c.budget_line_id = bl.id
         WHERE c.request_id = ?`,
        [requestId]
      );
      if (!claims.length) {
        return res.status(404).json({ success: false, error: 'Claim not found' });
      }
      const claim = claims[0];

      const tripItems = await query(
        `SELECT pti.*,
                CASE
                  WHEN u.id IS NOT NULL THEN CONCAT(u.first_name, ' ', u.last_name)
                  ELSE pti.recipient_name
                END AS recipient_display_name,
                u.email AS recipient_email
         FROM per_diem_trip_items pti
         LEFT JOIN users u ON pti.recipient_user_id = u.id
         WHERE pti.claim_id = ? ORDER BY pti.row_order, pti.trip_date`,
        [claim.id]
      );
      const costDistribution = await query(
        'SELECT * FROM per_diem_cost_distribution WHERE claim_id = ? ORDER BY row_order',
        [claim.id]
      );

      return res.json({
        success: true,
        data: { ...claim, trip_items: tripItems, cost_distribution: costDistribution }
      });
    } catch (err) {
      console.error('PerDiem getClaim error:', err);
      return res.status(500).json({ success: false, error: 'Failed to load per diem claim' });
    }
  }

  /**
   * POST /api/requests/:requestId/per-diem
   * Creates (or fully replaces) the claim for a request.
   * Only the owner can do this, and only while the request is DRAFT or REJECTED.
   */
  async upsertClaim(req, res) {
    try {
      const requestId = parseInt(req.params.requestId, 10);
      const userId    = req.user.id;

      const result = await transaction(async (conn) => {
        // Lock + validate request
        const [requests] = await conn.execute(
          'SELECT id, requester_id, status FROM requests WHERE id = ? FOR UPDATE',
          [requestId]
        );
        if (!requests.length) throw Object.assign(new Error('Request not found'), { status: 404 });
        const request = requests[0];
        if (request.requester_id !== userId) throw Object.assign(new Error('You can only edit your own claims'), { status: 403 });
        if (!['DRAFT', 'REJECTED'].includes(request.status)) {
          throw Object.assign(new Error('Claims can only be edited on DRAFT or REJECTED requests'), { status: 400 });
        }

        const {
          full_name,
          designation,
          project_id      = null,
          strategic_focus = null,
          budget_line_id  = null,
          less_outstanding_advance = 0,
          trip_items       = [],
          cost_distribution = [],
        } = req.body;

        // Validate required fields
        if (!full_name || !designation) {
          throw Object.assign(new Error('full_name and designation are required'), { status: 400 });
        }

        // ── Calculate trip items (no time-of-day eligibility rules) ────────────────
        for (const item of trip_items) {
          // Store rates at time of submission so records are reproducible
          item._rate_breakfast    = item.rate_breakfast    ?? DEFAULT_RATES.breakfast;
          item._rate_lunch        = item.rate_lunch        ?? DEFAULT_RATES.lunch;
          item._rate_dinner       = item.rate_dinner       ?? DEFAULT_RATES.dinner;
          item._rate_overnight    = item.rate_overnight    ?? DEFAULT_RATES.overnight;
          item._rate_accommodation = item.rate_accommodation ?? 0;

          item._line_total =
            (item.breakfast      ? item._rate_breakfast     : 0) +
            (item.lunch          ? item._rate_lunch         : 0) +
            (item.dinner         ? item._rate_dinner        : 0) +
            (item.overnight_stay ? item._rate_overnight     : 0) +
            (item.accommodation  ? item._rate_accommodation : 0);
        }

        const total_claimed = trip_items.reduce((s, i) => s + (i._line_total || 0), 0);
        const amount_payable = total_claimed - parseFloat(less_outstanding_advance || 0);

        // Derive trip date range from depart (trip_date) and expected return_date
        const allDates = [];
        for (const i of trip_items) {
          if (i.trip_date)   allDates.push(i.trip_date);
          if (i.return_date) allDates.push(i.return_date);
        }
        allDates.sort();
        const trip_start_date = allDates[0] || null;
        const trip_end_date   = allDates[allDates.length - 1] || null;

        // Reconciliation due date = last return date + 5 days
        let reconciliation_due = null;
        if (trip_end_date) {
          const d = new Date(trip_end_date);
          d.setDate(d.getDate() + 5);
          reconciliation_due = d.toISOString().slice(0, 10);
        }

        // ── Upsert claim header ───────────────────────────────────────────────
        const [existing] = await conn.execute(
          'SELECT id FROM per_diem_claims WHERE request_id = ?',
          [requestId]
        );

        let claimId;
        if (existing.length) {
          claimId = existing[0].id;
          await conn.execute(
            `UPDATE per_diem_claims SET
               full_name = ?, designation = ?, project_id = ?, strategic_focus = ?,
               budget_line_id = ?, trip_start_date = ?, trip_end_date = ?,
               total_claimed = ?, less_outstanding_advance = ?, amount_payable = ?,
               advance_reconciliation_due = ?, updated_at = NOW()
             WHERE id = ?`,
            [full_name, designation, project_id, strategic_focus, budget_line_id,
             trip_start_date, trip_end_date, total_claimed, less_outstanding_advance,
             amount_payable, reconciliation_due, claimId]
          );
          // Wipe children so they are fully replaced
          await conn.execute('DELETE FROM per_diem_trip_items WHERE claim_id = ?', [claimId]);
          await conn.execute('DELETE FROM per_diem_cost_distribution WHERE claim_id = ?', [claimId]);
        } else {
          const [ins] = await conn.execute(
            `INSERT INTO per_diem_claims
               (request_id, full_name, designation, project_id, strategic_focus, budget_line_id,
                trip_start_date, trip_end_date, total_claimed, less_outstanding_advance,
                amount_payable, advance_reconciliation_due, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [requestId, full_name, designation, project_id, strategic_focus, budget_line_id,
             trip_start_date, trip_end_date, total_claimed, less_outstanding_advance,
             amount_payable, reconciliation_due, userId]
          );
          claimId = ins.insertId;
        }

        // ── Insert trip items ─────────────────────────────────────────────────
        for (let i = 0; i < trip_items.length; i++) {
          const t = trip_items[i];
          await conn.execute(
            `INSERT INTO per_diem_trip_items
               (claim_id, recipient_user_id, recipient_name, row_order,
                trip_date, return_date, from_location, to_location,
                departure_time, arrival_time, purpose,
                breakfast, lunch, dinner, overnight_stay, accommodation,
                rate_breakfast, rate_lunch, rate_dinner, rate_overnight, rate_accommodation, line_total,
                created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [claimId,
             t.recipient_user_id || null, t.recipient_name || null, i,
             t.trip_date, t.return_date || null, t.from_location, t.to_location,
             t.departure_time, t.arrival_time, t.purpose,
             t.breakfast ? 1 : 0, t.lunch ? 1 : 0, t.dinner ? 1 : 0, t.overnight_stay ? 1 : 0, t.accommodation ? 1 : 0,
             t._rate_breakfast, t._rate_lunch, t._rate_dinner, t._rate_overnight, t._rate_accommodation, t._line_total]
          );
        }

        // ── Insert cost distribution ──────────────────────────────────────────
        for (let i = 0; i < cost_distribution.length; i++) {
          const d = cost_distribution[i];
          await conn.execute(
            `INSERT INTO per_diem_cost_distribution
               (claim_id, row_order, account_name, account_code, partner_project, amount, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [claimId, i, d.account_name, d.account_code, d.partner_project || null, d.amount]
          );
        }

        // ── Mark the request as having a per diem claim ───────────────────────
        await conn.execute(
          'UPDATE requests SET has_per_diem_claim = 1, updated_at = NOW() WHERE id = ?',
          [requestId]
        );

        return { claimId, total_claimed, amount_payable };
      });

      return res.status(200).json({
        success: true,
        message: 'Travel & Subsistence Claim saved',
        data: result
      });
    } catch (err) {
      const status = err.status || 500;
      console.error('PerDiem upsertClaim error:', err);
      return res.status(status).json({ success: false, error: err.message || 'Failed to save per diem claim' });
    }
  }

  /**
   * DELETE /api/requests/:requestId/per-diem
   * Removes the claim (owner only, DRAFT/REJECTED).
   */
  async deleteClaim(req, res) {
    try {
      const requestId = parseInt(req.params.requestId, 10);
      const userId    = req.user.id;

      await transaction(async (conn) => {
        const [requests] = await conn.execute(
          'SELECT requester_id, status FROM requests WHERE id = ? FOR UPDATE',
          [requestId]
        );
        if (!requests.length) throw Object.assign(new Error('Request not found'), { status: 404 });
        if (requests[0].requester_id !== userId) throw Object.assign(new Error('Access denied'), { status: 403 });
        if (!['DRAFT', 'REJECTED'].includes(requests[0].status)) {
          throw Object.assign(new Error('Cannot delete claim at this stage'), { status: 400 });
        }
        await conn.execute('DELETE FROM per_diem_claims WHERE request_id = ?', [requestId]);
        await conn.execute('UPDATE requests SET has_per_diem_claim = 0, updated_at = NOW() WHERE id = ?', [requestId]);
      });

      return res.json({ success: true, message: 'Per diem claim removed' });
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /api/per-diem/rates
   * Returns the current default meal/overnight rates.
   */
  getRates(req, res) {
    return res.json({ success: true, data: { ...DEFAULT_RATES } });
  }
}

module.exports = new PerDiemController();
