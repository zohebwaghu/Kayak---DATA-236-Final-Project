-- Sample data insertion script for testing
-- Run this AFTER schema.sql to populate with test data
-- This verifies foreign keys, constraints, and relationships work

USE `kayak`;

-- Sample Users (valid SSN format)
INSERT INTO `users` (
    `user_id`, `first_name`, `last_name`, `address_line1`, `city`, `state_code`, 
    `zip_code`, `phone_number`, `email`
) VALUES
    ('123-45-6789', 'John', 'Doe', '123 Main St', 'San Jose', 'CA', '95123', '408-555-0100', 'john.doe@example.com'),
    ('234-56-7890', 'Jane', 'Smith', '456 Oak Ave', 'Los Angeles', 'CA', '90001-1234', '213-555-0200', 'jane.smith@example.com'),
    ('345-67-8901', 'Bob', 'Johnson', '789 Pine Rd', 'New York', 'NY', '10001', '212-555-0300', 'bob.johnson@example.com');

-- Sample Admins
INSERT INTO `admins` (
    `admin_id`, `first_name`, `last_name`, `address_line1`, `city`, `state_code`,
    `zip_code`, `phone_number`, `email`, `role`, `access_level`
) VALUES
    (UUID(), 'Admin', 'User', '100 Admin Way', 'San Francisco', 'CA', '94102', '415-555-1000', 'admin@kayak.com', 'System Administrator', 9),
    (UUID(), 'Manager', 'Test', '200 Manager St', 'Seattle', 'WA', '98101', '206-555-2000', 'manager@kayak.com', 'Operations Manager', 5);

-- Sample Airports
INSERT INTO `airports` (`iata_code`, `name`, `city`, `state_code`, `timezone`) VALUES
    ('SFO', 'San Francisco International', 'San Francisco', 'CA', 'America/Los_Angeles'),
    ('LAX', 'Los Angeles International', 'Los Angeles', 'CA', 'America/Los_Angeles'),
    ('JFK', 'John F. Kennedy International', 'New York', 'NY', 'America/New_York'),
    ('SEA', 'Seattle-Tacoma International', 'Seattle', 'WA', 'America/Los_Angeles');

-- Sample Flights
INSERT INTO `flights` (
    `airline_name`, `flight_number`, `departure_airport`, `arrival_airport`,
    `departure_ts_utc`, `arrival_ts_utc`, `duration_min`, `ticket_price_usd`, `total_available_seats`, `rating_avg`
) VALUES
    ('American Airlines', 'AA123', 'SFO', 'LAX', '2025-12-01 14:00:00', '2025-12-01 15:30:00', 90, 299.99, 150, 4.5),
    ('United Airlines', 'UA456', 'SFO', 'JFK', '2025-12-02 08:00:00', '2025-12-02 16:30:00', 510, 599.99, 200, 4.2),
    ('Delta Airlines', 'DL789', 'LAX', 'SEA', '2025-12-03 10:00:00', '2025-12-03 12:30:00', 150, 349.99, 175, 4.7);

-- Sample Hotels
INSERT INTO `hotels` (
    `hotel_name`, `address_line1`, `city`, `state_code`, `zip_code`,
    `star_rating`, `num_rooms_total`, `amenities_json`, `rating_avg`
) VALUES
    ('Grand Hotel', '500 Luxury Blvd', 'San Francisco', 'CA', '94102', 5, 200, 
     '{"wifi": true, "parking": true, "breakfast": true, "pool": true}', 4.8),
    ('Budget Inn', '100 Economy St', 'Los Angeles', 'CA', '90001', 2, 50,
     '{"wifi": true, "parking": false}', 3.5),
    ('City Center', '300 Downtown Ave', 'New York', 'NY', '10001', 4, 300,
     '{"wifi": true, "breakfast": true, "gym": true}', 4.3);

-- Get hotel IDs from the inserts (assuming they were inserted in order)
SET @hotel1_id = (SELECT hotel_id FROM hotels WHERE hotel_name = 'Grand Hotel' LIMIT 1);
SET @hotel2_id = (SELECT hotel_id FROM hotels WHERE hotel_name = 'Budget Inn' LIMIT 1);
SET @hotel3_id = (SELECT hotel_id FROM hotels WHERE hotel_name = 'City Center' LIMIT 1);

-- Hotel Room Types
INSERT INTO `hotel_room_types` (`hotel_id`, `room_type`, `base_price_usd`, `max_occupancy`) VALUES
    (@hotel1_id, 'king', 299.99, 2),
    (@hotel1_id, 'suite', 499.99, 4),
    (@hotel2_id, 'single', 79.99, 1),
    (@hotel2_id, 'double', 99.99, 2),
    (@hotel3_id, 'queen', 199.99, 2),
    (@hotel3_id, 'studio', 249.99, 2);

-- Get room type IDs
SET @room_type1 = (SELECT room_type_id FROM hotel_room_types WHERE hotel_id = @hotel1_id AND room_type = 'king' LIMIT 1);
SET @room_type2 = (SELECT room_type_id FROM hotel_room_types WHERE hotel_id = @hotel2_id AND room_type = 'double' LIMIT 1);

-- Hotel Inventory (sample dates)
INSERT INTO `hotel_inventory` (`inventory_date`, `hotel_id`, `room_type_id`, `rooms_total`, `rooms_available`, `price_usd`) VALUES
    ('2025-12-01', @hotel1_id, @room_type1, 10, 8, 299.99),
    ('2025-12-02', @hotel1_id, @room_type1, 10, 10, 309.99),
    ('2025-12-01', @hotel2_id, @room_type2, 20, 15, 99.99);

-- Sample Cars
INSERT INTO `cars` (
    `car_type`, `provider_name`, `model`, `model_year`, `transmission_type`,
    `num_seats`, `daily_rental_price_usd`, `rating_avg`, `availability_status`
) VALUES
    ('suv', 'Enterprise', 'Toyota RAV4', 2024, 'automatic', 5, 89.99, 4.6, 'available'),
    ('sedan', 'Hertz', 'Toyota Camry', 2024, 'automatic', 5, 59.99, 4.4, 'available'),
    ('compact', 'Avis', 'Nissan Sentra', 2023, 'automatic', 5, 49.99, 4.2, 'available');

-- Sample Bookings
INSERT INTO `bookings` (
    `user_id`, `booking_type`, `status`, `start_date`, `end_date`,
    `subtotal_amount`, `tax_amount`, `total_amount`
) VALUES
    ('123-45-6789', 'hotel', 'confirmed', '2025-12-01', '2025-12-03', 599.98, 60.00, 659.98),
    ('234-56-7890', 'flight', 'confirmed', '2025-12-02', NULL, 599.99, 0.00, 599.99),
    ('345-67-8901', 'car', 'created', '2025-12-05', '2025-12-08', 269.97, 27.00, 296.97);

-- Get booking IDs (assuming they were inserted in order)
SET @booking1 = (SELECT booking_id FROM bookings WHERE user_id = '123-45-6789' AND booking_type = 'hotel' LIMIT 1);
SET @booking2 = (SELECT booking_id FROM bookings WHERE user_id = '234-56-7890' AND booking_type = 'flight' LIMIT 1);
SET @booking3 = (SELECT booking_id FROM bookings WHERE user_id = '345-67-8901' AND booking_type = 'car' LIMIT 1);

-- Booking Items
SET @flight1 = 1; -- First flight from above
INSERT INTO `booking_items` (`booking_id`, `item_type`, `item_id`, `quantity`, `unit_price`) VALUES
    (@booking1, 'hotel', @room_type1, 1, 299.99),
    (@booking2, 'flight', @flight1, 1, 599.99),
    (@booking3, 'car', 1, 3, 89.99);

-- Sample Billing
INSERT INTO `billing` (
    `user_id`, `booking_id`, `total_amount_paid`, `payment_method`, `transaction_status`, `invoice_json`
) VALUES
    ('123-45-6789', @booking1, 659.98, 'card', 'succeeded', '{"invoice_num": "INV001", "items": ["Hotel booking"]}'),
    ('234-56-7890', @booking2, 599.99, 'paypal', 'succeeded', '{"invoice_num": "INV002", "items": ["Flight booking"]}'),
    ('345-67-8901', @booking3, 296.97, 'card', 'pending', '{"invoice_num": "INV003", "items": ["Car rental"]}');

-- Payment Methods
INSERT INTO `payment_methods` (`user_id`, `provider`, `brand`, `last4`, `exp_month`, `exp_year`, `token_ref`, `is_default`) VALUES
    ('123-45-6789', 'card', 'Visa', '1234', 12, 2026, 'tok_abc123xyz', TRUE),
    ('234-56-7890', 'paypal', NULL, NULL, NULL, NULL, 'pp_token_456', TRUE);

-- Car Availability
INSERT INTO `car_availability` (`car_id`, `availability_date`, `is_available`) VALUES
    (1, '2025-12-05', FALSE),
    (1, '2025-12-06', FALSE),
    (1, '2025-12-07', FALSE),
    (2, '2025-12-05', TRUE),
    (2, '2025-12-06', TRUE);

SELECT 'Sample data inserted successfully!' AS Status;

-- Verification queries
SELECT COUNT(*) AS total_users FROM `users`;
SELECT COUNT(*) AS total_flights FROM `flights`;
SELECT COUNT(*) AS total_hotels FROM `hotels`;
SELECT COUNT(*) AS total_bookings FROM `bookings`;

