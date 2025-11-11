-- Migration script to align Tier 3 schema with Tier 2 middleware expectations
-- Run this AFTER schema.sql to add missing columns and create compatibility views

USE `kayak`;

-- ============================================================================
-- ISSUE 1: Add missing columns to users table
-- ============================================================================

-- Add password_hash column (for authentication)
ALTER TABLE `users` 
  ADD COLUMN `password_hash` VARCHAR(255) NULL AFTER `email`,
  ADD COLUMN `role` ENUM('user', 'admin') NOT NULL DEFAULT 'user' AFTER `password_hash`;

-- Update existing users to have default role
UPDATE `users` SET `role` = 'user' WHERE `role` IS NULL;

-- ============================================================================
-- ISSUE 2: Add missing columns to bookings table
-- ============================================================================

-- Add listingId and guests columns to bookings
ALTER TABLE `bookings`
  ADD COLUMN `listing_id` VARCHAR(50) NULL AFTER `booking_type`,
  ADD COLUMN `guests` INT UNSIGNED NULL DEFAULT 1 AFTER `end_date`;

-- Create index for listing lookups
CREATE INDEX `ix_bookings_listing` ON `bookings` (`booking_type`, `listing_id`);

-- ============================================================================
-- ISSUE 3: Create unified inventory table for all listing types
-- ============================================================================

CREATE TABLE `inventory` (
  `inventory_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `listing_type` ENUM('hotel', 'flight', 'car') NOT NULL,
  `listing_id` VARCHAR(50) NOT NULL,
  `available_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `price_per_unit` DECIMAL(10,2) NOT NULL,
  `updated_at_utc` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`inventory_id`),
  UNIQUE KEY `ux_inventory_listing` (`listing_type`, `listing_id`),
  KEY `ix_inventory_type` (`listing_type`),
  KEY `ix_inventory_available` (`available_count`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================================
-- ISSUE 4: Create compatibility views for camelCase column names
-- ============================================================================

-- View for users table with camelCase aliases (for Tier 2 compatibility)
CREATE OR REPLACE VIEW `users_compat` AS
SELECT 
  `user_id` AS `userId`,
  `first_name` AS `firstName`,
  `last_name` AS `last_name`,
  JSON_OBJECT(
    'line1', `address_line1`,
    'line2', `address_line2`,
    'city', `city`,
    'state', `state_code`,
    'zip', `zip_code`
  ) AS `address`,
  `email`,
  `password_hash` AS `passwordHash`,
  `role`,
  `phone_number` AS `phoneNumber`,
  `profile_image_url` AS `profileImageUrl`,
  `created_at_utc` AS `createdAt`,
  `updated_at_utc` AS `updatedAt`
FROM `users`;

-- View for bookings table with camelCase aliases
CREATE OR REPLACE VIEW `bookings_compat` AS
SELECT 
  `booking_id` AS `bookingId`,
  `user_id` AS `userId`,
  `booking_type` AS `listingType`,
  `listing_id` AS `listingId`,
  `start_date` AS `startDate`,
  `end_date` AS `endDate`,
  `guests`,
  `total_amount` AS `totalPrice`,
  `status`,
  `created_at_utc` AS `createdAt`,
  `updated_at_utc` AS `updatedAt`
FROM `bookings`;

-- ============================================================================
-- ISSUE 5: Create additional databases for Tier 2 compatibility
-- ============================================================================

-- Create separate databases if Tier 2 requires them
CREATE DATABASE IF NOT EXISTS `kayak_users` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS `kayak_bookings` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS `kayak_billing` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- Copy users table to kayak_users database
CREATE TABLE IF NOT EXISTS `kayak_users`.`users` LIKE `kayak`.`users`;
INSERT INTO `kayak_users`.`users` SELECT * FROM `kayak`.`users`;

-- Copy bookings table to kayak_bookings database
CREATE TABLE IF NOT EXISTS `kayak_bookings`.`bookings` LIKE `kayak`.`bookings`;
INSERT INTO `kayak_bookings`.`bookings` SELECT * FROM `kayak`.`bookings`;

-- Copy billing table to kayak_billing database
CREATE TABLE IF NOT EXISTS `kayak_billing`.`billing` LIKE `kayak`.`billing`;
INSERT INTO `kayak_billing`.`billing` SELECT * FROM `kayak`.`billing`;

-- ============================================================================
-- Summary
-- ============================================================================

SELECT 'Migration completed successfully!' AS status;
SELECT 'Added columns: users.password_hash, users.role, bookings.listing_id, bookings.guests' AS changes;
SELECT 'Created: inventory table, compatibility views, separate databases' AS created;

