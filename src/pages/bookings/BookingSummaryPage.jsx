// src/pages/bookings/BookingSummaryPage.jsx
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './BookingSummaryPage.css';

const BookingSummaryPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [bookingData, setBookingData] = useState(null);

  useEffect(() => {
    const aiBookingData = localStorage.getItem('aiBookingData');
    if (aiBookingData) {
      try {
        const parsed = JSON.parse(aiBookingData);
        setBookingData(parsed);
        localStorage.removeItem('aiBookingData');
      } catch (e) {
        console.error('Failed to parse AI booking data:', e);
      }
    }
  }, []);

  const bookingType = location.state?.bookingType || (bookingData ? 'bundle' : null);
  const listing = location.state?.listing || null;
  const aiQuote = bookingData?.quote || null;

  if (!bookingType && !aiQuote) {
    return (
      <div className="kayak-summary-page">
        <div className="kayak-summary-hero">
          <div className="kayak-summary-hero-content">
            <h1 className="kayak-summary-title">Review your booking</h1>
          </div>
        </div>
        <div className="kayak-summary-container">
          <div className="kayak-summary-empty">
            <div className="kayak-summary-empty-icon">📋</div>
            <h2 className="kayak-summary-empty-title">No booking selected</h2>
            <p className="kayak-summary-empty-text">We couldn&apos;t find any booking details. Please start from the search page and select a flight, hotel, or car to book.</p>
            <button type="button" className="kayak-summary-empty-btn" onClick={() => navigate('/')}>Back to search</button>
          </div>
        </div>
      </div>
    );
  }

  // Handle AI booking data
  if (aiQuote) {
    const quoteText = aiQuote.response || '';
    const titleMatch = quoteText.match(/\*\*Complete Quote: (.+?)\*\*/);
    const title = titleMatch ? titleMatch[1] : 'AI Travel Package';
    const totalMatch = quoteText.match(/\*\*Grand Total: \$(\d+)\*\*/);
    const grandTotal = totalMatch ? parseInt(totalMatch[1]) : 0;
    const flightMatch = quoteText.match(/\*\*Flight:\*\*[\s\S]*?Total: \$(\d+)/);
    const flightTotal = flightMatch ? parseInt(flightMatch[1]) : 0;
    const hotelMatch = quoteText.match(/\*\*Hotel:\*\*[\s\S]*?Total: \$(\d+)/);
    const hotelTotal = hotelMatch ? parseInt(hotelMatch[1]) : 0;

    const handleContinueToPayment = () => {
      navigate('/booking/payment', {
        state: {
          bookingType: 'bundle',
          listing: { name: title, totalPrice: grandTotal, flightPrice: flightTotal, hotelPrice: hotelTotal, source: 'ai-assistant' },
        },
      });
    };

    return (
      <div className="kayak-summary-page">
        <div className="kayak-summary-hero">
          <div className="kayak-summary-hero-content">
            <div className="kayak-summary-hero-steps">
              <div className="kayak-summary-step completed">
                <span className="kayak-summary-step-num">1</span>
                <span>Select</span>
              </div>
              <div className="kayak-summary-step-divider"></div>
              <div className="kayak-summary-step active">
                <span className="kayak-summary-step-num">2</span>
                <span>Review</span>
              </div>
              <div className="kayak-summary-step-divider"></div>
              <div className="kayak-summary-step">
                <span className="kayak-summary-step-num">3</span>
                <span>Pay</span>
              </div>
            </div>
            <h1 className="kayak-summary-title">Review your booking</h1>
            <p className="kayak-summary-subtitle">Package recommended by AI Travel Assistant</p>
          </div>
        </div>

        <div className="kayak-summary-container">
          <div className="kayak-summary-layout">
            <div className="kayak-summary-details">
              <div className="kayak-summary-details-header">
                <span className="kayak-summary-type-badge bundle">🤖 AI Package</span>
                <h2 className="kayak-summary-trip-title">{title}</h2>
              </div>
              <div className="kayak-summary-details-body">
                <div className="kayak-summary-meta">
                  <div className="kayak-summary-meta-item">
                    <div className="kayak-summary-meta-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 16v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="8.5" cy="7" r="4"></circle>
                        <line x1="23" y1="11" x2="17" y2="11"></line>
                      </svg>
                    </div>
                    <span>Includes flight and hotel accommodations</span>
                  </div>
                </div>
                <button type="button" className="kayak-summary-back-link" onClick={() => navigate('/')}>← Back to search</button>
              </div>
            </div>

            <div className="kayak-summary-price-card">
              <div className="kayak-summary-price-header">
                <p className="kayak-summary-price-label">Package total</p>
                <p className="kayak-summary-price-value">${grandTotal} <span>USD</span></p>
              </div>
              <div className="kayak-summary-breakdown">
                <div className="kayak-summary-breakdown-item">
                  <span className="kayak-summary-breakdown-label">✈️ Flight</span>
                  <span className="kayak-summary-breakdown-value">${flightTotal} USD</span>
                </div>
                <div className="kayak-summary-breakdown-item">
                  <span className="kayak-summary-breakdown-label">🏨 Hotel</span>
                  <span className="kayak-summary-breakdown-value">${hotelTotal} USD</span>
                </div>
              </div>
              <button type="button" className="kayak-summary-continue-btn" onClick={handleContinueToPayment}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                  <line x1="1" y1="10" x2="23" y2="10"></line>
                </svg>
                Continue to payment
              </button>
              <p className="kayak-summary-price-note">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
                You won&apos;t be charged until booking is confirmed
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Regular booking (non-AI)
  const typeLabel = bookingType === 'flight' ? 'Flight' : bookingType === 'hotel' ? 'Hotel' : bookingType === 'car' ? 'Car' : 'Trip';
  const typeClass = bookingType?.toLowerCase() || '';

  let title = '';
  let subtitle = '';
  let metaLines = [];
  let priceLabel = '';
  let priceValue = '';
  let priceNumeric = 0;

  if (bookingType === 'flight') {
    const origin = listing.origin || 'Origin';
    const destination = listing.destination || 'Destination';
    title = `${origin} → ${destination}`;
    subtitle = listing.airline || 'Any airline';
    const departText = listing.departureTime ? new Date(listing.departureTime).toLocaleString() : null;
    const stopsText = typeof listing.stops === 'number' ? `${listing.stops} stop${listing.stops === 1 ? '' : 's'}` : null;
    metaLines = [stopsText, departText].filter(Boolean);
    const price = typeof listing.price === 'number' ? listing.price : listing.totalPrice ?? null;
    priceNumeric = typeof price === 'number' ? price : 0;
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
    priceNumeric = typeof price === 'number' ? price : 0;
    priceLabel = 'Per night';
    priceValue = typeof price === 'number' ? `$${price.toFixed(0)}` : 'Price pending';
  } else if (bookingType === 'car') {
    title = listing.carType || listing.type || 'Car';
    subtitle = listing.location || '';
    metaLines = [listing.company || listing.vendor || ''].filter(Boolean);
    const price = listing.pricePerDay ?? listing.dailyPrice ?? listing.price ?? null;
    priceNumeric = typeof price === 'number' ? price : 0;
    priceLabel = 'Per day';
    priceValue = typeof price === 'number' ? `$${price.toFixed(0)}` : 'Price pending';
  }

  const handleContinueToPayment = () => navigate('/booking/payment', { state: { bookingType, listing } });

  return (
    <div className="kayak-summary-page">
      <div className="kayak-summary-hero">
        <div className="kayak-summary-hero-content">
          <div className="kayak-summary-hero-steps">
            <div className="kayak-summary-step completed">
              <span className="kayak-summary-step-num">1</span>
              <span>Select</span>
            </div>
            <div className="kayak-summary-step-divider"></div>
            <div className="kayak-summary-step active">
              <span className="kayak-summary-step-num">2</span>
              <span>Review</span>
            </div>
            <div className="kayak-summary-step-divider"></div>
            <div className="kayak-summary-step">
              <span className="kayak-summary-step-num">3</span>
              <span>Pay</span>
            </div>
          </div>
          <h1 className="kayak-summary-title">Review your booking</h1>
          <p className="kayak-summary-subtitle">Check the details below before continuing to payment</p>
        </div>
      </div>

      <div className="kayak-summary-container">
        <div className="kayak-summary-layout">
          <div className="kayak-summary-details">
            <div className="kayak-summary-details-header">
              <span className={`kayak-summary-type-badge ${typeClass}`}>
                {typeClass === 'flight' && '✈️'}
                {typeClass === 'hotel' && '🏨'}
                {typeClass === 'car' && '🚗'}
                {typeLabel}
              </span>
              <h2 className="kayak-summary-trip-title">{title}</h2>
              {subtitle && <p className="kayak-summary-trip-subtitle">{subtitle}</p>}
            </div>
            <div className="kayak-summary-details-body">
              {metaLines.length > 0 && (
                <div className="kayak-summary-meta">
                  {metaLines.map((line, idx) => (
                    <div key={idx} className="kayak-summary-meta-item">
                      <div className="kayak-summary-meta-icon">
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
              <button type="button" className="kayak-summary-back-link" onClick={() => navigate('/')}>← Back to search</button>
            </div>
          </div>

          <div className="kayak-summary-price-card">
            <div className="kayak-summary-price-header">
              <p className="kayak-summary-price-label">{priceLabel}</p>
              <p className="kayak-summary-price-value">{priceValue} <span>USD</span></p>
            </div>
            <button type="button" className="kayak-summary-continue-btn" onClick={handleContinueToPayment}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                <line x1="1" y1="10" x2="23" y2="10"></line>
              </svg>
              Continue to payment
            </button>
            <p className="kayak-summary-price-note">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
              You won&apos;t be charged until booking is confirmed
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingSummaryPage;
