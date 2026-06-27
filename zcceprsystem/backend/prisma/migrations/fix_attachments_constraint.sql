-- Fix attachments table to support polymorphic relationships
-- Remove the foreign key that only allows entity_id to reference requests table

-- Drop the foreign key constraint (must exist)
ALTER TABLE `attachments` DROP FOREIGN KEY `attachments_entity_id_fkey`;

-- Drop the index that was created for that foreign key
DROP INDEX `attachments_entity_id_fkey` ON `attachments`;

-- The entity_id column will now accept any integer value
-- entity_type determines what table the ID references ('REQUEST', 'BUDGET_TRANSACTION', 'APPROVAL')
