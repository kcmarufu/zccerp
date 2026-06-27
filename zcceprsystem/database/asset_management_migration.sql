-- ============================================================================
-- ASSET MANAGEMENT & TRACKING MODULE - Complete Database Schema
-- Run these queries in Navicat on the finance_erp database
-- Date: 2026-02-13
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================================
-- 1. ASSET CATEGORIES (IT Equipment, Vehicle, Furniture, Medical, etc.)
-- ============================================================================
DROP TABLE IF EXISTS `asset_categories`;
CREATE TABLE `asset_categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `category_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `category_code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `parent_id` int NULL DEFAULT NULL,
  `depreciation_method` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'STRAIGHT_LINE',
  `default_useful_life_years` int NULL DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `asset_categories_code_key` (`category_code`),
  INDEX `asset_categories_parent_idx` (`parent_id`),
  CONSTRAINT `fk_asset_cat_parent` FOREIGN KEY (`parent_id`) REFERENCES `asset_categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- Seed default categories
INSERT INTO `asset_categories` (`category_name`, `category_code`, `description`, `depreciation_method`, `default_useful_life_years`) VALUES
('IT Equipment', 'IT', 'Laptops, desktops, printers, servers, networking equipment', 'STRAIGHT_LINE', 3),
('Vehicles', 'VEH', 'Cars, trucks, motorcycles, bicycles', 'STRAIGHT_LINE', 5),
('Furniture & Fittings', 'FUR', 'Office furniture, desks, chairs, cabinets', 'STRAIGHT_LINE', 7),
('Medical Equipment', 'MED', 'Medical devices, diagnostic equipment', 'STRAIGHT_LINE', 5),
('Communication Equipment', 'COM', 'Radios, satellite phones, modems', 'STRAIGHT_LINE', 3),
('Office Equipment', 'OFC', 'Photocopiers, scanners, projectors', 'STRAIGHT_LINE', 5),
('Power & Energy', 'PWR', 'Generators, solar panels, UPS systems', 'STRAIGHT_LINE', 7),
('Field Equipment', 'FLD', 'Tents, camping gear, field tools', 'STRAIGHT_LINE', 3),
('Kitchen & Catering', 'KIT', 'Kitchen appliances, utensils, catering equipment', 'STRAIGHT_LINE', 5),
('Security Equipment', 'SEC', 'CCTV cameras, alarms, safes', 'STRAIGHT_LINE', 5);

-- ============================================================================
-- 2. ASSET LOCATIONS (Offices, districts, field sites)
-- ============================================================================
DROP TABLE IF EXISTS `asset_locations`;
CREATE TABLE `asset_locations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `location_name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OFFICE',
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `city` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `province` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `country` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Zimbabwe',
  `parent_location_id` int NULL DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `asset_locations_code_key` (`location_code`),
  INDEX `asset_locations_type_idx` (`location_type`),
  INDEX `asset_locations_parent_idx` (`parent_location_id`),
  CONSTRAINT `fk_location_parent` FOREIGN KEY (`parent_location_id`) REFERENCES `asset_locations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- Seed default locations
INSERT INTO `asset_locations` (`location_name`, `location_code`, `location_type`, `city`, `province`) VALUES
('Head Office', 'HQ', 'OFFICE', 'Harare', 'Harare'),
('Regional Office - Bulawayo', 'REG-BYO', 'OFFICE', 'Bulawayo', 'Bulawayo'),
('Field Office - Gweru', 'FLD-GWR', 'FIELD_SITE', 'Gweru', 'Midlands'),
('Warehouse - Harare', 'WH-HRE', 'WAREHOUSE', 'Harare', 'Harare');

-- ============================================================================
-- 3. SUPPLIERS
-- ============================================================================
DROP TABLE IF EXISTS `asset_suppliers`;
CREATE TABLE `asset_suppliers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `supplier_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `supplier_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact_person` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `phone` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `tax_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `asset_suppliers_code_key` (`supplier_code`)
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ============================================================================
-- 4. ASSETS (Main Asset Register)
-- ============================================================================
DROP TABLE IF EXISTS `assets`;
CREATE TABLE `assets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_tag` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `asset_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `category_id` int NOT NULL,
  `serial_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `model` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `manufacturer` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  
  -- Financial / Donor info
  `donor_id` int NULL DEFAULT NULL,
  `project_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `purchase_date` date NOT NULL,
  `purchase_cost` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `currency_code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `supplier_id` int NULL DEFAULT NULL,
  `purchase_order_ref` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `invoice_ref` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  
  -- Depreciation
  `useful_life_years` int NOT NULL DEFAULT 3,
  `salvage_value` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `depreciation_method` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'STRAIGHT_LINE',
  `accumulated_depreciation` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `current_value` decimal(15, 2) NOT NULL DEFAULT 0.00,
  
  -- Warranty
  `warranty_start_date` date NULL,
  `warranty_end_date` date NULL,
  `warranty_provider` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `warranty_terms` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  
  -- Location & Custodian
  `location_id` int NULL DEFAULT NULL,
  `custodian_id` int NULL DEFAULT NULL,
  `department_id` int NULL DEFAULT NULL,
  
  -- Status & Lifecycle
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'IN_USE',
  `condition_rating` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'GOOD',
  `last_inspection_date` date NULL,
  `next_inspection_date` date NULL,
  
  -- Insurance
  `insurance_policy_no` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `insurance_expiry` date NULL,
  `insured_value` decimal(15, 2) NULL DEFAULT 0.00,
  
  -- Metadata
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `barcode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `photo_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  
  `created_by` int NULL DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  
  PRIMARY KEY (`id`),
  UNIQUE INDEX `assets_tag_key` (`asset_tag`),
  INDEX `assets_category_idx` (`category_id`),
  INDEX `assets_donor_idx` (`donor_id`),
  INDEX `assets_supplier_idx` (`supplier_id`),
  INDEX `assets_location_idx` (`location_id`),
  INDEX `assets_custodian_idx` (`custodian_id`),
  INDEX `assets_department_idx` (`department_id`),
  INDEX `assets_status_idx` (`status`),
  INDEX `assets_condition_idx` (`condition_rating`),
  INDEX `assets_purchase_date_idx` (`purchase_date`),
  INDEX `assets_serial_idx` (`serial_number`),
  INDEX `assets_barcode_idx` (`barcode`),
  
  CONSTRAINT `fk_asset_category` FOREIGN KEY (`category_id`) REFERENCES `asset_categories` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_asset_donor` FOREIGN KEY (`donor_id`) REFERENCES `donors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_asset_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `asset_suppliers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_asset_location` FOREIGN KEY (`location_id`) REFERENCES `asset_locations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_asset_custodian` FOREIGN KEY (`custodian_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_asset_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_asset_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ============================================================================
-- 5. ASSET LIFECYCLE / STATUS HISTORY
-- ============================================================================
DROP TABLE IF EXISTS `asset_status_history`;
CREATE TABLE `asset_status_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `previous_status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `new_status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `change_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `changed_by` int NOT NULL,
  `ip_address` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `asset_status_history_asset_idx` (`asset_id`),
  INDEX `asset_status_history_date_idx` (`created_at`),
  CONSTRAINT `fk_asset_status_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_asset_status_user` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ============================================================================
-- 6. ASSET CHECK-IN / CHECK-OUT (Custodian Tracking)
-- ============================================================================
DROP TABLE IF EXISTS `asset_assignments`;
CREATE TABLE `asset_assignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `assigned_to` int NOT NULL,
  `assigned_by` int NOT NULL,
  `assignment_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CHECKOUT',
  `assignment_date` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expected_return_date` date NULL,
  `actual_return_date` datetime(3) NULL,
  `return_condition` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `return_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `returned_to` int NULL DEFAULT NULL,
  `purpose` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `location_id` int NULL DEFAULT NULL,
  `signature_confirmed` tinyint(1) NOT NULL DEFAULT 0,
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `asset_assignments_asset_idx` (`asset_id`),
  INDEX `asset_assignments_user_idx` (`assigned_to`),
  INDEX `asset_assignments_status_idx` (`status`),
  INDEX `asset_assignments_date_idx` (`assignment_date`),
  CONSTRAINT `fk_assignment_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_assignment_user` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_assignment_by` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_assignment_returned_to` FOREIGN KEY (`returned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_assignment_location` FOREIGN KEY (`location_id`) REFERENCES `asset_locations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ============================================================================
-- 7. ASSET TRANSFERS (Between locations/projects/departments)
-- ============================================================================
DROP TABLE IF EXISTS `asset_transfers`;
CREATE TABLE `asset_transfers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `transfer_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `from_location_id` int NULL,
  `to_location_id` int NULL,
  `from_department_id` int NULL,
  `to_department_id` int NULL,
  `from_custodian_id` int NULL,
  `to_custodian_id` int NULL,
  `transfer_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `transfer_date` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `approved_by` int NULL,
  `approved_at` datetime(3) NULL,
  `received_by` int NULL,
  `received_at` datetime(3) NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `initiated_by` int NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `asset_transfers_code_key` (`transfer_code`),
  INDEX `asset_transfers_asset_idx` (`asset_id`),
  INDEX `asset_transfers_status_idx` (`status`),
  INDEX `asset_transfers_date_idx` (`transfer_date`),
  CONSTRAINT `fk_transfer_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_transfer_from_loc` FOREIGN KEY (`from_location_id`) REFERENCES `asset_locations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_transfer_to_loc` FOREIGN KEY (`to_location_id`) REFERENCES `asset_locations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_transfer_from_dept` FOREIGN KEY (`from_department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_transfer_to_dept` FOREIGN KEY (`to_department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_transfer_initiated` FOREIGN KEY (`initiated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_transfer_approved` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_transfer_received` FOREIGN KEY (`received_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ============================================================================
-- 8. ASSET MAINTENANCE & REPAIRS
-- ============================================================================
DROP TABLE IF EXISTS `asset_maintenance`;
CREATE TABLE `asset_maintenance` (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `maintenance_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `maintenance_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PREVENTIVE',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `priority` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MEDIUM',
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SCHEDULED',
  `scheduled_date` date NULL,
  `start_date` datetime(3) NULL,
  `completion_date` datetime(3) NULL,
  `cost` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `currency_code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `vendor_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `invoice_ref` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `downtime_hours` decimal(10, 2) NULL DEFAULT 0,
  `parts_replaced` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `findings` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `next_service_date` date NULL,
  `next_service_mileage` int NULL,
  `reported_by` int NOT NULL,
  `performed_by` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `approved_by` int NULL,
  `budget_line_id` int NULL DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `asset_maintenance_code_key` (`maintenance_code`),
  INDEX `asset_maintenance_asset_idx` (`asset_id`),
  INDEX `asset_maintenance_status_idx` (`status`),
  INDEX `asset_maintenance_type_idx` (`maintenance_type`),
  INDEX `asset_maintenance_scheduled_idx` (`scheduled_date`),
  CONSTRAINT `fk_maintenance_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_maintenance_reported` FOREIGN KEY (`reported_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_maintenance_approved` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_maintenance_budget` FOREIGN KEY (`budget_line_id`) REFERENCES `budget_lines` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ============================================================================
-- 9. ASSET DISPOSAL & WRITE-OFF
-- ============================================================================
DROP TABLE IF EXISTS `asset_disposals`;
CREATE TABLE `asset_disposals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `disposal_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `disposal_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'WRITE_OFF',
  `disposal_reason` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `disposal_description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `disposal_date` date NOT NULL,
  `book_value_at_disposal` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `sale_value` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `gain_loss` decimal(15, 2) GENERATED ALWAYS AS (`sale_value` - `book_value_at_disposal`) STORED,
  `buyer_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `buyer_contact` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `requested_by` int NOT NULL,
  `approved_by` int NULL,
  `approved_at` datetime(3) NULL,
  `approval_comments` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `certificate_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `asset_disposals_code_key` (`disposal_code`),
  INDEX `asset_disposals_asset_idx` (`asset_id`),
  INDEX `asset_disposals_status_idx` (`status`),
  INDEX `asset_disposals_date_idx` (`disposal_date`),
  INDEX `asset_disposals_type_idx` (`disposal_type`),
  CONSTRAINT `fk_disposal_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_disposal_requested` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_disposal_approved` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ============================================================================
-- 10. ASSET INCIDENTS (Lost, Damaged, Stolen)
-- ============================================================================
DROP TABLE IF EXISTS `asset_incidents`;
CREATE TABLE `asset_incidents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `incident_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `incident_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `incident_date` datetime(3) NOT NULL,
  `location` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `responsible_person_id` int NULL,
  `severity` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MEDIUM',
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OPEN',
  `investigation_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `police_report_ref` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `insurance_claim_ref` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `estimated_loss` decimal(15, 2) NULL DEFAULT 0.00,
  `recovery_amount` decimal(15, 2) NULL DEFAULT 0.00,
  `resolution` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `resolved_date` datetime(3) NULL,
  `reported_by` int NOT NULL,
  `investigated_by` int NULL,
  `approved_for_writeoff` tinyint(1) NOT NULL DEFAULT 0,
  `writeoff_approved_by` int NULL,
  `writeoff_date` datetime(3) NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `asset_incidents_code_key` (`incident_code`),
  INDEX `asset_incidents_asset_idx` (`asset_id`),
  INDEX `asset_incidents_type_idx` (`incident_type`),
  INDEX `asset_incidents_status_idx` (`status`),
  INDEX `asset_incidents_date_idx` (`incident_date`),
  CONSTRAINT `fk_incident_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_incident_responsible` FOREIGN KEY (`responsible_person_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_incident_reported` FOREIGN KEY (`reported_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_incident_investigated` FOREIGN KEY (`investigated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_incident_writeoff_by` FOREIGN KEY (`writeoff_approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ============================================================================
-- 11. ASSET DEPRECIATION LOG (Monthly depreciation entries)
-- ============================================================================
DROP TABLE IF EXISTS `asset_depreciation_log`;
CREATE TABLE `asset_depreciation_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `period_date` date NOT NULL,
  `depreciation_amount` decimal(15, 2) NOT NULL,
  `accumulated_depreciation` decimal(15, 2) NOT NULL,
  `book_value` decimal(15, 2) NOT NULL,
  `method` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'STRAIGHT_LINE',
  `posted_by` int NULL DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `asset_depreciation_asset_idx` (`asset_id`),
  INDEX `asset_depreciation_period_idx` (`period_date`),
  UNIQUE INDEX `asset_depreciation_unique` (`asset_id`, `period_date`),
  CONSTRAINT `fk_depreciation_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_depreciation_posted` FOREIGN KEY (`posted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ============================================================================
-- 12. ASSET AUDIT LOG (immutable log for all changes)
-- ============================================================================
DROP TABLE IF EXISTS `asset_audit_log`;
CREATE TABLE `asset_audit_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `action` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `field_changed` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `old_value` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `new_value` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `performed_by` int NOT NULL,
  `ip_address` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `user_agent` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `asset_audit_asset_idx` (`asset_id`),
  INDEX `asset_audit_action_idx` (`action`),
  INDEX `asset_audit_date_idx` (`created_at`),
  CONSTRAINT `fk_audit_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_audit_user` FOREIGN KEY (`performed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- SUMMARY OF STATUS VALUES:
-- ============================================================================
-- assets.status: REQUESTED, APPROVED, PURCHASED, IN_USE, TRANSFERRED, DAMAGED, LOST, DISPOSED, WRITTEN_OFF
-- assets.condition_rating: EXCELLENT, GOOD, FAIR, POOR, NON_FUNCTIONAL
-- asset_assignments.status: ACTIVE, RETURNED, OVERDUE
-- asset_transfers.status: PENDING, APPROVED, IN_TRANSIT, COMPLETED, REJECTED
-- asset_maintenance.status: SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED
-- asset_maintenance.maintenance_type: PREVENTIVE, CORRECTIVE, EMERGENCY, INSPECTION
-- asset_disposals.status: PENDING, APPROVED, COMPLETED, REJECTED
-- asset_disposals.disposal_type: WRITE_OFF, SALE, DONATION, DESTRUCTION, RETURN_TO_DONOR
-- asset_disposals.disposal_reason: OBSOLETE, DAMAGED, STOLEN, END_OF_LIFE, SURPLUS, DONATED
-- asset_incidents.incident_type: LOST, STOLEN, DAMAGED, ACCIDENT, FIRE, FLOOD
-- asset_incidents.status: OPEN, INVESTIGATING, RESOLVED, CLOSED
-- asset_incidents.severity: LOW, MEDIUM, HIGH, CRITICAL
