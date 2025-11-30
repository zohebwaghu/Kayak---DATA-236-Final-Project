// src/pages/bookings/MyBookingsPage.jsx
import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { selectUser } from '../../store/slices/authSlice';
import './MyBookingsPage.css';

/**
 * MyBookingsPage
 *
 * - Fetches the current user's bookings via API Gateway:
 *     GET /api/v1/bookings/user/:userId  (gateway → booking service)
 * - Supports time filters: All / Upcoming / Ongoing / Past
 * - Shows tabs for Flights / Hotels / Cars
 * - Each tab shows only that category of bookings
 * - Default tab when page opens: Flights + All trips
 */
const MyBookingsPage = () => {
  const user = useSelector(selectUser);

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('flight'); // 'flight' | 'hotel' | 'car'
  const [timeFilter, setTimeFilter] = useState('all'); // 'all' | 'upcoming' | 'ongoing' | 'past'

  const formatType = (t) =>
    t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : '';

  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const deriveTitleAndSubtitle = (booking) => {
    const type = booking.listingType?.toLowerCase();
    const snapshot = booking.additionalDetails?.listingSnapshot || {};

    if (type === 'flight') {
      const origin = snapshot.origin || 'Origin';
      const destination = snapshot.destination || 'Destination';
      const airline = snapshot.airline || 'Any airline';
      return {
        title: `${origin} → ${destination}`,
        subtitle: airline,
      };
    }

    if (type === 'hotel') {
      const name =
        snapshot.name ||
        snapshot.hotelName ||
        snapshot.propertyName ||
        'Hotel';
      const city = snapshot.city || snapshot.address?.city || '';
      return {
        title: name,
        subtitle: city,
      };
    }

    if (type === 'car') {
      const carType = snapshot.carType || snapshot.type || 'Car rental';
      const loc = snapshot.location || '';
      return {
        title: carType,
        subtitle: loc,
      };
    }

    return { title: 'Trip', subtitle: '' };
  };

  useEffect(() => {
    let cancelled = false;

    const loadBookings = async () => {
      try {
        setLoading(true);
        setError('');

        // Guard: if somehow no user in Redux
        if (!user || !user.userId) {
          setError('Please log in to view your trips.');
          return;
        }

        // Map local timeFilter to backend timeFrame
        const params = {};
        if (timeFilter !== 'all') {
          if (timeFilter === 'upcoming') {
            params.timeFrame = 'future';
          } else if (timeFilter === 'ongoing') {
            params.timeFrame = 'current';
          } else if (timeFilter === 'past') {
            params.timeFrame = 'past';
          }
        }

        // Full URL = http://localhost:3000/api/v1/bookings/user/:userId
        const res = await api.get(`/bookings/user/${user.userId}`, {
          params,
        });

        const raw = res.data;

        // booking-service returns: { userId, count, filters, bookings: [...] }
        const list = Array.isArray(raw?.bookings)
          ? raw.bookings
          : Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.data)
          ? raw.data
          : [];

        if (!cancelled) {
          setBookings(list);
        }
      } catch (err) {
        if (!cancelled) {
          const msg =
            err?.response?.data?.message ||
            err?.response?.data?.error ||
            'Failed to load your bookings. Please try again.';
          setError(msg);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadBookings();

    return () => {
      cancelled = true;
    };
  }, [user, timeFilter]);

  const greetingName = user
    ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
    : 'there';

  const hasAnyBookings = bookings.length > 0;

  const filteredBookings = bookings.filter((b) => {
    const type = (b.listingType || '').toLowerCase();
    return type === activeTab;
  });

  return (
    <div className="container py-4 mytrips-root">
      <h1 className="mb-2">My trips</h1>
      <p className="text-muted mb-4">Hi {greetingName}, your bookings</p>

      {/* Kayak-ish tabs: Flights / Hotels / Cars */}
      <div className="mytrips-tabs mb-3">
        <button
          type="button"
          className={`mytrips-tab-btn ${
            activeTab === 'flight' ? 'mytrips-tab-btn-active' : ''
          }`}
          onClick={() => setActiveTab('flight')}
        >
          Flights
        </button>
        <button
          type="button"
          className={`mytrips-tab-btn ${
            activeTab === 'hotel' ? 'mytrips-tab-btn-active' : ''
          }`}
          onClick={() => setActiveTab('hotel')}
        >
          Hotels
        </button>
        <button
          type="button"
          className={`mytrips-tab-btn ${
            activeTab === 'car' ? 'mytrips-tab-btn-active' : ''
          }`}
          onClick={() => setActiveTab('car')}
        >
          Cars
        </button>
      </div>

      {/* Time filter chips: All / Upcoming / Ongoing / Past */}
      <div className="mytrips-time-filters mb-4">
        <button
          type="button"
          className={`mytrips-time-chip ${
            timeFilter === 'all' ? 'mytrips-time-chip-active' : ''
          }`}
          onClick={() => setTimeFilter('all')}
        >
          All trips
        </button>
        <button
          type="button"
          className={`mytrips-time-chip ${
            timeFilter === 'upcoming' ? 'mytrips-time-chip-active' : ''
          }`}
          onClick={() => setTimeFilter('upcoming')}
        >
          Upcoming
        </button>
        <button
          type="button"
          className={`mytrips-time-chip ${
            timeFilter === 'ongoing' ? 'mytrips-time-chip-active' : ''
          }`}
          onClick={() => setTimeFilter('ongoing')}
        >
          Ongoing
        </button>
        <button
          type="button"
          className={`mytrips-time-chip ${
            timeFilter === 'past' ? 'mytrips-time-chip-active' : ''
          }`}
          onClick={() => setTimeFilter('past')}
        >
          Past trips
        </button>
      </div>

      {loading && <p className="text-muted">Loading your bookings…</p>}

      {!loading && error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {/* Global empty state: no bookings for this time filter */}
      {!loading && !error && !hasAnyBookings && (
        <>
          <p className="mb-3">
            You don&apos;t have any trips in this view yet. Once you book a
            flight, hotel, or car, it will show up here.
          </p>
          <Link to="/" className="mytrips-back-btn">
            Back to search
          </Link>
        </>
      )}

      {/* Category-specific empty state: some bookings exist (for this time filter) but not in this tab */}
      {!loading &&
        !error &&
        hasAnyBookings &&
        filteredBookings.length === 0 && (
          <>
            <p className="mb-3">
              You don&apos;t have any{' '}
              {activeTab === 'flight'
                ? 'flight'
                : activeTab === 'hotel'
                ? 'hotel'
                : 'car'}{' '}
              bookings yet in this view. Try another tab or make a new booking.
            </p>
            <Link to="/" className="mytrips-back-btn">
              Back to search
            </Link>
          </>
        )}

      {/* Cards for filtered bookings */}
      {!loading &&
        !error &&
        hasAnyBookings &&
        filteredBookings.length > 0 && (
          <>
            <p className="mb-3">
              Here&apos;s a summary of your trips for the selected filters.
            </p>

            <div className="row g-3">
              {filteredBookings.map((booking) => {
                const {
                  bookingId,
                  id,
                  startDate,
                  endDate,
                  listingType,
                  totalPrice,
                  status,
                } = booking;

                const { title, subtitle } = deriveTitleAndSubtitle(booking);

                return (
                  <div
                    key={bookingId || id}
                    className="col-12 col-md-6 col-lg-4"
                  >
                    <div className="card h-100 shadow-sm border-0">
                      <div className="card-body d-flex flex-column">
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <span className="badge bg-light text-dark border">
                            {formatType(listingType) || 'Trip'}
                          </span>
                          {status && (
                            <span className="badge bg-secondary">
                              {status}
                            </span>
                          )}
                        </div>

                        <h5 className="card-title mb-1">{title}</h5>
                        {subtitle && (
                          <p className="card-subtitle text-muted mb-2">
                            {subtitle}
                          </p>
                        )}

                        <p className="mb-1">
                          <strong>Dates:</strong>{' '}
                          {formatDate(startDate)} – {formatDate(endDate)}
                        </p>

                        <p className="mb-2">
                          <strong>Total:</strong>{' '}
                          {typeof totalPrice === 'number'
                            ? `$${totalPrice.toFixed(0)} USD`
                            : 'N/A'}
                        </p>

                        <p className="text-muted small mt-auto">
                          Booking ID: {bookingId || id || 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4">
              <Link to="/" className="mytrips-back-btn">
                Back to search
              </Link>
            </div>
          </>
        )}
    </div>
  );
};

export default MyBookingsPage;
