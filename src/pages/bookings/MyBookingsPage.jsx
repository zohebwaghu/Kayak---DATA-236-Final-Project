// src/pages/bookings/MyBookingsPage.jsx
import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { selectUser } from '../../store/slices/authSlice';
import './MyBookingsPage.css';

const MyBookingsPage = () => {
  const user = useSelector(selectUser);

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('flight');
  const [timeFilter, setTimeFilter] = useState('all');

  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState('');
  const [selectedBookingInvoices, setSelectedBookingInvoices] = useState(null);

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

  const formatDateTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const deriveTitleAndSubtitle = (booking) => {
    const type = booking.listingType?.toLowerCase();
    const snapshot = booking.additionalDetails?.listingSnapshot || {};

    if (type === 'flight') {
      const origin = snapshot.origin || 'Origin';
      const destination = snapshot.destination || 'Destination';
      const airline = snapshot.airline || 'Any airline';
      return { title: `${origin} → ${destination}`, subtitle: airline };
    }

    if (type === 'hotel') {
      const name = snapshot.name || snapshot.hotelName || snapshot.propertyName || 'Hotel';
      const city = snapshot.city || snapshot.address?.city || '';
      return { title: name, subtitle: city };
    }

    if (type === 'car') {
      const carType = snapshot.carType || snapshot.type || 'Car rental';
      const loc = snapshot.location || '';
      return { title: carType, subtitle: loc };
    }

    return { title: 'Trip', subtitle: '' };
  };

  useEffect(() => {
    let cancelled = false;

    const loadBookings = async () => {
      try {
        setLoading(true);
        setError('');

        if (!user || !user.userId) {
          setError('Please log in to view your trips.');
          return;
        }

        const params = {};
        if (timeFilter !== 'all') {
          if (timeFilter === 'upcoming') params.timeFrame = 'future';
          else if (timeFilter === 'ongoing') params.timeFrame = 'current';
          else if (timeFilter === 'past') params.timeFrame = 'past';
        }

        const res = await api.get(`/bookings/user/${user.userId}`, { params });
        const raw = res.data;

        const list = Array.isArray(raw?.bookings)
          ? raw.bookings
          : Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.data)
          ? raw.data
          : [];

        if (!cancelled) setBookings(list);
      } catch (err) {
        if (!cancelled) {
          const msg =
            err?.response?.data?.message ||
            err?.response?.data?.error ||
            'Failed to load your bookings. Please try again.';
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadBookings();
    return () => { cancelled = true; };
  }, [user, timeFilter]);

  const greetingName = user
    ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
    : 'there';

  const hasAnyBookings = bookings.length > 0;
  const filteredBookings = bookings.filter((b) => (b.listingType || '').toLowerCase() === activeTab);

  const handleViewReceipt = async (booking) => {
    if (!user || !user.userId) return;

    const bookingKey = booking.bookingId || booking.id;
    if (!bookingKey) {
      setBillingError('Missing booking ID for this trip.');
      setSelectedBookingInvoices({ booking, invoices: [] });
      setShowInvoiceModal(true);
      return;
    }

    setBillingLoading(true);
    setBillingError('');
    setShowInvoiceModal(true);

    try {
      const res = await api.get(`/billing/users/${user.userId}/invoices`);
      const raw = res.data;
      const allInvoices = Array.isArray(raw?.invoices) ? raw.invoices : Array.isArray(raw) ? raw : [];
      const invoicesForBooking = allInvoices.filter((inv) => inv.bookingId === bookingKey);
      setSelectedBookingInvoices({ booking, invoices: invoicesForBooking });
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || 'Failed to load invoice for this booking.';
      setBillingError(msg);
      setSelectedBookingInvoices({ booking, invoices: [] });
    } finally {
      setBillingLoading(false);
    }
  };

  const closeInvoiceModal = () => {
    setShowInvoiceModal(false);
    setBillingError('');
    setSelectedBookingInvoices(null);
  };

  const getStatusClass = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'confirmed' || s === 'completed') return 'confirmed';
    if (s === 'pending') return 'pending';
    if (s === 'cancelled') return 'cancelled';
    return '';
  };

  const getEmptyIcon = () => {
    if (activeTab === 'flight') return '✈️';
    if (activeTab === 'hotel') return '🏨';
    return '🚗';
  };

  const getCategoryLabel = () => {
    if (activeTab === 'flight') return 'flight';
    if (activeTab === 'hotel') return 'hotel';
    return 'car';
  };

  return (
    <div className="kayak-trips-page">
      {/* Hero Header */}
      <div className="kayak-trips-hero">
        <div className="kayak-trips-hero-content">
          <p className="kayak-trips-greeting">Welcome back, {greetingName}</p>
          <h1 className="kayak-trips-title">My Trips</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="kayak-trips-container">
        {/* Category Tabs */}
        <div className="kayak-trips-tabs">
          <button
            type="button"
            className={`kayak-trips-tab ${activeTab === 'flight' ? 'active' : ''}`}
            onClick={() => setActiveTab('flight')}
          >
            <span className="kayak-trips-tab-icon">✈️</span>
            <span>Flights</span>
          </button>
          <button
            type="button"
            className={`kayak-trips-tab ${activeTab === 'hotel' ? 'active' : ''}`}
            onClick={() => setActiveTab('hotel')}
          >
            <span className="kayak-trips-tab-icon">🏨</span>
            <span>Hotels</span>
          </button>
          <button
            type="button"
            className={`kayak-trips-tab ${activeTab === 'car' ? 'active' : ''}`}
            onClick={() => setActiveTab('car')}
          >
            <span className="kayak-trips-tab-icon">🚗</span>
            <span>Cars</span>
          </button>
        </div>

        {/* Time Filters */}
        <div className="kayak-trips-filters">
          <button
            type="button"
            className={`kayak-trips-filter ${timeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setTimeFilter('all')}
          >
            All trips
          </button>
          <button
            type="button"
            className={`kayak-trips-filter ${timeFilter === 'upcoming' ? 'active' : ''}`}
            onClick={() => setTimeFilter('upcoming')}
          >
            Upcoming
          </button>
          <button
            type="button"
            className={`kayak-trips-filter ${timeFilter === 'ongoing' ? 'active' : ''}`}
            onClick={() => setTimeFilter('ongoing')}
          >
            Ongoing
          </button>
          <button
            type="button"
            className={`kayak-trips-filter ${timeFilter === 'past' ? 'active' : ''}`}
            onClick={() => setTimeFilter('past')}
          >
            Past trips
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="kayak-trips-loading">
            <div className="kayak-trips-spinner"></div>
            <p className="kayak-trips-loading-text">Loading your trips...</p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="kayak-trips-error">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Empty State - No bookings at all */}
        {!loading && !error && !hasAnyBookings && (
          <div className="kayak-trips-empty">
            <div className="kayak-trips-empty-icon">{getEmptyIcon()}</div>
            <h2 className="kayak-trips-empty-title">No trips yet</h2>
            <p className="kayak-trips-empty-text">
              Once you book a flight, hotel, or car rental, your trips will appear here.
            </p>
            <Link to="/" className="kayak-trips-search-btn">
              Start searching
            </Link>
          </div>
        )}

        {/* Empty State - Has bookings but none in this category */}
        {!loading && !error && hasAnyBookings && filteredBookings.length === 0 && (
          <div className="kayak-trips-empty">
            <div className="kayak-trips-empty-icon">{getEmptyIcon()}</div>
            <h2 className="kayak-trips-empty-title">No {getCategoryLabel()} bookings</h2>
            <p className="kayak-trips-empty-text">
              You don't have any {getCategoryLabel()} bookings yet. Try another category or make a new booking.
            </p>
            <Link to="/" className="kayak-trips-search-btn">
              Search {getCategoryLabel()}s
            </Link>
          </div>
        )}

        {/* Booking Cards */}
        {!loading && !error && hasAnyBookings && filteredBookings.length > 0 && (
          <div className="kayak-trips-grid">
            {filteredBookings.map((booking) => {
              const { bookingId, id, startDate, endDate, listingType, totalPrice, status } = booking;
              const { title, subtitle } = deriveTitleAndSubtitle(booking);
              const typeClass = (listingType || '').toLowerCase();

              return (
                <div key={bookingId || id} className="kayak-trip-card">
                  <div className="kayak-trip-card-header">
                    <span className={`kayak-trip-type-badge ${typeClass}`}>
                      {typeClass === 'flight' && '✈️'}
                      {typeClass === 'hotel' && '🏨'}
                      {typeClass === 'car' && '🚗'}
                      {listingType || 'Trip'}
                    </span>
                    {status && (
                      <span className={`kayak-trip-status ${getStatusClass(status)}`}>
                        {status}
                      </span>
                    )}
                  </div>

                  <div className="kayak-trip-card-body">
                    <h3 className="kayak-trip-title">{title}</h3>
                    {subtitle && <p className="kayak-trip-subtitle">{subtitle}</p>}

                    <div className="kayak-trip-details">
                      <div className="kayak-trip-detail">
                        <div className="kayak-trip-detail-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                          </svg>
                        </div>
                        <span className="kayak-trip-detail-label">Dates</span>
                        <span className="kayak-trip-detail-value">
                          {formatDate(startDate)} – {formatDate(endDate)}
                        </span>
                      </div>
                    </div>

                    <div className="kayak-trip-price">
                      {typeof totalPrice === 'number' ? `$${totalPrice.toFixed(0)}` : 'N/A'}
                      <span className="kayak-trip-price-label">USD total</span>
                    </div>
                  </div>

                  <div className="kayak-trip-card-footer">
                    <span className="kayak-trip-id">#{(bookingId || id || '').slice(-8)}</span>
                    <button
                      type="button"
                      className="kayak-trip-receipt-btn"
                      onClick={() => handleViewReceipt(booking)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                      </svg>
                      View receipt
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Invoice Modal */}
      {showInvoiceModal && (
        <div className="kayak-invoice-backdrop" onClick={closeInvoiceModal}>
          <div className="kayak-invoice-modal" onClick={(e) => e.stopPropagation()}>
            <div className="kayak-invoice-header">
              <h5 className="kayak-invoice-title">Receipt & Invoices</h5>
              <button type="button" className="kayak-invoice-close" onClick={closeInvoiceModal}>
                ✕
              </button>
            </div>

            <div className="kayak-invoice-body">
              {billingLoading && (
                <div className="kayak-trips-loading">
                  <div className="kayak-trips-spinner"></div>
                  <p className="kayak-trips-loading-text">Loading invoice...</p>
                </div>
              )}

              {!billingLoading && billingError && (
                <div className="kayak-trips-error">
                  <span>{billingError}</span>
                </div>
              )}

              {!billingLoading && !billingError && selectedBookingInvoices && (
                <>
                  {(!selectedBookingInvoices.invoices || selectedBookingInvoices.invoices.length === 0) && (
                    <div className="kayak-invoice-empty">
                      <p>No invoice has been generated yet for this booking.</p>
                    </div>
                  )}

                  {selectedBookingInvoices.invoices && selectedBookingInvoices.invoices.length > 0 && (
                    <ul className="kayak-invoice-list">
                      {selectedBookingInvoices.invoices.map((inv) => (
                        <li key={inv.invoiceId} className="kayak-invoice-item">
                          <div className="kayak-invoice-row">
                            <span className="kayak-invoice-label">Invoice ID</span>
                            <span className="kayak-invoice-value">{inv.invoiceId}</span>
                          </div>
                          <div className="kayak-invoice-row">
                            <span className="kayak-invoice-label">Amount</span>
                            <span className="kayak-invoice-value">
                              {typeof inv.amount === 'number'
                                ? `$${inv.amount.toFixed(2)} ${inv.currency || 'USD'}`
                                : `${inv.amount} ${inv.currency || 'USD'}`}
                            </span>
                          </div>
                          <div className="kayak-invoice-row">
                            <span className="kayak-invoice-label">Status</span>
                            <span className="kayak-invoice-value">{inv.status}</span>
                          </div>
                          <div className="kayak-invoice-row">
                            <span className="kayak-invoice-label">Issued at</span>
                            <span className="kayak-invoice-value">{formatDateTime(inv.issuedAt)}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            <div className="kayak-invoice-footer">
              <button type="button" className="kayak-invoice-close-btn" onClick={closeInvoiceModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyBookingsPage;
