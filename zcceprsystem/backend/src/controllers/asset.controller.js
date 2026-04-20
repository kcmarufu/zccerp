/**
 * Asset Controller
 * Handles HTTP requests for Asset Management module
 */

const assetService = require('../services/asset.service');

class AssetController {

  // ========================================================================
  // ASSETS CRUD
  // ========================================================================

  async createAsset(req, res) {
    try {
      const result = await assetService.createAsset(req.body, req.user.id);
      res.status(201).json({ success: true, message: 'Asset registered successfully', data: result });
    } catch (error) {
      console.error('Error creating asset:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to create asset' });
    }
  }

  async getAssets(req, res) {
    try {
      const filters = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 25,
        search: req.query.search,
        categoryId: req.query.categoryId,
        status: req.query.status,
        locationId: req.query.locationId,
        departmentId: req.query.departmentId,
        donorId: req.query.donorId,
        conditionRating: req.query.conditionRating,
        custodianId: req.query.custodianId
      };
      const result = await assetService.getAssets(filters);
      res.json({ success: true, data: result.data, pagination: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages } });
    } catch (error) {
      console.error('Error fetching assets:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch assets' });
    }
  }

  async getAssetById(req, res) {
    try {
      const asset = await assetService.getAssetById(req.params.id);
      if (!asset) return res.status(404).json({ success: false, error: 'Asset not found' });
      res.json({ success: true, data: asset });
    } catch (error) {
      console.error('Error fetching asset:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch asset' });
    }
  }

  async updateAsset(req, res) {
    try {
      const result = await assetService.updateAsset(req.params.id, req.body, req.user.id);
      res.json({ success: true, message: 'Asset updated successfully', data: result });
    } catch (error) {
      console.error('Error updating asset:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to update asset' });
    }
  }

  async deleteAsset(req, res) {
    try {
      await assetService.deleteAsset(req.params.id, req.user.id);
      res.json({ success: true, message: 'Asset deleted successfully' });
    } catch (error) {
      console.error('Error deleting asset:', error);
      res.status(500).json({ success: false, error: 'Failed to delete asset' });
    }
  }

  // ========================================================================
  // CATEGORIES
  // ========================================================================

  async getCategories(req, res) {
    try {
      const categories = await assetService.getCategories();
      res.json({ success: true, data: categories });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch categories' });
    }
  }

  async createCategory(req, res) {
    try {
      const result = await assetService.createCategory(req.body);
      res.status(201).json({ success: true, message: 'Category created', data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message || 'Failed to create category' });
    }
  }

  // ========================================================================
  // LOCATIONS
  // ========================================================================

  async getLocations(req, res) {
    try {
      const locations = await assetService.getLocations();
      res.json({ success: true, data: locations });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch locations' });
    }
  }

  async createLocation(req, res) {
    try {
      const result = await assetService.createLocation(req.body);
      res.status(201).json({ success: true, message: 'Location created', data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message || 'Failed to create location' });
    }
  }

  // ========================================================================
  // SUPPLIERS
  // ========================================================================

  async getSuppliers(req, res) {
    try {
      const suppliers = await assetService.getSuppliers();
      res.json({ success: true, data: suppliers });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch suppliers' });
    }
  }

  async createSupplier(req, res) {
    try {
      const result = await assetService.createSupplier(req.body);
      res.status(201).json({ success: true, message: 'Supplier created', data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message || 'Failed to create supplier' });
    }
  }

  // ========================================================================
  // CHECK-IN / CHECK-OUT
  // ========================================================================

  async checkoutAsset(req, res) {
    try {
      const result = await assetService.checkoutAsset(req.body, req.user.id);
      res.status(201).json({ success: true, message: 'Asset checked out successfully', data: result });
    } catch (error) {
      console.error('Error checking out asset:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to checkout asset' });
    }
  }

  async checkinAsset(req, res) {
    try {
      const result = await assetService.checkinAsset(req.params.assignmentId, req.body, req.user.id);
      res.json({ success: true, message: 'Asset checked in successfully', data: result });
    } catch (error) {
      console.error('Error checking in asset:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to checkin asset' });
    }
  }

  async getAssignments(req, res) {
    try {
      const data = await assetService.getAssignments(req.params.assetId);
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch assignments' });
    }
  }

  // ========================================================================
  // TRANSFERS
  // ========================================================================

  async createTransfer(req, res) {
    try {
      const result = await assetService.createTransfer(req.body, req.user.id);
      res.status(201).json({ success: true, message: 'Transfer initiated', data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message || 'Failed to create transfer' });
    }
  }

  async approveTransfer(req, res) {
    try {
      const result = await assetService.approveTransfer(req.params.transferId, req.body, req.user.id);
      res.json({ success: true, message: `Transfer ${result.status.toLowerCase()}`, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message || 'Failed to approve transfer' });
    }
  }

  async getTransfers(req, res) {
    try {
      const filters = { assetId: req.query.assetId, status: req.query.status };
      const data = await assetService.getTransfers(filters);
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch transfers' });
    }
  }

  // ========================================================================
  // MAINTENANCE
  // ========================================================================

  async createMaintenance(req, res) {
    try {
      const result = await assetService.createMaintenance(req.body, req.user.id);
      res.status(201).json({ success: true, message: 'Maintenance record created', data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message || 'Failed to create maintenance' });
    }
  }

  async updateMaintenance(req, res) {
    try {
      const result = await assetService.updateMaintenance(req.params.id, req.body, req.user.id);
      res.json({ success: true, message: 'Maintenance updated', data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message || 'Failed to update maintenance' });
    }
  }

  async getMaintenanceRecords(req, res) {
    try {
      const filters = { assetId: req.query.assetId, status: req.query.status, maintenanceType: req.query.maintenanceType };
      const data = await assetService.getMaintenanceRecords(filters);
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch maintenance records' });
    }
  }

  // ========================================================================
  // DISPOSALS
  // ========================================================================

  async createDisposal(req, res) {
    try {
      const result = await assetService.createDisposal(req.body, req.user.id);
      res.status(201).json({ success: true, message: 'Disposal request created', data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message || 'Failed to create disposal' });
    }
  }

  async approveDisposal(req, res) {
    try {
      const result = await assetService.approveDisposal(req.params.disposalId, req.body, req.user.id);
      res.json({ success: true, message: `Disposal ${result.status.toLowerCase()}`, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message || 'Failed to process disposal' });
    }
  }

  async getDisposals(req, res) {
    try {
      const filters = { assetId: req.query.assetId, status: req.query.status };
      const data = await assetService.getDisposals(filters);
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch disposals' });
    }
  }

  // ========================================================================
  // INCIDENTS
  // ========================================================================

  async createIncident(req, res) {
    try {
      const result = await assetService.createIncident(req.body, req.user.id);
      res.status(201).json({ success: true, message: 'Incident reported', data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message || 'Failed to report incident' });
    }
  }

  async updateIncident(req, res) {
    try {
      const result = await assetService.updateIncident(req.params.id, req.body, req.user.id);
      res.json({ success: true, message: 'Incident updated', data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message || 'Failed to update incident' });
    }
  }

  async getIncidents(req, res) {
    try {
      const filters = { assetId: req.query.assetId, status: req.query.status, incidentType: req.query.incidentType };
      const data = await assetService.getIncidents(filters);
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch incidents' });
    }
  }

  // ========================================================================
  // STATUS HISTORY & AUDIT
  // ========================================================================

  async getStatusHistory(req, res) {
    try {
      const data = await assetService.getStatusHistory(req.params.assetId);
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch status history' });
    }
  }

  async getAuditLog(req, res) {
    try {
      const data = await assetService.getAuditLog(req.params.assetId);
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to fetch audit log' });
    }
  }

  // ========================================================================
  // DASHBOARD
  // ========================================================================

  async getDashboardStats(req, res) {
    try {
      const data = await assetService.getDashboardStats();
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching asset dashboard:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch dashboard stats' });
    }
  }
}

module.exports = new AssetController();
