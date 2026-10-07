-- Leave v9 — the generated hr_leave_balances.balance column was still
-- DECIMAL(5,1), so a balance of 2.95 was stored (and shown) as 3.0.
-- Widen it to match the two-decimal columns it is computed from.
ALTER TABLE `hr_leave_balances`
  MODIFY COLUMN `balance` DECIMAL(8,2)
  GENERATED ALWAYS AS (`entitlement` + `carried_forward` - `taken` - `pending`) STORED;
