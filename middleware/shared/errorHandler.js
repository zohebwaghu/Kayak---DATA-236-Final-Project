/**
 * Standardized Error Response Handler
 * Ensures all services return consistent error formats
 */

/**
 * Creates a standardized error response
 * @param {number} status - HTTP status code
 * @param {string} error - Short error description
 * @param {string} message - Detailed error message
 * @param {string} path - Request URI
 * @returns {object} - Formatted error response
 */
const createErrorResponse = (status, error, message, path) => {
  return {
    timestamp: new Date().toISOString(),
    status,
    error,
    message,
    path
  };
};

/**
 * Express middleware for centralized error handling
 */
const errorMiddleware = (err, req, res, next) => {
  console.error('Error occurred:', err);

  // Default to 500 server error
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  const error = err.error || getErrorName(status);

  res.status(status).json(createErrorResponse(status, error, message, req.path));
};

/**
 * Get error name from status code
 */
const getErrorName = (status) => {
  const errorNames = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable'
  };
  return errorNames[status] || 'Error';
};

/**
 * Custom error classes
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.error = 'Bad Request';
  }
}

class AuthenticationError extends Error {
  constructor(message = 'Authentication failed') {
    super(message);
    this.name = 'AuthenticationError';
    this.status = 401;
    this.error = 'Unauthorized';
  }
}

class AuthorizationError extends Error {
  constructor(message = 'Insufficient permissions') {
    super(message);
    this.name = 'AuthorizationError';
    this.status = 403;
    this.error = 'Forbidden';
  }
}

class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
    this.error = 'Not Found';
  }
}

class ConflictError extends Error {
  constructor(message = 'Resource already exists') {
    super(message);
    this.name = 'ConflictError';
    this.status = 409;
    this.error = 'Conflict';
  }
}

module.exports = {
  createErrorResponse,
  errorMiddleware,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError
};

