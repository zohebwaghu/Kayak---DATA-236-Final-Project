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

  const bookingType =
    location.state?.bookingType || (bookingData ? 'bundle' : null);
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

  // ---------- AI BOOKING PATH (bundle from AI chat) ----------
  if (aiQuote) {
    // 1️⃣ Try to use structured data from bundles / quote object first
    const bundles =
      bookingData?.bundles ||
      aiQuote?.bundles ||
      (Array.isArray(bookingData?.quote?.bundles)
        ? bookingData.quote.bundles
        : []);

    let title = 'AI Travel Package';
    let flightTotal = 0;
    let hotelTotal = 0;
    let grandTotal = 0;
    let primaryBundle = null; // <-- keep reference so we can pull IDs later

    if (bundles && bundles.length > 0) {
      // Pick the first bundle as the selected one
      const primary = bundles[0];
      primaryBundle = primary;

      // Title
      title =
        primary.name ||
        primary.title ||
        primary.package_name ||
        'AI Travel Package';

      // Try to get total from bundle-level fields
      const bundleTotal =
        primary.total_price ??
        primary.totalPrice ??
        primary.packageTotal ??
        primary.grand_total ??
        null;

      if (typeof bundleTotal === 'number') {
        grandTotal = bundleTotal;
      }

      // Flight price from nested flight object or explicit field
      const flightPriceCandidate =
        primary.flight_total ??
        primary.flightTotal ??
        primary.flight?.total_price ??
        primary.flight?.totalPrice ??
        primary.flight?.price ??
        null;

      if (typeof flightPriceCandidate === 'number') {
        flightTotal = flightPriceCandidate;
      }

      // Hotel price from nested hotel object or explicit field
      const hotelPriceCandidate =
        primary.hotel_total ??
        primary.hotelTotal ??
        primary.hotel?.total_price ??
        primary.hotel?.totalPrice ??
        primary.hotel?.pricePerNight ??
        primary.hotel?.price ??
        null;

      if (typeof hotelPriceCandidate === 'number') {
        hotelTotal = hotelPriceCandidate;
      }

      // If bundle had no explicit grandTotal, derive it from parts
      if (!grandTotal && (flightTotal || hotelTotal)) {
        grandTotal = (flightTotal || 0) + (hotelTotal || 0);
      }
    }

    // 2️⃣ If still zero, fall back to parsing Markdown / text response
    if (!grandTotal || (!flightTotal && !hotelTotal)) {
      const quoteText = aiQuote.response || '';

      // Extract title (preferred: "Complete Quote: ...")
      const titleMatch = quoteText.match(/\*\*Complete Quote: (.+?)\*\*/);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1];
      } else {
        // Fallback: "**Quote Q-XXXX** Flight: ..."
        const quoteIdMatch = quoteText.match(/\*\*Quote\s+([^*]+)\*\*/i);
        if (quoteIdMatch && quoteIdMatch[1]) {
          title = `AI Package ${quoteIdMatch[1].trim()}`;
        }
      }

      // Extract grand total: "**Grand Total: $2830.03**"
      const totalMatch = quoteText.match(
        /\*\*Grand Total:\s*\$(\d+(\.\d+)?)\s*\*\*/,
      );
      if (totalMatch && totalMatch[1]) {
        grandTotal = parseFloat(totalMatch[1]);
      }

      // Extract flight info
      let flightMatch = quoteText.match(
        /\*\*Flight:\*\*[\s\S]*?Total:\s*\$(\d+(\.\d+)?)/,
      );
      if (flightMatch && flightMatch[1]) {
        flightTotal = parseFloat(flightMatch[1]);
      } else {
        // Fallback for: "Flight: $2409.00 + $289.08 taxes"
        const flightInlineMatch = quoteText.match(
          /Flight:\s*\$(\d+(\.\d+)?)(?:\s*\+\s*\$(\d+(\.\d+)?)\s*taxes)?/i,
        );
        if (flightInlineMatch && flightInlineMatch[1]) {
          const base = parseFloat(flightInlineMatch[1]);
          const tax = flightInlineMatch[3]
            ? parseFloat(flightInlineMatch[3])
            : 0;
          flightTotal = base + tax;
        }
      }

      // Extract hotel info
      let hotelMatch = quoteText.match(
        /\*\*Hotel:\*\*[\s\S]*?Total:\s*\$(\d+(\.\d+)?)/,
      );
      if (hotelMatch && hotelMatch[1]) {
        hotelTotal = parseFloat(hotelMatch[1]);
      } else {
        // Fallback for: "Hotel: $52.50 + $9.45 taxes"
        const hotelInlineMatch = quoteText.match(
          /Hotel:\s*\$(\d+(\.\d+)?)(?:\s*\+\s*\$(\d+(\.\d+)?)\s*taxes)?/i,
        );
        if (hotelInlineMatch && hotelInlineMatch[1]) {
          const base = parseFloat(hotelInlineMatch[1]);
          const tax = hotelInlineMatch[3]
            ? parseFloat(hotelInlineMatch[3])
            : 0;
          hotelTotal = base + tax;
        }
      }

      // If only grandTotal is known, split it roughly
      if (grandTotal && !flightTotal && !hotelTotal) {
        flightTotal = grandTotal / 2;
        hotelTotal = grandTotal / 2;
      } else if (grandTotal && flightTotal && !hotelTotal) {
        hotelTotal = Math.max(grandTotal - flightTotal, 0);
      } else if (grandTotal && !flightTotal && hotelTotal) {
        flightTotal = Math.max(grandTotal - hotelTotal, 0);
      }
    }

    // Final rounding
    const safeGrand = Math.max(0, Math.round(grandTotal || 0));
    const safeFlight = Math.max(0, Math.round(flightTotal || 0));
    const safeHotel = Math.max(0, Math.round(hotelTotal || 0));

    // 3️⃣ Build richer listing object (with listingId + primaryType) for PaymentPage
    const primaryFlight =
      primaryBundle?.flight ||
      primaryBundle?.flightOption ||
      primaryBundle?.flightListing ||
      null;

    const primaryHotel =
      primaryBundle?.hotel ||
      primaryBundle?.hotelOption ||
      primaryBundle?.hotelListing ||
      null;

    const listingForPayment = {
      name: title,
      totalPrice: safeGrand,
      flightPrice: safeFlight,
      hotelPrice: safeHotel,
      source: 'ai-assistant',

      // Hint for PaymentPage → booking-service mapping
      primaryType:
        primaryBundle?.primaryType ||
        (primaryFlight ? 'flight' : primaryHotel ? 'hotel' : 'flight'),

      // Try to use a REAL listing id from the bundle (flight first, then hotel).
      // Fallback to "ai-bundle" only if nothing is available.
      listingId:
        primaryBundle?.listingId ||
        primaryFlight?.id ||
        primaryFlight?.listingId ||
        primaryFlight?._id ||
        primaryHotel?.id ||
        primaryHotel?.listingId ||
        primaryHotel?._id ||
        'ai-bundle',

      // Optional date hints for PaymentPage when it builds start/end dates
      departureTime:
        primaryFlight?.departureTime ||
        primaryFlight?.departure ||
        primaryFlight?.startTime ||
        null,
      checkIn: primaryHotel?.checkIn || primaryHotel?.checkInDate || null,
      checkOut: primaryHotel?.checkOut || primaryHotel?.checkOutDate || null,
    };

    const handleContinueToPayment = () => {
      navigate('/booking/payment', {
        state: {
          bookingType: 'bundle',
          listing: listingForPayment,
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
                    <span className="booking-summary-breakdown-label">
                      ✈️ Flight
                    </span>
                    <span className="booking-summary-breakdown-value">
                      ${safeFlight} USD
                    </span>
                  </div>
                  <div className="booking-summary-breakdown-item">
                    <span className="booking-summary-breakdown-label">
                      🏨 Hotel
                    </span>
                    <span className="booking-summary-breakdown-value">
                      ${safeHotel} USD
                    </span>
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
                      ${safeGrand} USD
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
      typeof price === 'number'
        ? `$${price.toFixed(0)} USD`
        : 'Price pending';
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
