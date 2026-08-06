/**
 * Attachment Controller
 * Handles file uploads/downloads using raw mysql2 queries (consistent with rest of app)
 */
const { query } = require('../config/database');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { resolveStoredPath } = require('../config/uploads');

/**
 * Short-lived download tokens.
 *
 * These were previously single-use entries in an in-memory Map with a 60-second
 * life. That failed for real users in three ways: any browser that issues the
 * request twice (link prefetch, antivirus scanning, the download manager
 * retrying) consumed the token on the first hit and showed "Invalid or expired
 * download token" on the real one; a slow connection could outlive 60 seconds;
 * and every backend restart invalidated every outstanding token.
 *
 * A signed, self-describing token fixes all three: nothing is stored, repeat
 * requests succeed, and restarts are irrelevant. It stays unforgeable and
 * time-limited, and now also records who asked for it.
 */
const DOWNLOAD_TOKEN_TTL = '10m';
const DOWNLOAD_TOKEN_PURPOSE = 'attachment-download';

/**
 * Content types that may be rendered *inline* in the browser tab.
 *
 * Viewing beats downloading for the people reviewing these files — they only
 * want to read a receipt, not accumulate a Downloads folder full of them. But
 * inline rendering means the browser executes whatever it is handed, so only
 * types that cannot carry script are served that way:
 *   - PDF and raster images render in the built-in viewers,
 *   - SVG is deliberately excluded (it can carry <script>),
 *   - anything else (Word, Excel, CSV, unknown) still comes down as a download,
 *     because no browser can display it anyway.
 *
 * `Content-Type` here comes from the upload, i.e. from the client, so it is
 * treated as untrusted: `X-Content-Type-Options: nosniff` pins the browser to
 * the type we send, and a locked-down CSP neutralises the response even if a
 * future type slips onto this list.
 */
const INLINE_VIEWABLE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
  'text/plain'
]);

const canRenderInline = (fileType) => INLINE_VIEWABLE_TYPES.has(String(fileType || '').toLowerCase());

/**
 * Set the disposition and hardening headers for a file being served.
 * Falls back to a download whenever the type is not safely viewable.
 */
const applyFileHeaders = (res, attachment, wantsInline) => {
  const safeFileName = attachment.original_name.replace(/[\r\n"\\]/g, '_');
  const inline = wantsInline && canRenderInline(attachment.file_type);

  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${safeFileName}"`);
  res.setHeader('Content-Type', attachment.file_type || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; object-src 'none'; script-src 'none'; style-src 'unsafe-inline'; sandbox");
};

const signDownloadToken = (attachmentId, userId) => jwt.sign(
  { attachmentId, userId, purpose: DOWNLOAD_TOKEN_PURPOSE },
  process.env.JWT_SECRET,
  { expiresIn: DOWNLOAD_TOKEN_TTL }
);

const verifyDownloadToken = (token) => {
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  if (payload.purpose !== DOWNLOAD_TOKEN_PURPOSE) {
    throw new Error('Token is not a download token');
  }
  return payload;
};

/**
 * Upload single attachment
 */
exports.uploadAttachment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { attachment_type, entity_type, entity_id, description } = req.body;
    
    // Validate required fields
    if (!attachment_type || !entity_type || !entity_id) {
      return res.status(400).json({ 
        error: 'Missing required fields: attachment_type, entity_type, entity_id' 
      });
    }
    
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const file = req.file;
    
    // Create attachment record in database
    const result = await query(
      `INSERT INTO attachments (file_name, original_name, file_path, file_type, file_size, attachment_type, entity_type, entity_id, description, uploaded_by, uploaded_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), TRUE)`,
      [file.filename, file.originalname, file.path, file.mimetype, file.size, attachment_type, entity_type, parseInt(entity_id), description || null, userId]
    );
    
    // Fetch the created attachment with uploader info
    const attachments = await query(
      `SELECT a.*, u.first_name, u.last_name, u.email
       FROM attachments a
       JOIN users u ON a.uploaded_by = u.id
       WHERE a.id = ?`,
      [result.insertId]
    );
    
    res.status(201).json({
      message: 'File uploaded successfully',
      attachment: attachments[0]
    });
  } catch (error) {
    console.error('Error uploading attachment:', error);
    
    // Clean up uploaded file if database insert fails
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'Failed to upload file' });
  }
};

/**
 * Upload multiple attachments
 */
exports.uploadMultipleAttachments = async (req, res) => {
  try {
    const userId = req.user.id;
    const { attachment_type, entity_type, entity_id, description } = req.body;
    
    // Validate required fields
    if (!attachment_type || !entity_type || !entity_id) {
      return res.status(400).json({ 
        error: 'Missing required fields: attachment_type, entity_type, entity_id' 
      });
    }
    
    // Check if files were uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    const files = req.files;
    const attachments = [];
    
    // Create attachment records for all files
    for (const file of files) {
      const result = await query(
        `INSERT INTO attachments (file_name, original_name, file_path, file_type, file_size, attachment_type, entity_type, entity_id, description, uploaded_by, uploaded_at, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), TRUE)`,
        [file.filename, file.originalname, file.path, file.mimetype, file.size, attachment_type, entity_type, parseInt(entity_id), description || null, userId]
      );
      
      const created = await query(
        `SELECT a.*, u.first_name, u.last_name, u.email
         FROM attachments a
         JOIN users u ON a.uploaded_by = u.id
         WHERE a.id = ?`,
        [result.insertId]
      );
      
      attachments.push(created[0]);
    }
    
    res.status(201).json({
      message: `${files.length} file(s) uploaded successfully`,
      attachments
    });
  } catch (error) {
    console.error('Error uploading attachments:', error);
    
    // Clean up uploaded files if database insert fails
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    res.status(500).json({ error: 'Failed to upload files' });
  }
};

/**
 * Get attachment by ID
 */
exports.getAttachmentById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const attachments = await query(
      `SELECT a.*, u.first_name, u.last_name, u.email
       FROM attachments a
       JOIN users u ON a.uploaded_by = u.id
       WHERE a.id = ?`,
      [parseInt(id)]
    );
    
    if (attachments.length === 0) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
    res.json(attachments[0]);
  } catch (error) {
    console.error('Error fetching attachment:', error);
    res.status(500).json({ error: 'Failed to fetch attachment' });
  }
};

/**
 * Generate a short-lived download token for an attachment
 */
exports.generateDownloadToken = async (req, res) => {
  try {
    const attachmentId = parseInt(req.params.id);
    res.json({ token: signDownloadToken(attachmentId, req.user.id) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate download token' });
  }
};

/**
 * Serve attachment file using a signed token (no auth middleware — token IS the auth)
 */
exports.downloadByToken = async (req, res) => {
  try {
    let payload;
    try {
      payload = verifyDownloadToken(req.params.token);
    } catch (err) {
      const expired = err.name === 'TokenExpiredError';
      return res.status(401).send(
        expired
          ? 'This download link has expired. Please click download again.'
          : 'Invalid download token'
      );
    }

    const attachments = await query('SELECT * FROM attachments WHERE id = ?', [payload.attachmentId]);
    if (!attachments.length) return res.status(404).send('Attachment not found');
    const attachment = attachments[0];
    if (!attachment.is_active) return res.status(410).send('Attachment deleted');

    const filePath = resolveStoredPath(attachment.file_path);
    if (!filePath) return res.status(404).send('File not found on server');

    // ?disposition=inline asks the browser to display the file instead of
    // saving it. Honoured only for types that are safe to render — see
    // INLINE_VIEWABLE_TYPES.
    applyFileHeaders(res, attachment, req.query.disposition === 'inline');

    const data = await fs.promises.readFile(filePath);
    res.setHeader('Content-Length', data.length);
    res.end(data);
  } catch (err) {
    console.error('Error serving file by token:', err);
    if (!res.headersSent) res.status(500).send('Failed to download file');
  }
};

/**
 * Download attachment
 */
exports.downloadAttachment = async (req, res) => {
  try {
    const { id } = req.params;
    
    const attachments = await query(
      'SELECT * FROM attachments WHERE id = ?',
      [parseInt(id)]
    );
    
    if (attachments.length === 0) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
    const attachment = attachments[0];
    
    if (!attachment.is_active) {
      return res.status(410).json({ error: 'Attachment has been deleted' });
    }
    
    // Check if file exists (re-anchors legacy paths onto the current upload root)
    const filePath = resolveStoredPath(attachment.file_path);
    if (!filePath) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type');

    applyFileHeaders(res, attachment, req.query.disposition === 'inline');

    // Use promises so errors are caught by the outer try/catch.
    // Callback-based fs.readFile inside an async function is NOT covered by try/catch
    // and causes unhandled errors that abort the response with ERR_NETWORK.
    const data = await fs.promises.readFile(filePath);
    res.setHeader('Content-Length', data.length);
    res.end(data);
  } catch (error) {
    console.error('Error downloading attachment:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
};

/**
 * Get attachments for an entity (request, budget transaction, etc.)
 */
exports.getEntityAttachments = async (req, res) => {
  try {
    const { entity_type, entity_id } = req.query;
    
    if (!entity_type || !entity_id) {
      return res.status(400).json({ 
        error: 'Missing required query parameters: entity_type, entity_id' 
      });
    }
    
    const attachments = await query(
      `SELECT a.*, u.first_name, u.last_name, u.email
       FROM attachments a
       JOIN users u ON a.uploaded_by = u.id
       WHERE a.entity_type = ? AND a.entity_id = ? AND a.is_active = TRUE
       ORDER BY a.uploaded_at DESC`,
      [entity_type, parseInt(entity_id)]
    );
    
    res.json(attachments);
  } catch (error) {
    console.error('Error fetching entity attachments:', error);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
};

/**
 * Delete attachment (soft delete)
 */
exports.deleteAttachment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    
    const attachments = await query(
      'SELECT * FROM attachments WHERE id = ?',
      [parseInt(id)]
    );
    
    if (attachments.length === 0) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
    const attachment = attachments[0];
    
    // Check if user is authorized to delete (uploader or admin/finance)
    const isPrivileged =
      userRole === 'FINANCE_CLERK' ||
      userRole === 'HEAD_OF_PROGRAMS' ||
      userRole === 'ADMIN';
    const isUploader = attachment.uploaded_by === userId;

    if (!isUploader && !isPrivileged) {
      return res.status(403).json({ error: 'Not authorized to delete this attachment' });
    }

    // Requesters replace their own documents while a request is still theirs to
    // work on — a rejected float being re-submitted, or a reconciliation being
    // corrected. Once the request has been approved for payment or fully
    // reconciled, the files are the evidence behind that decision, so the
    // uploader can no longer remove them (Finance/HOP still can).
    if (isUploader && !isPrivileged && attachment.entity_type === 'REQUEST') {
      const UPLOADER_DELETABLE_STATUSES = [
        'DRAFT', 'REJECTED',
        'PENDING_ADMIN_APPROVAL', 'PENDING_LEAD_APPROVAL',
        'PENDING_HOP_APPROVAL', 'PENDING_FINANCE_APPROVAL',
        'DISPATCHED', 'PENDING_RECONCILIATION',
        'RECON_PENDING_LEAD', 'RECON_PENDING_FINANCE'
      ];
      const requests = await query('SELECT status FROM requests WHERE id = ?', [attachment.entity_id]);
      const status = requests.length ? requests[0].status : null;
      if (status && !UPLOADER_DELETABLE_STATUSES.includes(status)) {
        return res.status(403).json({
          error: `Attachments can no longer be removed — this request is ${status.replace(/_/g, ' ')}. Please contact Finance if a document must be replaced.`
        });
      }
    }

    // Soft delete
    await query(
      'UPDATE attachments SET is_active = FALSE WHERE id = ?',
      [parseInt(id)]
    );
    
    res.json({ 
      message: 'Attachment deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
};

/**
 * Permanently delete attachment (physical file deletion)
 */
exports.permanentlyDeleteAttachment = async (req, res) => {
  try {
    const { id } = req.params;
    
    const attachments = await query(
      'SELECT * FROM attachments WHERE id = ?',
      [parseInt(id)]
    );
    
    if (attachments.length === 0) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
    const attachment = attachments[0];
    
    // Delete physical file
    const storedFile = resolveStoredPath(attachment.file_path);
    if (storedFile) {
      fs.unlinkSync(storedFile);
    }
    
    // Delete database record
    await query(
      'DELETE FROM attachments WHERE id = ?',
      [parseInt(id)]
    );
    
    res.json({ message: 'Attachment permanently deleted' });
  } catch (error) {
    console.error('Error permanently deleting attachment:', error);
    res.status(500).json({ error: 'Failed to permanently delete attachment' });
  }
};
