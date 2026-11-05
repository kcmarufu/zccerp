/**
 * Rejection insights — what requests are rejected for, learned from the
 * system's own history, and hints for a request being drafted.
 */
import api from './api';

export type InsightsModule = 'float' | 'procurement';

export interface RejectionTheme {
  id: string;
  title: string;
  advice: string;
  isMistake: boolean;
  count: number;
  requestCount: number;
  share: number;
  recentCount: number;
  priorCount: number;
  examples: { at: string; text: string }[];
}

export interface RejectionFactor {
  id: string;
  theme: string;
  title: string;
  passLabel: string;
  failLabel: string;
  passCount: number;
  passRejectionRate: number;
  failCount: number;
  failRejectionRate: number;
  conclusive: boolean;
}

export interface RejectionAnalysis {
  module: InsightsModule;
  generatedAt: string;
  submittedRequests: number;
  rejectedRequests: number;
  rejectionRate: number;
  rejectionEvents: number;
  themes: RejectionTheme[];
  factors: RejectionFactor[];
  examplesHidden: boolean;
}

export interface RequestHint {
  id: string;
  severity: 'warning' | 'info';
  title: string;
  message: string;
  /** The case-specific part of the message, e.g. which supplier kinds were found. */
  detail?: string;
  evidence: string;
}

export interface RequestHints {
  module: InsightsModule;
  learnedFrom: { rejections: number; requests: number; rejectionRate: number; generatedAt: string };
  hints: RequestHint[];
}

export interface FloatDraft {
  isActivityRequest: boolean;
  justification: string;
  hasPerDiemClaim: boolean;
  activityStartDate?: string;
  activityEndDate?: string;
  items: { category?: string; description?: string }[];
  attachments: { name: string; type?: string }[];
}

export interface ProcurementDraft {
  title: string;
  justification: string;
  expectedDeliveryDate?: string | null;
  items: { description?: string; specifications?: string; category?: string | null; price?: number }[];
  attachments: { name: string; type?: string }[];
}

export const insightsService = {
  async getRejectionAnalysis(module: InsightsModule, refresh = false): Promise<RejectionAnalysis> {
    const response = await api.get('/insights/rejections', { params: { module, refresh: refresh ? 1 : undefined } });
    return response.data.data;
  },

  async getRequestHints(module: InsightsModule, draft: FloatDraft | ProcurementDraft): Promise<RequestHints> {
    const response = await api.post('/insights/request-hints', { module, draft });
    return response.data.data;
  },
};

export default insightsService;
