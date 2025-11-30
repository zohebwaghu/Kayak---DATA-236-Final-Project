
import mysql.connector
import random
import uuid
from datetime import datetime, timedelta
import os

# Configuration
DB_HOST = "localhost"
DB_PORT = 3307
DB_USER = "root"
DB_PASSWORD = "password"

def connect_db():
    return mysql.connector.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD
    )

def seed_transactions(count=500):
    conn = connect_db()
    cursor = conn.cursor()
    
    print(f"Generating {count} dummy transactions...")

    # 1. Get User IDs
    cursor.execute("SELECT user_id FROM kayak_users.users LIMIT 1000")
    users = [row[0] for row in cursor.fetchall()]
    
    if not users:
        print("No users found! Run import_data.py first.")
        return

    # 2. Get Listings (Hotels) - We'll just use IDs from the hotels collection logic
    # Since we can't easily query MongoDB from here without pymongo, 
    # and we know the ID format from import_data.py is HT000000, FL000000...
    # We will generate IDs synthetically or fetch from MySQL inventory if it was populated.
    # import_data.py did NOT populate MySQL inventory, only MongoDB.
    # However, the admin-service queries `invoices` and joins `bookings`.
    # It does NOT join `inventory` or MongoDB.
    # So we can just make up listing IDs that look real.
    
    # 3. Generate Data
    bookings_sql = """
    INSERT INTO kayak_bookings.bookings 
    (bookingId, userId, listingType, listingId, startDate, endDate, totalPrice, status, createdAt)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    
    invoices_sql = """
    INSERT INTO kayak_billing.invoices
    (invoiceId, bookingId, userId, amount, status, issuedAt, paidAt, createdAt)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """

    payments_sql = """
    INSERT INTO kayak_billing.payments
    (paymentId, bookingId, userId, amount, currency, paymentMethod, status, transactionId, createdAt)
    VALUES (%s, %s, %s, %s, 'USD', %s, %s, %s, %s)
    """
    
    for i in range(count):
        user_id = random.choice(users)
        listing_type = random.choice(['hotel', 'flight'])
        
        # Generate fake listing ID
        if listing_type == 'hotel':
            listing_id = f"HT{random.randint(0, 9999):06d}"
            price = random.uniform(100, 500)
            days = random.randint(1, 7)
            total_price = price * days
        else:
            listing_id = f"FL{random.randint(0, 9999):06d}"
            total_price = random.uniform(200, 1500)
            days = 0
            
        booking_id = str(uuid.uuid4())
        invoice_id = str(uuid.uuid4())
        payment_id = str(uuid.uuid4())
        transaction_id = f"txn_{random.randint(100000, 999999)}"
        
        # Random date in 2024-2025
        start_date = datetime(2025, 1, 1) + timedelta(days=random.randint(0, 365))
        end_date = start_date + timedelta(days=days)
        created_at = start_date - timedelta(days=random.randint(1, 30))
        
        status = random.choice(['confirmed', 'confirmed', 'confirmed', 'cancelled'])
        payment_status = 'completed' if status == 'confirmed' else 'failed'
        invoice_status = 'paid' if status == 'confirmed' else 'cancelled'
        payment_method = random.choice(['credit_card', 'paypal', 'debit_card'])
        
        # Insert Booking
        cursor.execute(bookings_sql, (
            booking_id, user_id, listing_type, listing_id, 
            start_date, end_date, total_price, status, created_at
        ))
        
        # Insert Invoice and Payment
        if status == 'confirmed':
            cursor.execute(invoices_sql, (
                invoice_id, booking_id, user_id, total_price, 
                invoice_status, created_at, created_at, created_at
            ))
            
            cursor.execute(payments_sql, (
                payment_id, booking_id, user_id, total_price,
                payment_method, payment_status, transaction_id, created_at
            ))
            
    conn.commit()
    cursor.close()
    conn.close()
    print("✅ Successfully seeded transactions!")

if __name__ == "__main__":
    seed_transactions()
