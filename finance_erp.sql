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

 Date: 13/02/2026 11:29:50
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
-- Records of approval_logs
-- ----------------------------
INSERT INTO `approval_logs` VALUES (1, 1, 1, 'GENERAL_USER', 'SUBMITTED', 'DRAFT', 'PENDING_LEAD_APPROVAL', NULL, '::1', NULL, '2026-02-11 15:28:44.039');
INSERT INTO `approval_logs` VALUES (2, 1, 2, 'PROGRAM_LEAD', 'APPROVED', 'PENDING_LEAD_APPROVAL', 'PENDING_HOP_APPROVAL', 'Proceed', '::1', NULL, '2026-02-11 15:46:23.322');
INSERT INTO `approval_logs` VALUES (3, 1, 3, 'HEAD_OF_PROGRAMS', 'APPROVED', 'PENDING_HOP_APPROVAL', 'PENDING_FINANCE_APPROVAL', NULL, '::1', NULL, '2026-02-11 16:26:04.799');
INSERT INTO `approval_logs` VALUES (4, 1, 4, 'FINANCE_CLERK', 'APPROVED', 'PENDING_FINANCE_APPROVAL', 'APPROVED', NULL, '::1', NULL, '2026-02-11 16:30:25.254');
INSERT INTO `approval_logs` VALUES (5, 2, 1, 'GENERAL_USER', 'SUBMITTED', 'DRAFT', 'PENDING_LEAD_APPROVAL', NULL, '::1', NULL, '2026-02-11 18:20:06.947');
INSERT INTO `approval_logs` VALUES (6, 3, 1, 'GENERAL_USER', 'SUBMITTED', 'DRAFT', 'PENDING_LEAD_APPROVAL', NULL, '::1', NULL, '2026-02-11 18:25:57.705');
INSERT INTO `approval_logs` VALUES (7, 4, 1, 'GENERAL_USER', 'SUBMITTED', 'DRAFT', 'PENDING_LEAD_APPROVAL', NULL, '::1', NULL, '2026-02-11 18:33:47.561');
INSERT INTO `approval_logs` VALUES (8, 4, 2, 'PROGRAM_LEAD', 'APPROVED', 'PENDING_LEAD_APPROVAL', 'PENDING_HOP_APPROVAL', 'QT 1 Looks good', '::1', NULL, '2026-02-11 18:38:27.496');
INSERT INTO `approval_logs` VALUES (9, 4, 3, 'HEAD_OF_PROGRAMS', 'APPROVED', 'PENDING_HOP_APPROVAL', 'PENDING_FINANCE_APPROVAL', NULL, '::1', NULL, '2026-02-11 18:44:27.330');
INSERT INTO `approval_logs` VALUES (10, 4, 4, 'FINANCE_CLERK', 'APPROVED', 'PENDING_FINANCE_APPROVAL', 'APPROVED', NULL, '::1', NULL, '2026-02-11 18:46:39.962');
INSERT INTO `approval_logs` VALUES (11, 4, 4, 'FINANCE_CLERK', 'APPROVED', 'APPROVED', 'DISPATCHED', 'Request dispatched', '::1', NULL, '2026-02-11 21:20:26.970');
INSERT INTO `approval_logs` VALUES (12, 1, 4, 'FINANCE_CLERK', 'APPROVED', 'APPROVED', 'DISPATCHED', 'Request dispatched', '::1', NULL, '2026-02-11 21:20:30.071');
INSERT INTO `approval_logs` VALUES (13, 1, 1, 'GENERAL_USER', 'SUBMITTED', 'DISPATCHED', 'PENDING_RECONCILIATION', 'Reconciliation submitted', '::1', NULL, '2026-02-11 21:25:15.120');
INSERT INTO `approval_logs` VALUES (14, 1, 4, 'FINANCE_CLERK', 'APPROVED', 'PENDING_RECONCILIATION', 'RECONCILED', 'Reconciliation approved', '::1', NULL, '2026-02-11 21:26:01.356');
INSERT INTO `approval_logs` VALUES (15, 5, 1, 'GENERAL_USER', 'SUBMITTED', 'DRAFT', 'PENDING_LEAD_APPROVAL', NULL, '::1', NULL, '2026-02-13 03:03:29.555');

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
-- Records of asset_assignments
-- ----------------------------

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
-- Records of asset_audit_log
-- ----------------------------
INSERT INTO `asset_audit_log` VALUES (1, 1, 'CREATED', NULL, NULL, NULL, 7, NULL, NULL, '2026-02-13 02:50:50.000');

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
-- Records of asset_categories
-- ----------------------------
INSERT INTO `asset_categories` VALUES (1, 'IT Equipment', 'IT', 'Laptops, desktops, printers, servers, networking equipment', NULL, 'STRAIGHT_LINE', 3, 1, '2026-02-13 02:38:24.736', '2026-02-13 02:38:24.736');
INSERT INTO `asset_categories` VALUES (2, 'Vehicles', 'VEH', 'Cars, trucks, motorcycles, bicycles', NULL, 'STRAIGHT_LINE', 5, 1, '2026-02-13 02:38:24.736', '2026-02-13 02:38:24.736');
INSERT INTO `asset_categories` VALUES (3, 'Furniture & Fittings', 'FUR', 'Office furniture, desks, chairs, cabinets', NULL, 'STRAIGHT_LINE', 7, 1, '2026-02-13 02:38:24.736', '2026-02-13 02:38:24.736');
INSERT INTO `asset_categories` VALUES (4, 'Medical Equipment', 'MED', 'Medical devices, diagnostic equipment', NULL, 'STRAIGHT_LINE', 5, 1, '2026-02-13 02:38:24.736', '2026-02-13 02:38:24.736');
INSERT INTO `asset_categories` VALUES (5, 'Communication Equipment', 'COM', 'Radios, satellite phones, modems', NULL, 'STRAIGHT_LINE', 3, 1, '2026-02-13 02:38:24.736', '2026-02-13 02:38:24.736');
INSERT INTO `asset_categories` VALUES (6, 'Office Equipment', 'OFC', 'Photocopiers, scanners, projectors', NULL, 'STRAIGHT_LINE', 5, 1, '2026-02-13 02:38:24.736', '2026-02-13 02:38:24.736');
INSERT INTO `asset_categories` VALUES (7, 'Power & Energy', 'PWR', 'Generators, solar panels, UPS systems', NULL, 'STRAIGHT_LINE', 7, 1, '2026-02-13 02:38:24.736', '2026-02-13 02:38:24.736');
INSERT INTO `asset_categories` VALUES (8, 'Field Equipment', 'FLD', 'Tents, camping gear, field tools', NULL, 'STRAIGHT_LINE', 3, 1, '2026-02-13 02:38:24.736', '2026-02-13 02:38:24.736');
INSERT INTO `asset_categories` VALUES (9, 'Kitchen & Catering', 'KIT', 'Kitchen appliances, utensils, catering equipment', NULL, 'STRAIGHT_LINE', 5, 1, '2026-02-13 02:38:24.736', '2026-02-13 02:38:24.736');
INSERT INTO `asset_categories` VALUES (10, 'Security Equipment', 'SEC', 'CCTV cameras, alarms, safes', NULL, 'STRAIGHT_LINE', 5, 1, '2026-02-13 02:38:24.736', '2026-02-13 02:38:24.736');

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
-- Records of asset_depreciation_log
-- ----------------------------

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
-- Records of asset_disposals
-- ----------------------------

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
-- Records of asset_incidents
-- ----------------------------

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
-- Records of asset_locations
-- ----------------------------
INSERT INTO `asset_locations` VALUES (1, 'Head Office', 'HQ', 'OFFICE', NULL, 'Harare', 'Harare', 'Zimbabwe', NULL, 1, '2026-02-13 02:38:24.780', '2026-02-13 02:38:24.780');
INSERT INTO `asset_locations` VALUES (2, 'Regional Office - Bulawayo', 'REG-BYO', 'OFFICE', NULL, 'Bulawayo', 'Bulawayo', 'Zimbabwe', NULL, 1, '2026-02-13 02:38:24.780', '2026-02-13 02:38:24.780');
INSERT INTO `asset_locations` VALUES (3, 'Field Office - Gweru', 'FLD-GWR', 'FIELD_SITE', NULL, 'Gweru', 'Midlands', 'Zimbabwe', NULL, 1, '2026-02-13 02:38:24.780', '2026-02-13 02:38:24.780');
INSERT INTO `asset_locations` VALUES (4, 'Warehouse - Harare', 'WH-HRE', 'WAREHOUSE', NULL, 'Harare', 'Harare', 'Zimbabwe', NULL, 1, '2026-02-13 02:38:24.780', '2026-02-13 02:38:24.780');

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
-- Records of asset_maintenance
-- ----------------------------

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
-- Records of asset_status_history
-- ----------------------------
INSERT INTO `asset_status_history` VALUES (1, 1, NULL, 'IN_USE', 'Asset registered', 7, NULL, '2026-02-13 02:50:50.000');

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
-- Records of asset_suppliers
-- ----------------------------

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
-- Records of asset_transfers
-- ----------------------------

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
-- Records of assets
-- ----------------------------
INSERT INTO `assets` VALUES (1, 'ZCC-IT-2026-0001', 'Laptop', 'Test Asset', 1, 'KB0001', 'HP15', 'HP', 5, 'EU', '2026-02-13', 1000.00, 'USD', NULL, '001', '001', 3, 0.00, 'STRAIGHT_LINE', 0.00, 1000.00, '2026-02-13', '2026-02-28', 'SALE', 'None', 1, NULL, 1, 'IN_USE', 'EXCELLENT', NULL, NULL, '00001', '2026-02-13', 993.00, 'n.a', '00001', NULL, 7, 1, '2026-02-13 02:50:50.000', '2026-02-13 02:50:50.000');

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
-- Records of attachments
-- ----------------------------
INSERT INTO `attachments` VALUES (1, 'WEBSITE_REVISIONS_1770827627496-858466606.docx', 'WEBSITE REVISIONS.docx', 'C:\\Users\\PC\\Downloads\\Compressed\\zcceprsystem\\zcceprsystem\\backend\\uploads\\temp\\WEBSITE_REVISIONS_1770827627496-858466606.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 18088, 'QUOTATION', 'REQUEST', 4, 'Supporting documents for request', 1, '2026-02-11 18:33:47.000', 1);
INSERT INTO `attachments` VALUES (2, 'WEBSITE_REVISIONS_1770827627497-709722943.docx', 'WEBSITE REVISIONS.docx', 'C:\\Users\\PC\\Downloads\\Compressed\\zcceprsystem\\zcceprsystem\\backend\\uploads\\temp\\WEBSITE_REVISIONS_1770827627497-709722943.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 18088, 'QUOTATION', 'REQUEST', 4, 'Supporting documents for request', 1, '2026-02-11 18:33:47.000', 1);
INSERT INTO `attachments` VALUES (3, 'WEBSITE_REVISIONS_1770827627497-985007950.docx', 'WEBSITE REVISIONS.docx', 'C:\\Users\\PC\\Downloads\\Compressed\\zcceprsystem\\zcceprsystem\\backend\\uploads\\temp\\WEBSITE_REVISIONS_1770827627497-985007950.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 18088, 'QUOTATION', 'REQUEST', 4, 'Supporting documents for request', 1, '2026-02-11 18:33:47.000', 1);
INSERT INTO `attachments` VALUES (4, 'WEBSITE_REVISIONS_1770944609499-684550531.docx', 'WEBSITE REVISIONS.docx', 'C:\\Users\\PC\\Downloads\\Compressed\\zcceprsystem\\zcceprsystem\\backend\\uploads\\temp\\WEBSITE_REVISIONS_1770944609499-684550531.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 18088, 'QUOTATION', 'REQUEST', 5, 'Supporting documents for request', 1, '2026-02-13 03:03:29.000', 1);
INSERT INTO `attachments` VALUES (5, 'WEBSITE_REVISIONS_1770944609500-262130624.docx', 'WEBSITE REVISIONS.docx', 'C:\\Users\\PC\\Downloads\\Compressed\\zcceprsystem\\zcceprsystem\\backend\\uploads\\temp\\WEBSITE_REVISIONS_1770944609500-262130624.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 18088, 'QUOTATION', 'REQUEST', 5, 'Supporting documents for request', 1, '2026-02-13 03:03:29.000', 1);

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
-- Records of budget_lines
-- ----------------------------
INSERT INTO `budget_lines` VALUES (1, 'USAID-2026-OPS', 'USAID - Operations & Programs', 1, 6, 'Operations', 2026, 200000.00, 0.00, NULL, NULL, 1, '2026-02-11 11:25:36.239', '2026-02-11 11:25:36.239', 4);
INSERT INTO `budget_lines` VALUES (2, 'USAID-2026-EQP', 'USAID - Equipment & Infrastructure', 1, 4, 'Equipment', 2026, 150000.00, 0.00, NULL, NULL, 1, '2026-02-11 11:25:36.245', '2026-02-11 11:25:36.245', 4);
INSERT INTO `budget_lines` VALUES (3, 'USAID-2026-CAP', 'USAID - Capacity Building', 1, 2, 'Training', 2026, 100000.00, 0.00, NULL, NULL, 1, '2026-02-11 11:25:36.250', '2026-02-11 11:25:36.250', 4);
INSERT INTO `budget_lines` VALUES (4, 'USAID-2026-ADM', 'USAID - Admin & Overheads', 1, 3, 'Administration', 2026, 50000.00, 0.00, NULL, NULL, 1, '2026-02-11 11:25:36.255', '2026-02-11 11:25:36.255', 4);
INSERT INTO `budget_lines` VALUES (5, 'UKAID-2026-HLT', 'UK Aid - Health Programs', 2, 6, 'Healthcare', 2026, 150000.00, 0.00, NULL, NULL, 1, '2026-02-11 11:25:36.261', '2026-02-11 11:25:36.261', 4);
INSERT INTO `budget_lines` VALUES (6, 'UKAID-2026-EDU', 'UK Aid - Education Initiatives', 2, 6, 'Education', 2026, 120000.00, 0.00, NULL, NULL, 1, '2026-02-11 11:25:36.266', '2026-02-11 11:25:36.266', 4);
INSERT INTO `budget_lines` VALUES (7, 'UKAID-2026-SUP', 'UK Aid - Supplies & Logistics', 2, 4, 'Supplies', 2026, 80000.00, 0.00, NULL, NULL, 1, '2026-02-11 11:25:36.271', '2026-02-11 11:25:36.271', 4);
INSERT INTO `budget_lines` VALUES (8, 'GFUND-2026-MED', 'GHF - Medical Supplies', 3, 4, 'Medical', 2026, 150000.00, 1100.00, NULL, NULL, 1, '2026-02-11 11:25:36.276', '2026-02-11 18:46:39.000', 4);
INSERT INTO `budget_lines` VALUES (9, 'GFUND-2026-TRN', 'GHF - Healthcare Training', 3, 2, 'Training', 2026, 70000.00, 300.00, NULL, NULL, 1, '2026-02-11 11:25:36.281', '2026-02-11 16:30:25.000', 4);
INSERT INTO `budget_lines` VALUES (10, 'GFUND-2026-RES', 'GHF - Research & M&E', 3, 6, 'Research', 2026, 30000.00, 2200.00, NULL, NULL, 1, '2026-02-11 11:25:36.286', '2026-02-11 18:46:39.000', 4);
INSERT INTO `budget_lines` VALUES (11, 'BMGF-2026-WAT', 'Gates - Water & Sanitation', 4, 6, 'Infrastructure', 2026, 250000.00, 0.00, NULL, NULL, 1, '2026-02-11 11:25:36.290', '2026-02-11 11:25:36.290', 4);
INSERT INTO `budget_lines` VALUES (12, 'BMGF-2026-AGR', 'Gates - Agriculture Development', 4, 6, 'Agriculture', 2026, 100000.00, 0.00, NULL, NULL, 1, '2026-02-11 11:25:36.296', '2026-02-11 11:25:36.296', 4);
INSERT INTO `budget_lines` VALUES (13, 'BMGF-2026-TEC', 'Gates - Technology & Innovation', 4, 1, 'Technology', 2026, 50000.00, 0.00, NULL, NULL, 1, '2026-02-11 11:25:36.301', '2026-02-11 11:25:36.301', 4);
INSERT INTO `budget_lines` VALUES (14, 'EURED-2026-GOV', 'EU - Governance & Rights', 5, 6, 'Governance', 2026, 120000.00, 0.00, NULL, NULL, 1, '2026-02-11 11:25:36.305', '2026-02-11 11:25:36.305', 4);
INSERT INTO `budget_lines` VALUES (15, 'EURED-2026-ECO', 'EU - Economic Development', 5, 6, 'Economic', 2026, 100000.00, 0.00, NULL, NULL, 1, '2026-02-11 11:25:36.310', '2026-02-11 11:25:36.310', 4);
INSERT INTO `budget_lines` VALUES (16, 'EURED-2026-ENV', 'EU - Environmental Protection', 5, 4, 'Environment', 2026, 80000.00, 0.00, NULL, NULL, 1, '2026-02-11 11:25:36.315', '2026-02-11 11:25:36.315', 4);

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
-- Records of budget_transactions
-- ----------------------------
INSERT INTO `budget_transactions` VALUES (1, 8, 1, 'DEDUCTION', 100.00, 150000.00, 149900.00, 'Budget deduction for approved request #REQ-2026-000001', 4, '2026-02-11 16:30:25.239');
INSERT INTO `budget_transactions` VALUES (2, 10, 1, 'DEDUCTION', 200.00, 30000.00, 29800.00, 'Budget deduction for approved request #REQ-2026-000001', 4, '2026-02-11 16:30:25.242');
INSERT INTO `budget_transactions` VALUES (3, 9, 1, 'DEDUCTION', 300.00, 70000.00, 69700.00, 'Budget deduction for approved request #REQ-2026-000001', 4, '2026-02-11 16:30:25.245');
INSERT INTO `budget_transactions` VALUES (4, 8, 4, 'DEDUCTION', 1000.00, 149900.00, 148900.00, 'Budget deduction for approved request #REQ-2026-000004', 4, '2026-02-11 18:46:39.953');
INSERT INTO `budget_transactions` VALUES (5, 10, 4, 'DEDUCTION', 2000.00, 29800.00, 27800.00, 'Budget deduction for approved request #REQ-2026-000004', 4, '2026-02-11 18:46:39.955');

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
-- Records of departments
-- ----------------------------
INSERT INTO `departments` VALUES (1, 'Information Technology', 'IT', 'Technology and systems department', 1, '2026-02-11 11:24:34.736', '2026-02-11 11:24:34.736');
INSERT INTO `departments` VALUES (2, 'Human Resources', 'HR', 'Personnel management', 1, '2026-02-11 11:24:34.741', '2026-02-11 11:24:34.741');
INSERT INTO `departments` VALUES (3, 'Finance', 'FIN', 'Financial operations', 1, '2026-02-11 11:24:34.748', '2026-02-11 11:24:34.748');
INSERT INTO `departments` VALUES (4, 'Operations', 'OPS', 'Daily operations management', 1, '2026-02-11 11:24:34.752', '2026-02-11 11:24:34.752');
INSERT INTO `departments` VALUES (5, 'Marketing', 'MKT', 'Marketing and communications', 1, '2026-02-11 11:24:34.755', '2026-02-11 11:24:34.755');
INSERT INTO `departments` VALUES (6, 'Programs', 'PRG', 'Program management and delivery', 1, '2026-02-11 11:24:34.759', '2026-02-11 11:24:34.759');

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
-- Records of donors
-- ----------------------------
INSERT INTO `donors` VALUES (1, 'USAID-2026', 'United States Agency for International Development (USAID)', 'GOVERNMENT', 'John Smith', 'john.smith@usaid.gov', NULL, NULL, 'United States', 500000.00, 500000.00, 0.00, 'USD', 2026, 'USAID-ZIM-2026-001', NULL, NULL, NULL, NULL, 1, '2026-02-11 11:25:36.208', '2026-02-11 11:25:36.321', 4);
INSERT INTO `donors` VALUES (2, 'UKAID-2026', 'UK Aid - Foreign Commonwealth Development Office', 'GOVERNMENT', 'Sarah Johnson', 'sarah.johnson@fcdo.gov.uk', NULL, NULL, 'United Kingdom', 350000.00, 350000.00, 0.00, 'GBP', 2026, 'FCDO-ZW-2026-078', NULL, NULL, NULL, NULL, 1, '2026-02-11 11:25:36.213', '2026-02-11 11:25:36.327', 4);
INSERT INTO `donors` VALUES (3, 'GFUND-2026', 'Global Health Fund', 'FOUNDATION', 'Dr. Michael Chen', 'mchen@globalhealthfund.org', NULL, NULL, 'Switzerland', 250000.00, 250000.00, 3600.00, 'USD', 2026, 'GHF-2026-ZIM-45', NULL, NULL, NULL, NULL, 1, '2026-02-11 11:25:36.218', '2026-02-11 18:46:39.000', 4);
INSERT INTO `donors` VALUES (4, 'BMGF-2026', 'Bill & Melinda Gates Foundation', 'FOUNDATION', 'Emily Rodriguez', 'emily.r@gatesfoundation.org', NULL, NULL, 'United States', 400000.00, 400000.00, 0.00, 'USD', 2026, 'BMGF-INV-2026-1234', NULL, NULL, NULL, NULL, 1, '2026-02-11 11:25:36.222', '2026-02-11 11:25:36.336', 4);
INSERT INTO `donors` VALUES (5, 'EURED-2026', 'European Union - EuropeAid', 'GOVERNMENT', 'Hans Mueller', 'hans.mueller@ec.europa.eu', NULL, NULL, 'Belgium', 300000.00, 300000.00, 0.00, 'EUR', 2026, 'EU-DEVCO-2026-Zimbabwe-89', NULL, NULL, NULL, NULL, 1, '2026-02-11 11:25:36.227', '2026-02-11 11:25:36.340', 4);

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
-- Records of hr_contracts
-- ----------------------------

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
-- Records of hr_disciplinary_records
-- ----------------------------

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
-- Records of hr_documents
-- ----------------------------

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
-- Records of hr_employees
-- ----------------------------

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
-- Records of hr_exit_clearance
-- ----------------------------

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
-- Records of hr_leave_balances
-- ----------------------------

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
-- Records of hr_leave_requests
-- ----------------------------

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
-- Records of hr_leave_types
-- ----------------------------
INSERT INTO `hr_leave_types` VALUES (1, 'ANNUAL', 'Annual Leave', NULL, 22.0, 1, 0, 5.0, 1, '2026-02-13 03:48:46.102', '2026-02-13 03:48:46.102');
INSERT INTO `hr_leave_types` VALUES (2, 'SICK', 'Sick Leave', NULL, 12.0, 1, 1, 0.0, 1, '2026-02-13 03:48:46.102', '2026-02-13 03:48:46.102');
INSERT INTO `hr_leave_types` VALUES (3, 'MATERNITY', 'Maternity Leave', NULL, 98.0, 1, 1, 0.0, 1, '2026-02-13 03:48:46.102', '2026-02-13 03:48:46.102');
INSERT INTO `hr_leave_types` VALUES (4, 'PATERNITY', 'Paternity Leave', NULL, 10.0, 1, 1, 0.0, 1, '2026-02-13 03:48:46.102', '2026-02-13 03:48:46.102');
INSERT INTO `hr_leave_types` VALUES (5, 'COMPASSIONATE', 'Compassionate Leave', NULL, 5.0, 1, 0, 0.0, 1, '2026-02-13 03:48:46.102', '2026-02-13 03:48:46.102');
INSERT INTO `hr_leave_types` VALUES (6, 'STUDY', 'Study Leave', NULL, 10.0, 1, 1, 0.0, 1, '2026-02-13 03:48:46.102', '2026-02-13 03:48:46.102');
INSERT INTO `hr_leave_types` VALUES (7, 'UNPAID', 'Unpaid Leave', NULL, 30.0, 0, 0, 0.0, 1, '2026-02-13 03:48:46.102', '2026-02-13 03:48:46.102');
INSERT INTO `hr_leave_types` VALUES (8, 'R_AND_R', 'Rest & Recuperation', NULL, 5.0, 1, 0, 0.0, 1, '2026-02-13 03:48:46.102', '2026-02-13 03:48:46.102');

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
-- Records of hr_payroll_periods
-- ----------------------------

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
-- Records of hr_payroll_records
-- ----------------------------

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
-- Records of hr_performance_reviews
-- ----------------------------

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
-- Records of hr_salary_grades
-- ----------------------------
INSERT INTO `hr_salary_grades` VALUES (1, 'G1', 'Grade 1 - Entry Level', 500.00, 1000.00, 'USD', NULL, 1, '2026-02-13 03:48:45.853', '2026-02-13 03:48:45.853');
INSERT INTO `hr_salary_grades` VALUES (2, 'G2', 'Grade 2 - Junior', 1000.00, 2000.00, 'USD', NULL, 1, '2026-02-13 03:48:45.853', '2026-02-13 03:48:45.853');
INSERT INTO `hr_salary_grades` VALUES (3, 'G3', 'Grade 3 - Mid-Level', 2000.00, 3500.00, 'USD', NULL, 1, '2026-02-13 03:48:45.853', '2026-02-13 03:48:45.853');
INSERT INTO `hr_salary_grades` VALUES (4, 'G4', 'Grade 4 - Senior', 3500.00, 5000.00, 'USD', NULL, 1, '2026-02-13 03:48:45.853', '2026-02-13 03:48:45.853');
INSERT INTO `hr_salary_grades` VALUES (5, 'G5', 'Grade 5 - Lead/Specialist', 5000.00, 7500.00, 'USD', NULL, 1, '2026-02-13 03:48:45.853', '2026-02-13 03:48:45.853');
INSERT INTO `hr_salary_grades` VALUES (6, 'G6', 'Grade 6 - Manager', 7500.00, 10000.00, 'USD', NULL, 1, '2026-02-13 03:48:45.853', '2026-02-13 03:48:45.853');
INSERT INTO `hr_salary_grades` VALUES (7, 'G7', 'Grade 7 - Director', 10000.00, 15000.00, 'USD', NULL, 1, '2026-02-13 03:48:45.853', '2026-02-13 03:48:45.853');
INSERT INTO `hr_salary_grades` VALUES (8, 'C1', 'Consultant - Short Term', 0.00, 50000.00, 'USD', NULL, 1, '2026-02-13 03:48:45.853', '2026-02-13 03:48:45.853');
INSERT INTO `hr_salary_grades` VALUES (9, 'V1', 'Volunteer', 0.00, 500.00, 'USD', NULL, 1, '2026-02-13 03:48:45.853', '2026-02-13 03:48:45.853');

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
-- Records of hr_timesheet_entries
-- ----------------------------

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
-- Records of hr_timesheets
-- ----------------------------

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
-- Records of hr_training_records
-- ----------------------------

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
-- Records of reconciliation_items
-- ----------------------------
INSERT INTO `reconciliation_items` VALUES (1, 1, 1, 'Test 1', 100.00, 100.00, DEFAULT, NULL, '2026-02-11 21:25:15.000');
INSERT INTO `reconciliation_items` VALUES (2, 1, 2, 'Test 2', 200.00, 200.00, DEFAULT, NULL, '2026-02-11 21:25:15.000');
INSERT INTO `reconciliation_items` VALUES (3, 1, 3, 'Test 3', 300.00, 300.00, DEFAULT, NULL, '2026-02-11 21:25:15.000');

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
-- Records of reconciliations
-- ----------------------------
INSERT INTO `reconciliations` VALUES (1, 1, 1, 'APPROVED', 600.00, 0.00, NULL, 4, NULL, '2026-02-11 21:26:01.000', '2026-02-11 21:25:15.000', '2026-02-11 21:26:01.000');

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
-- Records of request_items
-- ----------------------------
INSERT INTO `request_items` VALUES (1, 1, 'Test 1', 'PROCUREMENT', 1.00, 'EACH', 100.00, 8, NULL, '2026-02-11 15:28:43.000', '2026-02-11 15:28:43.000');
INSERT INTO `request_items` VALUES (2, 1, 'Test 2', 'PROCUREMENT', 1.00, 'EACH', 200.00, 10, NULL, '2026-02-11 15:28:43.000', '2026-02-11 15:28:43.000');
INSERT INTO `request_items` VALUES (3, 1, 'Test 3', 'PROCUREMENT', 1.00, 'EACH', 300.00, 9, NULL, '2026-02-11 15:28:43.000', '2026-02-11 15:28:43.000');
INSERT INTO `request_items` VALUES (4, 2, 'Test 1', 'PROCUREMENT', 1.00, 'EACH', 1000.00, 8, NULL, '2026-02-11 18:20:06.000', '2026-02-11 18:20:06.000');
INSERT INTO `request_items` VALUES (5, 2, 'Test 2', 'PROCUREMENT', 1.00, 'EACH', 2000.00, 10, NULL, '2026-02-11 18:20:06.000', '2026-02-11 18:20:06.000');
INSERT INTO `request_items` VALUES (6, 3, 'Test 1', 'PROCUREMENT', 1.00, 'EACH', 1000.00, 8, NULL, '2026-02-11 18:25:57.000', '2026-02-11 18:25:57.000');
INSERT INTO `request_items` VALUES (7, 3, 'Test 2', 'PROCUREMENT', 1.00, 'EACH', 2000.00, 10, NULL, '2026-02-11 18:25:57.000', '2026-02-11 18:25:57.000');
INSERT INTO `request_items` VALUES (8, 4, 'Test 1', 'PROCUREMENT', 1.00, 'EACH', 1000.00, 8, NULL, '2026-02-11 18:33:47.000', '2026-02-11 18:33:47.000');
INSERT INTO `request_items` VALUES (9, 4, 'Test 2', 'PROCUREMENT', 1.00, 'EACH', 2000.00, 10, NULL, '2026-02-11 18:33:47.000', '2026-02-11 18:33:47.000');
INSERT INTO `request_items` VALUES (10, 5, 'Transport to Gweru', 'PROCUREMENT', 1.00, 'TRIP', 1.00, 15, NULL, '2026-02-13 03:03:29.000', '2026-02-13 03:03:29.000');

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
-- Records of request_statuses
-- ----------------------------
INSERT INTO `request_statuses` VALUES (1, 'DRAFT', 'Request saved but not submitted');
INSERT INTO `request_statuses` VALUES (2, 'PENDING_LEAD_APPROVAL', 'Awaiting Program Lead approval');
INSERT INTO `request_statuses` VALUES (3, 'PENDING_HOP_APPROVAL', 'Awaiting Head of Programs approval');
INSERT INTO `request_statuses` VALUES (4, 'PENDING_FINANCE_APPROVAL', 'Awaiting Finance Clerk final approval');
INSERT INTO `request_statuses` VALUES (5, 'APPROVED', 'Fully approved - Budget deducted');
INSERT INTO `request_statuses` VALUES (6, 'REJECTED', 'Request rejected at any stage');
INSERT INTO `request_statuses` VALUES (7, 'CANCELLED', 'Request cancelled by requester');
INSERT INTO `request_statuses` VALUES (8, 'DISPATCHED', 'Items have been dispatched');
INSERT INTO `request_statuses` VALUES (9, 'PENDING_RECONCILIATION', 'Dispatched - awaiting reconciliation from requester');
INSERT INTO `request_statuses` VALUES (10, 'RECONCILED', 'Reconciliation submitted and approved by Finance');

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
-- Records of requests
-- ----------------------------
INSERT INTO `requests` VALUES (1, 'REQ-2026-000001', 1, 1, NULL, 'RECONCILED', 600.00, 'PPE Material 2026 2026', 'URGENT', '2026-02-11 15:28:44.000', '2026-02-11 15:46:23.000', '2026-02-11 16:26:04.000', '2026-02-11 16:30:25.000', '2026-02-11 16:30:25.000', '2026-02-11 15:28:43.000', '2026-02-11 21:26:01.000', 8);
INSERT INTO `requests` VALUES (2, 'REQ-2026-000002', 1, 1, NULL, 'PENDING_LEAD_APPROVAL', 3000.00, 'Testing 2 Testing 2 Testing 2', 'MEDIUM', '2026-02-11 18:20:06.000', NULL, NULL, NULL, NULL, '2026-02-11 18:20:06.000', '2026-02-11 18:20:06.000', 2);
INSERT INTO `requests` VALUES (3, 'REQ-2026-000003', 1, 1, NULL, 'PENDING_LEAD_APPROVAL', 3000.00, 'Test 3 File Upload Test 3 File Upload Test 3 File Upload', 'MEDIUM', '2026-02-11 18:25:57.000', NULL, NULL, NULL, NULL, '2026-02-11 18:25:57.000', '2026-02-11 18:25:57.000', 2);
INSERT INTO `requests` VALUES (4, 'REQ-2026-000004', 1, 1, NULL, 'DISPATCHED', 3000.00, 'Test 4 - File Upload Test', 'MEDIUM', '2026-02-11 18:33:47.000', '2026-02-11 18:38:27.000', '2026-02-11 18:44:27.000', '2026-02-11 18:46:39.000', '2026-02-11 18:46:39.000', '2026-02-11 18:33:47.000', '2026-02-11 21:20:26.000', 6);
INSERT INTO `requests` VALUES (5, 'REQ-2026-000005', 1, 1, NULL, 'PENDING_LEAD_APPROVAL', 1.00, 'Muchovha Muchovha Muchovha', 'MEDIUM', '2026-02-13 03:03:29.000', NULL, NULL, NULL, NULL, '2026-02-13 03:03:29.000', '2026-02-13 03:03:29.000', 2);

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
-- Records of roles
-- ----------------------------
INSERT INTO `roles` VALUES (1, 'GENERAL_USER', 'Can create and submit procurement requests', '2026-02-11 11:24:34.677');
INSERT INTO `roles` VALUES (2, 'PROGRAM_LEAD', 'Supervisor - First level approval for department requests', '2026-02-11 11:24:34.690');
INSERT INTO `roles` VALUES (3, 'HEAD_OF_PROGRAMS', 'Secondary approval authority', '2026-02-11 11:24:34.695');
INSERT INTO `roles` VALUES (4, 'FINANCE_CLERK', 'Final approval authority and budget management', '2026-02-11 11:24:34.700');
INSERT INTO `roles` VALUES (5, 'ADMIN', 'System Administrator with full oversight and control', '2026-02-11 23:00:25.423');

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

-- ----------------------------
-- Records of users
-- ----------------------------
INSERT INTO `users` VALUES (1, 'EMP001', 'user@zccinzim.org', '$2b$10$6yAXwjEa8ia8BITWj3JesOaH0tqdnjjjX3u4RfQ0Q3U3oJRcSGe.m', 'John', 'Requester', 1, 1, 1, '2026-02-13 07:30:21.000', '2026-02-11 11:24:34.844', '2026-02-13 07:30:21.000');
INSERT INTO `users` VALUES (2, 'EMP002', 'lead@zccinzim.org', '$2b$10$Mzbjkd68EB2WUgTFoLIhcu2gmgbmYuq3NOxdVr70nhJtRC2nxpKa.', 'Jane', 'Supervisor', 1, 2, 1, '2026-02-13 03:04:55.000', '2026-02-11 11:24:34.926', '2026-02-13 03:04:55.000');
INSERT INTO `users` VALUES (3, 'EMP003', 'hop@zccinzim.org', '$2b$10$rmRKEGPlQiOchgLKKGGZpOR6wsP.mh15VcxadjkVRGtLdRc5WrSLi', 'Robert', 'Director', 4, 3, 1, '2026-02-13 03:15:43.000', '2026-02-11 11:24:34.990', '2026-02-13 03:15:43.000');
INSERT INTO `users` VALUES (4, 'EMP004', 'finance@zccinzim.org', '$2b$10$f9/9GVbdNJEX4wGMs.Omje0GBgEFgUs3/cXMhY1AkPRhC8.n2YYMi', 'Alice', 'Accountant', 3, 4, 1, '2026-02-13 02:53:37.000', '2026-02-11 11:24:35.054', '2026-02-13 02:53:37.000');
INSERT INTO `users` VALUES (5, 'EMP005', 'user2@zccinzim.org', '$2b$10$CHRlbwmpGrzSFsRzpsw7ye9B841Xl8FM1CHQ/XgJiKbiYkzlCl.te', 'Charlie', 'Staff', 2, 1, 1, NULL, '2026-02-11 11:24:35.113', '2026-02-11 11:25:36.138');
INSERT INTO `users` VALUES (6, 'EMP006', 'lead2@zccinzim.org', '$2b$10$nbWKeFBTZpKe36rFPVcSpuGd1Afm90glAN9seE3.riSjwc79C4kGm', 'Diana', 'Manager', 2, 2, 1, NULL, '2026-02-11 11:24:35.176', '2026-02-11 11:25:36.202');
INSERT INTO `users` VALUES (7, 'ADMIN001', 'admin@zccinzim.org', '$2b$12$e6yMbMKV7wPjC3g1f8d06uBsiLnbrSZQGaHjjIR8bzqbVV0MxR3ju', 'System', 'Administrator', 1, 5, 1, '2026-02-13 02:41:42.000', '2026-02-11 23:03:29.000', '2026-02-13 02:41:42.000');

SET FOREIGN_KEY_CHECKS = 1;
