#!/usr/bin/env node
/**
 * Find and repair requests parked at an approval desk their current partner no
 * longer supports, and report any that no approver can reach.
 *
 * The condition it looks for is the one that stranded H5-0508-0000077: a
 * request at PENDING_ADMIN_APPROVAL charged to a non-ADMIN partner. Only
 * Admin & HR may act at that desk, and the AHR queue matched on partner type,
 * so such a request was visible to people who could not approve it and
 * invisible to the people who could.
 *
 * The routing fixes in requestRouting.service.js stop new ones appearing. This
 * repairs any that already exist, and is safe to re-run: it only touches rows
 * that are still mismatched.
 *
 *   node src/scripts/repairStrandedDesks.js          # report only
 *   node src/scripts/repairStrandedDesks.js --apply  # repair
 */

require('dotenv').config();

const { pool } = require('../config/database');
const requestRouting = require('../services/requestRouting.service');
const { REQUEST_STATUS } = require('../config/roles');

const APPLY = process.argv.includes('--apply');

async function main() {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute(
      `SELECT r.id, r.request_code, r.status, r.donor_id, r.project_id,
              r.department_id, r.routing_department_id, r.requester_id,
              d.donor_code, d.donor_type, ro.role_name AS requester_role
       FROM requests r
       LEFT JOIN donors d ON d.id = r.donor_id
       JOIN users u ON u.id = r.requester_id
       LEFT JOIN roles ro ON ro.id = u.role_id
       WHERE r.status = ?`,
      [REQUEST_STATUS.PENDING_ADMIN_APPROVAL]
    );

    const stranded = [];
    for (const r of rows) {
      const correctStatus = await requestRouting.alignDeskToDonor(connection, {
        status: r.status,
        donorId: r.donor_id,
        requesterRole: r.requester_role
      });
      if (correctStatus !== r.status) stranded.push({ ...r, correctStatus });
    }

    console.log(`${rows.length} request(s) at ${REQUEST_STATUS.PENDING_ADMIN_APPROVAL}; ${stranded.length} stranded.`);
    if (stranded.length === 0) return;

    for (const r of stranded) {
      const adminDonor = await requestRouting.isAdminDonor(connection, r.donor_id);
      const [lineRows] = await connection.execute(
        'SELECT budget_line_id FROM request_items WHERE request_id = ? ORDER BY id LIMIT 1',
        [r.id]
      );
      const routingDepartmentId = await requestRouting.resolveRoutingDepartmentId(connection, {
        adminDonor,
        requesterDeptId: r.department_id,
        projectId: r.project_id,
        firstBudgetLineId: lineRows[0]?.budget_line_id || 0
      });

      console.log(
        `  ${r.request_code} (id ${r.id}) partner ${r.donor_code}/${r.donor_type}: ` +
        `${r.status} -> ${r.correctStatus}, routing ${r.routing_department_id ?? 'NULL'} -> ${routingDepartmentId ?? 'NULL'}`
      );

      if (!APPLY) continue;

      await connection.beginTransaction();
      try {
        await connection.execute(
          `UPDATE requests
           SET status = ?, routing_department_id = ?, updated_at = NOW(), version = version + 1
           WHERE id = ? AND status = ?`,
          [r.correctStatus, routingDepartmentId, r.id, r.status]
        );
        await connection.execute(
          `INSERT INTO approval_logs
           (request_id, approver_id, approver_role, action, previous_status, new_status, comments, ip_address)
           VALUES (?, ?, 'SYSTEM', 'REROUTED', ?, ?, ?, NULL)`,
          [r.id, r.requester_id, r.status, r.correctStatus,
           `Routing repair: partner is ${r.donor_code || 'unset'} (${r.donor_type || 'none'}), ` +
           `which is not handled by the Admin desk. Moved to ${r.correctStatus}.`]
        );
        await connection.commit();
        console.log('    repaired');
      } catch (err) {
        await connection.rollback();
        console.error('    FAILED:', err.message);
      }
    }

    if (!APPLY) console.log('\nDry run — re-run with --apply to repair.');
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
