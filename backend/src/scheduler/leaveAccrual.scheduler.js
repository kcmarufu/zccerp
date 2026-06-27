/**
 * Monthly Leave Accrual Scheduler
 *
 * Runs once per hour in-process. Fires the accrual on the 25th of the month.
 * Idempotency is provided by the UNIQUE(employee_id, leave_type_id, fiscal_year,
 * accrual_month) constraint on hr_leave_accrual_log, so repeated invocations on
 * the same day, across server restarts, or on multiple instances all converge
 * on exactly one credit per employee per month.
 *
 * Set ENABLE_LEAVE_ACCRUAL_SCHEDULER=false in the environment to disable.
 */

const hrService = require('../services/hr.service');
const { logger } = require('../config/database');

const HOUR_MS       = 60 * 60 * 1000;
const ACCRUAL_DAY   = 25;
let timerHandle     = null;

async function tick() {
  const now = new Date();
  if (now.getDate() !== ACCRUAL_DAY) return;

  try {
    const result = await hrService.runMonthlyAccrual({ now, triggeredByUserId: null });
    if (result.ran) {
      logger.info('Leave accrual processed', result);
    } else {
      logger.warn('Leave accrual skipped', result);
    }
  } catch (err) {
    logger.error('Leave accrual failed', { message: err.message, stack: err.stack });
  }
}

function start() {
  if (process.env.ENABLE_LEAVE_ACCRUAL_SCHEDULER === 'false') {
    logger.info('Leave accrual scheduler disabled by ENABLE_LEAVE_ACCRUAL_SCHEDULER=false');
    return;
  }
  if (timerHandle) return; // already started

  // Run once on boot in case the server was offline at the scheduled hour.
  setImmediate(tick);

  timerHandle = setInterval(tick, HOUR_MS);
  timerHandle.unref?.();
  logger.info('Leave accrual scheduler started — checking hourly, fires on day 25');
}

function stop() {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
}

module.exports = { start, stop, tick };
