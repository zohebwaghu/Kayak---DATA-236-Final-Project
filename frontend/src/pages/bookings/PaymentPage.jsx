// src/pages/bookings/PaymentPage.jsx
import React, { useState, useEffect } from 'react';
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

  const userId = user?.userId;
  const paymentStorageKey = userId ? `kayak_payment_${userId}` : null;

  // ========= PREFILL PAYMENT FORM FROM LOCALSTORAGE / BACKEND =========
  useEffect(() => {
    if (!userId) return;

    const prefillFromLocalStorage = () => {
      if (!paymentStorageKey) return null;

      try {
        const raw = localStorage.getItem(paymentStorageKey);
        if (!raw) return null;

        const stored = JSON.parse(raw);

        // Build expiry as MM/YY from stored expiryMonth/expiryYear
        let expiry = '';
        if (stored.expiryMonth && stored.expiryYear) {
          const mm = String(stored.expiryMonth).padStart(2, '0');
          const yy = String(stored.expiryYear).slice(-2);
          expiry = `${mm}/${yy}`;
        }

        // Build billing address
        let billingAddress = '';
        const profileAddress = user?.address || {};
        if (stored.sameAsProfile) {
          const parts = [
            profileAddress.street || profileAddress.line1,
            profileAddress.city,
            profileAddress.state,
            profileAddress.zipCode,
          ].filter(Boolean);
          billingAddress = parts.join(', ');
        } else {
          const parts = [
            stored.billingStreet,
            stored.billingCity,
            stored.billingState,
            stored.billingZip,
          ].filter(Boolean);
          billingAddress = parts.join(', ');
        }

        const prefill = {
          nameOnCard: stored.cardholderName || '',
          // We only know last4, so mask the number – this is enough for the UI
          cardNumber: stored.last4
            ? `**** **** **** ${stored.last4}`
            : '',
          expiry,
          cvv: '',
          billingAddress,
        };

        return prefill;
      } catch {
        return null;
      }
    };

    const prefillFromBackend = async () => {
      try {
        const res = await api.get(`/users/${userId}/payment-methods`);
        const methods = Array.isArray(res.data) ? res.data : [];
        if (!methods.length) return;

        const primary =
          methods.find((m) => m.isDefault) || methods[0];

        // expiryMonth / expiryYear from backend
        let expiry = '';
        if (primary.expiryMonth && primary.expiryYear) {
          const mm = String(primary.expiryMonth).padStart(2, '0');
          const yy = String(primary.expiryYear).slice(-2);
          expiry = `${mm}/${yy}`;
        }

        // Build a best-effort billing address from profile, if available
        let billingAddress = '';
        const addr = user?.address || {};
        const parts = [
          addr.street || addr.line1,
          addr.city,
          addr.state,
          addr.zipCode,
        ].filter(Boolean);
        if (parts.length > 0) {
          billingAddress = parts.join(', ');
        }

        const fromServer = {
          nameOnCard: primary.cardHolderName || '',
          cardNumber: primary.lastFour
            ? `**** **** **** ${primary.lastFour}`
            : '',
          expiry,
          cvv: '',
          billingAddress,
        };

        setFormData((prev) => ({
          ...prev,
          ...fromServer,
        }));
      } catch (err) {
        console.error(
          'Failed to prefill payment method:',
          err?.response?.status,
          err?.response?.data || err?.message
        );
      }
    };

    // 1) Try localStorage (keeps behaviour consistent with ProfilePage)
    const localPrefill = prefillFromLocalStorage();
    if (localPrefill) {
      setFormData((prev) => ({
        ...prev,
        ...localPrefill,
      }));
      return;
    }

    // 2) Fallback to backend /payment-methods table
    prefillFromBackend();
  }, [userId, paymentStorageKey, user]);

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
        listingType: bookingType.toLowerCase(), // ✅ matches booking-service expectations
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

      // 1) Create booking (existing behaviour)
      await api.post('/bookings', payload);

      // 2) Best-effort: save payment method to user-service
      try {
        const digitsOnlyCard = (formData.cardNumber || '').replace(/\D/g, '');

        if (digitsOnlyCard.length >= 13) {
          // Simple card type inference (not critical for UI)
          let cardType = 'card';
          if (/^4/.test(digitsOnlyCard)) {
            cardType = 'visa';
          } else if (/^5[1-5]/.test(digitsOnlyCard)) {
            cardType = 'mastercard';
          } else if (/^3[47]/.test(digitsOnlyCard)) {
            cardType = 'amex';
          }

          let expiryMonth = '';
          let expiryYear = '';
          if (formData.expiry) {
            const parts = formData.expiry.split('/');
            if (parts.length >= 1) {
              expiryMonth = parts[0].trim();
            }
            if (parts.length >= 2) {
              expiryYear = parts[1].trim();
              if (expiryYear.length === 2) {
                expiryYear = `20${expiryYear}`;
              }
            }
          }

          await api.post(`/users/${user.userId}/payment-methods`, {
            cardType,
            cardNumber: digitsOnlyCard,
            expiryMonth,
            expiryYear,
            cardHolderName: formData.nameOnCard,
            isDefault: true,
          });
        }
      } catch (saveErr) {
        console.error(
          'Failed to save payment method:',
          saveErr?.response?.status,
          saveErr?.response?.data || saveErr?.message
        );
        // Intentionally do not surface this to the user –
        // booking should still look successful.
      }

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
