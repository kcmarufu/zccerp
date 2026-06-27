import api from './api';
import { PerDiemClaim, PerDiemClaimFormData, PerDiemRates } from '../types';

const perDiemService = {
  /** Fetch the claim attached to a request */
  getClaim: async (requestId: number): Promise<PerDiemClaim | null> => {
    try {
      const res = await api.get(`/requests/${requestId}/per-diem`);
      return res.data.data as PerDiemClaim;
    } catch (err: any) {
      if (err?.response?.status === 404) return null;
      throw err;
    }
  },

  /** Create or fully replace the claim for a request */
  upsertClaim: async (requestId: number, data: PerDiemClaimFormData): Promise<void> => {
    await api.put(`/requests/${requestId}/per-diem`, data);
  },

  /** Remove the claim from a request */
  deleteClaim: async (requestId: number): Promise<void> => {
    await api.delete(`/requests/${requestId}/per-diem`);
  },

  /** Get current default meal/overnight rates from the server */
  getRates: async (): Promise<PerDiemRates> => {
    const res = await api.get('/per-diem/rates');
    return res.data.data as PerDiemRates;
  },
};

export default perDiemService;
