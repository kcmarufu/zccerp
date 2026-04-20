import api from './api';

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
   * Download attachment
   */
  async downloadAttachment(id: number, originalName: string): Promise<void> {
    const response = await api.get(`/attachments/${id}/download`, {
      responseType: 'blob',
    });

    // Create blob link to download
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', originalName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
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
