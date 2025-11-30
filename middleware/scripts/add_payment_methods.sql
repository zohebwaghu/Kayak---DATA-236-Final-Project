-- Add payment_methods table to kayak_users database

USE kayak_users;

CREATE TABLE IF NOT EXISTS payment_methods (
    method_id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(11) NOT NULL,
    card_type VARCHAR(20) NOT NULL, -- 'visa', 'mastercard', 'amex', etc.
    last_four VARCHAR(4) NOT NULL,
    expiry_month VARCHAR(2) NOT NULL,
    expiry_year VARCHAR(4) NOT NULL,
    card_holder_name VARCHAR(255) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_at_utc TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at_utc TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
