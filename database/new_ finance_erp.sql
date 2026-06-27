/*
 Navicat Premium Dump SQL

 Source Server         : tiendetravels_db
 Source Server Type    : MySQL
 Source Server Version : 90600 (9.6.0)
 Source Host           : localhost:3306
 Source Schema         : finance_erp

 Target Server Type    : MySQL
 Target Server Version : 90600 (9.6.0)
 File Encoding         : 65001

 Date: 13/02/2026 04:03:10
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for approval_logs
-- ----------------------------
DROP TABLE IF EXISTS `approval_logs`;
CREATE TABLE `approval_logs`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_id` int NOT NULL,
  `approver_id` int NOT NULL,
  `approver_role` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `previous_status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `new_status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `comments` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `ip_address` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `user_agent` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `approval_logs_request_id_idx`(`request_id` ASC) USING BTREE,
  INDEX `approval_logs_approver_id_idx`(`approver_id` ASC) USING BTREE,
  INDEX `approval_logs_action_idx`(`action` ASC) USING BTREE,
  INDEX `approval_logs_created_at_idx`(`created_at` ASC) USING BTREE,
  CONSTRAINT `approval_logs_approver_id_fkey` FOREIGN KEY (`approver_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `approval_logs_request_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 16 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for asset_assignments
-- ----------------------------
DROP TABLE IF EXISTS `asset_assignments`;
CREATE TABLE `asset_assignments`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `assigned_to` int NOT NULL,
  `assigned_by` int NOT NULL,
  `assignment_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CHECKOUT',
  `assignment_date` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expected_return_date` date NULL DEFAULT NULL,
  `actual_return_date` datetime(3) NULL DEFAULT NULL,
  `return_condition` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `return_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `returned_to` int NULL DEFAULT NULL,
  `purpose` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `location_id` int NULL DEFAULT NULL,
  `signature_confirmed` tinyint(1) NOT NULL DEFAULT 0,
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `asset_assignments_asset_idx`(`asset_id` ASC) USING BTREE,
  INDEX `asset_assignments_user_idx`(`assigned_to` ASC) USING BTREE,
  INDEX `asset_assignments_status_idx`(`status` ASC) USING BTREE,
  INDEX `asset_assignments_date_idx`(`assignment_date` ASC) USING BTREE,
  INDEX `fk_assignment_by`(`assigned_by` ASC) USING BTREE,
  INDEX `fk_assignment_returned_to`(`returned_to` ASC) USING BTREE,
  INDEX `fk_assignment_location`(`location_id` ASC) USING BTREE,
  CONSTRAINT `fk_assignment_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_assignment_by` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_assignment_location` FOREIGN KEY (`location_id`) REFERENCES `asset_locations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_assignment_returned_to` FOREIGN KEY (`returned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_assignment_user` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for asset_audit_log
-- ----------------------------
DROP TABLE IF EXISTS `asset_audit_log`;
CREATE TABLE `asset_audit_log`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `action` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `field_changed` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `old_value` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `new_value` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `performed_by` int NOT NULL,
  `ip_address` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `user_agent` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `asset_audit_asset_idx`(`asset_id` ASC) USING BTREE,
  INDEX `asset_audit_action_idx`(`action` ASC) USING BTREE,
  INDEX `asset_audit_date_idx`(`created_at` ASC) USING BTREE,
  INDEX `fk_audit_user`(`performed_by` ASC) USING BTREE,
  CONSTRAINT `fk_audit_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_audit_user` FOREIGN KEY (`performed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 2 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for asset_categories
-- ----------------------------
DROP TABLE IF EXISTS `asset_categories`;
CREATE TABLE `asset_categories`  (
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
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `asset_categories_code_key`(`category_code` ASC) USING BTREE,
  INDEX `asset_categories_parent_idx`(`parent_id` ASC) USING BTREE,
  CONSTRAINT `fk_asset_cat_parent` FOREIGN KEY (`parent_id`) REFERENCES `asset_categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 11 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for asset_depreciation_log
-- ----------------------------
DROP TABLE IF EXISTS `asset_depreciation_log`;
CREATE TABLE `asset_depreciation_log`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `period_date` date NOT NULL,
  `depreciation_amount` decimal(15, 2) NOT NULL,
  `accumulated_depreciation` decimal(15, 2) NOT NULL,
  `book_value` decimal(15, 2) NOT NULL,
  `method` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'STRAIGHT_LINE',
  `posted_by` int NULL DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `asset_depreciation_unique`(`asset_id` ASC, `period_date` ASC) USING BTREE,
  INDEX `asset_depreciation_asset_idx`(`asset_id` ASC) USING BTREE,
  INDEX `asset_depreciation_period_idx`(`period_date` ASC) USING BTREE,
  INDEX `fk_depreciation_posted`(`posted_by` ASC) USING BTREE,
  CONSTRAINT `fk_depreciation_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_depreciation_posted` FOREIGN KEY (`posted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for asset_disposals
-- ----------------------------
DROP TABLE IF EXISTS `asset_disposals`;
CREATE TABLE `asset_disposals`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `disposal_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `disposal_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'WRITE_OFF',
  `disposal_reason` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `disposal_description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `disposal_date` date NOT NULL,
  `book_value_at_disposal` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `sale_value` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `gain_loss` decimal(15, 2) GENERATED ALWAYS AS ((`sale_value` - `book_value_at_disposal`)) STORED NULL,
  `buyer_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `buyer_contact` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `requested_by` int NOT NULL,
  `approved_by` int NULL DEFAULT NULL,
  `approved_at` datetime(3) NULL DEFAULT NULL,
  `approval_comments` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `certificate_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `asset_disposals_code_key`(`disposal_code` ASC) USING BTREE,
  INDEX `asset_disposals_asset_idx`(`asset_id` ASC) USING BTREE,
  INDEX `asset_disposals_status_idx`(`status` ASC) USING BTREE,
  INDEX `asset_disposals_date_idx`(`disposal_date` ASC) USING BTREE,
  INDEX `asset_disposals_type_idx`(`disposal_type` ASC) USING BTREE,
  INDEX `fk_disposal_requested`(`requested_by` ASC) USING BTREE,
  INDEX `fk_disposal_approved`(`approved_by` ASC) USING BTREE,
  CONSTRAINT `fk_disposal_approved` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_disposal_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_disposal_requested` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for asset_incidents
-- ----------------------------
DROP TABLE IF EXISTS `asset_incidents`;
CREATE TABLE `asset_incidents`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `incident_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `incident_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `incident_date` datetime(3) NOT NULL,
  `location` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `responsible_person_id` int NULL DEFAULT NULL,
  `severity` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MEDIUM',
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OPEN',
  `investigation_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `police_report_ref` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `insurance_claim_ref` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `estimated_loss` decimal(15, 2) NULL DEFAULT 0.00,
  `recovery_amount` decimal(15, 2) NULL DEFAULT 0.00,
  `resolution` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `resolved_date` datetime(3) NULL DEFAULT NULL,
  `reported_by` int NOT NULL,
  `investigated_by` int NULL DEFAULT NULL,
  `approved_for_writeoff` tinyint(1) NOT NULL DEFAULT 0,
  `writeoff_approved_by` int NULL DEFAULT NULL,
  `writeoff_date` datetime(3) NULL DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `asset_incidents_code_key`(`incident_code` ASC) USING BTREE,
  INDEX `asset_incidents_asset_idx`(`asset_id` ASC) USING BTREE,
  INDEX `asset_incidents_type_idx`(`incident_type` ASC) USING BTREE,
  INDEX `asset_incidents_status_idx`(`status` ASC) USING BTREE,
  INDEX `asset_incidents_date_idx`(`incident_date` ASC) USING BTREE,
  INDEX `fk_incident_responsible`(`responsible_person_id` ASC) USING BTREE,
  INDEX `fk_incident_reported`(`reported_by` ASC) USING BTREE,
  INDEX `fk_incident_investigated`(`investigated_by` ASC) USING BTREE,
  INDEX `fk_incident_writeoff_by`(`writeoff_approved_by` ASC) USING BTREE,
  CONSTRAINT `fk_incident_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_incident_investigated` FOREIGN KEY (`investigated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_incident_reported` FOREIGN KEY (`reported_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_incident_responsible` FOREIGN KEY (`responsible_person_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_incident_writeoff_by` FOREIGN KEY (`writeoff_approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for asset_locations
-- ----------------------------
DROP TABLE IF EXISTS `asset_locations`;
CREATE TABLE `asset_locations`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `location_name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OFFICE',
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `city` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `province` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `country` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Zimbabwe',
  `parent_location_id` int NULL DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `asset_locations_code_key`(`location_code` ASC) USING BTREE,
  INDEX `asset_locations_type_idx`(`location_type` ASC) USING BTREE,
  INDEX `asset_locations_parent_idx`(`parent_location_id` ASC) USING BTREE,
  CONSTRAINT `fk_location_parent` FOREIGN KEY (`parent_location_id`) REFERENCES `asset_locations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 5 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for asset_maintenance
-- ----------------------------
DROP TABLE IF EXISTS `asset_maintenance`;
CREATE TABLE `asset_maintenance`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `maintenance_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `maintenance_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PREVENTIVE',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `priority` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MEDIUM',
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SCHEDULED',
  `scheduled_date` date NULL DEFAULT NULL,
  `start_date` datetime(3) NULL DEFAULT NULL,
  `completion_date` datetime(3) NULL DEFAULT NULL,
  `cost` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `currency_code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `vendor_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `invoice_ref` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `downtime_hours` decimal(10, 2) NULL DEFAULT 0.00,
  `parts_replaced` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `findings` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `next_service_date` date NULL DEFAULT NULL,
  `next_service_mileage` int NULL DEFAULT NULL,
  `reported_by` int NOT NULL,
  `performed_by` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `approved_by` int NULL DEFAULT NULL,
  `budget_line_id` int NULL DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `asset_maintenance_code_key`(`maintenance_code` ASC) USING BTREE,
  INDEX `asset_maintenance_asset_idx`(`asset_id` ASC) USING BTREE,
  INDEX `asset_maintenance_status_idx`(`status` ASC) USING BTREE,
  INDEX `asset_maintenance_type_idx`(`maintenance_type` ASC) USING BTREE,
  INDEX `asset_maintenance_scheduled_idx`(`scheduled_date` ASC) USING BTREE,
  INDEX `fk_maintenance_reported`(`reported_by` ASC) USING BTREE,
  INDEX `fk_maintenance_approved`(`approved_by` ASC) USING BTREE,
  INDEX `fk_maintenance_budget`(`budget_line_id` ASC) USING BTREE,
  CONSTRAINT `fk_maintenance_approved` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_maintenance_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_maintenance_budget` FOREIGN KEY (`budget_line_id`) REFERENCES `budget_lines` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_maintenance_reported` FOREIGN KEY (`reported_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for asset_status_history
-- ----------------------------
DROP TABLE IF EXISTS `asset_status_history`;
CREATE TABLE `asset_status_history`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `previous_status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `new_status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `change_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `changed_by` int NOT NULL,
  `ip_address` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `asset_status_history_asset_idx`(`asset_id` ASC) USING BTREE,
  INDEX `asset_status_history_date_idx`(`created_at` ASC) USING BTREE,
  INDEX `fk_asset_status_user`(`changed_by` ASC) USING BTREE,
  CONSTRAINT `fk_asset_status_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_asset_status_user` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 2 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for asset_suppliers
-- ----------------------------
DROP TABLE IF EXISTS `asset_suppliers`;
CREATE TABLE `asset_suppliers`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `supplier_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `supplier_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact_person` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `phone` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `tax_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `asset_suppliers_code_key`(`supplier_code` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for asset_transfers
-- ----------------------------
DROP TABLE IF EXISTS `asset_transfers`;
CREATE TABLE `asset_transfers`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` int NOT NULL,
  `transfer_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `from_location_id` int NULL DEFAULT NULL,
  `to_location_id` int NULL DEFAULT NULL,
  `from_department_id` int NULL DEFAULT NULL,
  `to_department_id` int NULL DEFAULT NULL,
  `from_custodian_id` int NULL DEFAULT NULL,
  `to_custodian_id` int NULL DEFAULT NULL,
  `transfer_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `transfer_date` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `approved_by` int NULL DEFAULT NULL,
  `approved_at` datetime(3) NULL DEFAULT NULL,
  `received_by` int NULL DEFAULT NULL,
  `received_at` datetime(3) NULL DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `initiated_by` int NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `asset_transfers_code_key`(`transfer_code` ASC) USING BTREE,
  INDEX `asset_transfers_asset_idx`(`asset_id` ASC) USING BTREE,
  INDEX `asset_transfers_status_idx`(`status` ASC) USING BTREE,
  INDEX `asset_transfers_date_idx`(`transfer_date` ASC) USING BTREE,
  INDEX `fk_transfer_from_loc`(`from_location_id` ASC) USING BTREE,
  INDEX `fk_transfer_to_loc`(`to_location_id` ASC) USING BTREE,
  INDEX `fk_transfer_from_dept`(`from_department_id` ASC) USING BTREE,
  INDEX `fk_transfer_to_dept`(`to_department_id` ASC) USING BTREE,
  INDEX `fk_transfer_initiated`(`initiated_by` ASC) USING BTREE,
  INDEX `fk_transfer_approved`(`approved_by` ASC) USING BTREE,
  INDEX `fk_transfer_received`(`received_by` ASC) USING BTREE,
  CONSTRAINT `fk_transfer_approved` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_transfer_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_transfer_from_dept` FOREIGN KEY (`from_department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_transfer_from_loc` FOREIGN KEY (`from_location_id`) REFERENCES `asset_locations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_transfer_initiated` FOREIGN KEY (`initiated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_transfer_received` FOREIGN KEY (`received_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_transfer_to_dept` FOREIGN KEY (`to_department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_transfer_to_loc` FOREIGN KEY (`to_location_id`) REFERENCES `asset_locations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for assets
-- ----------------------------
DROP TABLE IF EXISTS `assets`;
CREATE TABLE `assets`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_tag` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `asset_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `category_id` int NOT NULL,
  `serial_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `model` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `manufacturer` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `donor_id` int NULL DEFAULT NULL,
  `project_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `purchase_date` date NOT NULL,
  `purchase_cost` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `currency_code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `supplier_id` int NULL DEFAULT NULL,
  `purchase_order_ref` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `invoice_ref` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `useful_life_years` int NOT NULL DEFAULT 3,
  `salvage_value` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `depreciation_method` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'STRAIGHT_LINE',
  `accumulated_depreciation` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `current_value` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `warranty_start_date` date NULL DEFAULT NULL,
  `warranty_end_date` date NULL DEFAULT NULL,
  `warranty_provider` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `warranty_terms` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `location_id` int NULL DEFAULT NULL,
  `custodian_id` int NULL DEFAULT NULL,
  `department_id` int NULL DEFAULT NULL,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'IN_USE',
  `condition_rating` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'GOOD',
  `last_inspection_date` date NULL DEFAULT NULL,
  `next_inspection_date` date NULL DEFAULT NULL,
  `insurance_policy_no` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `insurance_expiry` date NULL DEFAULT NULL,
  `insured_value` decimal(15, 2) NULL DEFAULT 0.00,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `barcode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `photo_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `created_by` int NULL DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `assets_tag_key`(`asset_tag` ASC) USING BTREE,
  INDEX `assets_category_idx`(`category_id` ASC) USING BTREE,
  INDEX `assets_donor_idx`(`donor_id` ASC) USING BTREE,
  INDEX `assets_supplier_idx`(`supplier_id` ASC) USING BTREE,
  INDEX `assets_location_idx`(`location_id` ASC) USING BTREE,
  INDEX `assets_custodian_idx`(`custodian_id` ASC) USING BTREE,
  INDEX `assets_department_idx`(`department_id` ASC) USING BTREE,
  INDEX `assets_status_idx`(`status` ASC) USING BTREE,
  INDEX `assets_condition_idx`(`condition_rating` ASC) USING BTREE,
  INDEX `assets_purchase_date_idx`(`purchase_date` ASC) USING BTREE,
  INDEX `assets_serial_idx`(`serial_number` ASC) USING BTREE,
  INDEX `assets_barcode_idx`(`barcode` ASC) USING BTREE,
  INDEX `fk_asset_created_by`(`created_by` ASC) USING BTREE,
  CONSTRAINT `fk_asset_category` FOREIGN KEY (`category_id`) REFERENCES `asset_categories` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_asset_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_asset_custodian` FOREIGN KEY (`custodian_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_asset_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_asset_donor` FOREIGN KEY (`donor_id`) REFERENCES `donors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_asset_location` FOREIGN KEY (`location_id`) REFERENCES `asset_locations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_asset_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `asset_suppliers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 2 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for attachments
-- ----------------------------
DROP TABLE IF EXISTS `attachments`;
CREATE TABLE `attachments`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `file_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` int NOT NULL,
  `attachment_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` int NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `uploaded_by` int NOT NULL,
  `uploaded_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `attachments_entity_type_entity_id_idx`(`entity_type` ASC, `entity_id` ASC) USING BTREE,
  INDEX `attachments_attachment_type_idx`(`attachment_type` ASC) USING BTREE,
  INDEX `attachments_uploaded_by_idx`(`uploaded_by` ASC) USING BTREE,
  INDEX `attachments_uploaded_at_idx`(`uploaded_at` ASC) USING BTREE,
  CONSTRAINT `attachments_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 6 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for budget_lines
-- ----------------------------
DROP TABLE IF EXISTS `budget_lines`;
CREATE TABLE `budget_lines`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `budget_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `budget_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `donor_id` int NOT NULL,
  `department_id` int NULL DEFAULT NULL,
  `category` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `fiscal_year` int NOT NULL,
  `allocated_amount` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `spent_amount` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `restrictions` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  `created_by` int NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `budget_lines_budget_code_key`(`budget_code` ASC) USING BTREE,
  INDEX `budget_lines_donor_id_idx`(`donor_id` ASC) USING BTREE,
  INDEX `budget_lines_department_id_idx`(`department_id` ASC) USING BTREE,
  INDEX `budget_lines_fiscal_year_idx`(`fiscal_year` ASC) USING BTREE,
  INDEX `budget_lines_is_active_idx`(`is_active` ASC) USING BTREE,
  INDEX `budget_lines_budget_code_idx`(`budget_code` ASC) USING BTREE,
  INDEX `budget_lines_created_by_fkey`(`created_by` ASC) USING BTREE,
  CONSTRAINT `budget_lines_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `budget_lines_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `budget_lines_donor_id_fkey` FOREIGN KEY (`donor_id`) REFERENCES `donors` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 17 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for budget_transactions
-- ----------------------------
DROP TABLE IF EXISTS `budget_transactions`;
CREATE TABLE `budget_transactions`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `budget_line_id` int NOT NULL,
  `request_id` int NULL DEFAULT NULL,
  `transaction_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(15, 2) NOT NULL,
  `balance_before` decimal(15, 2) NOT NULL,
  `balance_after` decimal(15, 2) NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `performed_by` int NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `budget_transactions_budget_line_id_idx`(`budget_line_id` ASC) USING BTREE,
  INDEX `budget_transactions_request_id_idx`(`request_id` ASC) USING BTREE,
  INDEX `budget_transactions_created_at_idx`(`created_at` ASC) USING BTREE,
  INDEX `budget_transactions_performed_by_fkey`(`performed_by` ASC) USING BTREE,
  CONSTRAINT `budget_transactions_budget_line_id_fkey` FOREIGN KEY (`budget_line_id`) REFERENCES `budget_lines` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `budget_transactions_performed_by_fkey` FOREIGN KEY (`performed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `budget_transactions_request_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `requests` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 6 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for departments
-- ----------------------------
DROP TABLE IF EXISTS `departments`;
CREATE TABLE `departments`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `department_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `department_code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `departments_department_name_key`(`department_name` ASC) USING BTREE,
  UNIQUE INDEX `departments_department_code_key`(`department_code` ASC) USING BTREE,
  INDEX `departments_department_code_idx`(`department_code` ASC) USING BTREE,
  INDEX `departments_is_active_idx`(`is_active` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 7 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for donors
-- ----------------------------
DROP TABLE IF EXISTS `donors`;
CREATE TABLE `donors`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `donor_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `donor_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `donor_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact_person` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `phone` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `country` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `total_committed` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `total_allocated` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `total_spent` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `currency_code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `fiscal_year` int NOT NULL,
  `agreement_reference` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `agreement_start_date` datetime(3) NULL DEFAULT NULL,
  `agreement_end_date` datetime(3) NULL DEFAULT NULL,
  `restrictions` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  `created_by` int NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `donors_donor_code_key`(`donor_code` ASC) USING BTREE,
  INDEX `donors_donor_code_idx`(`donor_code` ASC) USING BTREE,
  INDEX `donors_fiscal_year_idx`(`fiscal_year` ASC) USING BTREE,
  INDEX `donors_is_active_idx`(`is_active` ASC) USING BTREE,
  INDEX `donors_created_by_idx`(`created_by` ASC) USING BTREE,
  CONSTRAINT `donors_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 6 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for hr_contracts
-- ----------------------------
DROP TABLE IF EXISTS `hr_contracts`;
CREATE TABLE `hr_contracts`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `contract_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `contract_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'FIXED_TERM',
  `position_title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `department_id` int NULL DEFAULT NULL,
  `start_date` date NOT NULL,
  `end_date` date NULL DEFAULT NULL,
  `probation_months` int NULL DEFAULT 3,
  `basic_salary` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `currency_code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `salary_grade_id` int NULL DEFAULT NULL,
  `donor_id` int NULL DEFAULT NULL,
  `project_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `budget_line_id` int NULL DEFAULT NULL,
  `cost_allocation_json` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `transport_allowance` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `housing_allowance` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `field_allowance` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `other_allowances` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `allowances_description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `renewal_date` date NULL DEFAULT NULL,
  `renewal_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `termination_date` date NULL DEFAULT NULL,
  `termination_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `signed_date` date NULL DEFAULT NULL,
  `signed_by_employee` tinyint(1) NOT NULL DEFAULT 0,
  `signed_by_employer` tinyint(1) NOT NULL DEFAULT 0,
  `document_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_by` int NULL DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `hr_contracts_number_key`(`contract_number` ASC) USING BTREE,
  INDEX `hr_contracts_employee_idx`(`employee_id` ASC) USING BTREE,
  INDEX `hr_contracts_status_idx`(`status` ASC) USING BTREE,
  INDEX `hr_contracts_end_date_idx`(`end_date` ASC) USING BTREE,
  INDEX `hr_contracts_donor_idx`(`donor_id` ASC) USING BTREE,
  INDEX `fk_contract_dept`(`department_id` ASC) USING BTREE,
  INDEX `fk_contract_grade`(`salary_grade_id` ASC) USING BTREE,
  INDEX `fk_contract_budget`(`budget_line_id` ASC) USING BTREE,
  INDEX `fk_contract_created`(`created_by` ASC) USING BTREE,
  CONSTRAINT `fk_contract_budget` FOREIGN KEY (`budget_line_id`) REFERENCES `budget_lines` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_contract_created` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_contract_dept` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_contract_donor` FOREIGN KEY (`donor_id`) REFERENCES `donors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_contract_employee` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_contract_grade` FOREIGN KEY (`salary_grade_id`) REFERENCES `hr_salary_grades` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for hr_disciplinary_records
-- ----------------------------
DROP TABLE IF EXISTS `hr_disciplinary_records`;
CREATE TABLE `hr_disciplinary_records`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `incident_date` date NOT NULL,
  `incident_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'WARNING',
  `severity` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MINOR',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `action_taken` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `warning_level` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `investigation_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `outcome` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `follow_up_date` date NULL DEFAULT NULL,
  `follow_up_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `reported_by` int NOT NULL,
  `investigated_by` int NULL DEFAULT NULL,
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OPEN',
  `document_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `hr_disciplinary_employee_idx`(`employee_id` ASC) USING BTREE,
  INDEX `hr_disciplinary_status_idx`(`status` ASC) USING BTREE,
  INDEX `hr_disciplinary_type_idx`(`incident_type` ASC) USING BTREE,
  INDEX `fk_disciplinary_reported`(`reported_by` ASC) USING BTREE,
  INDEX `fk_disciplinary_investigated`(`investigated_by` ASC) USING BTREE,
  CONSTRAINT `fk_disciplinary_employee` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_disciplinary_investigated` FOREIGN KEY (`investigated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_disciplinary_reported` FOREIGN KEY (`reported_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for hr_documents
-- ----------------------------
DROP TABLE IF EXISTS `hr_documents`;
CREATE TABLE `hr_documents`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `document_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `document_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` int NULL DEFAULT 0,
  `expiry_date` date NULL DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `uploaded_by` int NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `hr_documents_employee_idx`(`employee_id` ASC) USING BTREE,
  INDEX `hr_documents_type_idx`(`document_type` ASC) USING BTREE,
  INDEX `fk_hr_doc_uploaded`(`uploaded_by` ASC) USING BTREE,
  CONSTRAINT `fk_hr_doc_employee` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_hr_doc_uploaded` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for hr_employees
-- ----------------------------
DROP TABLE IF EXISTS `hr_employees`;
CREATE TABLE `hr_employees`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NULL DEFAULT NULL,
  `employee_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `first_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `middle_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `date_of_birth` date NULL DEFAULT NULL,
  `gender` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `marital_status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `nationality` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'Zimbabwean',
  `personal_email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `work_email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `phone_primary` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `phone_secondary` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `city` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `province` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `national_id` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `passport_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `passport_expiry` date NULL DEFAULT NULL,
  `tax_id` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `nssa_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `nok_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `nok_relationship` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `nok_phone` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `nok_email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `nok_address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `bank_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `bank_branch` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `bank_account_number` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `bank_account_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `bank_currency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `department_id` int NULL DEFAULT NULL,
  `position_title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `salary_grade_id` int NULL DEFAULT NULL,
  `supervisor_id` int NULL DEFAULT NULL,
  `duty_station` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `work_location` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OFFICE',
  `primary_donor_id` int NULL DEFAULT NULL,
  `project_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `cost_allocation_json` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `hazard_category` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `employment_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'FULL_TIME',
  `employment_status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `hire_date` date NULL DEFAULT NULL,
  `probation_end_date` date NULL DEFAULT NULL,
  `confirmation_date` date NULL DEFAULT NULL,
  `termination_date` date NULL DEFAULT NULL,
  `termination_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `photo_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_by` int NULL DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `hr_employees_number_key`(`employee_number` ASC) USING BTREE,
  INDEX `hr_employees_user_idx`(`user_id` ASC) USING BTREE,
  INDEX `hr_employees_dept_idx`(`department_id` ASC) USING BTREE,
  INDEX `hr_employees_supervisor_idx`(`supervisor_id` ASC) USING BTREE,
  INDEX `hr_employees_status_idx`(`employment_status` ASC) USING BTREE,
  INDEX `hr_employees_type_idx`(`employment_type` ASC) USING BTREE,
  INDEX `hr_employees_donor_idx`(`primary_donor_id` ASC) USING BTREE,
  INDEX `fk_hr_emp_grade`(`salary_grade_id` ASC) USING BTREE,
  INDEX `fk_hr_emp_created`(`created_by` ASC) USING BTREE,
  CONSTRAINT `fk_hr_emp_created` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_hr_emp_dept` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_hr_emp_donor` FOREIGN KEY (`primary_donor_id`) REFERENCES `donors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_hr_emp_grade` FOREIGN KEY (`salary_grade_id`) REFERENCES `hr_salary_grades` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_hr_emp_supervisor` FOREIGN KEY (`supervisor_id`) REFERENCES `hr_employees` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_hr_emp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for hr_exit_clearance
-- ----------------------------
DROP TABLE IF EXISTS `hr_exit_clearance`;
CREATE TABLE `hr_exit_clearance`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `exit_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'RESIGNATION',
  `exit_date` date NOT NULL,
  `notice_date` date NULL DEFAULT NULL,
  `last_working_date` date NULL DEFAULT NULL,
  `reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `it_cleared` tinyint(1) NOT NULL DEFAULT 0,
  `it_cleared_by` int NULL DEFAULT NULL,
  `it_cleared_at` datetime(3) NULL DEFAULT NULL,
  `finance_cleared` tinyint(1) NOT NULL DEFAULT 0,
  `finance_cleared_by` int NULL DEFAULT NULL,
  `finance_cleared_at` datetime(3) NULL DEFAULT NULL,
  `hr_cleared` tinyint(1) NOT NULL DEFAULT 0,
  `hr_cleared_by` int NULL DEFAULT NULL,
  `hr_cleared_at` datetime(3) NULL DEFAULT NULL,
  `assets_returned` tinyint(1) NOT NULL DEFAULT 0,
  `assets_cleared_by` int NULL DEFAULT NULL,
  `assets_cleared_at` datetime(3) NULL DEFAULT NULL,
  `admin_cleared` tinyint(1) NOT NULL DEFAULT 0,
  `admin_cleared_by` int NULL DEFAULT NULL,
  `admin_cleared_at` datetime(3) NULL DEFAULT NULL,
  `outstanding_leave_days` decimal(5, 1) NOT NULL DEFAULT 0.0,
  `leave_payment` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `outstanding_advances` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `final_salary` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `gratuity` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `total_final_payment` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `exit_interview_conducted` tinyint(1) NOT NULL DEFAULT 0,
  `exit_interview_date` date NULL DEFAULT NULL,
  `exit_interview_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'INITIATED',
  `completed_at` datetime(3) NULL DEFAULT NULL,
  `processed_by` int NULL DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `hr_exit_employee_idx`(`employee_id` ASC) USING BTREE,
  INDEX `hr_exit_status_idx`(`status` ASC) USING BTREE,
  INDEX `hr_exit_date_idx`(`exit_date` ASC) USING BTREE,
  INDEX `fk_exit_processed`(`processed_by` ASC) USING BTREE,
  CONSTRAINT `fk_exit_employee` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_exit_processed` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for hr_leave_balances
-- ----------------------------
DROP TABLE IF EXISTS `hr_leave_balances`;
CREATE TABLE `hr_leave_balances`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `leave_type_id` int NOT NULL,
  `fiscal_year` int NOT NULL,
  `entitlement` decimal(5, 1) NOT NULL DEFAULT 0.0,
  `carried_forward` decimal(5, 1) NOT NULL DEFAULT 0.0,
  `taken` decimal(5, 1) NOT NULL DEFAULT 0.0,
  `pending` decimal(5, 1) NOT NULL DEFAULT 0.0,
  `balance` decimal(5, 1) GENERATED ALWAYS AS ((((`entitlement` + `carried_forward`) - `taken`) - `pending`)) STORED NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `hr_leave_bal_unique`(`employee_id` ASC, `leave_type_id` ASC, `fiscal_year` ASC) USING BTREE,
  INDEX `hr_leave_bal_employee_idx`(`employee_id` ASC) USING BTREE,
  INDEX `hr_leave_bal_type_idx`(`leave_type_id` ASC) USING BTREE,
  CONSTRAINT `fk_leave_bal_employee` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_leave_bal_type` FOREIGN KEY (`leave_type_id`) REFERENCES `hr_leave_types` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for hr_leave_requests
-- ----------------------------
DROP TABLE IF EXISTS `hr_leave_requests`;
CREATE TABLE `hr_leave_requests`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `leave_type_id` int NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `days_requested` decimal(5, 1) NOT NULL,
  `reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `approved_by` int NULL DEFAULT NULL,
  `approved_at` datetime(3) NULL DEFAULT NULL,
  `rejection_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `handover_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `covering_employee_id` int NULL DEFAULT NULL,
  `document_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `hr_leave_req_employee_idx`(`employee_id` ASC) USING BTREE,
  INDEX `hr_leave_req_type_idx`(`leave_type_id` ASC) USING BTREE,
  INDEX `hr_leave_req_status_idx`(`status` ASC) USING BTREE,
  INDEX `hr_leave_req_dates_idx`(`start_date` ASC, `end_date` ASC) USING BTREE,
  INDEX `fk_leave_req_approved`(`approved_by` ASC) USING BTREE,
  INDEX `fk_leave_req_cover`(`covering_employee_id` ASC) USING BTREE,
  CONSTRAINT `fk_leave_req_approved` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_leave_req_cover` FOREIGN KEY (`covering_employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_leave_req_employee` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_leave_req_type` FOREIGN KEY (`leave_type_id`) REFERENCES `hr_leave_types` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for hr_leave_types
-- ----------------------------
DROP TABLE IF EXISTS `hr_leave_types`;
CREATE TABLE `hr_leave_types`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `leave_code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `leave_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `default_days_per_year` decimal(5, 1) NOT NULL DEFAULT 0.0,
  `is_paid` tinyint(1) NOT NULL DEFAULT 1,
  `requires_documentation` tinyint(1) NOT NULL DEFAULT 0,
  `max_carry_forward` decimal(5, 1) NOT NULL DEFAULT 0.0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `hr_leave_types_code_key`(`leave_code` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 9 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for hr_payroll_periods
-- ----------------------------
DROP TABLE IF EXISTS `hr_payroll_periods`;
CREATE TABLE `hr_payroll_periods`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `period_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `period_month` int NOT NULL,
  `period_year` int NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OPEN',
  `processed_by` int NULL DEFAULT NULL,
  `processed_at` datetime(3) NULL DEFAULT NULL,
  `approved_by` int NULL DEFAULT NULL,
  `approved_at` datetime(3) NULL DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `hr_payroll_period_unique`(`period_month` ASC, `period_year` ASC) USING BTREE,
  INDEX `hr_payroll_period_status_idx`(`status` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for hr_payroll_records
-- ----------------------------
DROP TABLE IF EXISTS `hr_payroll_records`;
CREATE TABLE `hr_payroll_records`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `payroll_period_id` int NOT NULL,
  `employee_id` int NOT NULL,
  `contract_id` int NULL DEFAULT NULL,
  `basic_salary` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `transport_allowance` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `housing_allowance` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `field_allowance` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `overtime_pay` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `other_allowances` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `gross_pay` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `tax_paye` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `nssa_employee` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `nssa_employer` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `pension_employee` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `pension_employer` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `medical_aid` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `loan_deduction` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `advance_recovery` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `other_deductions` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `total_deductions` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `net_pay` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `currency_code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `cost_allocation_json` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT',
  `payment_date` date NULL DEFAULT NULL,
  `payment_reference` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `hr_payroll_record_unique`(`payroll_period_id` ASC, `employee_id` ASC) USING BTREE,
  INDEX `hr_payroll_record_employee_idx`(`employee_id` ASC) USING BTREE,
  INDEX `hr_payroll_record_status_idx`(`status` ASC) USING BTREE,
  INDEX `fk_payroll_contract`(`contract_id` ASC) USING BTREE,
  CONSTRAINT `fk_payroll_contract` FOREIGN KEY (`contract_id`) REFERENCES `hr_contracts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_payroll_employee` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_payroll_period` FOREIGN KEY (`payroll_period_id`) REFERENCES `hr_payroll_periods` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for hr_performance_reviews
-- ----------------------------
DROP TABLE IF EXISTS `hr_performance_reviews`;
CREATE TABLE `hr_performance_reviews`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `review_period` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `review_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ANNUAL',
  `reviewer_id` int NOT NULL,
  `review_date` date NOT NULL,
  `job_knowledge_score` decimal(3, 1) NULL DEFAULT NULL,
  `quality_of_work_score` decimal(3, 1) NULL DEFAULT NULL,
  `productivity_score` decimal(3, 1) NULL DEFAULT NULL,
  `communication_score` decimal(3, 1) NULL DEFAULT NULL,
  `teamwork_score` decimal(3, 1) NULL DEFAULT NULL,
  `initiative_score` decimal(3, 1) NULL DEFAULT NULL,
  `attendance_score` decimal(3, 1) NULL DEFAULT NULL,
  `overall_score` decimal(3, 1) NULL DEFAULT NULL,
  `overall_rating` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `goals_json` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `achievements` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `areas_for_improvement` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `training_recommendations` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `employee_comments` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `reviewer_comments` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT',
  `employee_acknowledged` tinyint(1) NOT NULL DEFAULT 0,
  `acknowledged_at` datetime(3) NULL DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `hr_perf_review_employee_idx`(`employee_id` ASC) USING BTREE,
  INDEX `hr_perf_review_reviewer_idx`(`reviewer_id` ASC) USING BTREE,
  INDEX `hr_perf_review_status_idx`(`status` ASC) USING BTREE,
  INDEX `hr_perf_review_period_idx`(`review_period` ASC) USING BTREE,
  CONSTRAINT `fk_perf_review_employee` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_perf_review_reviewer` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for hr_salary_grades
-- ----------------------------
DROP TABLE IF EXISTS `hr_salary_grades`;
CREATE TABLE `hr_salary_grades`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `grade_code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `grade_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `min_salary` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `max_salary` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `currency_code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `hr_salary_grades_code_key`(`grade_code` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 10 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for hr_timesheet_entries
-- ----------------------------
DROP TABLE IF EXISTS `hr_timesheet_entries`;
CREATE TABLE `hr_timesheet_entries`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `timesheet_id` int NOT NULL,
  `entry_date` date NOT NULL,
  `donor_id` int NULL DEFAULT NULL,
  `project_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `activity_description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `hours` decimal(5, 2) NOT NULL DEFAULT 0.00,
  `is_overtime` tinyint(1) NOT NULL DEFAULT 0,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `hr_ts_entry_timesheet_idx`(`timesheet_id` ASC) USING BTREE,
  INDEX `hr_ts_entry_date_idx`(`entry_date` ASC) USING BTREE,
  INDEX `hr_ts_entry_donor_idx`(`donor_id` ASC) USING BTREE,
  CONSTRAINT `fk_ts_entry_donor` FOREIGN KEY (`donor_id`) REFERENCES `donors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ts_entry_timesheet` FOREIGN KEY (`timesheet_id`) REFERENCES `hr_timesheets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for hr_timesheets
-- ----------------------------
DROP TABLE IF EXISTS `hr_timesheets`;
CREATE TABLE `hr_timesheets`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `period_month` int NOT NULL,
  `period_year` int NOT NULL,
  `total_hours` decimal(10, 2) NOT NULL DEFAULT 0.00,
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT',
  `submitted_at` datetime(3) NULL DEFAULT NULL,
  `supervisor_approved_by` int NULL DEFAULT NULL,
  `supervisor_approved_at` datetime(3) NULL DEFAULT NULL,
  `hr_approved_by` int NULL DEFAULT NULL,
  `hr_approved_at` datetime(3) NULL DEFAULT NULL,
  `finance_approved_by` int NULL DEFAULT NULL,
  `finance_approved_at` datetime(3) NULL DEFAULT NULL,
  `rejection_reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `hr_timesheets_unique`(`employee_id` ASC, `period_month` ASC, `period_year` ASC) USING BTREE,
  INDEX `hr_timesheets_status_idx`(`status` ASC) USING BTREE,
  INDEX `hr_timesheets_period_idx`(`period_year` ASC, `period_month` ASC) USING BTREE,
  INDEX `fk_timesheet_supervisor`(`supervisor_approved_by` ASC) USING BTREE,
  INDEX `fk_timesheet_hr`(`hr_approved_by` ASC) USING BTREE,
  INDEX `fk_timesheet_finance`(`finance_approved_by` ASC) USING BTREE,
  CONSTRAINT `fk_timesheet_employee` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_timesheet_finance` FOREIGN KEY (`finance_approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_timesheet_hr` FOREIGN KEY (`hr_approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_timesheet_supervisor` FOREIGN KEY (`supervisor_approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for hr_training_records
-- ----------------------------
DROP TABLE IF EXISTS `hr_training_records`;
CREATE TABLE `hr_training_records`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `training_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `training_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EXTERNAL',
  `provider` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `start_date` date NOT NULL,
  `end_date` date NULL DEFAULT NULL,
  `duration_hours` decimal(10, 2) NULL DEFAULT NULL,
  `cost` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `currency_code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `donor_id` int NULL DEFAULT NULL,
  `certification_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `certification_expiry` date NULL DEFAULT NULL,
  `certificate_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PLANNED',
  `approved_by` int NULL DEFAULT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `hr_training_employee_idx`(`employee_id` ASC) USING BTREE,
  INDEX `hr_training_status_idx`(`status` ASC) USING BTREE,
  INDEX `hr_training_donor_idx`(`donor_id` ASC) USING BTREE,
  INDEX `fk_training_approved`(`approved_by` ASC) USING BTREE,
  CONSTRAINT `fk_training_approved` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_training_donor` FOREIGN KEY (`donor_id`) REFERENCES `donors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_training_employee` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

-- ----------------------------
-- Table structure for reconciliation_items
-- ----------------------------
DROP TABLE IF EXISTS `reconciliation_items`;
CREATE TABLE `reconciliation_items`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `reconciliation_id` int NOT NULL,
  `request_item_id` int NULL DEFAULT NULL,
  `description` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `budgeted_amount` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `actual_amount` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `variance` decimal(15, 2) GENERATED ALWAYS AS ((`budgeted_amount` - `actual_amount`)) STORED NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_recon_item_recon`(`reconciliation_id` ASC) USING BTREE,
  INDEX `fk_recon_item_req_item`(`request_item_id` ASC) USING BTREE,
  CONSTRAINT `fk_recon_item_recon` FOREIGN KEY (`reconciliation_id`) REFERENCES `reconciliations` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_recon_item_req_item` FOREIGN KEY (`request_item_id`) REFERENCES `request_items` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 4 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for reconciliations
-- ----------------------------
DROP TABLE IF EXISTS `reconciliations`;
CREATE TABLE `reconciliations`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_id` int NOT NULL,
  `reconciled_by` int NOT NULL,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SUBMITTED',
  `total_spent` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `total_returned` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `finance_reviewer_id` int NULL DEFAULT NULL,
  `finance_comments` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `reviewed_at` datetime(3) NULL DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_recon_request`(`request_id` ASC) USING BTREE,
  INDEX `idx_recon_user`(`reconciled_by` ASC) USING BTREE,
  INDEX `idx_recon_status`(`status` ASC) USING BTREE,
  INDEX `fk_recon_reviewer`(`finance_reviewer_id` ASC) USING BTREE,
  CONSTRAINT `fk_recon_request` FOREIGN KEY (`request_id`) REFERENCES `requests` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_recon_reviewer` FOREIGN KEY (`finance_reviewer_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_recon_user` FOREIGN KEY (`reconciled_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 2 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for request_items
-- ----------------------------
DROP TABLE IF EXISTS `request_items`;
CREATE TABLE `request_items`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_id` int NOT NULL,
  `item_description` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PROCUREMENT',
  `quantity` decimal(10, 2) NOT NULL,
  `unit_of_measure` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EACH',
  `unit_price` decimal(15, 2) NOT NULL,
  `budget_line_id` int NOT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `request_items_request_id_idx`(`request_id` ASC) USING BTREE,
  INDEX `request_items_budget_line_id_idx`(`budget_line_id` ASC) USING BTREE,
  CONSTRAINT `request_items_budget_line_id_fkey` FOREIGN KEY (`budget_line_id`) REFERENCES `budget_lines` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `request_items_request_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 11 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for request_statuses
-- ----------------------------
DROP TABLE IF EXISTS `request_statuses`;
CREATE TABLE `request_statuses`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `status_name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `status_description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `request_statuses_status_name_key`(`status_name` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 11 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for requests
-- ----------------------------
DROP TABLE IF EXISTS `requests`;
CREATE TABLE `requests`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `requester_id` int NOT NULL,
  `department_id` int NOT NULL,
  `donor_id` int NULL DEFAULT NULL,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT',
  `total_amount` decimal(15, 2) NOT NULL DEFAULT 0.00,
  `justification` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `priority` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MEDIUM',
  `submitted_at` datetime(3) NULL DEFAULT NULL,
  `lead_approved_at` datetime(3) NULL DEFAULT NULL,
  `hop_approved_at` datetime(3) NULL DEFAULT NULL,
  `finance_approved_at` datetime(3) NULL DEFAULT NULL,
  `completed_at` datetime(3) NULL DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  `version` int NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `requests_request_code_key`(`request_code` ASC) USING BTREE,
  INDEX `requests_requester_id_idx`(`requester_id` ASC) USING BTREE,
  INDEX `requests_department_id_idx`(`department_id` ASC) USING BTREE,
  INDEX `requests_donor_id_idx`(`donor_id` ASC) USING BTREE,
  INDEX `requests_status_idx`(`status` ASC) USING BTREE,
  INDEX `requests_created_at_idx`(`created_at` ASC) USING BTREE,
  CONSTRAINT `requests_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `requests_donor_id_fkey` FOREIGN KEY (`donor_id`) REFERENCES `donors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `requests_requester_id_fkey` FOREIGN KEY (`requester_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `requests_status_fkey` FOREIGN KEY (`status`) REFERENCES `request_statuses` (`status_name`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 6 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for roles
-- ----------------------------
DROP TABLE IF EXISTS `roles`;
CREATE TABLE `roles`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `role_name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `role_description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `roles_role_name_key`(`role_name` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 8 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for users
-- ----------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `first_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `department_id` int NOT NULL,
  `role_id` int NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `last_login` datetime(3) NULL DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `users_employee_id_key`(`employee_id` ASC) USING BTREE,
  UNIQUE INDEX `users_email_key`(`email` ASC) USING BTREE,
  INDEX `users_email_idx`(`email` ASC) USING BTREE,
  INDEX `users_department_id_idx`(`department_id` ASC) USING BTREE,
  INDEX `users_role_id_idx`(`role_id` ASC) USING BTREE,
  INDEX `users_is_active_idx`(`is_active` ASC) USING BTREE,
  CONSTRAINT `users_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `users_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 8 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
