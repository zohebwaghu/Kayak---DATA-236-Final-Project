/**
 * Data Validation Utilities
 * These validators ensure data integrity across all microservices
 */

/**
 * Validates User ID (SSN format: ###-##-####)
 * @param {string} userId - User ID to validate
 * @returns {boolean} - True if valid
 */
const validateUserId = (userId) => {
  const ssnPattern = /^\d{3}-\d{2}-\d{4}$/;
  return ssnPattern.test(userId);
};

/**
 * Validates ZIP code (##### or #####-####)
 * @param {string} zipCode - ZIP code to validate
 * @returns {boolean} - True if valid
 */
const validateZipCode = (zipCode) => {
  const zipPattern = /^\d{5}(?:-\d{4})?$/;
  return zipPattern.test(zipCode);
};

/**
 * Validates US state abbreviation
 * @param {string} state - State code to validate
 * @returns {boolean} - True if valid
 */
const STATE_MAP = {
  'ALABAMA': 'AL', 'ALASKA': 'AK', 'ARIZONA': 'AZ', 'ARKANSAS': 'AR', 'CALIFORNIA': 'CA',
  'COLORADO': 'CO', 'CONNECTICUT': 'CT', 'DELAWARE': 'DE', 'FLORIDA': 'FL', 'GEORGIA': 'GA',
  'HAWAII': 'HI', 'IDAHO': 'ID', 'ILLINOIS': 'IL', 'INDIANA': 'IN', 'IOWA': 'IA',
  'KANSAS': 'KS', 'KENTUCKY': 'KY', 'LOUISIANA': 'LA', 'MAINE': 'ME', 'MARYLAND': 'MD',
  'MASSACHUSETTS': 'MA', 'MICHIGAN': 'MI', 'MINNESOTA': 'MN', 'MISSISSIPPI': 'MS', 'MISSOURI': 'MO',
  'MONTANA': 'MT', 'NEBRASKA': 'NE', 'NEVADA': 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', 'OHIO': 'OH',
  'OKLAHOMA': 'OK', 'OREGON': 'OR', 'PENNSYLVANIA': 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD', 'TENNESSEE': 'TN', 'TEXAS': 'TX', 'UTAH': 'UT', 'VERMONT': 'VT',
  'VIRGINIA': 'VA', 'WASHINGTON': 'WA', 'WEST VIRGINIA': 'WV', 'WISCONSIN': 'WI', 'WYOMING': 'WY'
};

const VALID_STATE_CODES = new Set(Object.values(STATE_MAP));

/**
 * Validates US state (abbreviation or full name)
 * @param {string} state - State to validate
 * @returns {boolean} - True if valid
 */
const validateState = (state) => {
  if (!state) return false;
  const upper = state.toUpperCase().trim();
  return VALID_STATE_CODES.has(upper) || STATE_MAP.hasOwnProperty(upper);
};

/**
 * Normalizes state to 2-letter code
 * @param {string} state - State to normalize
 * @returns {string|null} - 2-letter code or null if invalid
 */
const normalizeState = (state) => {
  if (!state) return null;
  const upper = state.toUpperCase().trim();
  if (VALID_STATE_CODES.has(upper)) return upper;
  return STATE_MAP[upper] || null;
};

/**
 * Validates email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid
 */
const validateEmail = (email) => {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email);
};

/**
 * Validates phone number (basic US format)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} - True if valid
 */
const validatePhone = (phone) => {
  const phonePattern = /^[\d\s\-\(\)]+$/;
  return phonePattern.test(phone) && phone.replace(/\D/g, '').length === 10;
};

/**
 * Validates password strength
 * @param {string} password - Password to validate
 * @returns {object} - { valid: boolean, message: string }
 */
const validatePassword = (password) => {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  return { valid: true, message: 'Password is valid' };
};

/**
 * Validates date format (YYYY-MM-DD)
 * @param {string} date - Date string to validate
 * @returns {boolean} - True if valid
 */
const validateDate = (date) => {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(date)) return false;

  const dateObj = new Date(date);
  return dateObj instanceof Date && !isNaN(dateObj);
};

// ==================== SPEC-REQUIRED ERROR CODES ====================
// These throw exceptions with the exact error codes required by the project spec

/**
 * Validates User ID (SSN format) and throws if invalid
 * @throws {object} Error with code 'invalid_driver_id' if invalid
 */
const requireValidUserId = (userId) => {
  if (!userId || !validateUserId(userId)) {
    const error = new Error('User ID must match SSN format: ###-##-####');
    error.status = 400;
    error.code = 'invalid_driver_id';
    throw error;
  }
};

/**
 * Validates US state and throws if invalid
 * @throws {object} Error with code 'malformed_state' if invalid
 */
const requireValidState = (state) => {
  if (!state || !validateState(state)) {
    const error = new Error('Invalid US state abbreviation or name');
    error.status = 400;
    error.code = 'malformed_state';
    throw error;
  }
};

/**
 * Validates ZIP code and throws if invalid
 * @throws {object} Error with code 'malformed_zip' if invalid
 */
const requireValidZip = (zipCode) => {
  if (!zipCode || !validateZipCode(zipCode)) {
    const error = new Error('ZIP code must be in format ##### or #####-####');
    error.status = 400;
    error.code = 'malformed_zip';
    throw error;
  }
};

module.exports = {
  validateUserId,
  validateZipCode,
  validateState,
  validateEmail,
  validatePhone,
  validatePassword,
  validateDate,
  normalizeState,
  // Spec-required exception throwers
  requireValidUserId,
  requireValidState,
  requireValidZip,
  // Export constants for reuse
  STATE_MAP,
  VALID_STATE_CODES
};

