/**
 * Procurement Controller
 * HTTP request handlers for the Procurement Module
 */

const { validationResult } = require('express-validator');
const procurementService = require('../services/procurement.service');
const { query } = require('../config/database');
const path = require('path');
const fs = require('fs');

class ProcurementController {

  // ===== DASHBOARD =====

  async getDashboardStats(req, res) {
    try {
      const stats = await procurementService.getDashboardStats(req.user);
      res.json({ success: true, data: stats });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ===== PURCHASE REQUESTS =====

  async createPurchaseRequest(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      const result = await procurementService.createPurchaseRequest(req.body, req.user);
      res.status(201).json({ success: true, data: result, message: 'Purchase request created successfully' });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async getPurchaseRequests(req, res) {
    try {
      const filters = {
        status: req.query.status,
        priority: req.query.priority,
        search: req.query.search,
        limit: req.query.limit || 50,
        offset: req.query.offset || 0
      };
      const requests = await procurementService.getPurchaseRequests(req.user, filters);
      res.json({ success: true, data: requests });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async getPurchaseRequestById(req, res) {
    try {
      const request = await procurementService.getPurchaseRequestById(req.params.id);
      if (!request) return res.status(404).json({ success: false, error: 'Request not found' });
      res.json({ success: true, data: request });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async updatePurchaseRequest(req, res) {
    try {
      const result = await procurementService.updatePurchaseRequest(req.params.id, req.body, req.user);
      res.json({ success: true, data: result, message: 'Purchase request updated successfully' });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async submitPurchaseRequest(req, res) {
    try {
      const result = await procurementService.submitPurchaseRequest(req.params.id, req.user);
      res.json({ success: true, data: result, message: 'Purchase request submitted for approval' });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async deletePurchaseRequest(req, res) {
    try {
      const rows = await query('SELECT * FROM proc_requests WHERE id = ?', [req.params.id]);
      if (!rows.length) return res.status(404).json({ success: false, error: 'Request not found' });
      const req_ = rows[0];
      if (req_.status !== 'DRAFT') {
        return res.status(400).json({ success: false, error: 'Only DRAFT requests can be deleted' });
      }
      if (req_.requester_id !== req.user.id && req.user.role !== 'ADMIN') {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      await query('DELETE FROM proc_requests WHERE id = ?', [req.params.id]);
      res.json({ success: true, message: 'Purchase request deleted' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ===== APPROVALS =====

  async approveDeptLevel(req, res) {
    try {
      const result = await procurementService.approveDeptLevel(
        req.params.id, req.user, req.body.comments || ''
      );
      res.json({ success: true, data: result, message: 'Request approved at department level' });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async approveFinanceLevel(req, res) {
    try {
      const result = await procurementService.approveFinanceLevel(
        req.params.id, req.user, req.body.comments || ''
      );
      res.json({ success: true, data: result, message: 'Request approved by finance – forwarded to procurement team' });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async reverseDeptApproval(req, res) {
    try {
      const result = await procurementService.reverseDeptApproval(req.params.id, req.user);
      res.json({ success: true, data: result, message: 'Department approval reversed. Request returned to Pending Department Approval.' });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async rejectRequest(req, res) {
    try {
      if (!req.body.comments) {
        return res.status(400).json({ success: false, error: 'Rejection reason is required' });
      }
      const result = await procurementService.rejectRequest(
        req.params.id, req.user, req.body.comments
      );
      res.json({ success: true, data: result, message: 'Request rejected' });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async submitToCommittee(req, res) {
    try {
      const result = await procurementService.submitToCommittee(
        req.params.id, req.body.selected_quotation_id || null, req.user, req.body.comments || ''
      );
      res.json({ success: true, data: result, message: 'Submitted to procurement committee' });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async committeeDecision(req, res) {
    try {
      const { decision, selected_quotation_id, justification } = req.body;
      if (!decision) {
        return res.status(400).json({ success: false, error: 'Decision is required' });
      }
      const result = await procurementService.committeeDecision(
        req.params.id, decision, selected_quotation_id || null, req.user, justification || ''
      );
      res.json({ success: true, data: result, message: `Committee decision: ${decision}` });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async finalFinanceApproval(req, res) {
    try {
      const popFilePath = req.file ? req.file.path : null;
      const popFileName = req.file ? req.file.originalname : null;
      const popFileSize = req.file ? req.file.size : null;
      const result = await procurementService.finalFinanceApproval(
        req.params.id, req.user, req.body.comments || '',
        popFilePath, popFileName, popFileSize
      );
      res.json({ success: true, data: result, message: 'Final finance approval granted. Procurement completed.' });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async reverseFinalApproval(req, res) {
    try {
      const result = await procurementService.reverseFinalApproval(req.params.id, req.user, req.body.reason || '');
      res.json({ success: true, data: result, message: 'Final approval reversed. Request returned to pending final approval.' });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  // ===== QUOTATIONS =====

  async uploadQuotation(req, res) {
    try {
      const requestId = req.params.id;
      const data = { ...req.body };

      // If file was uploaded via multer
      if (req.file) {
        data.file_path = req.file.path;
        data.file_name = req.file.originalname;
        data.file_size = req.file.size;
      }

      if (!data.vendor_name) {
        return res.status(400).json({ success: false, error: 'Vendor name is required' });
      }
      if (!data.total_amount || isNaN(parseFloat(data.total_amount))) {
        return res.status(400).json({ success: false, error: 'Valid total amount is required' });
      }

      data.total_amount = parseFloat(data.total_amount);
      const result = await procurementService.addQuotation(requestId, data, req.user);
      res.status(201).json({ success: true, data: result, message: 'Quotation uploaded successfully' });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async getQuotations(req, res) {
    try {
      const quotations = await procurementService.getQuotations(req.params.id);
      res.json({ success: true, data: quotations });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async deleteQuotation(req, res) {
    try {
      const result = await procurementService.deleteQuotation(req.params.quotationId, req.user);
      res.json({ success: true, data: result, message: 'Quotation deleted' });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async updateQuotation(req, res) {
    try {
      const result = await procurementService.updateQuotation(req.params.quotationId, req.body, req.user);
      res.json({ success: true, data: result, message: 'Quotation updated successfully' });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async downloadQuotation(req, res) {
    try {
      const rows = await query('SELECT * FROM proc_quotations WHERE id = ?', [req.params.quotationId]);
      if (!rows.length) return res.status(404).json({ success: false, error: 'Quotation not found' });
      const quot = rows[0];
      if (!quot.file_path) return res.status(404).json({ success: false, error: 'No file attached' });

      const filePath = path.resolve(quot.file_path);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'File not found on server' });
      }
      res.download(filePath, quot.file_name || 'quotation');
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ===== VENDORS =====

  async getVendors(req, res) {
    try {
      const vendors = await procurementService.getVendors(req.query);
      res.json({ success: true, data: vendors });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async getVendorById(req, res) {
    try {
      const vendor = await procurementService.getVendorById(req.params.vendorId);
      if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });
      res.json({ success: true, data: vendor });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async createVendor(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      const result = await procurementService.createVendor(req.body, req.user);
      res.status(201).json({ success: true, data: result, message: 'Vendor created successfully' });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async updateVendor(req, res) {
    try {
      const result = await procurementService.updateVendor(req.params.vendorId, req.body);
      res.json({ success: true, data: result, message: 'Vendor updated successfully' });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async deleteVendor(req, res) {
    try {
      const result = await procurementService.deleteVendor(req.params.vendorId, req.user);
      res.json({ success: true, data: result, message: 'Vendor deactivated successfully' });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  async downloadPOP(req, res) {
    try {
      const rows = await query('SELECT pop_file_path, pop_file_name FROM proc_requests WHERE id = ?', [req.params.id]);
      if (!rows.length) return res.status(404).json({ success: false, error: 'Request not found' });
      const { pop_file_path, pop_file_name } = rows[0];
      if (!pop_file_path) return res.status(404).json({ success: false, error: 'No POP document uploaded for this request' });
      const filePath = path.resolve(pop_file_path);
      if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'POP file not found on server' });
      res.download(filePath, pop_file_name || 'proof-of-payment');
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ===== APPROVAL TRAIL =====

  async getApprovalTrail(req, res) {
    try {
      const logs = await query(
        `SELECT pal.*,
          u.first_name AS actor_first_name, u.last_name AS actor_last_name, u.email AS actor_email
         FROM proc_approval_logs pal
         JOIN users u ON pal.actor_id = u.id
         WHERE pal.request_id = ?
         ORDER BY pal.created_at ASC`,
        [req.params.id]
      );
      res.json({ success: true, data: logs });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ===== COMMITTEE REVIEWS =====

  async getCommitteeVotes(req, res) {
    try {
      const votes = await procurementService.getCommitteeVotes(parseInt(req.params.id));
      res.json({ success: true, data: votes });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async getCommitteeReviews(req, res) {
    try {
      const reviews = await query(
        `SELECT pcr.*,
          u.first_name AS reviewer_first_name, u.last_name AS reviewer_last_name,
          pq.vendor_name, pq.total_amount AS selected_amount
         FROM proc_committee_reviews pcr
         JOIN users u ON pcr.reviewer_id = u.id
         LEFT JOIN proc_quotations pq ON pcr.selected_quotation_id = pq.id
         WHERE pcr.request_id = ?
         ORDER BY pcr.reviewed_at DESC`,
        [req.params.id]
      );
      res.json({ success: true, data: reviews });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // ===== REQUEST ATTACHMENTS =====

  async getRequestAttachments(req, res) {
    try {
      const attachments = await query(
        `SELECT pra.*, u.first_name, u.last_name
         FROM proc_request_attachments pra
         JOIN users u ON pra.uploaded_by = u.id
         WHERE pra.request_id = ?
         ORDER BY pra.created_at DESC`,
        [req.params.id]
      );
      res.json({ success: true, data: attachments });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async uploadRequestAttachment(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }
      const { attachment_type = 'OTHER', description = '' } = req.body;
      const result = await query(
        `INSERT INTO proc_request_attachments
          (request_id, file_name, original_name, file_path, file_type, file_size, attachment_type, description, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.params.id,
          req.file.filename,
          req.file.originalname,
          req.file.path,
          req.file.mimetype,
          req.file.size,
          attachment_type,
          description,
          req.user.id
        ]
      );
      res.status(201).json({ success: true, data: { id: result.insertId, file_name: req.file.filename, original_name: req.file.originalname, attachment_type }, message: 'File uploaded successfully' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async deleteRequestAttachment(req, res) {
    try {
      const rows = await query(
        'SELECT * FROM proc_request_attachments WHERE id = ? AND request_id = ?',
        [req.params.attachmentId, req.params.id]
      );
      if (!rows || !rows[0]) return res.status(404).json({ success: false, error: 'Attachment not found' });
      const attachment = rows[0];
      // Only uploader or admin can delete
      if (attachment.uploaded_by !== req.user.id && req.user.role !== 'ADMIN') {
        return res.status(403).json({ success: false, error: 'Not authorized to delete this attachment' });
      }
      // Remove file from disk
      if (fs.existsSync(attachment.file_path)) {
        fs.unlinkSync(attachment.file_path);
      }
      await query('DELETE FROM proc_request_attachments WHERE id = ?', [req.params.attachmentId]);
      res.json({ success: true, message: 'Attachment deleted' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async downloadRequestAttachment(req, res) {
    try {
      const rows = await query(
        'SELECT * FROM proc_request_attachments WHERE id = ?',
        [req.params.attachmentId]
      );
      if (!rows || !rows[0]) return res.status(404).json({ success: false, error: 'Attachment not found' });
      const attachment = rows[0];
      if (!fs.existsSync(attachment.file_path)) {
        return res.status(404).json({ success: false, error: 'File not found on server' });
      }
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.original_name}"`);
      res.setHeader('Content-Type', attachment.file_type || 'application/octet-stream');
      res.sendFile(path.resolve(attachment.file_path));
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = new ProcurementController();
