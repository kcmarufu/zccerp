/**
 * Zero-rate leave sweep.
 *
 * Accounts that accrue no leave (accrual off, or a monthly rate of 0) may not
 * apply for leave. The API refuses new applications from them; this sweep
 * catches anything already pending (or that slipped in before the rule) and
 * rejects it as the System account, emailing the person at their working
 * mailbox. Runs on boot and then hourly.
 *
 * Set ENABLE_ZERO_RATE_LEAVE_SWEEP=false to disable.
 */

const hrService = require('../services/hr.service');
const workflowEmail = require('../services/workflowEmail.service');
const { logger } = require('../config/database');

const HOUR_MS = 60 * 60 * 1000;
let timerHandle = null;

async function tick() {
  try {
    const rejected = await hrService.autoRejectZeroRatePending();
    if (rejected.length) {
      logger.info('Zero-rate leave requests auto-rejected', { ids: rejected });
      for (const id of rejected) {
        await workflowEmail.leaveZeroRateRejected(id)
          .catch((err) => logger.error('Zero-rate leave email failed', { id, message: err.message }));
      }
    }
    return rejected;
  } catch (err) {
    logger.error('Zero-rate leave sweep failed', { message: err.message, stack: err.stack });
    return [];
  }
}

function start() {
  if (process.env.ENABLE_ZERO_RATE_LEAVE_SWEEP === 'false') return;
  if (timerHandle) return;
  setImmediate(tick);
  timerHandle = setInterval(tick, HOUR_MS);
  timerHandle.unref?.();
  logger.info('Zero-rate leave sweep started (boot + hourly)');
}

module.exports = { start, tick };
