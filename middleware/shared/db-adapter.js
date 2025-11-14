/**
 * DATABASE ADAPTER
 * 
 * Translates between Tier 2 (camelCase) and Tier 3 (snake_case) schemas
 * This allows our middleware to work with their actual database structure
 */

/**
 * Convert Tier 2 user object to Tier 3 database format
 */
const userToDb = (user) => {
  const dbUser = {
    user_id: user.userId,
    first_name: user.firstName,
    last_name: user.lastName,
    email: user.email,
    phone_number: user.phone || '',
    created_at_utc: user.createdAt,
    updated_at_utc: user.updatedAt
  };

  // Handle address - convert JSON to separate columns
  if (user.address) {
    dbUser.address_line1 = user.address.street || '';
    dbUser.address_line2 = user.address.line2 || null;
    dbUser.city = user.address.city || '';
    dbUser.state_code = user.address.state || '';
    dbUser.zip_code = user.address.zipCode || '';
  }

  // Handle password hash (if they add it)
  if (user.passwordHash) {
    dbUser.password_hash = user.passwordHash;
  }

  // Handle role (if they add it)
  if (user.role) {
    dbUser.role = user.role;
  }

  return dbUser;
};

/**
 * Convert Tier 3 database row to Tier 2 user object
 */
const dbToUser = (row) => {
  return {
    userId: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone_number,
    address: {
      street: row.address_line1,
      line2: row.address_line2,
      city: row.city,
      state: row.state_code,
      zipCode: row.zip_code
    },
    passwordHash: row.password_hash || null,
    role: row.role || 'user',
    profileImageUrl: row.profile_image_url,
    createdAt: row.created_at_utc,
    updatedAt: row.updated_at_utc
  };
};

/**
 * Convert Tier 2 booking object to Tier 3 database format
 */
const bookingToDb = (booking) => {
  return {
    booking_id: booking.bookingId,
    user_id: booking.userId,
    booking_type: booking.listingType,
    status: booking.status || 'created',
    start_date: booking.startDate,
    end_date: booking.endDate,
    currency: 'USD',
    subtotal_amount: booking.totalPrice,
    tax_amount: 0,
    total_amount: booking.totalPrice,
    // Store additional data in metadata
    metadata_json: JSON.stringify({
      listing_id: booking.listingId,
      num_guests: booking.guests,
      additional_details: booking.additionalDetails
    })
  };
};

/**
 * Convert Tier 3 database row to Tier 2 booking object
 */
const dbToBooking = (row) => {
  let metadata = {};
  try {
    metadata = typeof row.metadata_json === 'string' 
      ? JSON.parse(row.metadata_json) 
      : row.metadata_json || {};
  } catch (e) {
    console.error('Error parsing booking metadata:', e);
  }

  return {
    bookingId: row.booking_id ? row.booking_id.toString() : null,
    userId: row.user_id,
    listingType: row.booking_type,
    listingId: metadata.listing_id || null,
    startDate: row.start_date,
    endDate: row.end_date,
    guests: metadata.num_guests || 1,
    totalPrice: parseFloat(row.total_amount),
    status: row.status,
    additionalDetails: metadata.additional_details || {},
    createdAt: row.created_at_utc,
    updatedAt: row.updated_at_utc
  };
};

/**
 * Build SQL WHERE clause with proper column names
 */
const buildWhereClause = (filters) => {
  const conditions = [];
  const values = [];

  if (filters.userId) {
    conditions.push('user_id = ?');
    values.push(filters.userId);
  }

  if (filters.status) {
    conditions.push('status = ?');
    values.push(filters.status);
  }

  if (filters.listingType) {
    conditions.push('booking_type = ?');
    values.push(filters.listingType);
  }

  if (filters.timeFrame) {
    if (filters.timeFrame === 'past') {
      conditions.push('end_date < CURDATE()');
    } else if (filters.timeFrame === 'current') {
      conditions.push('start_date <= CURDATE() AND end_date >= CURDATE()');
    } else if (filters.timeFrame === 'future') {
      conditions.push('start_date > CURDATE()');
    }
  }

  return {
    clause: conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '',
    values
  };
};

module.exports = {
  userToDb,
  dbToUser,
  bookingToDb,
  dbToBooking,
  buildWhereClause
};

