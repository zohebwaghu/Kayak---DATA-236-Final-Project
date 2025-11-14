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
const validateState = (state) => {
  const validStates = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
  ];
  return validStates.includes(state.toUpperCase());
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

module.exports = {
  validateUserId,
  validateZipCode,
  validateState,
  validateEmail,
  validatePhone,
  validatePassword,
  validateDate
};

