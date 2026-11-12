/**
 * Budget reservation scheduler.
 *
 * Every 15 minutes: rejects approved floats / purchase requests whose
 * 10-working-day reservation ran out before they were dispatched or paid,
 * releasing the funds, and closes any hold whose request has moved on.
 * On boot it also reserves what is still to be paid on purchase requests
 * approved before reservations existed.
 *
 * Set ENABLE_RESERVATION_SCHEDULER=false in the environment to disable.
 */

const reservations = require('../services/budgetReservation.service');
const { logger } = require('../config/database');

const INTERVAL_MS = 15 * 60 * 1000;
let timerHandle = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    await reservations.closeOrphans();
    const { expired } = await reservations.expireOverdue();
    if (expired) logger.info('Budget reservations expired', { expired });
  } catch (err) {
    logger.error('Budget reservation check failed', { message: err.message, stack: err.stack });
  } finally {
    running = false;
  }
}

function start() {
  if (process.env.ENABLE_RESERVATION_SCHEDULER === 'false') {
    logger.info('Budget reservation scheduler disabled by ENABLE_RESERVATION_SCHEDULER=false');
    return;
  }
  if (timerHandle) return;
  setImmediate(async () => {
    try { await reservations.backfillPurchaseRequests(); } catch (err) {
      logger.error('Budget reservation back-fill failed', { message: err.message });
    }
    tick();
  });
  timerHandle = setInterval(tick, INTERVAL_MS);
  timerHandle.unref?.();
  logger.info('Budget reservation scheduler started — checking every 15 minutes');
}

function stop() {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
}

module.exports = { start, stop, tick };
