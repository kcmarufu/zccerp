/**
 * Attachment Controller
 * Handles file uploads/downloads using raw mysql2 queries (consistent with rest of app)
 */
const { query } = require('../config/database');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// In-memory one-time download tokens: token -> { attachmentId, expiresAt }
const _downloadTokens = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [t, e] of _downloadTokens.entries()) {
    if (now > e.expiresAt) _downloadTokens.delete(t);
  }
}, 60000);

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
 * Generate a short-lived one-time download token for an attachment
 */
exports.generateDownloadToken = async (req, res) => {
  try {
    const attachmentId = parseInt(req.params.id);
    const token = crypto.randomBytes(32).toString('hex');
    _downloadTokens.set(token, { attachmentId, expiresAt: Date.now() + 60000 });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate download token' });
  }
};

/**
 * Serve attachment file using a one-time token (no auth middleware — token IS the auth)
 */
exports.downloadByToken = async (req, res) => {
  try {
    const entry = _downloadTokens.get(req.params.token);
    if (!entry || Date.now() > entry.expiresAt) {
      _downloadTokens.delete(req.params.token);
      return res.status(401).send('Invalid or expired download token');
    }
    _downloadTokens.delete(req.params.token); // one-time use

    const attachments = await query('SELECT * FROM attachments WHERE id = ?', [entry.attachmentId]);
    if (!attachments.length) return res.status(404).send('Attachment not found');
    const attachment = attachments[0];
    if (!attachment.is_active) return res.status(410).send('Attachment deleted');

    const filePath = path.resolve(attachment.file_path);
    if (!fs.existsSync(filePath)) return res.status(404).send('File not found on server');

    const safeFileName = attachment.original_name.replace(/[\r\n"\\]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.setHeader('Content-Type', attachment.file_type || 'application/octet-stream');

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
    
    // Check if file exists
    if (!fs.existsSync(attachment.file_path)) {
      return res.status(404).json({ error: 'File not found on server' });
    }
    
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type');

    const safeFileName = attachment.original_name.replace(/[\r\n"\\]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.setHeader('Content-Type', attachment.file_type || 'application/octet-stream');

    // Use promises so errors are caught by the outer try/catch.
    // Callback-based fs.readFile inside an async function is NOT covered by try/catch
    // and causes unhandled errors that abort the response with ERR_NETWORK.
    const data = await fs.promises.readFile(path.resolve(attachment.file_path));
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
    const isAuthorized = 
      attachment.uploaded_by === userId || 
      userRole === 'FINANCE_CLERK' ||
      userRole === 'HEAD_OF_PROGRAMS';
    
    if (!isAuthorized) {
      return res.status(403).json({ error: 'Not authorized to delete this attachment' });
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
    if (fs.existsSync(attachment.file_path)) {
      fs.unlinkSync(attachment.file_path);
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
