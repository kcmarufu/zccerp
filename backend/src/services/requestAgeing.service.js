/**
 * Request Ageing — how long a float request spends at each stage of its life,
 * from the moment it is raised until its reconciliation is fully closed.
 *
 * The request row only keeps the latest timestamp for each milestone, and a
 * rejection sends a request round the loop again, so the timeline is rebuilt
 * from approval_logs instead: every status change is logged there with its
 * time. Rules for reading it:
 *
 *   - Submitted and Reconciliation submitted use the FIRST occurrence. The
 *     requester's clock is what those stages measure, and a later resubmission
 *     is part of the review stage that bounced it, not a new start.
 *   - Every approval milestone uses the LAST occurrence, so time lost to
 *     rejection and rework is charged to the stage where the request was held
 *     up. The rejection counts per stage show how much of it was rework.
 *
 * Durations are elapsed calendar days to one decimal (hours / 24), so a
 * same-day approval reads as 0.2 rather than disappearing into a whole day.
 */

const { query } = require('../config/database');

const DAY_MS = 24 * 60 * 60 * 1000;

const SUPERVISOR_DESKS = [
  'PENDING_LEAD_APPROVAL', 'PENDING_ADMIN_APPROVAL', 'PENDING_GS_APPROVAL', 'PENDING_HOP_APPROVAL',
];
const RECON_DESKS = ['RECON_PENDING_LEAD', 'RECON_PENDING_FINANCE'];

/**
 * The stages, in order. `from`/`to` name the milestones that open and close
 * each stage; a stage with several `from` candidates starts at the first one
 * present (a request with no supervisor stage goes straight to Finance).
 */
const STAGES = [
  { key: 'SUBMISSION',        label: 'Drafting → Submitted',           from: ['created'],                        to: 'submitted' },
  { key: 'SUPERVISOR',        label: 'Supervisor / HOD approval',      from: ['submitted'],                      to: 'supervisorApproved' },
  { key: 'FINANCE',           label: 'Finance approval',               from: ['supervisorApproved', 'submitted'], to: 'financeApproved' },
  { key: 'DISPATCH',          label: 'Awaiting dispatch',              from: ['financeApproved'],                to: 'dispatched' },
  { key: 'RECON_SUBMISSION',  label: 'Reconciliation submission',      from: ['dispatched'],                     to: 'reconSubmitted' },
  { key: 'RECON_SUPERVISOR',  label: 'Reconciliation — supervisor',    from: ['reconSubmitted'],                 to: 'reconSupervisorApproved' },
  { key: 'RECON_FINANCE',     label: 'Reconciliation — Finance',       from: ['reconSupervisorApproved', 'reconSubmitted'], to: 'reconciled' },
];

/** Where an open request is sitting now, keyed by its status. */
const STATUS_STAGE = {
  PENDING_LEAD_APPROVAL: 'SUPERVISOR',
  PENDING_ADMIN_APPROVAL: 'SUPERVISOR',
  PENDING_GS_APPROVAL: 'SUPERVISOR',
  PENDING_HOP_APPROVAL: 'SUPERVISOR',
  PENDING_FINANCE_APPROVAL: 'FINANCE',
  APPROVED: 'DISPATCH',
  DISPATCHED: 'RECON_SUBMISSION',
  PENDING_RECONCILIATION: 'RECON_SUBMISSION',
  RECON_PENDING_LEAD: 'RECON_SUPERVISOR',
  RECON_PENDING_FINANCE: 'RECON_FINANCE',
  REJECTED: 'RETURNED',
};

const OPEN_STAGE_LABELS = {
  ...Object.fromEntries(STAGES.map((s) => [s.key, s.label])),
  RETURNED: 'Returned to requester (rejected)',
};

/** Ageing buckets for requests still in the pipeline, in days. */
const BUCKETS = [
  { key: '0-2',  label: '0–2 days',   max: 2 },
  { key: '3-7',  label: '3–7 days',   max: 7 },
  { key: '8-14', label: '8–14 days',  max: 14 },
  { key: '15-30', label: '15–30 days', max: 30 },
  { key: '30+',  label: 'Over 30 days', max: Infinity },
];

const days = (from, to) => {
  if (!from || !to) return null;
  const d = (new Date(to) - new Date(from)) / DAY_MS;
  // A reversal can leave a later milestone stamped before an earlier one; a
  // negative span is not a duration, so it is left out rather than averaged in.
  return d < 0 ? null : Math.round(d * 10) / 10;
};

const bucketFor = (d) => BUCKETS.find((b) => d <= b.max).key;

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function summarise(values) {
  const v = values.filter((x) => x !== null).sort((a, b) => a - b);
  if (v.length === 0) return { count: 0, avg: null, median: null, p90: null, max: null };
  const avg = v.reduce((s, x) => s + x, 0) / v.length;
  return {
    count: v.length,
    avg: Math.round(avg * 10) / 10,
    median: percentile(v, 50),
    p90: percentile(v, 90),
    max: v[v.length - 1],
  };
}

/** Rebuilds one request's milestones from its log rows (oldest first). */
function milestonesFor(request, logs) {
  const m = { created: request.created_at };
  const rejections = { SUPERVISOR: 0, FINANCE: 0, RECON: 0 };
  let enteredCurrent = null;

  for (const log of logs) {
    const prev = log.previous_status;
    const next = log.new_status;
    const at = log.created_at;

    if (log.action === 'SUBMITTED' && prev === 'DRAFT' && !m.submitted) m.submitted = at;
    if (log.action === 'APPROVED' && SUPERVISOR_DESKS.includes(prev) && next === 'PENDING_FINANCE_APPROVAL') {
      m.supervisorApproved = at;
    }
    if (log.action === 'APPROVED' && prev === 'PENDING_FINANCE_APPROVAL' && next === 'APPROVED') m.financeApproved = at;
    if (log.action === 'DISPATCHED' && next === 'DISPATCHED') m.dispatched = at;
    if (log.action === 'SUBMITTED' && RECON_DESKS.includes(next) && !m.reconSubmitted) m.reconSubmitted = at;
    if (log.action === 'APPROVED' && prev === 'RECON_PENDING_LEAD' && next === 'RECON_PENDING_FINANCE') {
      m.reconSupervisorApproved = at;
    }
    if (next === 'RECONCILED' && prev !== 'RECONCILED') m.reconciled = at;

    if (log.action === 'REJECTED') {
      if (SUPERVISOR_DESKS.includes(prev)) rejections.SUPERVISOR += 1;
      else if (RECON_DESKS.includes(prev)) rejections.RECON += 1;
      else rejections.FINANCE += 1;
    }

    // When the request last moved into the status it holds now — edits that
    // leave the status alone do not restart the clock.
    if (next === request.status && prev !== next) enteredCurrent = at;
  }

  // Requests that predate the log, or were moved by a script, still carry
  // their milestones on the row itself.
  m.submitted = m.submitted || request.submitted_at || null;
  m.dispatched = m.dispatched || request.dispatched_at || null;
  if (request.status === 'RECONCILED' && !m.reconciled) m.reconciled = request.completed_at || null;

  return { m, rejections, enteredCurrent: enteredCurrent || request.updated_at };
}

/**
 * Builds the ageing report.
 *
 * filters: { fiscalYear, dateFrom, dateTo, donorId, projectId, departmentId }
 * scope:   null for everything, or { departmentId } to limit to requests raised
 *          in, or routed to, one department.
 */
async function getRequestAgeing(filters = {}, scope = null) {
  const where = ["r.status NOT IN ('DRAFT', 'CANCELLED')"];
  const params = [];

  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (isDate(filters.dateFrom)) { where.push('r.created_at >= ?'); params.push(filters.dateFrom); }
  if (isDate(filters.dateTo)) { where.push('r.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(filters.dateTo); }
  if (!isDate(filters.dateFrom) && !isDate(filters.dateTo) && filters.fiscalYear) {
    where.push('YEAR(r.created_at) = ?'); params.push(Number(filters.fiscalYear));
  }
  if (filters.donorId) { where.push('r.donor_id = ?'); params.push(Number(filters.donorId)); }
  if (filters.projectId) { where.push('r.project_id = ?'); params.push(Number(filters.projectId)); }
  if (filters.departmentId) { where.push('r.department_id = ?'); params.push(Number(filters.departmentId)); }
  if (scope && scope.departmentId) {
    where.push('(r.department_id = ? OR r.routing_department_id = ?)');
    params.push(scope.departmentId, scope.departmentId);
  }

  const requests = await query(
    `SELECT r.id, r.request_code, r.status, r.total_amount, r.justification,
            r.created_at, r.submitted_at, r.dispatched_at, r.completed_at, r.updated_at,
            CONCAT(u.first_name, ' ', u.last_name) AS requester_name,
            dep.department_code, dep.department_name,
            d.donor_code, p.project_code
       FROM requests r
       LEFT JOIN users u ON u.id = r.requester_id
       LEFT JOIN departments dep ON dep.id = r.department_id
       LEFT JOIN donors d ON d.id = r.donor_id
       LEFT JOIN projects p ON p.id = r.project_id
      WHERE ${where.join(' AND ')}
      ORDER BY r.created_at DESC`,
    params
  );

  const logsByRequest = new Map();
  if (requests.length > 0) {
    const ids = requests.map((r) => r.id);
    const logs = await query(
      `SELECT request_id, action, previous_status, new_status, created_at
         FROM approval_logs
        WHERE request_id IN (${ids.map(() => '?').join(',')})
        ORDER BY created_at, id`,
      ids
    );
    for (const log of logs) {
      if (!logsByRequest.has(log.request_id)) logsByRequest.set(log.request_id, []);
      logsByRequest.get(log.request_id).push(log);
    }
  }

  const now = new Date();
  const durations = Object.fromEntries(STAGES.map((s) => [s.key, []]));
  const totals = { toDispatch: [], toReconciled: [] };
  const openByStage = {};

  const rows = requests.map((r) => {
    const { m, rejections, enteredCurrent } = milestonesFor(r, logsByRequest.get(r.id) || []);

    const stageDays = {};
    for (const stage of STAGES) {
      const start = stage.from.map((k) => m[k]).find(Boolean);
      const d = days(start, m[stage.to]);
      stageDays[stage.key] = d;
      if (d !== null) durations[stage.key].push(d);
    }

    const toDispatch = days(m.submitted, m.dispatched);
    const toReconciled = days(m.submitted, m.reconciled);
    if (toDispatch !== null) totals.toDispatch.push(toDispatch);
    if (toReconciled !== null) totals.toReconciled.push(toReconciled);

    const currentStage = STATUS_STAGE[r.status] || null;
    const daysInStage = currentStage ? days(enteredCurrent, now) : null;
    if (currentStage && daysInStage !== null) {
      const bucket = bucketFor(daysInStage);
      if (!openByStage[currentStage]) {
        openByStage[currentStage] = {
          stage: currentStage, label: OPEN_STAGE_LABELS[currentStage],
          count: 0, amount: 0, oldest: 0,
          buckets: Object.fromEntries(BUCKETS.map((b) => [b.key, 0])),
        };
      }
      const o = openByStage[currentStage];
      o.count += 1;
      o.amount += Number(r.total_amount) || 0;
      o.oldest = Math.max(o.oldest, daysInStage);
      o.buckets[bucket] += 1;
    }

    return {
      id: r.id,
      request_code: r.request_code,
      status: r.status,
      requester_name: r.requester_name,
      department_code: r.department_code,
      donor_code: r.donor_code,
      project_code: r.project_code,
      total_amount: Number(r.total_amount) || 0,
      milestones: m,
      stage_days: stageDays,
      submitted_to_dispatched: toDispatch,
      submitted_to_reconciled: toReconciled,
      rejections,
      current_stage: currentStage,
      current_stage_label: currentStage ? OPEN_STAGE_LABELS[currentStage] : null,
      days_in_current_stage: daysInStage,
    };
  });

  const openOrder = [...STAGES.map((s) => s.key), 'RETURNED'];
  return {
    stages: STAGES.map((s) => ({ key: s.key, label: s.label, ...summarise(durations[s.key]) })),
    totals: {
      submittedToDispatched: summarise(totals.toDispatch),
      submittedToReconciled: summarise(totals.toReconciled),
    },
    buckets: BUCKETS.map(({ key, label }) => ({ key, label })),
    openPipeline: openOrder.filter((k) => openByStage[k]).map((k) => ({
      ...openByStage[k], amount: Math.round(openByStage[k].amount * 100) / 100,
    })),
    requests: rows,
    generatedAt: now.toISOString(),
  };
}

module.exports = { getRequestAgeing, STAGES };
