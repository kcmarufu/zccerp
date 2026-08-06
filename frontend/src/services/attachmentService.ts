import api, { API_BASE_URL } from './api';

export interface Attachment {
  id: number;
  file_name: string;
  original_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  attachment_type: 'QUOTATION' | 'RECONCILIATION' | 'INVOICE' | 'RECEIPT' | 'OTHER';
  entity_type: 'REQUEST' | 'BUDGET_TRANSACTION' | 'APPROVAL';
  entity_id: number;
  description?: string;
  uploaded_by: number;
  uploaded_at: string;
  is_active: boolean;
  first_name?: string;
  last_name?: string;
  email?: string;
}

export interface UploadAttachmentDto {
  file: File;
  attachment_type: 'QUOTATION' | 'RECONCILIATION' | 'INVOICE' | 'RECEIPT' | 'OTHER';
  entity_type: 'REQUEST' | 'BUDGET_TRANSACTION' | 'APPROVAL';
  entity_id: number;
  description?: string;
}

class AttachmentService {
  /**
   * Upload single attachment
   */
  async uploadAttachment(data: UploadAttachmentDto): Promise<{ message: string; attachment: Attachment }> {
    const formData = new FormData();
    formData.append('file', data.file);
    formData.append('attachment_type', data.attachment_type);
    formData.append('entity_type', data.entity_type);
    formData.append('entity_id', data.entity_id.toString());
    if (data.description) {
      formData.append('description', data.description);
    }

    const response = await api.post('/attachments/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  /**
   * Upload multiple attachments
   */
  async uploadMultipleAttachments(
    files: File[],
    attachment_type: 'QUOTATION' | 'RECONCILIATION' | 'INVOICE' | 'RECEIPT' | 'OTHER',
    entity_type: 'REQUEST' | 'BUDGET_TRANSACTION' | 'APPROVAL',
    entity_id: number,
    description?: string
  ): Promise<{ message: string; attachments: Attachment[] }> {
    const formData = new FormData();
    
    files.forEach(file => {
      formData.append('files', file);
    });
    
    formData.append('attachment_type', attachment_type);
    formData.append('entity_type', entity_type);
    formData.append('entity_id', entity_id.toString());
    if (description) {
      formData.append('description', description);
    }

    const response = await api.post('/attachments/upload-multiple', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  /**
   * Get attachment by ID
   */
  async getAttachmentById(id: number): Promise<Attachment> {
    const response = await api.get(`/attachments/${id}`);
    return response.data;
  }

  /**
   * Download attachment via one-time token — uses native browser download
   * to avoid all axios blob / CORS issues.
   */
  async downloadAttachment(id: number, originalName: string): Promise<void> {
    // Step 1: get a short-lived one-time token (normal JSON request, always works)
    const { data } = await api.get(`/attachments/${id}/download-token`);
    const token: string = data.token;

    // Step 2: trigger a native browser download — no XHR, no CORS, no blob handling
    const url = `${API_BASE_URL}/attachments/dl/${token}`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', originalName);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  /**
   * Open an attachment in a new browser tab instead of saving it to disk.
   *
   * Reviewers overwhelmingly just want to read a receipt or a quotation, and
   * downloading every one of them fills up their machine for nothing. The
   * backend serves the file with `Content-Disposition: inline`, but only for
   * types a browser can safely display — Word/Excel files are still handed
   * over as a download because nothing else can be done with them.
   *
   * The tab is opened synchronously, before the token request, so the browser
   * attributes it to the user's click and does not block it as a popup.
   */
  async viewAttachment(id: number, originalName?: string): Promise<void> {
    const tab = window.open('', '_blank');
    try {
      const { data } = await api.get(`/attachments/${id}/download-token`);
      const url = `${API_BASE_URL}/attachments/dl/${data.token}?disposition=inline`;
      if (tab) {
        tab.location.href = url;
      } else {
        // Popup blocked — fall back to a normal download so the click still works
        await this.downloadAttachment(id, originalName || 'attachment');
      }
    } catch (err) {
      tab?.close();
      throw err;
    }
  }

  /**
   * Whether the browser will render this file in a tab rather than download it.
   * Mirrors INLINE_VIEWABLE_TYPES in the backend attachment controller.
   */
  canViewInline(fileType?: string): boolean {
    const t = (fileType || '').toLowerCase();
    return t === 'application/pdf' || t === 'text/plain' ||
      (t.startsWith('image/') && t !== 'image/svg+xml');
  }

  /**
   * Get attachments for an entity (request, budget transaction, etc.)
   */
  async getEntityAttachments(
    entity_type: 'REQUEST' | 'BUDGET_TRANSACTION' | 'APPROVAL',
    entity_id: number
  ): Promise<Attachment[]> {
    const response = await api.get('/attachments', {
      params: { entity_type, entity_id },
    });
    return response.data;
  }

  /**
   * Delete attachment (soft delete)
   */
  async deleteAttachment(id: number): Promise<{ message: string; attachment: Attachment }> {
    const response = await api.delete(`/attachments/${id}`);
    return response.data;
  }

  /**
   * Permanently delete attachment (Finance Clerk only)
   */
  async permanentlyDeleteAttachment(id: number): Promise<{ message: string }> {
    const response = await api.delete(`/attachments/${id}/permanent`);
    return response.data;
  }

  /**
   * Human label for an attachment type.
   *
   * Files attached to a float request are stored under the 'QUOTATION' type for
   * upload-routing reasons, but they are not quotations — they are whatever the
   * requester attached in support of the request. Showing approvers the raw
   * storage type was misleading, so the UI shows the plain-English meaning.
   */
  typeLabel(type?: string): string {
    switch (type) {
      case 'RECEIPT':        return 'Receipt';
      case 'INVOICE':        return 'Invoice';
      case 'RECONCILIATION': return 'Reconciliation document';
      case 'PHOTO':          return 'Photo';
      case 'SPECIFICATION':  return 'Specification';
      default:               return 'Supporting document';
    }
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Get icon for file type
   */
  getFileIcon(mimeType: string): string {
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('image')) return '🖼️';
    if (mimeType.includes('word')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('csv')) return '📋';
    return '📎';
  }
}

export default new AttachmentService();
