-- Test script for validation constraints
-- Run this AFTER schema.sql to verify constraints work

USE `kayak`;

-- Test 1: Invalid SSN format (should fail)
INSERT INTO `users` (
    `user_id`, `first_name`, `last_name`, `address_line1`, `city`, `state_code`, `zip_code`, `phone_number`, `email`
) VALUES (
    '123-45-678',  -- Invalid: should be 123-45-6789 (4 digits at end)
    'Test', 'User', '123 Main St', 'San Jose', 'CA', '95123', '408-555-1234', 'test@example.com'
);

-- Test 2: Valid SSN format (should pass)
INSERT INTO `users` (
    `user_id`, `first_name`, `last_name`, `address_line1`, `city`, `state_code`, `zip_code`, `phone_number`, `email`
) VALUES (
    '123-45-6789',
    'Test', 'User', '123 Main St', 'San Jose', 'CA', '95123', '408-555-1234', 'test2@example.com'
);

-- Test 3: Invalid ZIP (should fail)
INSERT INTO `users` (
    `user_id`, `first_name`, `last_name`, `address_line1`, `city`, `state_code`, `zip_code`, `phone_number`, `email`
) VALUES (
    '111-22-3333',
    'Test', 'User', '123 Main St', 'San Jose', 'CA', '1234', '408-555-1234', 'test3@example.com'  -- Invalid ZIP
);

-- Test 4: Invalid state (should fail)
INSERT INTO `users` (
    `user_id`, `first_name`, `last_name`, `address_line1`, `city`, `state_code`, `zip_code`, `phone_number`, `email`
) VALUES (
    '222-33-4444',
    'Test', 'User', '123 Main St', 'San Jose', 'XX', '95123', '408-555-1234', 'test4@example.com'  -- Invalid state
);

-- Test 5: Valid ZIP formats (should pass)
INSERT INTO `users` (
    `user_id`, `first_name`, `last_name`, `address_line1`, `city`, `state_code`, `zip_code`, `phone_number`, `email`
) VALUES (
    '333-44-5555',
    'Test', 'User', '123 Main St', 'San Jose', 'CA', '95192-1234', '408-555-1234', 'test5@example.com'  -- Extended ZIP
);

-- Test 6: Flight time constraint (should fail - arrival before departure)
INSERT INTO `airports` (`iata_code`, `name`, `city`) VALUES ('SFO', 'San Francisco', 'San Francisco'), ('LAX', 'Los Angeles', 'Los Angeles');
INSERT INTO `flights` (
    `airline_name`, `flight_number`, `departure_airport`, `arrival_airport`,
    `departure_ts_utc`, `arrival_ts_utc`, `duration_min`, `ticket_price_usd`, `total_available_seats`
) VALUES (
    'AA', 'AA123', 'SFO', 'LAX',
    '2025-12-01 14:00:00', '2025-12-01 13:00:00',  -- Invalid: arrival before departure
    60, 299.99, 150
);

-- Test 7: Valid flight (should pass)
INSERT INTO `flights` (
    `airline_name`, `flight_number`, `departure_airport`, `arrival_airport`,
    `departure_ts_utc`, `arrival_ts_utc`, `duration_min`, `ticket_price_usd`, `total_available_seats`
) VALUES (
    'AA', 'AA124', 'SFO', 'LAX',
    '2025-12-01 14:00:00', '2025-12-01 15:30:00',
    90, 299.99, 150
);

-- Test 8: Booking date order (should fail)
SET @test_user_id = '333-44-5555';
INSERT INTO `bookings` (
    `user_id`, `booking_type`, `start_date`, `end_date`, `subtotal_amount`, `total_amount`
) VALUES (
    @test_user_id, 'hotel',
    '2025-12-10', '2025-12-05',  -- Invalid: end before start
    500.00, 550.00
);

-- Cleanup (if tests pass)
-- DELETE FROM `users` WHERE `user_id` IN ('123-45-6789', '222-33-4444', '333-44-5555');
-- DELETE FROM `flights` WHERE `flight_number` IN ('AA124');

