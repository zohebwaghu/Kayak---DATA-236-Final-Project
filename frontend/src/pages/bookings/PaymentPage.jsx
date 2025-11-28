// src/pages/bookings/PaymentPage.jsx
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import api from '../../api/axios';
import { selectUser } from '../../store/slices/authSlice';
import './PaymentPage.css';

/**
 * PaymentPage
 *
 * Option B:
 *  - Split layout: left = booking details, right = payment form
 *  - Kayak-ish colours and rounded cards
 *
 * Navigation in:
 *  navigate('/booking/payment', { state: { bookingType, listing } });
 */
const PaymentPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useSelector(selectUser);

  const bookingType = location.state?.bookingType || null;
  const listing = location.state?.listing || null;

  const [formData, setFormData] = useState({
    nameOnCard: '',
    cardNumber: '',
    expiry: '',
    cvv: '',
    billingAddress: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  if (!bookingType || !listing) {
    return (
      <div className="payment-page">
        <div className="payment-page-inner">
          <div className="payment-empty-card">
            <h1 className="payment-title">No booking to pay for</h1>
            <p className="payment-text">
              We couldn&apos;t find any booking details. Please go back to the
              search page and select a trip to book.
            </p>
            <button
              type="button"
              className="payment-primary-btn"
              onClick={() => navigate('/')}
            >
              Back to search
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Build details similar to summary page
  const typeLabel =
    bookingType === 'flight'
      ? 'Flight'
      : bookingType === 'hotel'
      ? 'Hotel'
      : bookingType === 'car'
      ? 'Car'
      : 'Trip';

  let title = '';
  let subtitle = '';
  let metaLines = [];
  let priceLabel = '';
  let priceValue = '';
  let priceNumeric = null;

  if (bookingType === 'flight') {
    const origin = listing.origin || 'Origin';
    const destination = listing.destination || 'Destination';
    const airline = listing.airline || 'Any airline';
    const departText = listing.departureTime
      ? new Date(listing.departureTime).toLocaleString()
      : null;
    const stopsText =
      typeof listing.stops === 'number'
        ? `${listing.stops} stop${listing.stops === 1 ? '' : 's'}`
        : null;

    title = `${origin} → ${destination}`;
    subtitle = airline;
    metaLines = [stopsText, departText].filter(Boolean);

    const price =
      typeof listing.price === 'number'
        ? listing.price
        : listing.totalPrice ?? null;
    priceNumeric = typeof price === 'number' ? price : null;
    priceLabel = 'Trip total';
    priceValue =
      typeof price === 'number' ? `$${price.toFixed(0)} USD` : 'Price pending';
  } else if (bookingType === 'hotel') {
    const name =
      listing.name ||
      listing.hotelName ||
      listing.propertyName ||
      'Hotel property';
    const city = listing.city || '';
    const star =
      listing.starRating ?? listing.stars ?? listing.rating ?? null;

    let amenitiesText = '';
    if (Array.isArray(listing.amenities)) {
      amenitiesText = listing.amenities.slice(0, 3).join(', ');
    } else if (typeof listing.amenities === 'string') {
      amenitiesText = listing.amenities;
    }

    title = star ? `${name} · ${star}★` : name;
    subtitle = city;
    metaLines = [amenitiesText].filter(Boolean);

    const price =
      listing.pricePerNight ??
      listing.price ??
      listing.samplePrice ??
      listing.totalPrice ??
      null;
    priceNumeric = typeof price === 'number' ? price : null;
    priceLabel = 'Nightly price';
    priceValue =
      typeof price === 'number'
        ? `$${price.toFixed(0)} USD / night`
        : 'Price pending';
  } else if (bookingType === 'car') {
    const type = listing.carType || listing.type || 'Car';
    const loc = listing.location || '';
    const company = listing.company || listing.vendor || '';

    title = type;
    subtitle = loc;
    metaLines = [company].filter(Boolean);

    const price =
      listing.pricePerDay ?? listing.dailyPrice ?? listing.price ?? null;
    priceNumeric = typeof price === 'number' ? price : null;
    priceLabel = 'Daily price';
    priceValue =
      typeof price === 'number'
        ? `$${price.toFixed(0)} USD / day`
        : 'Price pending';
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSubmitError('');
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const toISODate = (d) => d.toISOString().slice(0, 10);

  const getFallbackRange = () => {
    const start = new Date();
    start.setDate(start.getDate() + 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 3);
    return {
      startDate: toISODate(start),
      endDate: toISODate(end),
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitError('');
    setSubmitting(true);

    try {
      if (!user || !user.userId) {
        setSubmitError(
          'Your session has expired. Please log in again to complete payment.'
        );
        navigate('/login');
        return;
      }

      const listingId =
        listing.listingId ||
        listing.id ||
        listing._id ||
        listing.hotelId ||
        listing.carId ||
        listing.flightId ||
        '';

      let startDateStr = '';
      let endDateStr = '';

      if (bookingType === 'flight' && listing.departureTime) {
        const dep = new Date(listing.departureTime);
        if (!Number.isNaN(dep.getTime())) {
          const start = dep;
          const end = new Date(dep);
          end.setDate(end.getDate() + 1);
          startDateStr = toISODate(start);
          endDateStr = toISODate(end);
        }
      } else if (bookingType === 'hotel') {
        if (listing.checkIn && listing.checkOut) {
          const checkIn = new Date(listing.checkIn);
          const checkOut = new Date(listing.checkOut);
          if (
            !Number.isNaN(checkIn.getTime()) &&
            !Number.isNaN(checkOut.getTime())
          ) {
            startDateStr = toISODate(checkIn);
            endDateStr = toISODate(checkOut);
          }
        }
      } else if (bookingType === 'car') {
        if (listing.pickupDate && listing.dropoffDate) {
          const pickup = new Date(listing.pickupDate);
          const dropoff = new Date(listing.dropoffDate);
          if (
            !Number.isNaN(pickup.getTime()) &&
            !Number.isNaN(dropoff.getTime())
          ) {
            startDateStr = toISODate(pickup);
            endDateStr = toISODate(dropoff);
          }
        }
      }

      if (!startDateStr || !endDateStr) {
        const fallback = getFallbackRange();
        startDateStr = fallback.startDate;
        endDateStr = fallback.endDate;
      }

      const guests =
        listing.guests ||
        listing.numGuests ||
        listing.adults ||
        listing.passengers ||
        1;

      const totalPrice =
        typeof priceNumeric === 'number' && priceNumeric > 0
          ? priceNumeric
          : 1;

      const payload = {
        userId: user.userId,
        listingType: bookingType.toLowerCase(),   // ✅ ONLY CHANGE
        listingId,
        startDate: startDateStr,
        endDate: endDateStr,
        guests,
        totalPrice,
        additionalDetails: {
          listingSnapshot: listing,
          payment: {
            nameOnCard: formData.nameOnCard,
            last4: formData.cardNumber.slice(-4),
            billingAddress: formData.billingAddress,
          },
        },
      };

      await api.post('/bookings', payload);

      navigate('/my-bookings');
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Payment or booking failed. Please try again.';
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackToSummary = () => {
    navigate('/booking/summary', {
      state: {
        bookingType,
        listing,
      },
    });
  };

  return (
    <div className="payment-page">
      <div className="payment-page-inner">
        <div className="payment-layout">
          {/* Left: booking details */}
          <section className="payment-details-card">
            <div className="payment-chip">{typeLabel}</div>
            <h1 className="payment-title">Confirm your trip details</h1>
            <p className="payment-subtitle">
              Review your selection before entering payment information.
            </p>

            <div className="payment-trip-block">
              <h2 className="payment-trip-title">{title}</h2>
              {subtitle && (
                <p className="payment-trip-subtitle">{subtitle}</p>
              )}

              {metaLines.length > 0 && (
                <ul className="payment-meta-list">
                  {metaLines.map((line, idx) => (
                    <li key={idx} className="payment-meta-item">
                      {line}
                    </li>
                  ))}
                </ul>
              )}

              <div className="payment-price-summary">
                <span className="payment-price-label">{priceLabel}</span>
                <span className="payment-price-value">{priceValue}</span>
              </div>

              <button
                type="button"
                className="payment-link-btn"
                onClick={handleBackToSummary}
              >
                ← Back to summary
              </button>
            </div>
          </section>

          {/* Right: payment form */}
          <section className="payment-form-card">
            <h2 className="payment-form-title">Secure payment</h2>
            <p className="payment-form-subtitle">
              We use industry-standard encryption to protect your details.
            </p>

            <form onSubmit={handleSubmit} className="payment-form">
              <div className="payment-form-group">
                <label className="payment-label" htmlFor="nameOnCard">
                  Name on card
                </label>
                <input
                  id="nameOnCard"
                  name="nameOnCard"
                  type="text"
                  className="payment-input"
                  placeholder="Akshit Tyagi"
                  value={formData.nameOnCard}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="payment-form-row">
                <div className="payment-form-group">
                  <label className="payment-label" htmlFor="cardNumber">
                    Card number
                  </label>
                  <input
                    id="cardNumber"
                    name="cardNumber"
                    type="text"
                    className="payment-input"
                    placeholder="1234 5678 9012 3456"
                    value={formData.cardNumber}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="payment-form-row">
                <div className="payment-form-group">
                  <label className="payment-label" htmlFor="expiry">
                    Expiry (MM/YY)
                  </label>
                  <input
                    id="expiry"
                    name="expiry"
                    type="text"
                    className="payment-input"
                    placeholder="10/28"
                    value={formData.expiry}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="payment-form-group">
                  <label className="payment-label" htmlFor="cvv">
                    CVV
                  </label>
                  <input
                    id="cvv"
                    name="cvv"
                    type="password"
                    className="payment-input"
                    placeholder="123"
                    value={formData.cvv}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="payment-form-group">
                <label className="payment-label" htmlFor="billingAddress">
                  Billing address
                </label>
                <textarea
                  id="billingAddress"
                  name="billingAddress"
                  className="payment-textarea"
                  rows="2"
                  placeholder="123 Main St, San Jose, CA"
                  value={formData.billingAddress}
                  onChange={handleChange}
                  required
                />
              </div>

              <button
                type="submit"
                className="payment-primary-btn"
                disabled={submitting}
              >
                {submitting ? 'Processing…' : 'Pay now'}
              </button>

              <p className="payment-note">
                You won&apos;t be charged until your booking is confirmed.
              </p>

              {submitError && (
                <p className="payment-note" style={{ color: '#b91c1c' }}>
                  {submitError}
                </p>
              )}
            </form>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PaymentPage;
