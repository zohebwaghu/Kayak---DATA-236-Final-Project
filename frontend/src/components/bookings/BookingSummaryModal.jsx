// src/components/BookingSummaryModal.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import './BookingSummaryModal.css';

const BookingSummaryModal = ({
  show,
  onClose,
  listingType = 'flight',
  listing,
  user,
}) => {
  const navigate = useNavigate();

  if (!show || !listing) return null;

  const isFlight = listingType === 'flight';

  const formatDateTime = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 🚀 FIXED: No parent onConfirm call, no alerts
  const handleContinueToPayment = () => {
    onClose?.(); // close the modal

    navigate('/booking/payment', {
      state: {
        bookingType: listingType,
        listing,
      },
    });
  };

  return (
    <div className="booking-modal-backdrop">
      <div className="booking-modal-container">
        <div className="booking-modal-header">
          <h5 className="booking-modal-title">
            {isFlight ? 'Review your flight booking' : 'Review your booking'}
          </h5>

          <button
            type="button"
            className="booking-modal-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="booking-modal-body">
          {/* Left: details */}
          <div className="booking-modal-section">
            <h6 className="booking-section-title">Trip details</h6>

            {isFlight && (
              <>
                <div className="booking-trip-row">
                  <span className="booking-label">Route</span>
                  <span className="booking-value">
                    {listing.origin} → {listing.destination}
                  </span>
                </div>

                <div className="booking-trip-row">
                  <span className="booking-label">Departure</span>
                  <span className="booking-value">
                    {formatDateTime(listing.departureTime)}
                  </span>
                </div>

                <div className="booking-trip-row">
                  <span className="booking-label">Airline</span>
                  <span className="booking-value">{listing.airline}</span>
                </div>

                <div className="booking-trip-row">
                  <span className="booking-label">Stops</span>
                  <span className="booking-value">
                    {listing.stops === 0
                      ? 'Non-stop'
                      : `${listing.stops} stop${listing.stops > 1 ? 's' : ''}`}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Right: traveler + price */}
          <div className="booking-modal-section">
            <h6 className="booking-section-title">Traveler & price</h6>

            <div className="booking-trip-row">
              <span className="booking-label">Traveler</span>
              <span className="booking-value">
                {user
                  ? `${user.firstName} ${user.lastName}`
                  : 'You will confirm after login'}
              </span>
            </div>

            <div className="booking-trip-row">
              <span className="booking-label">Price</span>
              <span className="booking-price">
                ${listing.price?.toFixed ? listing.price.toFixed(2) : listing.price}
              </span>
            </div>

            <p className="booking-note">
              No payment will be processed in this step. This is just a UI flow.
            </p>
          </div>
        </div>

        <div className="booking-modal-footer">
          <button
            type="button"
            className="btn btn-outline-secondary booking-btn-secondary"
            onClick={onClose}
          >
            Back
          </button>

          <button
            type="button"
            className="btn booking-btn-primary"
            onClick={handleContinueToPayment}
          >
            Continue to payment
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookingSummaryModal;
