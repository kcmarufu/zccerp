/**
 * Rejection insights: what float and purchase requests are rejected for, and
 * hints for a request being drafted. See services/rejectionInsights.service.js.
 */

const insights = require('../services/rejectionInsights.service');
const { ROLES, isFinanceManager } = require('../config/roles');

/** Roles that may open the analysis page. */
const ANALYST_ROLES = [
  ROLES.ADMIN, ROLES.FINANCE_CLERK, ROLES.PROGRAM_LEAD,
  ROLES.HEAD_OF_PROGRAMS, ROLES.PROCUREMENT_OFFICER,
];

/**
 * Example comments name people and amounts, so only the desks that review the
 * whole organisation's requests see them; everyone else gets the figures.
 */
function canSeeExamples(user, module) {
  if (user.role === ROLES.ADMIN || user.role === ROLES.FINANCE_CLERK || isFinanceManager(user)) return true;
  return module === 'procurement' && user.role === ROLES.PROCUREMENT_OFFICER;
}

const moduleOf = (value) => (value === 'procurement' ? 'procurement' : 'float');

class InsightsController {
  /** GET /api/insights/rejections?module=float|procurement[&refresh=1] */
  async getRejectionAnalysis(req, res) {
    try {
      if (!ANALYST_ROLES.includes(req.user.role)) {
        return res.status(403).json({ success: false, error: 'Insufficient permissions for this action' });
      }
      const module = moduleOf(req.query.module);
      const model = await insights.getModel(module, { refresh: req.query.refresh === '1' });
      const showExamples = canSeeExamples(req.user, module);
      res.json({
        success: true,
        data: {
          ...model,
          themes: model.themes.map(t => (showExamples ? t : { ...t, examples: [] })),
          examplesHidden: !showExamples,
        },
      });
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
