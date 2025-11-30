// src/pages/bookings/BookingSummaryPage.jsx
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './BookingSummaryPage.css';

/**
 * BookingSummaryPage
 *
 * UI-only step for this phase:
 *  - Shows a Kayak-style summary card
 *  - Supports flights / hotels / cars via location.state
 *  - Also supports AI chat booking via localStorage
 *
 * Navigation:
 *  navigate('/booking/summary', { state: { bookingType, listing } });
 */
const BookingSummaryPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const [bookingData, setBookingData] = useState(null);

  // Check for AI booking data in localStorage
  useEffect(() => {
    const aiBookingData = localStorage.getItem('aiBookingData');
    if (aiBookingData) {
      try {
        const parsed = JSON.parse(aiBookingData);
        setBookingData(parsed);
        // Clear after reading
        localStorage.removeItem('aiBookingData');
      } catch (e) {
        console.error('Failed to parse AI booking data:', e);
      }
    }
  }, []);

  const bookingType = location.state?.bookingType || (bookingData ? 'bundle' : null);
  const listing = location.state?.listing || null;
  const aiQuote = bookingData?.quote || null;

  // If user somehow opens the page directly without state and no AI data
  if (!bookingType && !aiQuote) {
    return (
      <div className="booking-summary-page">
        <div className="booking-summary-inner">
          <div className="booking-summary-card booking-summary-card--empty">
            <h1 className="booking-summary-title">No booking selected</h1>
            <p className="booking-summary-text">
              We couldn&apos;t find any booking details. Please start from the
              search page and select a flight, hotel, or car to book.
            </p>
            <button
              type="button"
              className="booking-summary-primary-btn"
              onClick={() => navigate('/')}
            >
              Back to search
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Handle AI booking data
  if (aiQuote) {
    // Parse the quote response to extract details
    const quoteText = aiQuote.response || '';
    
    // Extract title (first line after **)
    const titleMatch = quoteText.match(/\*\*Complete Quote: (.+?)\*\*/);
    const title = titleMatch ? titleMatch[1] : 'AI Travel Package';
    
    // Extract grand total
    const totalMatch = quoteText.match(/\*\*Grand Total: \$(\d+)\*\*/);
    const grandTotal = totalMatch ? parseInt(totalMatch[1]) : 0;
    
    // Extract flight info
    const flightMatch = quoteText.match(/\*\*Flight:\*\*[\s\S]*?Total: \$(\d+)/);
    const flightTotal = flightMatch ? parseInt(flightMatch[1]) : 0;
    
    // Extract hotel info
    const hotelMatch = quoteText.match(/\*\*Hotel:\*\*[\s\S]*?Total: \$(\d+)/);
    const hotelTotal = hotelMatch ? parseInt(hotelMatch[1]) : 0;

    const handleContinueToPayment = () => {
      navigate('/booking/payment', {
        state: {
          bookingType: 'bundle',
          listing: {
            name: title,
            totalPrice: grandTotal,
            flightPrice: flightTotal,
            hotelPrice: hotelTotal,
            source: 'ai-assistant'
          },
        },
      });
    };

    const handleBackToSearch = () => {
      navigate('/');
    };

    return (
      <div className="booking-summary-page">
        <div className="booking-summary-inner">
          <div className="booking-summary-card">
            <header className="booking-summary-header">
              <div>
                <div className="booking-summary-chip">AI Travel Package</div>
                <h1 className="booking-summary-title">Review your booking</h1>
                <p className="booking-summary-subtitle">
                  Package recommended by AI Travel Assistant
                </p>
              </div>
            </header>

            <div className="booking-summary-body">
              {/* Left: details */}
              <div className="booking-summary-details">
                <h2 className="booking-summary-item-title">{title}</h2>
                
                <div className="booking-summary-breakdown">
                  <div className="booking-summary-breakdown-item">
                    <span className="booking-summary-breakdown-label">✈️ Flight</span>
                    <span className="booking-summary-breakdown-value">${flightTotal} USD</span>
                  </div>
                  <div className="booking-summary-breakdown-item">
                    <span className="booking-summary-breakdown-label">🏨 Hotel</span>
                    <span className="booking-summary-breakdown-value">${hotelTotal} USD</span>
                  </div>
                </div>

                <div className="booking-summary-actions-secondary">
                  <button
                    type="button"
                    className="booking-summary-link-btn"
                    onClick={handleBackToSearch}
                  >
                    ← Back to search
                  </button>
                </div>
              </div>

              {/* Right: price + CTA */}
              <aside className="booking-summary-side">
                <div className="booking-summary-price-card">
                  <div className="booking-summary-price-row">
                    <span className="booking-summary-price-label">
                      Package total
                    </span>
                    <span className="booking-summary-price-value">
                      ${grandTotal} USD
                    </span>
                  </div>
                  <button
                    type="button"
                    className="booking-summary-primary-btn"
                    onClick={handleContinueToPayment}
                  >
                    Continue to payment
                  </button>
                  <p className="booking-summary-price-note">
                    You won&apos;t be charged until the booking is confirmed.
                  </p>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Original code for non-AI bookings ----------

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
    priceLabel = 'Daily price';
    priceValue =
      typeof price === 'number'
        ? `$${price.toFixed(0)} USD / day`
        : 'Price pending';
  }

  // 🔁 UPDATED: go to PaymentPage instead of showing alert
  const handleContinueToPayment = () => {
    navigate('/booking/payment', {
      state: {
        bookingType,
        listing,
      },
    });
  };

  const handleBackToSearch = () => {
    navigate('/');
  };

  return (
    <div className="booking-summary-page">
      <div className="booking-summary-inner">
        <div className="booking-summary-card">
          <header className="booking-summary-header">
            <div>
              <div className="booking-summary-chip">{typeLabel}</div>
              <h1 className="booking-summary-title">Review your booking</h1>
              <p className="booking-summary-subtitle">
                Check the details below before continuing to payment.
              </p>
            </div>
          </header>

          <div className="booking-summary-body">
            {/* Left: details */}
            <div className="booking-summary-details">
              <h2 className="booking-summary-item-title">{title}</h2>
              {subtitle && (
                <p className="booking-summary-item-subtitle">{subtitle}</p>
              )}

              {metaLines.length > 0 && (
                <ul className="booking-summary-meta-list">
                  {metaLines.map((line, idx) => (
                    <li key={idx} className="booking-summary-meta-item">
                      {line}
                    </li>
                  ))}
                </ul>
              )}

              <div className="booking-summary-actions-secondary">
                <button
                  type="button"
                  className="booking-summary-link-btn"
                  onClick={handleBackToSearch}
                >
                  ← Back to search
                </button>
              </div>
            </div>

            {/* Right: price + CTA */}
            <aside className="booking-summary-side">
              <div className="booking-summary-price-card">
                <div className="booking-summary-price-row">
                  <span className="booking-summary-price-label">
                    {priceLabel}
                  </span>
                  <span className="booking-summary-price-value">
                    {priceValue}
                  </span>
                </div>
                <button
                  type="button"
                  className="booking-summary-primary-btn"
                  onClick={handleContinueToPayment}
                >
                  Continue to payment
                </button>
                <p className="booking-summary-price-note">
                  You won&apos;t be charged until the booking is confirmed.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingSummaryPage;
