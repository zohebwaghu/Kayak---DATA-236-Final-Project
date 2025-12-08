-- MySQL explicit indexes for performance (run once)
-- Users
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_user_id ON users (user_id);

-- Bookings
CREATE INDEX idx_bookings_user ON bookings (userId);
CREATE INDEX idx_bookings_transaction_date ON bookings (createdAt);
CREATE INDEX idx_bookings_listing ON bookings (listingType, listingId);

-- Billing
CREATE INDEX idx_billing_user ON invoices (userId);
CREATE INDEX idx_billing_booking ON invoices (bookingId);
CREATE INDEX idx_billing_date ON invoices (transactionDate);
