/**
 * Export Service
 * Handles PDF and Excel document downloads
 */

import api from './api';

export const exportService = {
  /**
   * Download dispatch PDF for a request
   */
  downloadDispatchPdf: async (requestId: string): Promise<Blob> => {
    const response = await api.get(`/export/dispatch/${requestId}/pdf`, {
      responseType: 'blob'
    });
    return response.data;
  },

  /**
   * Download dispatch Excel for a request
   */
  downloadDispatchExcel: async (requestId: string): Promise<Blob> => {
    const response = await api.get(`/export/dispatch/${requestId}/excel`, {
      responseType: 'blob'
    });
    return response.data;
  }
};

export default exportService;
