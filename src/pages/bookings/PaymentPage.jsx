// src/pages/bookings/PaymentPage.jsx
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import api from '../../api/axios';
import { selectUser } from '../../store/slices/authSlice';
import './PaymentPage.css';

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

  useEffect(() => {
    if (!userId) return;

    const prefillFromLocalStorage = () => {
      if (!paymentStorageKey) return null;
      try {
        const raw = localStorage.getItem(paymentStorageKey);
        if (!raw) return null;
        const stored = JSON.parse(raw);
        let expiry = '';
        if (stored.expiryMonth && stored.expiryYear) {
          const mm = String(stored.expiryMonth).padStart(2, '0');
          const yy = String(stored.expiryYear).slice(-2);
          expiry = `${mm}/${yy}`;
        }
        let billingAddress = '';
        const profileAddress = user?.address || {};
        if (stored.sameAsProfile) {
          const parts = [profileAddress.street || profileAddress.line1, profileAddress.city, profileAddress.state, profileAddress.zipCode].filter(Boolean);
          billingAddress = parts.join(', ');
        } else {
          const parts = [stored.billingStreet, stored.billingCity, stored.billingState, stored.billingZip].filter(Boolean);
          billingAddress = parts.join(', ');
        }
        return { nameOnCard: stored.cardholderName || '', cardNumber: stored.last4 ? `**** **** **** ${stored.last4}` : '', expiry, cvv: '', billingAddress };
      } catch { return null; }
    };

    const prefillFromBackend = async () => {
      try {
        const res = await api.get(`/users/${userId}/payment-methods`);
        const methods = Array.isArray(res.data) ? res.data : [];
        if (!methods.length) return;
        const primary = methods.find((m) => m.isDefault) || methods[0];
        let expiry = '';
        if (primary.expiryMonth && primary.expiryYear) {
          const mm = String(primary.expiryMonth).padStart(2, '0');
          const yy = String(primary.expiryYear).slice(-2);
          expiry = `${mm}/${yy}`;
        }
        let billingAddress = '';
        const addr = user?.address || {};
        const parts = [addr.street || addr.line1, addr.city, addr.state, addr.zipCode].filter(Boolean);
        if (parts.length > 0) billingAddress = parts.join(', ');
        setFormData((prev) => ({ ...prev, nameOnCard: primary.cardHolderName || '', cardNumber: primary.lastFour ? `**** **** **** ${primary.lastFour}` : '', expiry, cvv: '', billingAddress }));
      } catch (err) { console.error('Failed to prefill payment method:', err?.response?.status, err?.response?.data || err?.message); }
    };

    const localPrefill = prefillFromLocalStorage();
    if (localPrefill) { setFormData((prev) => ({ ...prev, ...localPrefill })); return; }
    prefillFromBackend();
  }, [userId, paymentStorageKey, user]);

  if (!bookingType || !listing) {
    return (
      <div className="kayak-payment-page">
        <div className="kayak-payment-hero">
          <div className="kayak-payment-hero-content">
            <h1 className="kayak-payment-title">Complete your booking</h1>
          </div>
        </div>
        <div className="kayak-payment-container">
          <div className="kayak-payment-empty">
            <div className="kayak-payment-empty-icon">💳</div>
            <h2 className="kayak-payment-empty-title">No booking to pay for</h2>
            <p className="kayak-payment-empty-text">We couldn&apos;t find any booking details. Please go back and select a trip to book.</p>
            <button type="button" className="kayak-payment-empty-btn" onClick={() => navigate('/')}>Back to search</button>
          </div>
        </div>
      </div>
    );
  }

  const typeLabel = bookingType === 'flight' ? 'Flight' : bookingType === 'hotel' ? 'Hotel' : bookingType === 'car' ? 'Car' : 'Trip';
  const typeClass = bookingType?.toLowerCase() || '';

  let title = '';
  let subtitle = '';
  let metaLines = [];
  let priceLabel = '';
  let priceValue = '';
  let priceNumeric = null;

  if (bookingType === 'flight') {
    const origin = listing.origin || 'Origin';
    const destination = listing.destination || 'Destination';
    title = `${origin} → ${destination}`;
    subtitle = listing.airline || 'Any airline';
    const departText = listing.departureTime ? new Date(listing.departureTime).toLocaleString() : null;
    const stopsText = typeof listing.stops === 'number' ? `${listing.stops} stop${listing.stops === 1 ? '' : 's'}` : null;
    metaLines = [stopsText, departText].filter(Boolean);
    const price = typeof listing.price === 'number' ? listing.price : listing.totalPrice ?? null;
    priceNumeric = typeof price === 'number' ? price : null;
    priceLabel = 'Trip total';
    priceValue = typeof price === 'number' ? `$${price.toFixed(0)}` : 'Price pending';
  } else if (bookingType === 'hotel') {
    const name = listing.name || listing.hotelName || listing.propertyName || 'Hotel property';
    const star = listing.starRating ?? listing.stars ?? listing.rating ?? null;
    title = star ? `${name} · ${star}★` : name;
    subtitle = listing.city || '';
    let amenitiesText = '';
    if (Array.isArray(listing.amenities)) amenitiesText = listing.amenities.slice(0, 3).join(', ');
    else if (typeof listing.amenities === 'string') amenitiesText = listing.amenities;
    metaLines = [amenitiesText].filter(Boolean);
    const price = listing.pricePerNight ?? listing.price ?? listing.samplePrice ?? listing.totalPrice ?? null;
    priceNumeric = typeof price === 'number' ? price : null;
    priceLabel = 'Per night';
    priceValue = typeof price === 'number' ? `$${price.toFixed(0)}` : 'Price pending';
  } else if (bookingType === 'car') {
    title = listing.carType || listing.type || 'Car';
    subtitle = listing.location || '';
    metaLines = [listing.company || listing.vendor || ''].filter(Boolean);
    const price = listing.pricePerDay ?? listing.dailyPrice ?? listing.price ?? null;
    priceNumeric = typeof price === 'number' ? price : null;
    priceLabel = 'Per day';
    priceValue = typeof price === 'number' ? `$${price.toFixed(0)}` : 'Price pending';
  }

  const handleChange = (e) => { setSubmitError(''); setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value })); };
  const toISODate = (d) => d.toISOString().slice(0, 10);
  const getFallbackRange = () => { const start = new Date(); start.setDate(start.getDate() + 7); const end = new Date(start); end.setDate(end.getDate() + 3); return { startDate: toISODate(start), endDate: toISODate(end) }; };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitError('');
    setSubmitting(true);
    try {
      if (!user || !user.userId) { setSubmitError('Your session has expired. Please log in again.'); navigate('/login'); return; }
      const listingId = listing.listingId || listing.id || listing._id || listing.hotelId || listing.carId || listing.flightId || '';
      let startDateStr = '';
      let endDateStr = '';
      if (bookingType === 'flight' && listing.departureTime) {
        const dep = new Date(listing.departureTime);
        if (!Number.isNaN(dep.getTime())) { startDateStr = toISODate(dep); const end = new Date(dep); end.setDate(end.getDate() + 1); endDateStr = toISODate(end); }
      } else if (bookingType === 'hotel' && listing.checkIn && listing.checkOut) {
        const checkIn = new Date(listing.checkIn);
        const checkOut = new Date(listing.checkOut);
        if (!Number.isNaN(checkIn.getTime()) && !Number.isNaN(checkOut.getTime())) { startDateStr = toISODate(checkIn); endDateStr = toISODate(checkOut); }
      } else if (bookingType === 'car' && listing.pickupDate && listing.dropoffDate) {
        const pickup = new Date(listing.pickupDate);
        const dropoff = new Date(listing.dropoffDate);
        if (!Number.isNaN(pickup.getTime()) && !Number.isNaN(dropoff.getTime())) { startDateStr = toISODate(pickup); endDateStr = toISODate(dropoff); }
      }
      if (!startDateStr || !endDateStr) { const fallback = getFallbackRange(); startDateStr = fallback.startDate; endDateStr = fallback.endDate; }
      const guests = listing.guests || listing.numGuests || listing.adults || listing.passengers || 1;
      const totalPrice = typeof priceNumeric === 'number' && priceNumeric > 0 ? priceNumeric : 1;
      const payload = { userId: user.userId, listingType: bookingType.toLowerCase(), listingId, startDate: startDateStr, endDate: endDateStr, guests, totalPrice, additionalDetails: { listingSnapshot: listing, payment: { nameOnCard: formData.nameOnCard, last4: formData.cardNumber.slice(-4), billingAddress: formData.billingAddress } } };
      const bookingResponse = await api.post('/bookings', payload);
      const createdBookingId = bookingResponse?.data?.bookingId || null;
      try {
        const digitsOnlyCardForBilling = (formData.cardNumber || '').replace(/\D/g, '');
        const last4ForBilling = digitsOnlyCardForBilling.slice(-4) || '';
        let cardTypeForBilling = 'Card';
        if (/^4/.test(digitsOnlyCardForBilling)) cardTypeForBilling = 'Visa';
        else if (/^5[1-5]/.test(digitsOnlyCardForBilling)) cardTypeForBilling = 'Mastercard';
        else if (/^3[47]/.test(digitsOnlyCardForBilling)) cardTypeForBilling = 'Amex';
        if (createdBookingId) await api.post('/billing/charge', { bookingId: createdBookingId, userId: user.userId, paymentMethod: 'credit_card', cardType: cardTypeForBilling, cardLast4: last4ForBilling || undefined });
      } catch (billingErr) { console.error('Failed to create billing records:', billingErr?.response?.status, billingErr?.response?.data || billingErr?.message); }
      try {
        const digitsOnlyCard = (formData.cardNumber || '').replace(/\D/g, '');
        if (digitsOnlyCard.length >= 13) {
          let cardType = 'card';
          if (/^4/.test(digitsOnlyCard)) cardType = 'visa';
          else if (/^5[1-5]/.test(digitsOnlyCard)) cardType = 'mastercard';
          else if (/^3[47]/.test(digitsOnlyCard)) cardType = 'amex';
          let expiryMonth = '';
          let expiryYear = '';
          if (formData.expiry) { const parts = formData.expiry.split('/'); if (parts.length >= 1) expiryMonth = parts[0].trim(); if (parts.length >= 2) { expiryYear = parts[1].trim(); if (expiryYear.length === 2) expiryYear = `20${expiryYear}`; } }
          await api.post(`/users/${user.userId}/payment-methods`, { cardType, cardNumber: digitsOnlyCard, expiryMonth, expiryYear, cardHolderName: formData.nameOnCard, isDefault: true });
        }
      } catch (saveErr) { console.error('Failed to save payment method:', saveErr?.response?.status, saveErr?.response?.data || saveErr?.message); }
      navigate('/my-bookings');
    } catch (err) { setSubmitError(err?.response?.data?.message || err?.response?.data?.error || 'Payment or booking failed. Please try again.'); }
    finally { setSubmitting(false); }
  };

  const handleBackToSummary = () => navigate('/booking/summary', { state: { bookingType, listing } });

  return (
    <div className="kayak-payment-page">
      {/* Hero Header */}
      <div className="kayak-payment-hero">
        <div className="kayak-payment-hero-content">
          <div className="kayak-payment-hero-steps">
            <div className="kayak-payment-step completed">
              <span className="kayak-payment-step-num">1</span>
              <span>Select</span>
            </div>
            <div className="kayak-payment-step-divider"></div>
            <div className="kayak-payment-step completed">
              <span className="kayak-payment-step-num">2</span>
              <span>Review</span>
            </div>
            <div className="kayak-payment-step-divider"></div>
            <div className="kayak-payment-step active">
              <span className="kayak-payment-step-num">3</span>
              <span>Pay</span>
            </div>
          </div>
          <h1 className="kayak-payment-title">Complete your booking</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="kayak-payment-container">
        <div className="kayak-payment-layout">
          {/* Left: Booking Summary */}
          <div className="kayak-payment-summary">
            <div className="kayak-payment-summary-header">
              <span className={`kayak-payment-type-badge ${typeClass}`}>
                {typeClass === 'flight' && '✈️'}
                {typeClass === 'hotel' && '🏨'}
                {typeClass === 'car' && '🚗'}
                {typeLabel}
              </span>
              <h2 className="kayak-payment-trip-title">{title}</h2>
              {subtitle && <p className="kayak-payment-trip-subtitle">{subtitle}</p>}
            </div>

            <div className="kayak-payment-summary-body">
              {metaLines.length > 0 && (
                <div className="kayak-payment-meta">
                  {metaLines.map((line, idx) => (
                    <div key={idx} className="kayak-payment-meta-item">
                      <div className="kayak-payment-meta-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                      </div>
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="kayak-payment-price-row">
                <span className="kayak-payment-price-label">{priceLabel}</span>
                <span className="kayak-payment-price-value">{priceValue} <span>USD</span></span>
              </div>

              <button type="button" className="kayak-payment-back-link" onClick={handleBackToSummary}>
                ← Back to summary
              </button>
            </div>
          </div>

          {/* Right: Payment Form */}
          <div className="kayak-payment-form-card">
            <div className="kayak-payment-form-header">
              <div className="kayak-payment-lock-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </div>
              <div className="kayak-payment-form-header-text">
                <h2>Secure payment</h2>
                <p>Your payment info is encrypted</p>
              </div>
            </div>

            <div className="kayak-payment-form-body">
              {submitError && (
                <div className="kayak-payment-error">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <span>{submitError}</span>
                </div>
              )}

              <div className="kayak-card-icons">
                <div className="kayak-card-icon">VISA</div>
                <div className="kayak-card-icon">MC</div>
                <div className="kayak-card-icon">AMEX</div>
              </div>

              <form onSubmit={handleSubmit} className="kayak-payment-form">
                <div className="kayak-payment-field">
                  <label className="kayak-payment-label" htmlFor="nameOnCard">Name on card</label>
                  <input id="nameOnCard" name="nameOnCard" type="text" className="kayak-payment-input" placeholder="Akshit Tyagi" value={formData.nameOnCard} onChange={handleChange} required />
                </div>

                <div className="kayak-payment-field">
                  <label className="kayak-payment-label" htmlFor="cardNumber">Card number</label>
                  <input id="cardNumber" name="cardNumber" type="text" className="kayak-payment-input" placeholder="1234 5678 9012 3456" value={formData.cardNumber} onChange={handleChange} required />
                </div>

                <div className="kayak-payment-row">
                  <div className="kayak-payment-field">
                    <label className="kayak-payment-label" htmlFor="expiry">Expiry (MM/YY)</label>
                    <input id="expiry" name="expiry" type="text" className="kayak-payment-input" placeholder="10/28" value={formData.expiry} onChange={handleChange} required />
                  </div>
                  <div className="kayak-payment-field">
                    <label className="kayak-payment-label" htmlFor="cvv">CVV</label>
                    <input id="cvv" name="cvv" type="password" className="kayak-payment-input" placeholder="123" value={formData.cvv} onChange={handleChange} required />
                  </div>
                </div>

                <div className="kayak-payment-field">
                  <label className="kayak-payment-label" htmlFor="billingAddress">Billing address</label>
                  <textarea id="billingAddress" name="billingAddress" className="kayak-payment-textarea" rows="2" placeholder="123 Main St, San Jose, CA" value={formData.billingAddress} onChange={handleChange} required />
                </div>

                <button type="submit" className="kayak-payment-submit" disabled={submitting}>
                  {submitting ? (
                    <>Processing...</>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                        <line x1="1" y1="10" x2="23" y2="10"></line>
                      </svg>
                      Pay now
                    </>
                  )}
                </button>

                <p className="kayak-payment-secure-note">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                  You won&apos;t be charged until your booking is confirmed
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentPage;
