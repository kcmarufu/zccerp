const { query, transaction } = require('../config/database');

/**
 * Get all donors
 */
exports.getAllDonors = async (req, res) => {
  try {
    const { fiscal_year, is_active, donor_type } = req.query;
    
    let whereClause = '1=1';
    const params = [];
    
    if (fiscal_year) {
      whereClause += ' AND d.fiscal_year = ?';
      params.push(parseInt(fiscal_year));
    }
    if (is_active !== undefined) {
      whereClause += ' AND d.is_active = ?';
      params.push(is_active === 'true' ? 1 : 0);
    }
    if (donor_type) {
      whereClause += ' AND d.donor_type = ?';
      params.push(donor_type);
    }
    
    const donors = await query(
      `SELECT d.*,
              u.first_name as creator_first_name,
              u.last_name as creator_last_name,
              u.email as creator_email,
              (SELECT COUNT(*) FROM budget_lines WHERE donor_id = d.id) as budget_lines_count,
              (SELECT COUNT(*) FROM requests WHERE donor_id = d.id) as requests_count
       FROM donors d
       LEFT JOIN users u ON d.created_by = u.id
       WHERE ${whereClause}
       ORDER BY d.created_at DESC`,
      params
    );
    
    res.json(donors);
  } catch (error) {
    console.error('Error fetching donors:', error);
    res.status(500).json({ error: 'Failed to fetch donors' });
  }
};

/**
 * Get donor by ID
 */
exports.getDonorById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const donorResult = await query(
      `SELECT d.*,
              u.first_name as creator_first_name,
              u.last_name as creator_last_name,
              u.email as creator_email
       FROM donors d
       LEFT JOIN users u ON d.created_by = u.id
       WHERE d.id = ?`,
      [parseInt(id)]
    );
    
    if (donorResult.length === 0) {
      return res.status(404).json({ error: 'Donor not found' });
    }
    
    const donor = donorResult[0];
    
    // Get budget lines
    const budgetLines = await query(
      `SELECT bl.*,
              dep.department_name,
              dep.department_code,
              (bl.allocated_amount - bl.spent_amount) as balance
       FROM budget_lines bl
       LEFT JOIN departments dep ON bl.department_id = dep.id
       WHERE bl.donor_id = ?
       ORDER BY bl.budget_code`,
      [parseInt(id)]
    );
    
    // Get requests
    const requests = await query(
      `SELECT id, request_code, status, total_amount, created_at
       FROM requests
       WHERE donor_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [parseInt(id)]
    );
    
    donor.budget_lines = budgetLines;
    donor.requests = requests;
    
    res.json(donor);
  } catch (error) {
    console.error('Error fetching donor:', error);
    res.status(500).json({ error: 'Failed to fetch donor' });
  }
};

/**
 * Generate next donor code (DON-001, DON-002, etc.)
 */
async function generateDonorCode() {
  const result = await query(
    `SELECT donor_code FROM donors WHERE donor_code LIKE 'DON-%' ORDER BY id DESC LIMIT 1`
  );
  
  let nextNum = 1;
  if (result.length > 0) {
    const lastCode = result[0].donor_code;
    const match = lastCode.match(/DON-(\d+)/);
    if (match) {
      nextNum = parseInt(match[1]) + 1;
    }
  }
  
  return `DON-${String(nextNum).padStart(3, '0')}`;
}

/**
 * Get next donor code (for preview)
 */
exports.getNextDonorCode = async (req, res) => {
  try {
    const donorCode = await generateDonorCode();
    res.json({ donor_code: donorCode });
  } catch (error) {
    console.error('Error generating donor code:', error);
    res.status(500).json({ error: 'Failed to generate donor code' });
  }
};

/**
 * Create new donor (Finance Clerk only)
 */
exports.createDonor = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      donor_name,
      donor_type,
      contact_person,
      email,
      phone,
      address,
      country,
      total_committed,
      currency_code,
      fiscal_year,
      agreement_reference,
      agreement_start_date,
      agreement_end_date,
      restrictions,
      notes
    } = req.body;
    
    // Auto-generate donor code
    const donor_code = await generateDonorCode();
    
    // Convert empty strings to null for date fields
    const startDate = agreement_start_date && agreement_start_date !== '' ? agreement_start_date : null;
    const endDate = agreement_end_date && agreement_end_date !== '' ? agreement_end_date : null;
    
    const result = await query(
      `INSERT INTO donors (
        donor_code, donor_name, donor_type, contact_person, email, phone,
        address, country, total_committed, total_allocated, currency_code,
        fiscal_year, agreement_reference, agreement_start_date, agreement_end_date,
        restrictions, notes, created_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        donor_code, donor_name, donor_type,
        contact_person || null, email || null, phone || null,
        address || null, country || null, total_committed || 0,
        currency_code || 'USD', fiscal_year, agreement_reference || null,
        startDate, endDate,
        restrictions || null, notes || null, userId
      ]
    );
    
    const newDonor = await query(
      `SELECT d.*,
              u.first_name as creator_first_name,
              u.last_name as creator_last_name,
              u.email as creator_email
       FROM donors d
       LEFT JOIN users u ON d.created_by = u.id
       WHERE d.id = ?`,
      [result.insertId]
    );
    
    res.status(201).json(newDonor[0]);
  } catch (error) {
    console.error('Error creating donor:', error);
    res.status(500).json({ error: 'Failed to create donor' });
  }
};

/**
 * Update donor (Finance Clerk only)
 */
exports.updateDonor = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Check if donor exists
    const existing = await query(
      'SELECT * FROM donors WHERE id = ?',
      [parseInt(id)]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Donor not found' });
    }
    
    // If updating donor_code, check for uniqueness
    if (updates.donor_code && updates.donor_code !== existing[0].donor_code) {
      const codeExists = await query(
        'SELECT id FROM donors WHERE donor_code = ? AND id != ?',
        [updates.donor_code, parseInt(id)]
      );
      
      if (codeExists.length > 0) {
        return res.status(400).json({ error: 'Donor code already exists' });
      }
    }
    
    // Build update query dynamically
    const updateFields = [];
    const params = [];
    
    const allowedFields = [
      'donor_code', 'donor_name', 'donor_type', 'contact_person', 'email', 'phone',
      'address', 'country', 'total_committed', 'total_allocated', 'currency_code',
      'fiscal_year', 'agreement_reference', 'agreement_start_date', 'agreement_end_date',
      'restrictions', 'notes', 'is_active'
    ];
    
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        params.push(updates[field]);
      }
    });
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    params.push(parseInt(id));
    
    await query(
      `UPDATE donors SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = ?`,
      params
    );
    
    const updated = await query(
      `SELECT d.*,
              u.first_name as creator_first_name,
              u.last_name as creator_last_name,
              u.email as creator_email
       FROM donors d
       LEFT JOIN users u ON d.created_by = u.id
       WHERE d.id = ?`,
      [parseInt(id)]
    );
    
    res.json(updated[0]);
  } catch (error) {
    console.error('Error updating donor:', error);
    res.status(500).json({ error: 'Failed to update donor' });
  }
};

/**
 * Deactivate donor (Finance Clerk only)
 */
exports.deactivateDonor = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(
      'UPDATE donors SET is_active = 0, updated_at = NOW() WHERE id = ?',
      [parseInt(id)]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Donor not found' });
    }
    
    const donor = await query(
      'SELECT * FROM donors WHERE id = ?',
      [parseInt(id)]
    );
    
    res.json({ message: 'Donor deactivated successfully', donor: donor[0] });
  } catch (error) {
    console.error('Error deactivating donor:', error);
    res.status(500).json({ error: 'Failed to deactivate donor' });
  }
};

/**
 * Delete donor permanently (Finance Clerk only)
 * Only allowed if donor has no budget lines or requests
 */
exports.deleteDonor = async (req, res) => {
  try {
    const { id } = req.params;
    const donorId = parseInt(id);

    // Check donor exists
    const existing = await query('SELECT * FROM donors WHERE id = ?', [donorId]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Donor not found' });
    }

    // Check for linked budget lines
    const budgetLines = await query('SELECT COUNT(*) as count FROM budget_lines WHERE donor_id = ?', [donorId]);
    if (budgetLines[0].count > 0) {
      return res.status(400).json({ 
        error: `Cannot delete donor with ${budgetLines[0].count} linked budget line(s). Delete the budget lines first or deactivate the donor instead.` 
      });
    }

    // Check for linked requests
    const requests = await query('SELECT COUNT(*) as count FROM requests WHERE donor_id = ?', [donorId]);
    if (requests[0].count > 0) {
      return res.status(400).json({ 
        error: `Cannot delete donor with ${requests[0].count} linked request(s). Deactivate the donor instead.` 
      });
    }

    // Safe to delete
    await query('DELETE FROM donor_transactions WHERE donor_id = ?', [donorId]);
    await query('DELETE FROM donors WHERE id = ?', [donorId]);

    res.json({ message: 'Donor deleted successfully' });
  } catch (error) {
    console.error('Error deleting donor:', error);
    res.status(500).json({ error: 'Failed to delete donor' });
  }
};

/**
 * Add committed funds to donor
 * POST /api/donors/:id/add-funds
 */
exports.addFunds = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description } = req.body;
    const performedBy = req.user.id;
    const donorId = parseInt(id);
    const parsedAmount = parseFloat(amount);

    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than zero' });
    }

    const result = await transaction(async (connection) => {
      const [donors] = await connection.execute(
        'SELECT * FROM donors WHERE id = ? FOR UPDATE',
        [donorId]
      );

      if (donors.length === 0) {
        throw new Error('Donor not found');
      }

      const currentCommitted = parseFloat(donors[0].total_committed);
      const newCommitted = currentCommitted + parsedAmount;

      // Update donor
      await connection.execute(
        'UPDATE donors SET total_committed = ?, updated_at = NOW() WHERE id = ?',
        [newCommitted, donorId]
      );

      // Log transaction
      await connection.execute(
        `INSERT INTO donor_transactions (donor_id, transaction_type, amount, balance_before, balance_after, description, performed_by)
         VALUES (?, 'COMMITMENT_ADD', ?, ?, ?, ?, ?)`,
        [donorId, parsedAmount, currentCommitted, newCommitted, description || 'Additional funds committed', performedBy]
      );

      return { previousCommitted: currentCommitted, newCommitted };
    });

    res.json({ 
      message: `Added ${parsedAmount.toFixed(2)} to committed funds`,
      data: result 
    });
  } catch (error) {
    console.error('Error adding funds:', error);
    res.status(error.message === 'Donor not found' ? 404 : 500).json({ 
      error: error.message || 'Failed to add funds' 
    });
  }
};

/**
 * Remove committed funds from donor
 * POST /api/donors/:id/remove-funds
 */
exports.removeFunds = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description } = req.body;
    const performedBy = req.user.id;
    const donorId = parseInt(id);
    const parsedAmount = parseFloat(amount);

    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than zero' });
    }

    const result = await transaction(async (connection) => {
      const [donors] = await connection.execute(
        'SELECT * FROM donors WHERE id = ? FOR UPDATE',
        [donorId]
      );

      if (donors.length === 0) {
        throw new Error('Donor not found');
      }

      const currentCommitted = parseFloat(donors[0].total_committed);
      const totalAllocated = parseFloat(donors[0].total_allocated);

      if (parsedAmount > currentCommitted) {
        throw new Error(`Cannot remove more than the current committed amount (${currentCommitted.toFixed(2)})`);
      }

      const newCommitted = currentCommitted - parsedAmount;

      if (newCommitted < totalAllocated) {
        throw new Error(`Cannot reduce committed below allocated amount (${totalAllocated.toFixed(2)}). Reduce budget allocations first.`);
      }

      // Update donor
      await connection.execute(
        'UPDATE donors SET total_committed = ?, updated_at = NOW() WHERE id = ?',
        [newCommitted, donorId]
      );

      // Log transaction
      await connection.execute(
        `INSERT INTO donor_transactions (donor_id, transaction_type, amount, balance_before, balance_after, description, performed_by)
         VALUES (?, 'COMMITMENT_REMOVE', ?, ?, ?, ?, ?)`,
        [donorId, parsedAmount, currentCommitted, newCommitted, description || 'Funds removed from commitment', performedBy]
      );

      return { previousCommitted: currentCommitted, newCommitted };
    });

    res.json({ 
      message: `Removed ${parsedAmount.toFixed(2)} from committed funds`,
      data: result 
    });
  } catch (error) {
    console.error('Error removing funds:', error);
    const status = error.message.includes('not found') ? 404 : 
                   error.message.includes('Cannot') ? 400 : 500;
    res.status(status).json({ error: error.message || 'Failed to remove funds' });
  }
};

/**
 * Get donor fund transaction history
 * GET /api/donors/:id/transactions
 */
exports.getDonorTransactions = async (req, res) => {
  try {
    const { id } = req.params;
    const transactions = await query(
      `SELECT dt.*, u.first_name, u.last_name
       FROM donor_transactions dt
       LEFT JOIN users u ON dt.performed_by = u.id
       WHERE dt.donor_id = ?
       ORDER BY dt.created_at DESC`,
      [parseInt(id)]
    );
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching donor transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};

/**
 * Get budget lines for a specific donor
 */
exports.getDonorBudgetLines = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.query;
    
    let whereClause = 'bl.donor_id = ?';
    const params = [parseInt(id)];
    
    if (is_active !== undefined) {
      whereClause += ' AND bl.is_active = ?';
      params.push(is_active === 'true' ? 1 : 0);
    }
    
    const budgetLines = await query(
      `SELECT bl.*,
              dep.department_name,
              dep.department_code,
              d.donor_name,
              d.donor_code,
              d.currency_code,
              (bl.allocated_amount - bl.spent_amount) as balance,
              ROUND((bl.spent_amount / NULLIF(bl.allocated_amount, 0)) * 100, 2) as utilization_percentage
       FROM budget_lines bl
       LEFT JOIN departments dep ON bl.department_id = dep.id
       JOIN donors d ON bl.donor_id = d.id
       WHERE ${whereClause}
       ORDER BY bl.budget_code`,
      params
    );
    
    res.json(budgetLines);
  } catch (error) {
    console.error('Error fetching donor budget lines:', error);
    res.status(500).json({ error: 'Failed to fetch budget lines' });
  }
};

/**
 * Get donor statistics/summary
 */
exports.getDonorStats = async (req, res) => {
  try {
    const { id } = req.params;
    
    const donorResult = await query(
      'SELECT * FROM donors WHERE id = ?',
      [parseInt(id)]
    );
    
    if (donorResult.length === 0) {
      return res.status(404).json({ error: 'Donor not found' });
    }
    
    const donor = donorResult[0];
    
    // Get budget lines summary
    const budgetSummary = await query(
      `SELECT 
        COUNT(*) as budget_lines_count,
        SUM(allocated_amount) as total_allocated,
        SUM(spent_amount) as total_spent
       FROM budget_lines
       WHERE donor_id = ?`,
      [parseInt(id)]
    );
    
    // Get requests by status
    const requestsByStatus = await query(
      `SELECT status, COUNT(*) as count
       FROM requests
       WHERE donor_id = ?
       GROUP BY status`,
      [parseInt(id)]
    );
    
    const totalRequests = await query(
      'SELECT COUNT(*) as count FROM requests WHERE donor_id = ?',
      [parseInt(id)]
    );
    
    const summary = budgetSummary[0];
    const totalAllocated = parseFloat(summary.total_allocated) || 0;
    const totalSpent = parseFloat(summary.total_spent) || 0;
    const remainingBalance = totalAllocated - totalSpent;
    const utilizationRate = totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : 0;
    
    const requestsStatusMap = {};
    requestsByStatus.forEach(row => {
      requestsStatusMap[row.status] = row.count;
    });
    
    const stats = {
      donor_id: donor.id,
      donor_name: donor.donor_name,
      donor_code: donor.donor_code,
      currency: donor.currency_code,
      total_committed: parseFloat(donor.total_committed),
      total_allocated: totalAllocated,
      total_spent: totalSpent,
      remaining_balance: remainingBalance,
      utilization_rate: utilizationRate.toFixed(2),
      budget_lines_count: summary.budget_lines_count,
      requests_count: totalRequests[0].count,
      requests_by_status: requestsStatusMap
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching donor stats:', error);
    res.status(500).json({ error: 'Failed to fetch donor statistics' });
  }
};
