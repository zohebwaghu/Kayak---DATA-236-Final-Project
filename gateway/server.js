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
const { createProxyMiddleware } = require('http-proxy-middleware');

const { createErrorResponse } = require('../backend/shared/errorHandler');
const {
  publishEvent,
  initProducer,
  gracefulShutdown,
} = require('./controllers/producerController');

const app = express();
const PORT = process.env.API_GATEWAY_PORT || 3000;
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'kafka:9093';

// Initialize Kafka producer once at startup
initProducer({
  clientId: 'gateway-producer',
  brokers: KAFKA_BROKER.split(','),
});

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

// Simple passthrough for analytics events to admin-service
app.post('/api/v1/analytics/events', (req, res) => {
  const adminUrl = `http://admin-service:${process.env.ADMIN_SERVICE_PORT || 3006}/api/v1/admin/analytics/events`;
  proxyToServiceWithPath(req, res, 'Admin Service', adminUrl, '');
});

/**
 * Generic service proxy function
 * Routes requests to downstream microservices
 *
 * NOTE: By default this forwards to: serviceUrl + req.path
 * For services that need a fixed API prefix (like bookings),
 * we encode that prefix inside serviceUrl itself.
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

/**
 * Proxy to service with custom path (for path rewriting)
 */
const proxyToServiceWithPath = async (req, res, serviceName, serviceUrl, customPath) => {
  try {
    const response = await axios({
      method: req.method,
      url: `${serviceUrl}${customPath}`,
      data: req.body,
      params: req.query,
      headers: {
        'X-User-ID': req.user?.userId,
        'X-User-Role': req.user?.role,
        'X-Request-ID': req.headers['x-request-id'] || `req-${Date.now()}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else if (error.code === 'ECONNREFUSED') {
      res.status(503).json(
        createErrorResponse(503, 'Service Unavailable', `${serviceName} is currently unavailable.`, req.path)
      );
    } else if (error.code === 'ETIMEDOUT') {
      res.status(504).json(
        createErrorResponse(504, 'Gateway Timeout', `${serviceName} did not respond in time.`, req.path)
      );
    } else {
      console.error(`Error proxying to ${serviceName}:`, error);
      res.status(500).json(
        createErrorResponse(500, 'Internal Server Error', 'An unexpected error occurred.', req.path)
      );
    }
  }
};

// ==================== AUTHENTICATION ROUTES (PUBLIC) ====================

app.post('/api/v1/auth/register', async (req, res) => {
  try {
    const { userId, email, password } = req.body || {};
    if (!userId || !email || !password) {
      return res.status(400).json(
        createErrorResponse(
          400,
          'Bad Request',
          'Missing required fields: userId, email, password',
          req.path
        )
      );
    }

    const correlationId = req.headers['x-request-id'] || `req-${Date.now()}`;
    await publishEvent('user.create', userId, {
      eventType: 'user.create',
      data: req.body,
      correlationId,
    });

    return res.status(202).json({
      status: 'accepted',
      correlationId,
      message: 'User creation queued',
    });
  } catch (error) {
    console.error('❌ Failed to enqueue user.create:', error);
    return res.status(503).json(
      createErrorResponse(
        503,
        'Service Unavailable',
        'Unable to enqueue registration request',
        req.path
      )
    );
  }
});

app.post('/api/v1/auth/login', (req, res) => {
  const serviceUrl =
    process.env.USER_SERVICE_URL ||
    `http://user-service:${process.env.USER_SERVICE_PORT || 3001}`;
  proxyToService(req, res, 'User Service', serviceUrl);
});

// ==================== USER SERVICE ROUTES ====================

app.use('/api/v1/users', authenticateJWT, (req, res) => {
  const serviceUrl =
    process.env.USER_SERVICE_URL ||
    `http://user-service:${process.env.USER_SERVICE_PORT || 3001}`;
  // Strip /api/v1/users prefix - user-service expects /:userId directly
  const rewrittenPath = req.path.replace(/^\/api\/v1\/users/, '') || '/';
  proxyToServiceWithPath(req, res, 'User Service', serviceUrl, rewrittenPath);
});

// ==================== SEARCH SERVICE ROUTES (PUBLIC) ====================

app.use('/api/v1/search', (req, res) => {
  const serviceUrl =
    process.env.SEARCH_SERVICE_URL ||
    `http://search-service:${process.env.SEARCH_SERVICE_PORT || 3003}`;
  proxyToService(req, res, 'Search Service', serviceUrl);
});

// ==================== LISTINGS ROUTES (ADMIN ONLY) ====================
// Note: Listings are managed by admin-service (MongoDB), not a separate listings-service

app.use('/api/v1/listings', authenticateJWT, requireAdmin, (req, res) => {
  // Route to admin-service which handles listing CRUD via MongoDB
  const serviceUrl =
    process.env.ADMIN_SERVICE_URL ||
    `http://admin-service:${process.env.ADMIN_SERVICE_PORT || 3006}`;
  // Rewrite /api/v1/listings/* to /listings/* for admin-service
  const rewrittenPath = req.path.replace(/^\/api\/v1\/listings/, '/listings') || '/listings';
  proxyToServiceWithPath(req, res, 'Admin Service (Listings)', serviceUrl, rewrittenPath);
});

// ==================== BOOKING SERVICE ROUTES ====================

// Async booking creation -> Kafka
app.post('/api/v1/bookings', authenticateJWT, async (req, res) => {
  try {
    const { listingType, listingId, startDate, endDate } = req.body || {};
    if (!listingType || !listingId || !startDate || !endDate) {
      return res.status(400).json(
        createErrorResponse(
          400,
          'Bad Request',
          'Missing required fields: listingType, listingId, startDate, endDate',
          req.path
        )
      );
    }

    const correlationId = req.headers['x-request-id'] || `req-${Date.now()}`;
    await publishEvent('booking.request', req.user?.userId || 'guest', {
      eventType: 'booking.request',
      data: {
        ...req.body,
        userId: req.user?.userId,
      },
      correlationId,
    });

    return res.status(202).json({
      status: 'accepted',
      correlationId,
      message: 'Booking request queued',
    });
  } catch (error) {
    console.error('❌ Failed to enqueue booking.request:', error);
    return res.status(503).json(
      createErrorResponse(
        503,
        'Service Unavailable',
        'Unable to enqueue booking request',
        req.path
      )
    );
  }
});

// Other booking routes (GET, PATCH) proxy synchronously
app.use('/api/v1/bookings', authenticateJWT, (req, res) => {
  const serviceUrl =
    process.env.BOOKING_SERVICE_URL ||
    `http://booking-service:${process.env.BOOKING_SERVICE_PORT || 3004}`;
  proxyToService(req, res, 'Booking Service', serviceUrl);
});

// ==================== BILLING SERVICE ROUTES ====================

app.use('/api/v1/billing', authenticateJWT, (req, res) => {
  // billing-service defines its routes as /api/v1/billing...
  // req.path already contains /api/v1/billing, so we just use the base URL
  const serviceUrl =
    process.env.BILLING_SERVICE_URL ||
    `http://billing-service:${process.env.BILLING_SERVICE_PORT || 3005}`;

  proxyToService(req, res, 'Billing Service', serviceUrl);
});

// ==================== AI SERVICE ROUTES (PUBLIC) ====================

app.use('/api/v1/ai', (req, res) => {
  const serviceUrl =
    process.env.AI_SERVICE_URL ||
    `http://ai-service:${process.env.AI_SERVICE_PORT || 8000}/api/ai`;
  proxyToService(req, res, 'AI Service', serviceUrl);
});

// ==================== ADMIN SERVICE ROUTES (ADMIN ONLY) ====================

app.use('/api/v1/admin', authenticateJWT, requireAdmin, (req, res) => {
  const serviceUrl =
    process.env.ADMIN_SERVICE_URL ||
    `http://admin-service:${process.env.ADMIN_SERVICE_PORT || 3006}`;
  // Strip /api/v1/admin prefix - admin-service expects /analytics, /users, /billing directly
  const rewrittenPath = req.path.replace(/^\/api\/v1\/admin/, '') || '/';
  proxyToServiceWithPath(req, res, 'Admin Service', serviceUrl, rewrittenPath);
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

// ==================== WEBSOCKET PROXY FOR AI SERVICE ====================

// WebSocket proxy for AI service real-time events
const wsProxy = createProxyMiddleware('/api/v1/ai/events', {
  target: process.env.AI_SERVICE_URL || 'http://ai-service:8000',
  ws: true,
  changeOrigin: true,
  pathRewrite: { '^/api/v1/ai': '/api/ai' },
  logLevel: 'warn'
});
app.use('/api/v1/ai/events', wsProxy);

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
  gracefulShutdown().finally(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  gracefulShutdown().finally(() => process.exit(0));
});
