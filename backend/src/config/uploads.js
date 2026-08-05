/**
 * Upload storage configuration and path resolution.
 *
 * WHY THIS EXISTS
 * ---------------
 * Uploaded files live on persistent storage OUTSIDE the git working tree
 * (UPLOAD_DIR, normally /var/www/zcc-erp/shared/uploads). The application
 * directory used to reach them through a `backend/uploads` symlink, and the
 * absolute path *through that symlink* was written into the database.
 *
 * When a deploy replaced the symlink with a real (empty) directory, every one
 * of those stored paths stopped resolving and every download 404'd — even
 * though the files themselves were never lost.
 *
 * To make that failure impossible in future:
 *   1. Uploads are always written under UPLOAD_ROOT, read from the environment,
 *      never through a symlink that a deploy can clobber.
 *   2. Reads go through resolveStoredPath(), which re-anchors any historical
 *      path onto the *current* upload root before giving up.
 */

const path = require('path');
const fs = require('fs');

// Persistent upload root. Falls back to the in-tree directory for local dev.
const UPLOAD_ROOT = path.resolve(
  process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads')
);

// attachment_type (as sent by the client) → subdirectory name
const SUBDIRS = {
  QUOTATION:      'quotations',
  RECONCILIATION: 'reconciliations',
  INVOICE:        'invoices',
  RECEIPT:        'receipts',
  temp:           'temp',
};

/** Absolute directory for a given attachment type (defaults to temp). */
function dirFor(type) {
  return path.join(UPLOAD_ROOT, SUBDIRS[type] || SUBDIRS.temp);
}

/** Create every upload subdirectory if it does not already exist. */
function ensureUploadDirs() {
  for (const sub of Object.values(SUBDIRS)) {
    const dir = path.join(UPLOAD_ROOT, sub);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Resolve a path as stored in the database to a file that actually exists.
 * Returns the absolute path, or null when the file cannot be found anywhere.
 *
 * Tries, in order:
 *   1. the stored path as-is (current-format paths),
 *   2. the portion after the last '/uploads/' re-anchored onto UPLOAD_ROOT
 *      (paths written when the upload root lived somewhere else),
 *   3. the same filename in any known upload subdirectory.
 */
function resolveStoredPath(stored) {
  if (!stored) return null;

  const direct = path.resolve(stored);
  if (fs.existsSync(direct)) return direct;

  const MARKER = '/uploads/';
  const idx = stored.replace(/\\/g, '/').lastIndexOf(MARKER);
  if (idx >= 0) {
    const rebased = path.join(UPLOAD_ROOT, stored.replace(/\\/g, '/').slice(idx + MARKER.length));
    if (fs.existsSync(rebased)) return rebased;
  }

  const base = path.basename(stored.replace(/\\/g, '/'));
  if (base) {
    for (const sub of Object.values(SUBDIRS)) {
      const candidate = path.join(UPLOAD_ROOT, sub, base);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return null;
}

module.exports = { UPLOAD_ROOT, SUBDIRS, dirFor, ensureUploadDirs, resolveStoredPath };
