-- ==========================================
-- KAYAK MICROSERVICES - MySQL Database Schema
-- ==========================================

-- Create databases
CREATE DATABASE IF NOT EXISTS kayak_users;
CREATE DATABASE IF NOT EXISTS kayak_bookings;
CREATE DATABASE IF NOT EXISTS kayak_billing;

-- ==========================================
-- USER DATABASE
-- ==========================================

USE kayak_users;

-- Users table (UPDATED to snake_case to match user-service/server.js)
CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(11) PRIMARY KEY COMMENT 'SSN format: ###-##-####',
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,

    -- Address split into separate columns (no JSON)
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(255),
    state_code VARCHAR(2),
    zip_code VARCHAR(10),

    phone_number VARCHAR(20),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,

    role ENUM('user', 'admin') DEFAULT 'user',

    profile_image_id VARCHAR(24) COMMENT 'MongoDB ObjectId reference',
    payment_details_token VARCHAR(255) COMMENT 'Tokenized payment info',

    -- Timestamps in UTC style, matching server.js expectations
    created_at_utc TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at_utc TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_email (email),
    INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- BOOKING DATABASE
-- ==========================================

USE kayak_bookings;

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
    bookingId VARCHAR(50) PRIMARY KEY,
    userId VARCHAR(11) NOT NULL,
    listingType ENUM('hotel', 'flight', 'car') NOT NULL,
    listingId VARCHAR(50) NOT NULL,
    startDate DATE NOT NULL,
    endDate DATE NOT NULL,
    guests INT DEFAULT 1,
    totalPrice DECIMAL(10, 2) NOT NULL,
    status ENUM('pending', 'confirmed', 'cancelled') DEFAULT 'pending',
    additionalDetails JSON COMMENT 'Extra booking information',
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_userId (userId),
    INDEX idx_listingType (listingType),
    INDEX idx_status (status),
    INDEX idx_dates (startDate, endDate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inventory table (for availability management)
CREATE TABLE IF NOT EXISTS inventory (
    inventoryId INT AUTO_INCREMENT PRIMARY KEY,
    listingType ENUM('hotel', 'flight', 'car') NOT NULL,
    listingId VARCHAR(50) NOT NULL,
    availableCount INT DEFAULT 0,
    pricePerUnit DECIMAL(10, 2),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_listing (listingType, listingId),
    INDEX idx_listingType (listingType),
    INDEX idx_availability (availableCount)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- BILLING DATABASE
-- ==========================================

USE kayak_billing;

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    paymentId VARCHAR(50) PRIMARY KEY,
    bookingId VARCHAR(50) NOT NULL,
    userId VARCHAR(11) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    paymentMethod ENUM('credit_card', 'debit_card', 'paypal', 'stripe') NOT NULL,
    status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
    transactionId VARCHAR(100) COMMENT 'External payment gateway transaction ID',
    processorResponse JSON COMMENT 'Payment processor response data',
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_bookingId (bookingId),
    INDEX idx_userId (userId),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
    invoiceId VARCHAR(50) PRIMARY KEY,
    bookingId VARCHAR(50) NOT NULL,
    userId VARCHAR(11) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status ENUM('draft', 'issued', 'paid', 'cancelled') DEFAULT 'draft',
    issuedAt TIMESTAMP NULL,
    paidAt TIMESTAMP NULL,
    dueAt TIMESTAMP NULL,
    lineItems JSON COMMENT 'Breakdown of charges',
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_bookingId (bookingId),
    INDEX idx_userId (userId),
    INDEX idx_status (status),
    INDEX idx_issuedAt (issuedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- SEED DATA (for testing)
-- ==========================================

USE kayak_users;

-- Insert a test admin user (password: Admin123!)
INSERT INTO users (
    user_id,
    first_name,
    last_name,
    address_line1,
    address_line2,
    city,
    state_code,
    zip_code,
    phone_number,
    email,
    password_hash,
    role
)
VALUES (
    '123-45-6789',
    'Admin',
    'User',
    '123 Admin St',
    NULL,
    'San Francisco',
    'CA',
    '94105',
    '415-555-0100',
    'admin@kayak.com',
    '$2b$10$rZ3vZqZqQwZqZqZqZqZqZeZqZqZqZqZqZqZqZqZqZqZqZqZqZqZqZ', -- bcrypt hash of 'Admin123!'
    'admin'
) ON DUPLICATE KEY UPDATE email = email;

-- Insert a test regular user (password: User123!)
INSERT INTO users (
    user_id,
    first_name,
    last_name,
    address_line1,
    address_line2,
    city,
    state_code,
    zip_code,
    phone_number,
    email,
    password_hash,
    role
)
VALUES (
    '987-65-4321',
    'John',
    'Doe',
    '456 User Ave',
    NULL,
    'New York',
    'NY',
    '10001',
    '212-555-0200',
    'john.doe@example.com',
    '$2b$10$rZ3vZqZqQwZqZqZqZqZqZeZqZqZqZqZqZqZqZqZqZqZqZqZqZqZqZ', -- bcrypt hash of 'User123!'
    'user'
) ON DUPLICATE KEY UPDATE email = email;

USE kayak_bookings;

-- Insert sample inventory
INSERT INTO inventory (listingType, listingId, availableCount, pricePerUnit) VALUES
    ('hotel', 'HTL001', 50, 150.00),
    ('hotel', 'HTL002', 30, 200.00),
    ('hotel', 'HTL003', 25, 180.00),
    ('flight', 'FLT001', 100, 350.00),
    ('flight', 'FLT002', 80, 420.00),
    ('flight', 'FLT003', 60, 290.00),
    ('car', 'CAR001', 20, 75.00),
    ('car', 'CAR002', 15, 95.00),
    ('car', 'CAR003', 10, 120.00)
ON DUPLICATE KEY UPDATE availableCount = VALUES(availableCount);

-- ==========================================
-- ANALYTICS VIEWS (for Admin Dashboard)
-- ==========================================

USE kayak_bookings;

-- View: Booking statistics
CREATE OR REPLACE VIEW booking_statistics AS
SELECT 
    listingType,
    status,
    COUNT(*) as count,
    SUM(totalPrice) as total_revenue,
    AVG(totalPrice) as avg_price,
    DATE_FORMAT(createdAt, '%Y-%m') as month
FROM bookings
GROUP BY listingType, status, DATE_FORMAT(createdAt, '%Y-%m');

-- View: User booking history
CREATE OR REPLACE VIEW user_booking_summary AS
SELECT 
    userId,
    COUNT(*) as total_bookings,
    SUM(CASE WHEN status = 'confirmed' THEN totalPrice ELSE 0 END) as total_spent,
    MAX(createdAt) as last_booking_date
FROM bookings
GROUP BY userId;

COMMIT;

-- Success message
SELECT 'Database initialization completed successfully!' AS Status;
