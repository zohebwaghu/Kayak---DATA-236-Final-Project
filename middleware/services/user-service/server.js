/**
 * USER SERVICE
 * 
 * Purpose: Manages user accounts, authentication, and profiles
 * Responsibilities:
 *  - User registration and authentication
 *  - User profile CRUD operations
 *  - JWT token generation
 *  - Publishing user events to Kafka
 *  - Password hashing and validation
 * 
 * Database: MySQL (transactional data)
 * Message Queue: Kafka (event publishing)
 */

require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');

const {
  createKafkaClient,
  createProducer,
  publishEvent,
  disconnectKafka,
  TOPICS,
  EVENT_TYPES
} = require('../../shared/kafka');

const {
  validateUserId,
  validateZipCode,
  validateState,
  validateEmail,
  validatePassword
} = require('../../shared/validators');

const {
  createErrorResponse,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ConflictError
} = require('../../shared/errorHandler');

const app = express();
const PORT = process.env.USER_SERVICE_PORT || 3001;

app.use(express.json());

// ==================== DATABASE CONNECTION ====================

// Use Tier 3's database structure
// They created both 'kayak' (main) and 'kayak_users' (compatibility)
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '', // Empty password for Homebrew MySQL
  database: process.env.MYSQL_DB_USERS || 'kayak_users', // Use 'kayak_users' (Tier 2 compatibility)
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Test database connection
pool.getConnection()
  .then(connection => {
    console.log('✅ MySQL database connected');
    connection.release();
  })
  .catch(err => {
    console.error('❌ MySQL connection failed:', err);
    process.exit(1);
  });

// ==================== KAFKA SETUP ====================

let kafkaProducer;

(async () => {
  try {
    const kafka = createKafkaClient('user-service');
    kafkaProducer = await createProducer(kafka);
  } catch (error) {
    console.error('❌ Failed to initialize Kafka:', error);
    // Don't exit - service can work without Kafka for basic operations
  }
})();

// ==================== HEALTH CHECK ====================

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    service: 'User Service',
    timestamp: new Date().toISOString()
  });
});

// ==================== AUTHENTICATION ENDPOINTS ====================

/**
 * POST /api/v1/auth/register
 * Register a new user account
 */
app.post('/api/v1/auth/register', async (req, res) => {
  try {
    let { userId, firstName, lastName, address, phone, email, password } = req.body;

    // ===== VALIDATION =====

    if (!userId || !firstName || !lastName || !email || !password) {
      throw new ValidationError('Missing required fields: userId, firstName, lastName, email, password');
    }

    if (!validateUserId(userId)) {
      throw new ValidationError('User ID must match SSN format: ###-##-####');
    }

    if (!validateEmail(email)) {
      throw new ValidationError('Invalid email format');
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      throw new ValidationError(passwordValidation.message);
    }

    // Address validation - if provided, must be valid
    // If no address provided, use defaults to satisfy database constraints
    if (!address) {
      address = {
        line1: 'TBD',
        city: 'TBD',
        state: 'CA', // Default to California (valid state code)
        zipCode: '00000' // Default ZIP that passes regex validation
      };
    } else {
      // Validate provided address
      if (!validateState(address.state)) {
        throw new ValidationError('Invalid US state abbreviation');
      }
      if (!validateZipCode(address.zipCode)) {
        throw new ValidationError('ZIP code must be in format ##### or #####-####');
      }
    }

    // ===== CHECK FOR DUPLICATES =====
    // Use Tier 3's snake_case column names
    const [existingUsers] = await pool.execute(
      'SELECT user_id, email FROM users WHERE user_id = ? OR email = ?',
      [userId, email]
    );

    if (existingUsers.length > 0) {
      if (existingUsers[0].user_id === userId) {
        throw new ConflictError('User ID already exists');
      }
      if (existingUsers[0].email === email) {
        throw new ConflictError('Email already registered');
      }
    }

    // ===== HASH PASSWORD =====

    const passwordHash = await bcrypt.hash(password, 10);

    // ===== INSERT USER =====
    // Use Tier 3's schema: separate address columns, not JSON
    await pool.execute(
      `INSERT INTO users (
        user_id, first_name, last_name, 
        address_line1, address_line2, city, state_code, zip_code,
        phone_number, email, password_hash, role,
        created_at_utc, updated_at_utc
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', NOW(), NOW())`,
      [
        userId,
        firstName,
        lastName,
        address?.street || address?.line1 || '',
        address?.line2 || null,
        address?.city || '',
        address?.state || '',
        address?.zipCode || '',
        phone || '',
        email,
        passwordHash
      ]
    );

    // ===== PUBLISH EVENT TO KAFKA =====

    if (kafkaProducer) {
      await publishEvent(kafkaProducer, TOPICS.USER_EVENTS, userId, {
        eventType: EVENT_TYPES.USER_CREATED,
        data: {
          userId,
          email,
          firstName,
          lastName
        }
      });
    }

    // ===== RETURN SUCCESS RESPONSE =====

    res.status(201).json({
      userId,
      firstName,
      lastName,
      address,
      phone,
      email,
      role: 'user',
      createdAt: new Date().toISOString(),
      message: 'User registered successfully'
    });

  } catch (error) {
    console.error('Error in user registration:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage
    });

    if (error instanceof ValidationError || error instanceof ConflictError) {
      return res.status(error.status).json(
        createErrorResponse(error.status, error.error, error.message, req.path)
      );
    }

    // Include more details in error response for debugging
    const errorMessage = error.sqlMessage || error.message || 'Failed to register user';
    res.status(500).json(
      createErrorResponse(500, 'Internal Server Error', errorMessage, req.path)
    );
  }
});

/**
 * POST /api/v1/auth/login
 * Authenticate user and return JWT token
 */
app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // ===== VALIDATION =====

    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    // ===== FIND USER =====
    // Use Tier 3's snake_case column names
    const [users] = await pool.execute(
      'SELECT user_id, email, password_hash, first_name, last_name, role FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      throw new AuthenticationError('Invalid email or password');
    }

    const user = users[0];

    // ===== VERIFY PASSWORD =====

    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      throw new AuthenticationError('Invalid email or password');
    }

    // ===== GENERATE JWT TOKEN =====

    const token = jwt.sign(
      {
        userId: user.user_id,  // Use snake_case from DB
        email: user.email,
        role: user.role || 'user'
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: process.env.JWT_EXPIRY || '24h' }
    );

    // ===== RETURN TOKEN =====

    res.status(200).json({
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn: process.env.JWT_EXPIRY || '24h',
      user: {
        userId: user.user_id,  // Convert back to camelCase for API response
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role || 'user'
      }
    });

  } catch (error) {
    console.error('Error in user login:', error);

    if (error instanceof ValidationError || error instanceof AuthenticationError) {
      return res.status(error.status).json(
        createErrorResponse(error.status, error.error, error.message, req.path)
      );
    }

    res.status(500).json(
      createErrorResponse(500, 'Internal Server Error', 'Login failed', req.path)
    );
  }
});

// ==================== USER CRUD ENDPOINTS ====================

/**
 * GET /:userId
 * Retrieve user profile information
 *
 * NOTE: API Gateway rewrites /api/v1/users/:userId -> /:userId for this service.
 */
app.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Use Tier 3's snake_case column names
    const [users] = await pool.execute(
      `SELECT user_id, first_name, last_name, 
              address_line1, address_line2, city, state_code, zip_code,
              phone_number, email, role, 
              created_at_utc, updated_at_utc 
       FROM users WHERE user_id = ?`,
      [userId]
    );

    if (users.length === 0) {
      throw new NotFoundError('User not found');
    }

    const row = users[0];
    // Convert snake_case to camelCase for API response
    const user = {
      userId: row.user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      address: {
        street: row.address_line1,
        line2: row.address_line2,
        city: row.city,
        state: row.state_code,
        zipCode: row.zip_code
      },
      phone: row.phone_number,
      email: row.email,
      role: row.role || 'user',
      createdAt: row.created_at_utc,
      updatedAt: row.updated_at_utc
    };

    res.status(200).json(user);

  } catch (error) {
    console.error('Error fetching user:', error);

    if (error instanceof NotFoundError) {
      return res.status(error.status).json(
        createErrorResponse(error.status, error.error, error.message, req.path)
      );
    }

    res.status(500).json(
      createErrorResponse(500, 'Internal Server Error', 'Failed to fetch user', req.path)
    );
  }
});

/**
 * PUT /:userId
 * Update user profile information
 *
 * NOTE: API Gateway rewrites /api/v1/users/:userId -> /:userId for this service.
 */
app.put('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;

    // ===== VALIDATE UPDATES =====

    if (updates.address) {
      if (updates.address.state && !validateState(updates.address.state)) {
        throw new ValidationError('Invalid US state abbreviation');
      }
      if (updates.address.zipCode && !validateZipCode(updates.address.zipCode)) {
        throw new ValidationError('Invalid ZIP code format');
      }
    }

    if (updates.email && !validateEmail(updates.email)) {
      throw new ValidationError('Invalid email format');
    }

    // ===== BUILD UPDATE QUERY =====
    // Map camelCase to Tier 3's snake_case column names
    const fieldMapping = {
      'firstName': 'first_name',
      'lastName': 'last_name',
      'phone': 'phone_number',
      'email': 'email'
    };

    const updateFields = [];
    const updateValues = [];

    // Handle regular fields
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'address') {
        // Address is separate columns in Tier 3 schema
        if (value.street || value.line1) {
          updateFields.push('address_line1 = ?');
          updateValues.push(value.street || value.line1 || '');
        }
        if (value.line2 !== undefined) {
          updateFields.push('address_line2 = ?');
          updateValues.push(value.line2 || null);
        }
        if (value.city) {
          updateFields.push('city = ?');
          updateValues.push(value.city);
        }
        if (value.state) {
          updateFields.push('state_code = ?');
          updateValues.push(value.state);
        }
        if (value.zipCode) {
          updateFields.push('zip_code = ?');
          updateValues.push(value.zipCode);
        }
      } else if (fieldMapping[key] && value !== undefined) {
        updateFields.push(`${fieldMapping[key]} = ?`);
        updateValues.push(value);
      }
    }

    if (updateFields.length === 0) {
      throw new ValidationError('No valid fields to update');
    }

    updateFields.push('updated_at_utc = NOW()');
    updateValues.push(userId);

    // ===== UPDATE DATABASE =====
    // Use Tier 3's snake_case column names
    const [result] = await pool.execute(
      `UPDATE users SET ${updateFields.join(', ')} WHERE user_id = ?`,
      updateValues
    );

    if (result.affectedRows === 0) {
      throw new NotFoundError('User not found');
    }

    // ===== PUBLISH EVENT TO KAFKA =====

    if (kafkaProducer) {
      await publishEvent(kafkaProducer, TOPICS.USER_EVENTS, userId, {
        eventType: EVENT_TYPES.USER_UPDATED,
        data: {
          userId,
          updatedFields: Object.keys(updates)
        }
      });
    }

    // ===== FETCH AND RETURN UPDATED USER =====
    // Use Tier 3's snake_case, convert to camelCase for response
    const [users] = await pool.execute(
      `SELECT user_id, first_name, last_name, 
              address_line1, address_line2, city, state_code, zip_code,
              phone_number, email, role, updated_at_utc 
       FROM users WHERE user_id = ?`,
      [userId]
    );

    const row = users[0];
    const user = {
      userId: row.user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      address: {
        street: row.address_line1,
        line2: row.address_line2,
        city: row.city,
        state: row.state_code,
        zipCode: row.zip_code
      },
      phone: row.phone_number,
      email: row.email,
      role: row.role || 'user',
      updatedAt: row.updated_at_utc
    };

    res.status(200).json({
      ...user,
      message: 'User updated successfully'
    });

  } catch (error) {
    console.error('Error updating user:', error);

    if (error instanceof ValidationError || error instanceof NotFoundError) {
      return res.status(error.status).json(
        createErrorResponse(error.status, error.error, error.message, req.path)
      );
    }

    res.status(500).json(
      createErrorResponse(500, 'Internal Server Error', 'Failed to update user', req.path)
    );
  }
});

/**
 * DELETE /:userId
 * Delete user account
 *
 * NOTE: API Gateway rewrites /api/v1/users/:userId -> /:userId for this service.
 */
app.delete('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Use Tier 3's snake_case column names
    const [result] = await pool.execute(
      'DELETE FROM users WHERE user_id = ?',
      [userId]
    );

    if (result.affectedRows === 0) {
      throw new NotFoundError('User not found');
    }

    // ===== PUBLISH EVENT TO KAFKA =====

    if (kafkaProducer) {
      await publishEvent(kafkaProducer, TOPICS.USER_EVENTS, userId, {
        eventType: EVENT_TYPES.USER_DELETED,
        data: { userId }
      });
    }

    res.status(204).send();

  } catch (error) {
    console.error('Error deleting user:', error);

    if (error instanceof NotFoundError) {
      return res.status(error.status).json(
        createErrorResponse(error.status, error.error, error.message, req.path)
      );
    }

    res.status(500).json(
      createErrorResponse(500, 'Internal Server Error', 'Failed to delete user', req.path)
    );
  }
});

// ==================== PAYMENT METHOD ENDPOINTS ====================

/**
 * GET /:userId/payment-methods
 * Retrieve all payment methods for a user
 */
app.get('/:userId/payment-methods', async (req, res) => {
  try {
    const { userId } = req.params;

    const [methods] = await pool.execute(
      `SELECT method_id, card_type, last_four, expiry_month, expiry_year, 
              card_holder_name, is_default, created_at_utc
       FROM payment_methods 
       WHERE user_id = ?
       ORDER BY is_default DESC, created_at_utc DESC`,
      [userId]
    );

    // Map to camelCase
    const paymentMethods = methods.map(row => ({
      methodId: row.method_id,
      cardType: row.card_type,
      lastFour: row.last_four,
      expiryMonth: row.expiry_month,
      expiryYear: row.expiry_year,
      cardHolderName: row.card_holder_name,
      isDefault: !!row.is_default,
      createdAt: row.created_at_utc
    }));

    res.status(200).json(paymentMethods);

  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json(
      createErrorResponse(500, 'Internal Server Error', 'Failed to fetch payment methods', req.path)
    );
  }
});

/**
 * POST /:userId/payment-methods
 * Add a new payment method
 */
app.post('/:userId/payment-methods', async (req, res) => {
  try {
    const { userId } = req.params;
    const { cardType, cardNumber, expiryMonth, expiryYear, cardHolderName, isDefault } = req.body;

    // Basic validation
    if (!cardType || !cardNumber || !expiryMonth || !expiryYear || !cardHolderName) {
      throw new ValidationError('Missing required payment fields');
    }

    // Simple card validation (luhn check would be better but keeping it simple)
    if (cardNumber.length < 13) {
      throw new ValidationError('Invalid card number');
    }

    const lastFour = cardNumber.slice(-4);
    const methodId = randomUUID();

    // If setting as default, unset other defaults first
    if (isDefault) {
      await pool.execute(
        'UPDATE payment_methods SET is_default = FALSE WHERE user_id = ?',
        [userId]
      );
    }

    await pool.execute(
      `INSERT INTO payment_methods (
        method_id, user_id, card_type, last_four, 
        expiry_month, expiry_year, card_holder_name, is_default
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [methodId, userId, cardType, lastFour, expiryMonth, expiryYear, cardHolderName, isDefault || false]
    );

    res.status(201).json({
      methodId,
      cardType,
      lastFour,
      expiryMonth,
      expiryYear,
      cardHolderName,
      isDefault: !!isDefault,
      message: 'Payment method added successfully'
    });

  } catch (error) {
    console.error('Error adding payment method:', error);
    if (error instanceof ValidationError) {
      return res.status(error.status).json(
        createErrorResponse(error.status, error.error, error.message, req.path)
      );
    }
    res.status(500).json(
      createErrorResponse(500, 'Internal Server Error', 'Failed to add payment method', req.path)
    );
  }
});

/**
 * DELETE /:userId/payment-methods/:methodId
 * Remove a payment method
 */
app.delete('/:userId/payment-methods/:methodId', async (req, res) => {
  try {
    const { userId, methodId } = req.params;

    const [result] = await pool.execute(
      'DELETE FROM payment_methods WHERE method_id = ? AND user_id = ?',
      [methodId, userId]
    );

    if (result.affectedRows === 0) {
      throw new NotFoundError('Payment method not found');
    }

    res.status(204).send();

  } catch (error) {
    console.error('Error deleting payment method:', error);
    if (error instanceof NotFoundError) {
      return res.status(error.status).json(
        createErrorResponse(error.status, error.error, error.message, req.path)
      );
    }
    res.status(500).json(
      createErrorResponse(500, 'Internal Server Error', 'Failed to delete payment method', req.path)
    );
  }
});

// ==================== ERROR HANDLING ====================

app.use((req, res) => {
  res.status(404).json(
    createErrorResponse(404, 'Not Found', `Endpoint ${req.method} ${req.path} not found`, req.path)
  );
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json(
    createErrorResponse(500, 'Internal Server Error', 'An unexpected error occurred', req.path)
  );
});

// ==================== SERVER STARTUP ====================

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║          👤 USER SERVICE STARTED                      ║
╠═══════════════════════════════════════════════════════╣
║  Port:         ${PORT}                                   ║
║  Database:     MySQL (${process.env.MYSQL_DB_USERS || 'kayak_users'})          ║
║  Kafka:        ${kafkaProducer ? '✅ Connected' : '❌ Not Connected'}                       ║
║  Time:         ${new Date().toISOString()}  ║
╚═══════════════════════════════════════════════════════╝
  `);
});

// ==================== GRACEFUL SHUTDOWN ====================

process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await disconnectKafka(kafkaProducer, null);
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  await disconnectKafka(kafkaProducer, null);
  await pool.end();
  process.exit(0);
});