/**
 * API GATEWAY SERVICE
 * 
 * Purpose: Single entry point for all client requests
 * Responsibilities:
 *  - JWT Authentication & Authorization
 *  - Request routing to downstream services
 *  - Rate limiting
 *  - Request logging
 *  - CORS handling
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const { createErrorResponse } = require('./shared/errorHandler');

const app = express();
const PORT = process.env.API_GATEWAY_PORT || 3000;

// ==================== MIDDLEWARE SETUP ====================

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Rate limiting (100 requests per 15 minutes)
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    timestamp: new Date().toISOString(),
    status: 429,
    error: 'Too Many Requests',
    message: 'You have exceeded the rate limit. Please try again later.'
  }
});
app.use(limiter);

// ==================== AUTHENTICATION MIDDLEWARE ====================

/**
 * JWT Authentication Middleware
 * Validates JWT token and extracts user information
 */
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json(
      createErrorResponse(
        401,
        'Unauthorized',
        'Missing or invalid Authorization header. Expected format: Bearer <token>',
        req.path
      )
    );
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { userId, email, role }
    next();
  } catch (err) {
    return res.status(401).json(
      createErrorResponse(
        401,
        'Unauthorized',
        err.name === 'TokenExpiredError' 
          ? 'Token has expired. Please login again.' 
          : 'Invalid token.',
        req.path
      )
    );
  }
};

/**
 * Admin Authorization Middleware
 * Ensures user has admin role
 */
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json(
      createErrorResponse(
        403,
        'Forbidden',
        'Admin access required. You do not have permission to access this resource.',
        req.path
      )
    );
  }
  next();
};

// ==================== HEALTH CHECK ====================

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    service: 'API Gateway',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ==================== SERVICE ROUTING ====================

/**
 * Generic service proxy function
 * Routes requests to downstream microservices
 */
const proxyToService = async (req, res, serviceName, serviceUrl) => {
  try {
    const response = await axios({
      method: req.method,
      url: `${serviceUrl}${req.path}`,
      data: req.body,
      params: req.query,
      headers: {
        'X-User-ID': req.user?.userId,
        'X-User-Role': req.user?.role,
        'X-Request-ID': req.headers['x-request-id'] || `req-${Date.now()}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 seconds
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    if (error.response) {
      // Service returned an error response
      res.status(error.response.status).json(error.response.data);
    } else if (error.code === 'ECONNREFUSED') {
      // Service is down
      res.status(503).json(
        createErrorResponse(
          503,
          'Service Unavailable',
          `${serviceName} is currently unavailable. Please try again later.`,
          req.path
        )
      );
    } else if (error.code === 'ETIMEDOUT') {
      // Request timeout
      res.status(504).json(
        createErrorResponse(
          504,
          'Gateway Timeout',
          `${serviceName} did not respond in time. Please try again.`,
          req.path
        )
      );
    } else {
      // Unknown error
      console.error(`Error proxying to ${serviceName}:`, error);
      res.status(500).json(
        createErrorResponse(
          500,
          'Internal Server Error',
          'An unexpected error occurred while processing your request.',
          req.path
        )
      );
    }
  }
};

// ==================== AUTHENTICATION ROUTES (PUBLIC) ====================

app.post('/api/v1/auth/register', (req, res) => {
  const serviceUrl = process.env.USER_SERVICE_URL || `http://user-service:${process.env.USER_SERVICE_PORT || 3001}`;
  proxyToService(req, res, 'User Service', serviceUrl);
});

app.post('/api/v1/auth/login', (req, res) => {
  const serviceUrl = process.env.USER_SERVICE_URL || `http://user-service:${process.env.USER_SERVICE_PORT || 3001}`;
  proxyToService(req, res, 'User Service', serviceUrl);
});

// ==================== USER SERVICE ROUTES ====================

app.use('/api/v1/users', authenticateJWT, (req, res) => {
  const serviceUrl = process.env.USER_SERVICE_URL || `http://user-service:${process.env.USER_SERVICE_PORT || 3001}`;
  proxyToService(req, res, 'User Service', serviceUrl);
});

// ==================== SEARCH SERVICE ROUTES (PUBLIC) ====================

app.use('/api/v1/search', (req, res) => {
  const serviceUrl = process.env.SEARCH_SERVICE_URL || `http://search-service:${process.env.SEARCH_SERVICE_PORT || 3003}`;
  proxyToService(req, res, 'Search Service', serviceUrl);
});

// ==================== LISTINGS SERVICE ROUTES (ADMIN ONLY) ====================

app.use('/api/v1/listings', authenticateJWT, requireAdmin, (req, res) => {
  const serviceUrl = process.env.LISTINGS_SERVICE_URL || `http://listings-service:${process.env.LISTINGS_SERVICE_PORT || 3002}`;
  proxyToService(req, res, 'Listings Service', serviceUrl);
});

// ==================== BOOKING SERVICE ROUTES ====================

app.use('/api/v1/bookings', authenticateJWT, (req, res) => {
  const serviceUrl = process.env.BOOKING_SERVICE_URL || `http://booking-service:${process.env.BOOKING_SERVICE_PORT || 3004}`;
  proxyToService(req, res, 'Booking Service', serviceUrl);
});

// ==================== BILLING SERVICE ROUTES ====================

app.use('/api/v1/billing', authenticateJWT, (req, res) => {
  const serviceUrl = process.env.BILLING_SERVICE_URL || `http://billing-service:${process.env.BILLING_SERVICE_PORT || 3005}`;
  proxyToService(req, res, 'Billing Service', serviceUrl);
});

// ==================== ADMIN SERVICE ROUTES (ADMIN ONLY) ====================

app.use('/api/v1/admin', authenticateJWT, requireAdmin, (req, res) => {
  const serviceUrl = process.env.ADMIN_SERVICE_URL || `http://admin-service:${process.env.ADMIN_SERVICE_PORT || 3006}`;
  proxyToService(req, res, 'Admin Service', serviceUrl);
});

// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res) => {
  res.status(404).json(
    createErrorResponse(
      404,
      'Not Found',
      `The endpoint ${req.method} ${req.path} does not exist.`,
      req.path
    )
  );
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json(
    createErrorResponse(
      500,
      'Internal Server Error',
      'An unexpected error occurred.',
      req.path
    )
  );
});

// ==================== SERVER STARTUP ====================

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║          🚀 API GATEWAY STARTED                       ║
╠═══════════════════════════════════════════════════════╣
║  Port:         ${PORT}                                   ║
║  Environment:  ${process.env.NODE_ENV || 'development'}                    ║
║  Health Check: http://localhost:${PORT}/health         ║
║  Time:         ${new Date().toISOString()}  ║
╚═══════════════════════════════════════════════════════╝
  `);
});

// ==================== GRACEFUL SHUTDOWN ====================

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

