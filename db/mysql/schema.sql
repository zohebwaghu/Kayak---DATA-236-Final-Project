-- Kayak Simulation - Relational Schema (MySQL 8.0+)
-- Scope: Core OLTP entities (users, admins, listings, inventory, bookings, billing)
-- Notes:
--  - Do NOT store raw PAN. Payment methods are token references only.
--  - Enforce US-specific input validation via CHECK constraints.
--  - Timezone: store all timestamps in UTC.

/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='STRICT_ALL_TABLES,ANSI_QUOTES' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

DROP DATABASE IF EXISTS `kayak`;
CREATE DATABASE `kayak` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `kayak`;

-- Reference table for valid US states (abbrev + full name)
CREATE TABLE `us_states` (
  `state_code` CHAR(2) NOT NULL,
  `state_name` VARCHAR(64) NOT NULL,
  PRIMARY KEY (`state_code`),
  UNIQUE KEY `ux_state_name` (`state_name`)
);

INSERT INTO `us_states` (`state_code`,`state_name`) VALUES
('AL','Alabama'),('AK','Alaska'),('AZ','Arizona'),('AR','Arkansas'),('CA','California'),('CO','Colorado'),
('CT','Connecticut'),('DE','Delaware'),('FL','Florida'),('GA','Georgia'),('HI','Hawaii'),('ID','Idaho'),
('IL','Illinois'),('IN','Indiana'),('IA','Iowa'),('KS','Kansas'),('KY','Kentucky'),('LA','Louisiana'),
('ME','Maine'),('MD','Maryland'),('MA','Massachusetts'),('MI','Michigan'),('MN','Minnesota'),('MS','Mississippi'),
('MO','Missouri'),('MT','Montana'),('NE','Nebraska'),('NV','Nevada'),('NH','New Hampshire'),('NJ','New Jersey'),
('NM','New Mexico'),('NY','New York'),('NC','North Carolina'),('ND','North Dakota'),('OH','Ohio'),('OK','Oklahoma'),
('OR','Oregon'),('PA','Pennsylvania'),('RI','Rhode Island'),('SC','South Carolina'),('SD','South Dakota'),
('TN','Tennessee'),('TX','Texas'),('UT','Utah'),('VT','Vermont'),('VA','Virginia'),('WA','Washington'),
('WV','West Virginia'),('WI','Wisconsin'),('WY','Wyoming');

-- Users
-- Note: password_hash and role added for Tier 2 middleware compatibility
CREATE TABLE `users` (
  `user_id` CHAR(11) NOT NULL, -- SSN pattern ###-##-####
  `first_name` VARCHAR(64) NOT NULL,
  `last_name` VARCHAR(64) NOT NULL,
  `address_line1` VARCHAR(128) NOT NULL,
  `address_line2` VARCHAR(128) NULL,
  `city` VARCHAR(64) NOT NULL,
  `state_code` CHAR(2) NOT NULL,
  `zip_code` VARCHAR(10) NOT NULL,
  `phone_number` VARCHAR(20) NOT NULL,
  `email` VARCHAR(256) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL DEFAULT '', -- For authentication (Tier 2 compatibility)
  `role` ENUM('user', 'admin') NOT NULL DEFAULT 'user', -- For authorization (Tier 2 compatibility)
  `profile_image_url` VARCHAR(512) NULL,
  `created_at_utc` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at_utc` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `ux_users_email` (`email`),
  KEY `ix_users_role` (`role`),
  CONSTRAINT `fk_users_state` FOREIGN KEY (`state_code`) REFERENCES `us_states` (`state_code`),
  CONSTRAINT `chk_users_ssn` CHECK (`user_id` REGEXP '^[0-9]{3}-[0-9]{2}-[0-9]{4}$'),
  CONSTRAINT `chk_users_zip` CHECK (`zip_code` REGEXP '^[0-9]{5}(-[0-9]{4})?$')
);

-- Payment methods (tokenized)
CREATE TABLE `payment_methods` (
  `payment_method_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` CHAR(11) NOT NULL,
  `provider` ENUM('card','paypal','apple_pay','google_pay') NOT NULL,
  `brand` VARCHAR(32) NULL,
  `last4` CHAR(4) NULL,
  `exp_month` TINYINT UNSIGNED NULL,
  `exp_year` SMALLINT UNSIGNED NULL,
  `billing_zip` VARCHAR(10) NULL,
  `token_ref` VARCHAR(128) NOT NULL, -- reference to external token vault
  `is_default` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at_utc` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_method_id`),
  KEY `ix_payment_methods_user` (`user_id`),
  CONSTRAINT `fk_payment_methods_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_payment_zip` CHECK (`billing_zip` IS NULL OR `billing_zip` REGEXP '^[0-9]{5}(-[0-9]{4})?$')
);

-- Admins
CREATE TABLE `admins` (
  `admin_id` CHAR(36) NOT NULL, -- UUID
  `first_name` VARCHAR(64) NOT NULL,
  `last_name` VARCHAR(64) NOT NULL,
  `address_line1` VARCHAR(128) NOT NULL,
  `address_line2` VARCHAR(128) NULL,
  `city` VARCHAR(64) NOT NULL,
  `state_code` CHAR(2) NOT NULL,
  `zip_code` VARCHAR(10) NOT NULL,
  `phone_number` VARCHAR(20) NOT NULL,
  `email` VARCHAR(256) NOT NULL,
  `role` VARCHAR(64) NOT NULL,
  `access_level` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `created_at_utc` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`admin_id`),
  UNIQUE KEY `ux_admins_email` (`email`),
  CONSTRAINT `fk_admins_state` FOREIGN KEY (`state_code`) REFERENCES `us_states` (`state_code`),
  CONSTRAINT `chk_admins_zip` CHECK (`zip_code` REGEXP '^[0-9]{5}(-[0-9]{4})?$')
);

-- Airports (minimal reference)
CREATE TABLE `airports` (
  `iata_code` CHAR(3) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `city` VARCHAR(64) NOT NULL,
  `state_code` CHAR(2) NULL,
  `timezone` VARCHAR(64) NULL,
  PRIMARY KEY (`iata_code`),
  CONSTRAINT `fk_airports_state` FOREIGN KEY (`state_code`) REFERENCES `us_states` (`state_code`)
);

-- Flights (dated instances)
CREATE TABLE `flights` (
  `flight_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `airline_name` VARCHAR(64) NOT NULL,
  `flight_number` VARCHAR(10) NOT NULL, -- e.g., AA123
  `departure_airport` CHAR(3) NOT NULL,
  `arrival_airport` CHAR(3) NOT NULL,
  `departure_ts_utc` DATETIME(3) NOT NULL,
  `arrival_ts_utc` DATETIME(3) NOT NULL,
  `duration_min` INT UNSIGNED NOT NULL,
  `ticket_price_usd` DECIMAL(10,2) NOT NULL,
  `total_available_seats` INT UNSIGNED NOT NULL,
  `rating_avg` DECIMAL(3,2) NULL,
  `created_at_utc` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`flight_id`),
  KEY `ix_flights_route_time` (`departure_airport`,`arrival_airport`,`departure_ts_utc`),
  CONSTRAINT `fk_flights_dep_airport` FOREIGN KEY (`departure_airport`) REFERENCES `airports` (`iata_code`),
  CONSTRAINT `fk_flights_arr_airport` FOREIGN KEY (`arrival_airport`) REFERENCES `airports` (`iata_code`),
  CONSTRAINT `chk_flights_times` CHECK (`arrival_ts_utc` > `departure_ts_utc`)
);

-- Hotels
CREATE TABLE `hotels` (
  `hotel_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `hotel_name` VARCHAR(128) NOT NULL,
  `address_line1` VARCHAR(128) NOT NULL,
  `address_line2` VARCHAR(128) NULL,
  `city` VARCHAR(64) NOT NULL,
  `state_code` CHAR(2) NOT NULL,
  `zip_code` VARCHAR(10) NOT NULL,
  `star_rating` TINYINT UNSIGNED NULL,
  `num_rooms_total` INT UNSIGNED NOT NULL,
  `amenities_json` JSON NULL, -- for quick filters; detailed reviews/tags in Mongo
  `rating_avg` DECIMAL(3,2) NULL,
  `created_at_utc` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`hotel_id`),
  KEY `ix_hotels_city_state` (`city`,`state_code`),
  CONSTRAINT `fk_hotels_state` FOREIGN KEY (`state_code`) REFERENCES `us_states` (`state_code`),
  CONSTRAINT `chk_hotels_zip` CHECK (`zip_code` REGEXP '^[0-9]{5}(-[0-9]{4})?$')
);

-- Hotel room types and pricing
CREATE TABLE `hotel_room_types` (
  `room_type_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `hotel_id` BIGINT UNSIGNED NOT NULL,
  `room_type` ENUM('single','double','queen','king','suite','studio','apartment') NOT NULL,
  `base_price_usd` DECIMAL(10,2) NOT NULL,
  `max_occupancy` TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (`room_type_id`),
  UNIQUE KEY `ux_room_type_per_hotel` (`hotel_id`,`room_type`),
  CONSTRAINT `fk_room_types_hotel` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`hotel_id`) ON DELETE CASCADE
);

-- Hotel inventory by date (for availability and dynamic price)
-- Note: Not partitioned due to MySQL limitation (FKs + partitioning not supported together)
-- Use date-based indexes for performance instead
CREATE TABLE `hotel_inventory` (
  `inventory_date` DATE NOT NULL,
  `hotel_id` BIGINT UNSIGNED NOT NULL,
  `room_type_id` BIGINT UNSIGNED NOT NULL,
  `rooms_total` INT UNSIGNED NOT NULL,
  `rooms_available` INT UNSIGNED NOT NULL,
  `price_usd` DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (`inventory_date`,`hotel_id`,`room_type_id`),
  KEY `ix_inventory_hotel_date` (`hotel_id`,`inventory_date`),
  KEY `ix_inventory_date` (`inventory_date`),
  CONSTRAINT `fk_inventory_hotel` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`hotel_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_inventory_room_type` FOREIGN KEY (`room_type_id`) REFERENCES `hotel_room_types` (`room_type_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_rooms_nonnegative` CHECK (`rooms_available` <= `rooms_total`)
);

-- Cars
CREATE TABLE `cars` (
  `car_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `car_type` ENUM('suv','sedan','compact','minivan','truck','convertible','wagon','luxury') NOT NULL,
  `provider_name` VARCHAR(64) NOT NULL,
  `model` VARCHAR(64) NOT NULL,
  `model_year` SMALLINT UNSIGNED NOT NULL,
  `transmission_type` ENUM('automatic','manual') NOT NULL,
  `num_seats` TINYINT UNSIGNED NOT NULL,
  `daily_rental_price_usd` DECIMAL(10,2) NOT NULL,
  `rating_avg` DECIMAL(3,2) NULL,
  `availability_status` ENUM('available','unavailable','maintenance') NOT NULL DEFAULT 'available',
  `created_at_utc` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`car_id`),
  KEY `ix_cars_provider_type` (`provider_name`,`car_type`)
);

-- Bookings (polymorphic across flight/hotel/car)
-- Note: Not partitioned due to MySQL limitation (FKs + partitioning not supported together)
-- Use date-based indexes for time-range queries and consider application-level archiving
-- Note: listing_id and guests added for Tier 2 middleware compatibility
CREATE TABLE `bookings` (
  `booking_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` CHAR(11) NOT NULL,
  `booking_type` ENUM('flight','hotel','car') NOT NULL,
  `listing_id` VARCHAR(50) NULL, -- For Tier 2 compatibility (references flight_id, hotel_id, or car_id)
  `status` ENUM('created','confirmed','cancelled','refunded') NOT NULL DEFAULT 'created',
  `start_date` DATE NULL,
  `end_date` DATE NULL,
  `num_guests` INT UNSIGNED DEFAULT 1, -- For Tier 2 compatibility (renamed from 'guests')
  `currency` CHAR(3) NOT NULL DEFAULT 'USD',
  `subtotal_amount` DECIMAL(12,2) NOT NULL,
  `tax_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `total_amount` DECIMAL(12,2) NOT NULL,
  `created_at_utc` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at_utc` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`booking_id`),
  KEY `ix_bookings_user_time` (`user_id`,`created_at_utc`),
  KEY `ix_bookings_type_time` (`booking_type`,`created_at_utc`),
  KEY `ix_bookings_created_date` (`created_at_utc`),
  KEY `ix_bookings_listing` (`booking_type`, `listing_id`),
  CONSTRAINT `fk_bookings_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_dates_order` CHECK (`end_date` IS NULL OR `start_date` IS NULL OR `end_date` >= `start_date`)
);

-- Booking items map to underlying entities for auditing
CREATE TABLE `booking_items` (
  `booking_item_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `booking_id` BIGINT UNSIGNED NOT NULL,
  `item_type` ENUM('flight','hotel','car') NOT NULL,
  `item_id` BIGINT UNSIGNED NOT NULL,
  `quantity` INT UNSIGNED NOT NULL DEFAULT 1,
  `unit_price` DECIMAL(12,2) NOT NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'USD',
  `metadata_json` JSON NULL,
  PRIMARY KEY (`booking_item_id`),
  KEY `ix_items_booking` (`booking_id`),
  CONSTRAINT `fk_booking_items_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`booking_id`) ON DELETE CASCADE
);

-- Billing / Payments
-- Note: Not partitioned due to MySQL limitation (FKs + partitioning not supported together)
-- Use date-based indexes for time-range queries and consider application-level archiving
CREATE TABLE `billing` (
  `billing_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` CHAR(11) NOT NULL,
  `booking_id` BIGINT UNSIGNED NOT NULL,
  `transaction_ts_utc` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `total_amount_paid` DECIMAL(12,2) NOT NULL,
  `payment_method` ENUM('card','paypal','apple_pay','google_pay') NOT NULL,
  `transaction_status` ENUM('pending','succeeded','failed','refunded') NOT NULL,
  `invoice_json` JSON NULL,
  `payment_provider_ref` VARCHAR(128) NULL,
  PRIMARY KEY (`billing_id`),
  UNIQUE KEY `ux_billing_booking_unique_paid` (`booking_id`,`transaction_status`),
  KEY `ix_billing_user_time` (`user_id`,`transaction_ts_utc`),
  KEY `ix_billing_transaction_date` (`transaction_ts_utc`),
  CONSTRAINT `fk_billing_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_billing_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`booking_id`) ON DELETE CASCADE
);

-- Helper link tables for direct relations (optional but useful for integrity)
CREATE TABLE `flight_seat_holds` (
  `flight_id` BIGINT UNSIGNED NOT NULL,
  `booking_id` BIGINT UNSIGNED NOT NULL,
  `seats_held` INT UNSIGNED NOT NULL,
  `expires_at_utc` DATETIME(3) NOT NULL,
  PRIMARY KEY (`flight_id`,`booking_id`),
  KEY `ix_flight_holds_expiry` (`expires_at_utc`),
  CONSTRAINT `fk_holds_flight` FOREIGN KEY (`flight_id`) REFERENCES `flights` (`flight_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_holds_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`booking_id`) ON DELETE CASCADE
);

CREATE TABLE `car_availability` (
  `car_id` BIGINT UNSIGNED NOT NULL,
  `availability_date` DATE NOT NULL,
  `is_available` BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (`car_id`,`availability_date`),
  KEY `ix_car_avail_date` (`availability_date`),
  CONSTRAINT `fk_car_avail_car` FOREIGN KEY (`car_id`) REFERENCES `cars` (`car_id`) ON DELETE CASCADE
);

-- Minimal listing tables link to booking items via item_id
-- For flights: booking_items.item_id -> flights.flight_id
-- For hotels: booking_items.item_id -> hotel_room_types.room_type_id (with dates in booking)
-- For cars: booking_items.item_id -> cars.car_id

-- Unified inventory table for Tier 2 middleware compatibility
-- This provides a single interface for inventory management across all listing types
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

-- Practical search indexes
-- Note: Functional index on JSON requires MySQL 8.0.13+. For compatibility, consider a generated column instead.
-- CREATE INDEX `ix_hotels_price_star_city` ON `hotels` ((CAST(JSON_EXTRACT(`amenities_json`, '$.avg_price') AS DECIMAL(10,2))), `star_rating`, `city`);
-- Alternative: Add a materialized price column if needed for frequent filtering
CREATE INDEX `ix_hotels_star_city` ON `hotels` (`star_rating`, `city`);

/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;


