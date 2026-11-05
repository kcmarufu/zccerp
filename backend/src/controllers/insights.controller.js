/**
 * Rejection insights: what float and purchase requests are rejected for, and
 * hints for a request being drafted. See services/rejectionInsights.service.js.
 */

const insights = require('../services/rejectionInsights.service');
const { ROLES } = require('../config/roles');

/**
 * Who may open Rejection Insights (user decision, 2026-11-05):
 *   - the Super Admin;
 *   - the HOD and the Lead of Finance (FOS), HSD and CPJS;
 *   - the Lead of Admin & HR (AHR) — the Lead only.
 * Nobody else, including Finance Clerks and the procurement team. The
 * frontend mirrors this in utils/insightsAccess.ts.
 */
const HOD_AND_LEAD_DEPTS = ['FOS', 'HSD', 'CPJS'];
const LEAD_ONLY_DEPTS = ['AHR'];

function canViewRejectionInsights(user) {
  if (!user) return false;
  if (user.role === ROLES.ADMIN) return true;
  const dept = user.department_code;
  if ([ROLES.HEAD_OF_PROGRAMS, ROLES.PROGRAM_LEAD].includes(user.role) && HOD_AND_LEAD_DEPTS.includes(dept)) return true;
  return user.role === ROLES.PROGRAM_LEAD && LEAD_ONLY_DEPTS.includes(dept);
}

const moduleOf = (value) => (value === 'procurement' ? 'procurement' : 'float');

class InsightsController {
  /** GET /api/insights/rejections?module=float|procurement[&refresh=1] */
  async getRejectionAnalysis(req, res) {
    try {
      if (!canViewRejectionInsights(req.user)) {
        return res.status(403).json({ success: false, error: 'Insufficient permissions for this action' });
      }
      const module = moduleOf(req.query.module);
      const model = await insights.getModel(module, { refresh: req.query.refresh === '1' });
      res.json({ success: true, data: { ...model, examplesHidden: false } });
    } catch (error) {
      console.error('Error building rejection analysis:', error);
      res.status(500).json({ success: false, error: 'Failed to build the rejection analysis' });
    }
  }

  /** POST /api/insights/request-hints  { module, draft } */
  async getRequestHints(req, res) {
    try {
      const module = moduleOf(req.body?.module);
      const draft = req.body?.draft && typeof req.body.draft === 'object' ? req.body.draft : {};
      const data = await insights.getHintsForDraft(module, draft);
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error building request hints:', error);
      res.status(500).json({ success: false, error: 'Failed to load hints' });
    }
  }
}

module.exports = new InsightsController();
