/**
 * Asset Management Service
 * Business logic for the Asset Management module
 */

const { query, transaction } = require('../config/database');

class AssetService {
  // ========================================================================
  // ASSET CRUD
  // ========================================================================

  /**
   * Generate a unique asset tag: ZCC-{CATEGORY_CODE}-{YEAR}-{SEQ}
   */
  async generateAssetTag(categoryCode, connection = null) {
    const year = new Date().getFullYear();
    const sql = `SELECT COUNT(*) + 1 as seq FROM assets WHERE asset_tag LIKE ?`;
    const pattern = `ZCC-${categoryCode}-${year}-%`;
    
    let rows;
    if (connection) {
      const [result] = await connection.execute(sql, [pattern]);
      rows = result;
    } else {
      rows = await query(sql, [pattern]);
    }
    const seq = String(rows[0].seq).padStart(4, '0');
    return `ZCC-${categoryCode}-${year}-${seq}`;
  }

  /**
   * Register a new asset
   */
  async createAsset(data, userId) {
    return await transaction(async (connection) => {
      // Get category code for tag generation
      const [catRows] = await connection.execute(
        `SELECT category_code FROM asset_categories WHERE id = ?`, [data.categoryId]
      );
      if (!catRows.length) throw new Error('Invalid category');
      const categoryCode = catRows[0].category_code;

      const assetTag = await this.generateAssetTag(categoryCode, connection);
      const currentValue = (data.purchaseCost || 0) - (data.accumulatedDepreciation || 0);

      // Convert empty strings to null for date/FK fields
      const toNull = (v) => (v === '' || v === undefined) ? null : v;
      const toNullInt = (v) => (v === '' || v === undefined || v === null) ? null : parseInt(v) || null;

      const [result] = await connection.execute(
        `INSERT INTO assets (
          asset_tag, asset_name, description, category_id, serial_number, model, manufacturer,
          donor_id, project_name, purchase_date, purchase_cost, currency_code, supplier_id,
          purchase_order_ref, invoice_ref, useful_life_years, salvage_value, depreciation_method,
          accumulated_depreciation, current_value, warranty_start_date, warranty_end_date,
          warranty_provider, warranty_terms, location_id, custodian_id, department_id,
          status, condition_rating, insurance_policy_no, insurance_expiry, insured_value,
          notes, barcode, photo_url, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          assetTag, data.assetName, toNull(data.description), data.categoryId,
          toNull(data.serialNumber), toNull(data.model), toNull(data.manufacturer),
          toNullInt(data.donorId), toNull(data.projectName), data.purchaseDate, data.purchaseCost || 0,
          data.currencyCode || 'USD', toNullInt(data.supplierId),
          toNull(data.purchaseOrderRef), toNull(data.invoiceRef),
          data.usefulLifeYears || 3, data.salvageValue || 0, data.depreciationMethod || 'STRAIGHT_LINE',
          data.accumulatedDepreciation || 0, currentValue,
          toNull(data.warrantyStartDate), toNull(data.warrantyEndDate),
          toNull(data.warrantyProvider), toNull(data.warrantyTerms),
          toNullInt(data.locationId), toNullInt(data.custodianId), toNullInt(data.departmentId),
          data.status || 'IN_USE', data.conditionRating || 'GOOD',
          toNull(data.insurancePolicyNo), toNull(data.insuranceExpiry), data.insuredValue || 0,
          toNull(data.notes), toNull(data.barcode), toNull(data.photoUrl),
          userId
        ]
      );

      const assetId = result.insertId;

      // Log lifecycle event
      await connection.execute(
        `INSERT INTO asset_status_history (asset_id, previous_status, new_status, change_reason, changed_by, created_at)
         VALUES (?, NULL, ?, 'Asset registered', ?, NOW())`,
        [assetId, data.status || 'IN_USE', userId]
      );

      // Audit log
      await connection.execute(
        `INSERT INTO asset_audit_log (asset_id, action, performed_by, created_at)
         VALUES (?, 'CREATED', ?, NOW())`,
        [assetId, userId]
      );

      return { id: assetId, assetTag };
    });
  }

  /**
   * Get paginated asset list with filters
   */
  async getAssets(filters = {}) {
    const { page = 1, limit = 25, search, categoryId, status, locationId, departmentId, donorId, conditionRating, custodianId } = filters;
    
    // Ensure numeric types for pagination
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 25;
    const offset = (pageNum - 1) * limitNum;
    
    const params = [];
    let whereClause = 'WHERE a.is_active = 1';

    if (search) {
      whereClause += ` AND (a.asset_tag LIKE ? OR a.asset_name LIKE ? OR a.serial_number LIKE ? OR a.description LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (categoryId) { whereClause += ` AND a.category_id = ?`; params.push(parseInt(categoryId)); }
    if (status) { whereClause += ` AND a.status = ?`; params.push(status); }
    if (locationId) { whereClause += ` AND a.location_id = ?`; params.push(parseInt(locationId)); }
    if (departmentId) { whereClause += ` AND a.department_id = ?`; params.push(parseInt(departmentId)); }
    if (donorId) { whereClause += ` AND a.donor_id = ?`; params.push(parseInt(donorId)); }
    if (conditionRating) { whereClause += ` AND a.condition_rating = ?`; params.push(conditionRating); }
    if (custodianId) { whereClause += ` AND a.custodian_id = ?`; params.push(parseInt(custodianId)); }

    const countSql = `SELECT COUNT(*) as total FROM assets a ${whereClause}`;
    const countResult = await query(countSql, params);
    const total = countResult[0].total;

    const dataSql = `
      SELECT a.*, 
        ac.category_name, ac.category_code,
        al.location_name, al.location_code,
        d.department_name,
        CONCAT(u.first_name, ' ', u.last_name) as custodian_name,
        dn.donor_name
      FROM assets a
      LEFT JOIN asset_categories ac ON a.category_id = ac.id
      LEFT JOIN asset_locations al ON a.location_id = al.id
      LEFT JOIN departments d ON a.department_id = d.id
      LEFT JOIN users u ON a.custodian_id = u.id
      LEFT JOIN donors dn ON a.donor_id = dn.id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const data = await query(dataSql, [...params, limitNum, offset]);

    return { data, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) };
  }

  /**
   * Get single asset with all details
   */
  async getAssetById(id) {
    const sql = `
      SELECT a.*, 
        ac.category_name, ac.category_code,
        al.location_name, al.location_code,
        d.department_name,
        CONCAT(u.first_name, ' ', u.last_name) as custodian_name,
        dn.donor_name,
        sup.supplier_name,
        CONCAT(cb.first_name, ' ', cb.last_name) as created_by_name
      FROM assets a
      LEFT JOIN asset_categories ac ON a.category_id = ac.id
      LEFT JOIN asset_locations al ON a.location_id = al.id
      LEFT JOIN departments d ON a.department_id = d.id
      LEFT JOIN users u ON a.custodian_id = u.id
      LEFT JOIN donors dn ON a.donor_id = dn.id
      LEFT JOIN asset_suppliers sup ON a.supplier_id = sup.id
      LEFT JOIN users cb ON a.created_by = cb.id
      WHERE a.id = ?
    `;
    const result = await query(sql, [id]);
    if (!result.length) return null;
    return result[0];
  }

  /**
   * Update an asset
   */
  async updateAsset(id, data, userId) {
    return await transaction(async (connection) => {
      // Get current asset for audit comparison
      const [currentRows] = await connection.execute(`SELECT * FROM assets WHERE id = ?`, [id]);
      if (!currentRows.length) throw new Error('Asset not found');
      const current = currentRows[0];

      const fields = [];
      const values = [];
      const auditChanges = [];

      const fieldMap = {
        assetName: 'asset_name', description: 'description', categoryId: 'category_id',
        serialNumber: 'serial_number', model: 'model', manufacturer: 'manufacturer',
        donorId: 'donor_id', projectName: 'project_name', purchaseDate: 'purchase_date',
        purchaseCost: 'purchase_cost', currencyCode: 'currency_code', supplierId: 'supplier_id',
        purchaseOrderRef: 'purchase_order_ref', invoiceRef: 'invoice_ref',
        usefulLifeYears: 'useful_life_years', salvageValue: 'salvage_value',
        depreciationMethod: 'depreciation_method', warrantyStartDate: 'warranty_start_date',
        warrantyEndDate: 'warranty_end_date', warrantyProvider: 'warranty_provider',
        warrantyTerms: 'warranty_terms', locationId: 'location_id', custodianId: 'custodian_id',
        departmentId: 'department_id', conditionRating: 'condition_rating',
        insurancePolicyNo: 'insurance_policy_no', insuranceExpiry: 'insurance_expiry',
        insuredValue: 'insured_value', notes: 'notes', barcode: 'barcode', photoUrl: 'photo_url'
      };

      // Fields that must be null instead of empty strings (FK/date fields)
      const nullableFields = new Set([
        'donor_id', 'supplier_id', 'location_id', 'custodian_id', 'department_id',
        'warranty_start_date', 'warranty_end_date', 'insurance_expiry',
        'purchase_date', 'serial_number', 'model', 'manufacturer',
        'purchase_order_ref', 'invoice_ref', 'warranty_provider', 'warranty_terms',
        'insurance_policy_no', 'notes', 'barcode', 'photo_url', 'description',
        'project_name'
      ]);

      for (const [key, col] of Object.entries(fieldMap)) {
        if (data[key] !== undefined) {
          let val = data[key];
          if (nullableFields.has(col) && (val === '' || val === null)) {
            val = null;
          }
          fields.push(`${col} = ?`);
          values.push(val);
          const oldVal = current[col];
          if (String(oldVal) !== String(val)) {
            auditChanges.push({ field: col, oldValue: oldVal, newValue: val });
          }
        }
      }

      if (fields.length === 0) throw new Error('No fields to update');

      fields.push('updated_at = NOW()');
      values.push(id);

      await connection.execute(`UPDATE assets SET ${fields.join(', ')} WHERE id = ?`, values);

      // Status change handling
      if (data.status && data.status !== current.status) {
        await connection.execute(
          `UPDATE assets SET status = ?, updated_at = NOW() WHERE id = ?`,
          [data.status, id]
        );
        await connection.execute(
          `INSERT INTO asset_status_history (asset_id, previous_status, new_status, change_reason, changed_by, created_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [id, current.status, data.status, data.statusChangeReason || null, userId]
        );
      }

      // Audit log for each changed field
      for (const change of auditChanges) {
        await connection.execute(
          `INSERT INTO asset_audit_log (asset_id, action, field_changed, old_value, new_value, performed_by, created_at)
           VALUES (?, 'UPDATED', ?, ?, ?, ?, NOW())`,
          [id, change.field, String(change.oldValue ?? ''), String(change.newValue ?? ''), userId]
        );
      }

      return { id };
    });
  }

  /**
   * Soft delete asset
   */
  async deleteAsset(id, userId) {
    await query(`UPDATE assets SET is_active = 0, updated_at = NOW() WHERE id = ?`, [id]);
    await query(
      `INSERT INTO asset_audit_log (asset_id, action, performed_by, created_at) VALUES (?, 'DELETED', ?, NOW())`,
      [id, userId]
    );
    return { id };
  }

  // ========================================================================
  // ASSET CATEGORIES
  // ========================================================================

  async getCategories() {
    return await query(`SELECT * FROM asset_categories WHERE is_active = 1 ORDER BY category_name`);
  }

  async createCategory(data) {
    const result = await query(
      `INSERT INTO asset_categories (category_name, category_code, description, parent_id, depreciation_method, default_useful_life_years)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.categoryName, data.categoryCode, data.description || null, data.parentId || null,
       data.depreciationMethod || 'STRAIGHT_LINE', data.defaultUsefulLifeYears || null]
    );
    return { id: result.insertId };
  }

  // ========================================================================
  // LOCATIONS
  // ========================================================================

  async getLocations() {
    return await query(`SELECT * FROM asset_locations WHERE is_active = 1 ORDER BY location_name`);
  }

  async createLocation(data) {
    const result = await query(
      `INSERT INTO asset_locations (location_name, location_code, location_type, address, city, province, country, parent_location_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.locationName, data.locationCode, data.locationType || 'OFFICE', data.address || null,
       data.city || null, data.province || null, data.country || 'Zimbabwe', data.parentLocationId || null]
    );
    return { id: result.insertId };
  }

  // ========================================================================
  // SUPPLIERS
  // ========================================================================

  async getSuppliers() {
    return await query(`SELECT * FROM asset_suppliers WHERE is_active = 1 ORDER BY supplier_name`);
  }

  async createSupplier(data) {
    const result = await query(
      `INSERT INTO asset_suppliers (supplier_name, supplier_code, contact_person, email, phone, address, tax_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.supplierName, data.supplierCode, data.contactPerson || null, data.email || null,
       data.phone || null, data.address || null, data.taxId || null]
    );
    return { id: result.insertId };
  }

  // ========================================================================
  // ASSET ASSIGNMENTS (Check-in / Check-out)
  // ========================================================================

  async checkoutAsset(data, userId) {
    return await transaction(async (connection) => {
      // Verify asset exists and is available
      const [assetRows] = await connection.execute(
        `SELECT id, status, custodian_id FROM assets WHERE id = ? AND is_active = 1`, [data.assetId]
      );
      if (!assetRows.length) throw new Error('Asset not found');

      // Create assignment
      const [result] = await connection.execute(
        `INSERT INTO asset_assignments (
          asset_id, assigned_to, assigned_by, assignment_type, assignment_date,
          expected_return_date, purpose, location_id, status, notes
        ) VALUES (?, ?, ?, 'CHECKOUT', NOW(), ?, ?, ?, 'ACTIVE', ?)`,
        [data.assetId, data.assignedTo, userId, data.expectedReturnDate || null,
         data.purpose || null, data.locationId || null, data.notes || null]
      );

      // Update asset custodian
      await connection.execute(
        `UPDATE assets SET custodian_id = ?, location_id = COALESCE(?, location_id), updated_at = NOW() WHERE id = ?`,
        [data.assignedTo, data.locationId || null, data.assetId]
      );

      // Status history
      await connection.execute(
        `INSERT INTO asset_status_history (asset_id, previous_status, new_status, change_reason, changed_by, created_at)
         VALUES (?, ?, 'IN_USE', ?, ?, NOW())`,
        [data.assetId, assetRows[0].status, `Checked out to user #${data.assignedTo}`, userId]
      );

      return { id: result.insertId };
    });
  }

  async checkinAsset(assignmentId, data, userId) {
    return await transaction(async (connection) => {
      const [assignRows] = await connection.execute(
        `SELECT * FROM asset_assignments WHERE id = ? AND status = 'ACTIVE'`, [assignmentId]
      );
      if (!assignRows.length) throw new Error('Active assignment not found');
      const assignment = assignRows[0];

      await connection.execute(
        `UPDATE asset_assignments SET 
          actual_return_date = NOW(), return_condition = ?, return_notes = ?,
          returned_to = ?, status = 'RETURNED', updated_at = NOW()
         WHERE id = ?`,
        [data.returnCondition || 'GOOD', data.returnNotes || null, userId, assignmentId]
      );

      // Update asset
      await connection.execute(
        `UPDATE assets SET custodian_id = NULL, condition_rating = ?, updated_at = NOW() WHERE id = ?`,
        [data.returnCondition || 'GOOD', assignment.asset_id]
      );

      // Status history
      await connection.execute(
        `INSERT INTO asset_status_history (asset_id, previous_status, new_status, change_reason, changed_by, created_at)
         VALUES (?, 'IN_USE', 'IN_USE', ?, ?, NOW())`,
        [assignment.asset_id, `Checked in by user #${userId}`, userId]
      );

      return { id: assignmentId };
    });
  }

  async getAssignments(assetId) {
    return await query(
      `SELECT aa.*, 
        CONCAT(ato.first_name, ' ', ato.last_name) as assigned_to_name,
        CONCAT(aby.first_name, ' ', aby.last_name) as assigned_by_name,
        CONCAT(rto.first_name, ' ', rto.last_name) as returned_to_name,
        al.location_name
      FROM asset_assignments aa
      LEFT JOIN users ato ON aa.assigned_to = ato.id
      LEFT JOIN users aby ON aa.assigned_by = aby.id
      LEFT JOIN users rto ON aa.returned_to = rto.id
      LEFT JOIN asset_locations al ON aa.location_id = al.id
      WHERE aa.asset_id = ?
      ORDER BY aa.assignment_date DESC`,
      [assetId]
    );
  }

  // ========================================================================
  // ASSET TRANSFERS
  // ========================================================================

  async createTransfer(data, userId) {
    return await transaction(async (connection) => {
      // Get current asset info for from-values
      const [assetRows] = await connection.execute(
        `SELECT id, status, location_id, department_id, custodian_id FROM assets WHERE id = ? AND is_active = 1`, [data.assetId]
      );
      if (!assetRows.length) throw new Error('Asset not found');
      const asset = assetRows[0];
      const previousStatus = asset.status;

      const year = new Date().getFullYear();
      const [countResult] = await connection.execute(
        `SELECT COUNT(*) + 1 as seq FROM asset_transfers WHERE YEAR(created_at) = ?`, [year]
      );
      const transferCode = `TRF-${year}-${String(countResult[0].seq).padStart(4, '0')}`;

      const [result] = await connection.execute(
        `INSERT INTO asset_transfers (
          asset_id, transfer_code, from_location_id, to_location_id,
          from_department_id, to_department_id, from_custodian_id, to_custodian_id,
          transfer_reason, status, initiated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
        [data.assetId, transferCode,
         data.fromLocationId || asset.location_id || null, data.toLocationId || null,
         data.fromDepartmentId || asset.department_id || null, data.toDepartmentId || null,
         data.fromCustodianId || asset.custodian_id || null, data.toCustodianId || null,
         data.transferReason, userId]
      );

      // Update asset status
      await connection.execute(
        `UPDATE assets SET status = 'TRANSFERRED', updated_at = NOW() WHERE id = ?`,
        [data.assetId]
      );

      await connection.execute(
        `INSERT INTO asset_status_history (asset_id, previous_status, new_status, change_reason, changed_by, created_at)
         VALUES (?, ?, 'TRANSFERRED', ?, ?, NOW())`,
        [data.assetId, previousStatus, `Transfer ${transferCode} initiated`, userId]
      );

      return { id: result.insertId, transferCode };
    });
  }

  async approveTransfer(transferId, data, userId) {
    return await transaction(async (connection) => {
      const [transferRows] = await connection.execute(
        `SELECT * FROM asset_transfers WHERE id = ? AND status = 'PENDING'`, [transferId]
      );
      if (!transferRows.length) throw new Error('Pending transfer not found');
      const transfer = transferRows[0];

      const newStatus = data.approved ? 'APPROVED' : 'REJECTED';
      await connection.execute(
        `UPDATE asset_transfers SET status = ?, approved_by = ?, approved_at = NOW(), notes = ?, updated_at = NOW() WHERE id = ?`,
        [newStatus, userId, data.notes || null, transferId]
      );

      if (data.approved) {
        // Update asset location/department/custodian
        const updates = [];
        const vals = [];
        if (transfer.to_location_id) { updates.push('location_id = ?'); vals.push(transfer.to_location_id); }
        if (transfer.to_department_id) { updates.push('department_id = ?'); vals.push(transfer.to_department_id); }
        if (transfer.to_custodian_id) { updates.push('custodian_id = ?'); vals.push(transfer.to_custodian_id); }
        updates.push("status = 'IN_USE'");
        updates.push('updated_at = NOW()');
        vals.push(transfer.asset_id);
        await connection.execute(`UPDATE assets SET ${updates.join(', ')} WHERE id = ?`, vals);
      } else {
        await connection.execute(
          `UPDATE assets SET status = 'IN_USE', updated_at = NOW() WHERE id = ?`, [transfer.asset_id]
        );
      }

      return { id: transferId, status: newStatus };
    });
  }

  async getTransfers(filters = {}) {
    const params = [];
    let whereClause = 'WHERE 1=1';
    if (filters.assetId) { whereClause += ` AND t.asset_id = ?`; params.push(filters.assetId); }
    if (filters.status) { whereClause += ` AND t.status = ?`; params.push(filters.status); }
    if (filters.departmentId) { whereClause += ` AND a.department_id = ?`; params.push(filters.departmentId); }
    if (filters.custodianId) { whereClause += ` AND a.custodian_id = ?`; params.push(filters.custodianId); }

    return await query(
      `SELECT t.*, a.asset_tag, a.asset_name,
        fl.location_name as from_location, tl.location_name as to_location,
        CONCAT(ib.first_name, ' ', ib.last_name) as initiated_by_name,
        CONCAT(ab.first_name, ' ', ab.last_name) as approved_by_name
      FROM asset_transfers t
      LEFT JOIN assets a ON t.asset_id = a.id
      LEFT JOIN asset_locations fl ON t.from_location_id = fl.id
      LEFT JOIN asset_locations tl ON t.to_location_id = tl.id
      LEFT JOIN users ib ON t.initiated_by = ib.id
      LEFT JOIN users ab ON t.approved_by = ab.id
      ${whereClause}
      ORDER BY t.created_at DESC`,
      params
    );
  }

  // ========================================================================
  // MAINTENANCE
  // ========================================================================

  async createMaintenance(data, userId) {
    const year = new Date().getFullYear();
    const countResult = await query(
      `SELECT COUNT(*) + 1 as seq FROM asset_maintenance WHERE YEAR(created_at) = ?`, [year]
    );
    const maintenanceCode = `MNT-${year}-${String(countResult[0].seq).padStart(4, '0')}`;

    const result = await query(
      `INSERT INTO asset_maintenance (
        asset_id, maintenance_code, maintenance_type, description, priority, status,
        scheduled_date, cost, currency_code, vendor_name, budget_line_id, reported_by, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.assetId, maintenanceCode, data.maintenanceType || 'PREVENTIVE', data.description,
       data.priority || 'MEDIUM', data.status || 'SCHEDULED', data.scheduledDate || null,
       data.cost || 0, data.currencyCode || 'USD', data.vendorName || null,
       data.budgetLineId || null, userId, data.notes || null]
    );

    return { id: result.insertId, maintenanceCode };
  }

  async updateMaintenance(id, data, userId) {
    const fields = [];
    const values = [];

    if (data.status) { fields.push('status = ?'); values.push(data.status); }
    if (data.startDate) { fields.push('start_date = ?'); values.push(data.startDate); }
    if (data.completionDate) { fields.push('completion_date = ?'); values.push(data.completionDate); }
    if (data.cost !== undefined) { fields.push('cost = ?'); values.push(data.cost); }
    if (data.vendorName) { fields.push('vendor_name = ?'); values.push(data.vendorName); }
    if (data.invoiceRef) { fields.push('invoice_ref = ?'); values.push(data.invoiceRef); }
    if (data.downtimeHours !== undefined) { fields.push('downtime_hours = ?'); values.push(data.downtimeHours); }
    if (data.partsReplaced) { fields.push('parts_replaced = ?'); values.push(data.partsReplaced); }
    if (data.findings) { fields.push('findings = ?'); values.push(data.findings); }
    if (data.nextServiceDate) { fields.push('next_service_date = ?'); values.push(data.nextServiceDate); }
    if (data.performedBy) { fields.push('performed_by = ?'); values.push(data.performedBy); }
    if (data.approvedBy) { fields.push('approved_by = ?'); values.push(userId); }
    if (data.notes) { fields.push('notes = ?'); values.push(data.notes); }

    fields.push('updated_at = NOW()');
    values.push(id);

    await query(`UPDATE asset_maintenance SET ${fields.join(', ')} WHERE id = ?`, values);
    return { id };
  }

  async getMaintenanceRecords(filters = {}) {
    const params = [];
    let whereClause = 'WHERE 1=1';
    if (filters.assetId) { whereClause += ` AND m.asset_id = ?`; params.push(filters.assetId); }
    if (filters.status) { whereClause += ` AND m.status = ?`; params.push(filters.status); }
    if (filters.maintenanceType) { whereClause += ` AND m.maintenance_type = ?`; params.push(filters.maintenanceType); }
    if (filters.departmentId) { whereClause += ` AND a.department_id = ?`; params.push(filters.departmentId); }
    if (filters.custodianId) { whereClause += ` AND a.custodian_id = ?`; params.push(filters.custodianId); }

    return await query(
      `SELECT m.*, a.asset_tag, a.asset_name,
        CONCAT(rb.first_name, ' ', rb.last_name) as reported_by_name
      FROM asset_maintenance m
      LEFT JOIN assets a ON m.asset_id = a.id
      LEFT JOIN users rb ON m.reported_by = rb.id
      ${whereClause}
      ORDER BY m.scheduled_date DESC, m.created_at DESC`,
      params
    );
  }

  // ========================================================================
  // DISPOSALS
  // ========================================================================

  async createDisposal(data, userId) {
    return await transaction(async (connection) => {
      const year = new Date().getFullYear();
      const [countResult] = await connection.execute(
        `SELECT COUNT(*) + 1 as seq FROM asset_disposals WHERE YEAR(created_at) = ?`, [year]
      );
      const disposalCode = `DSP-${year}-${String(countResult[0].seq).padStart(4, '0')}`;

      // Get current book value
      const [assetRows] = await connection.execute(
        `SELECT current_value FROM assets WHERE id = ?`, [data.assetId]
      );
      const bookValue = assetRows.length ? assetRows[0].current_value : 0;

      const [result] = await connection.execute(
        `INSERT INTO asset_disposals (
          asset_id, disposal_code, disposal_type, disposal_reason, disposal_description,
          disposal_date, book_value_at_disposal, sale_value, buyer_name, buyer_contact,
          status, requested_by, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
        [data.assetId, disposalCode, data.disposalType || 'WRITE_OFF',
         data.disposalReason, data.disposalDescription, data.disposalDate,
         bookValue, data.saleValue || 0, data.buyerName || null, data.buyerContact || null,
         userId, data.notes || null]
      );

      return { id: result.insertId, disposalCode };
    });
  }

  async approveDisposal(disposalId, data, userId) {
    return await transaction(async (connection) => {
      const [dispRows] = await connection.execute(
        `SELECT * FROM asset_disposals WHERE id = ? AND status = 'PENDING'`, [disposalId]
      );
      if (!dispRows.length) throw new Error('Pending disposal not found');

      const newStatus = data.approved ? 'APPROVED' : 'REJECTED';
      await connection.execute(
        `UPDATE asset_disposals SET status = ?, approved_by = ?, approved_at = NOW(),
         approval_comments = ?, updated_at = NOW() WHERE id = ?`,
        [newStatus, userId, data.comments || null, disposalId]
      );

      if (data.approved) {
        // Get current status before update
        const [assetRows] = await connection.execute(`SELECT status FROM assets WHERE id = ?`, [dispRows[0].asset_id]);
        const prevStatus = assetRows.length ? assetRows[0].status : 'IN_USE';

        await connection.execute(
          `UPDATE assets SET status = 'DISPOSED', is_active = 0, updated_at = NOW() WHERE id = ?`,
          [dispRows[0].asset_id]
        );

        await connection.execute(
          `INSERT INTO asset_status_history (asset_id, previous_status, new_status, change_reason, changed_by, created_at)
           VALUES (?, ?, 'DISPOSED', ?, ?, NOW())`,
          [dispRows[0].asset_id, prevStatus, `Disposal ${dispRows[0].disposal_code} approved`, userId]
        );
      }

      return { id: disposalId, status: newStatus };
    });
  }

  async getDisposals(filters = {}) {
    const params = [];
    let whereClause = 'WHERE 1=1';
    if (filters.assetId) { whereClause += ` AND d.asset_id = ?`; params.push(filters.assetId); }
    if (filters.status) { whereClause += ` AND d.status = ?`; params.push(filters.status); }
    if (filters.departmentId) { whereClause += ` AND a.department_id = ?`; params.push(filters.departmentId); }
    if (filters.custodianId) { whereClause += ` AND a.custodian_id = ?`; params.push(filters.custodianId); }

    return await query(
      `SELECT d.*, a.asset_tag, a.asset_name,
        CONCAT(rb.first_name, ' ', rb.last_name) as requested_by_name,
        CONCAT(ab.first_name, ' ', ab.last_name) as approved_by_name
      FROM asset_disposals d
      LEFT JOIN assets a ON d.asset_id = a.id
      LEFT JOIN users rb ON d.requested_by = rb.id
      LEFT JOIN users ab ON d.approved_by = ab.id
      ${whereClause}
      ORDER BY d.created_at DESC`,
      params
    );
  }

  // ========================================================================
  // INCIDENTS
  // ========================================================================

  async createIncident(data, userId) {
    const year = new Date().getFullYear();
    const countResult = await query(
      `SELECT COUNT(*) + 1 as seq FROM asset_incidents WHERE YEAR(created_at) = ?`, [year]
    );
    const incidentCode = `INC-${year}-${String(countResult[0].seq).padStart(4, '0')}`;

    const result = await query(
      `INSERT INTO asset_incidents (
        asset_id, incident_code, incident_type, incident_date, location, description,
        responsible_person_id, severity, status, police_report_ref, estimated_loss,
        reported_by, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)`,
      [data.assetId, incidentCode, data.incidentType, data.incidentDate,
       data.location || null, data.description, data.responsiblePersonId || null,
       data.severity || 'MEDIUM', data.policeReportRef || null,
       data.estimatedLoss || 0, userId, data.notes || null]
    );

    // Update asset status if lost/stolen
    if (['LOST', 'STOLEN'].includes(data.incidentType)) {
      const currentAsset = await query(`SELECT status FROM assets WHERE id = ?`, [data.assetId]);
      const prevStatus = currentAsset.length ? currentAsset[0].status : 'IN_USE';
      await query(`UPDATE assets SET status = 'LOST', updated_at = NOW() WHERE id = ?`, [data.assetId]);
      await query(
        `INSERT INTO asset_status_history (asset_id, previous_status, new_status, change_reason, changed_by, created_at)
         VALUES (?, ?, 'LOST', ?, ?, NOW())`,
        [data.assetId, prevStatus, `Incident: ${data.incidentType} - ${incidentCode}`, userId]
      );
    } else if (data.incidentType === 'DAMAGED') {
      await query(`UPDATE assets SET status = 'DAMAGED', condition_rating = 'POOR', updated_at = NOW() WHERE id = ?`, [data.assetId]);
    }

    return { id: result.insertId, incidentCode };
  }

  async updateIncident(id, data, userId) {
    const fields = [];
    const values = [];

    if (data.status) { fields.push('status = ?'); values.push(data.status); }
    if (data.investigationNotes) { fields.push('investigation_notes = ?'); values.push(data.investigationNotes); }
    if (data.investigatedBy) { fields.push('investigated_by = ?'); values.push(data.investigatedBy); }
    if (data.policeReportRef) { fields.push('police_report_ref = ?'); values.push(data.policeReportRef); }
    if (data.insuranceClaimRef) { fields.push('insurance_claim_ref = ?'); values.push(data.insuranceClaimRef); }
    if (data.recoveryAmount !== undefined) { fields.push('recovery_amount = ?'); values.push(data.recoveryAmount); }
    if (data.resolution) { fields.push('resolution = ?'); values.push(data.resolution); }
    if (data.resolvedDate) { fields.push('resolved_date = ?'); values.push(data.resolvedDate); }
    if (data.notes) { fields.push('notes = ?'); values.push(data.notes); }

    fields.push('updated_at = NOW()');
    values.push(id);

    await query(`UPDATE asset_incidents SET ${fields.join(', ')} WHERE id = ?`, values);
    return { id };
  }

  async getIncidents(filters = {}) {
    const params = [];
    let whereClause = 'WHERE 1=1';
    if (filters.assetId) { whereClause += ` AND i.asset_id = ?`; params.push(filters.assetId); }
    if (filters.status) { whereClause += ` AND i.status = ?`; params.push(filters.status); }
    if (filters.incidentType) { whereClause += ` AND i.incident_type = ?`; params.push(filters.incidentType); }
    if (filters.departmentId) { whereClause += ` AND a.department_id = ?`; params.push(filters.departmentId); }
    if (filters.custodianId) { whereClause += ` AND a.custodian_id = ?`; params.push(filters.custodianId); }

    return await query(
      `SELECT i.*, a.asset_tag, a.asset_name,
        CONCAT(rb.first_name, ' ', rb.last_name) as reported_by_name,
        CONCAT(rp.first_name, ' ', rp.last_name) as responsible_person_name
      FROM asset_incidents i
      LEFT JOIN assets a ON i.asset_id = a.id
      LEFT JOIN users rb ON i.reported_by = rb.id
      LEFT JOIN users rp ON i.responsible_person_id = rp.id
      ${whereClause}
      ORDER BY i.incident_date DESC`,
      params
    );
  }

  // ========================================================================
  // STATUS HISTORY & AUDIT
  // ========================================================================

  async getStatusHistory(assetId) {
    return await query(
      `SELECT sh.*, CONCAT(u.first_name, ' ', u.last_name) as changed_by_name
       FROM asset_status_history sh
       LEFT JOIN users u ON sh.changed_by = u.id
       WHERE sh.asset_id = ?
       ORDER BY sh.created_at DESC`,
      [assetId]
    );
  }

  async getAuditLog(assetId) {
    return await query(
      `SELECT al.*, CONCAT(u.first_name, ' ', u.last_name) as performed_by_name
       FROM asset_audit_log al
       LEFT JOIN users u ON al.performed_by = u.id
       WHERE al.asset_id = ?
       ORDER BY al.created_at DESC`,
      [assetId]
    );
  }

  // ========================================================================
  // DASHBOARD / SUMMARY STATS
  // ========================================================================

  async getDashboardStats(filters = {}) {
    try {
      let whereClause = 'WHERE is_active = 1';
      let assetAliasWhereClause = 'WHERE a.is_active = 1';
      const params = [];
      if (filters.departmentId) {
        whereClause += ' AND department_id = ?';
        assetAliasWhereClause += ' AND a.department_id = ?';
        params.push(filters.departmentId);
      }
      if (filters.custodianId) {
        whereClause += ' AND custodian_id = ?';
        assetAliasWhereClause += ' AND a.custodian_id = ?';
        params.push(filters.custodianId);
      }

      const totalAssetsResult = await query(`SELECT COUNT(*) as count FROM assets ${whereClause}`, params);
      const totalValueResult = await query(`SELECT COALESCE(SUM(current_value), 0) as value FROM assets ${whereClause}`, params);
      const statusCounts = await query(
        `SELECT status, COUNT(*) as count FROM assets ${whereClause} GROUP BY status`, params
      );
      const categoryCounts = await query(
        `SELECT ac.category_name, COUNT(a.id) as count, COALESCE(SUM(a.current_value), 0) as total_value
         FROM assets a JOIN asset_categories ac ON a.category_id = ac.id
        ${assetAliasWhereClause} GROUP BY ac.id, ac.category_name ORDER BY count DESC`, params
      );
      const conditionCounts = await query(
        `SELECT condition_rating, COUNT(*) as count FROM assets ${whereClause} GROUP BY condition_rating`, params
      );
      const upcomingMaintenanceResult = await query(
        `SELECT COUNT(*) as count
         FROM asset_maintenance m
         JOIN assets a ON a.id = m.asset_id
         WHERE m.status = 'SCHEDULED' AND m.scheduled_date <= DATE_ADD(NOW(), INTERVAL 30 DAY)
         ${filters.departmentId ? 'AND a.department_id = ?' : ''}
         ${filters.custodianId ? 'AND a.custodian_id = ?' : ''}`,
        [...(filters.departmentId ? [filters.departmentId] : []), ...(filters.custodianId ? [filters.custodianId] : [])]
      );
      const openIncidentsResult = await query(
        `SELECT COUNT(*) as count
         FROM asset_incidents i
         JOIN assets a ON a.id = i.asset_id
         WHERE i.status IN ('OPEN', 'INVESTIGATING')
         ${filters.departmentId ? 'AND a.department_id = ?' : ''}
         ${filters.custodianId ? 'AND a.custodian_id = ?' : ''}`,
        [...(filters.departmentId ? [filters.departmentId] : []), ...(filters.custodianId ? [filters.custodianId] : [])]
      );
      const pendingDisposalsResult = await query(
        `SELECT COUNT(*) as count
         FROM asset_disposals d
         JOIN assets a ON a.id = d.asset_id
         WHERE d.status = 'PENDING'
         ${filters.departmentId ? 'AND a.department_id = ?' : ''}
         ${filters.custodianId ? 'AND a.custodian_id = ?' : ''}`,
        [...(filters.departmentId ? [filters.departmentId] : []), ...(filters.custodianId ? [filters.custodianId] : [])]
      );

      return {
        totalAssets: totalAssetsResult[0]?.count || 0,
        totalValue: totalValueResult[0]?.value || 0,
        statusBreakdown: statusCounts || [],
        categoryBreakdown: categoryCounts || [],
        conditionBreakdown: conditionCounts || [],
        upcomingMaintenance: upcomingMaintenanceResult[0]?.count || 0,
        openIncidents: openIncidentsResult[0]?.count || 0,
        pendingDisposals: pendingDisposalsResult[0]?.count || 0
      };
    } catch (error) {
      // Return empty stats if tables don't exist yet (migration not run)
      return {
        totalAssets: 0,
        totalValue: 0,
        statusBreakdown: [],
        categoryBreakdown: [],
        conditionBreakdown: [],
        upcomingMaintenance: 0,
        openIncidents: 0,
        pendingDisposals: 0
      };
    }
  }
}

module.exports = new AssetService();
