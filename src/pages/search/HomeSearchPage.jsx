// src/pages/search/HomeSearchPage.jsx
// Kayak-style Home Search Page with Dark Hero Section

import React, { useState, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import './HomeSearchPage.css';

import api from '../../api/axios';
import { sendChatMessage, createWatch } from '../../api/aiService';
import { selectIsAuthenticated, selectUser } from '../../store/slices/authSlice';

// AI Components
import AiPriceAnalysis from '../../components/ai/AiPriceAnalysis';
import AiQuoteModal from '../../components/ai/AiQuoteModal';

const HomeSearchPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Determine active tab from URL
  const getTabFromUrl = () => {
    const path = location.pathname;
    if (path.includes('/hotels')) return 'stays';
    if (path.includes('/cars')) return 'cars';
    if (path.includes('/ai')) return 'ai';
    return 'flights';
  };

  const activeTab = getTabFromUrl();

  const handleTabChange = (tab) => {
    switch (tab) {
      case 'stays':
        navigate('/search/hotels');
        break;
      case 'cars':
        navigate('/search/cars');
        break;
      case 'ai':
        navigate('/search/ai');
        break;
      case 'flights':
      default:
        navigate('/search/flights');
        break;
    }
  };

  // Redux auth state
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const user = useSelector(selectUser);
  const userId = user?.userId || 'guest_user';

  // ===== FLIGHTS STATE =====
  const [flightFilters, setFlightFilters] = useState({
    origin: '',
    destination: '',
    departureDate: '',
    returnDate: '',
    passengers: '1',
  });
  const [flightResults, setFlightResults] = useState([]);
  const [flightPagination, setFlightPagination] = useState(null);
  const [flightLoading, setFlightLoading] = useState(false);
  const [flightError, setFlightError] = useState('');
  const [flightLoadedOnce, setFlightLoadedOnce] = useState(false);
  const [showFlightFilters, setShowFlightFilters] = useState(false);
  const [advancedFlightFilters, setAdvancedFlightFilters] = useState({
    minPrice: '',
    maxPrice: '',
    airline: '',
    maxStops: '',
  });

  // ===== HOTELS STATE =====
  const [hotelFilters, setHotelFilters] = useState({
    city: '',
    checkInDate: '',
    checkOutDate: '',
    guests: '2',
    rooms: '1',
  });
  const [hotelResults, setHotelResults] = useState([]);
  const [hotelPagination, setHotelPagination] = useState(null);
  const [hotelLoading, setHotelLoading] = useState(false);
  const [hotelError, setHotelError] = useState('');
  const [hotelLoadedOnce, setHotelLoadedOnce] = useState(false);
  const [showHotelFilters, setShowHotelFilters] = useState(false);
  const [advancedHotelFilters, setAdvancedHotelFilters] = useState({
    minStarRating: '',
    maxStarRating: '',
    minPrice: '',
    maxPrice: '',
    amenities: '',
  });

  // ===== CARS STATE =====
  const [carFilters, setCarFilters] = useState({
    location: '',
    pickupDate: '',
    dropoffDate: '',
  });
  const [carResults, setCarResults] = useState([]);
  const [carPagination, setCarPagination] = useState(null);
  const [carLoading, setCarLoading] = useState(false);
  const [carError, setCarError] = useState('');
  const [carLoadedOnce, setCarLoadedOnce] = useState(false);
  const [showCarFilters, setShowCarFilters] = useState(false);
  const [advancedCarFilters, setAdvancedCarFilters] = useState({
    carType: '',
    minPrice: '',
    maxPrice: '',
  });

  // UX state for richer Kayak-like controls
  const [tripType, setTripType] = useState('round');
  const [cabinClass, setCabinClass] = useState('economy');
  const [travelerCount, setTravelerCount] = useState(1);

  const [sortOption, setSortOption] = useState({
    flights: 'best',
    stays: 'recommended',
    cars: 'recommended',
    ai: 'best',
  });

  const [activeFilterChips, setActiveFilterChips] = useState({
    flights: new Set(['No bag fees']),
    stays: new Set(['Free cancellation']),
    cars: new Set(['Automatic']),
    ai: new Set(),
  });

  const [statusMessage, setStatusMessage] = useState('');
  const [autoSearch, setAutoSearch] = useState(true);

  const filterChipOptions = {
    flights: ['No bag fees', 'Refundable', 'Red-eye', 'Wi-Fi'],
    stays: ['Free cancellation', 'Breakfast included', 'Pay at property', '4+ stars'],
    cars: ['Automatic', 'Free cancel', 'SUV', 'Electric'],
    ai: ['Flight + hotel', 'Nonstop flights'],
  };

  const sortOptions = {
    flights: [
      { value: 'best', label: 'Best' },
      { value: 'cheapest', label: 'Cheapest' },
      { value: 'quickest', label: 'Quickest' },
    ],
    stays: [
      { value: 'recommended', label: 'Recommended' },
      { value: 'price', label: 'Lowest price' },
      { value: 'rating', label: 'Guest rating' },
    ],
    cars: [
      { value: 'recommended', label: 'Recommended' },
      { value: 'price', label: 'Lowest price' },
      { value: 'size', label: 'Larger first' },
    ],
    ai: [
      { value: 'best', label: 'Best match' },
      { value: 'price', label: 'Lowest price' },
    ],
  };

  const cabinLabels = {
    economy: 'Economy',
    premium: 'Premium economy',
    business: 'Business',
    first: 'First',
  };

  const formatPrice = (val, fallback = '—') => {
    if (typeof val === 'number' && !Number.isNaN(val)) return `$${val.toFixed(0)}`;
    return fallback;
  };

  const renderStars = (value) => {
    const v = Math.round(Number(value) * 2) / 2;
    if (!v) return null;
    const full = Math.floor(v);
    const half = v - full >= 0.5;
    const stars = '★'.repeat(full) + (half ? '½' : '');
    return <span className="kayak-stars" aria-label={`${v} star rating`}>{stars}</span>;
  };

  const renderSkeleton = (type, count = 5) => (
    <div className="kayak-skeleton-list">
      {Array.from({ length: count }).map((_, i) => (
        <div key={`${type}-sk-${i}`} className={`kayak-skeleton-card ${type}`}>
          <div className="sk-left" />
          <div className="sk-body">
            <div className="sk-line short" />
            <div className="sk-line" />
            <div className="sk-line" />
          </div>
          <div className="sk-price" />
        </div>
      ))}
    </div>
  );

  const toggleChip = (type, label) => {
    setActiveFilterChips((prev) => {
      const next = new Set(prev[type] || []);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return { ...prev, [type]: next };
    });
  };

  const handleSortChange = (type, value) => {
    setSortOption((prev) => ({ ...prev, [type]: value }));
  };

  const incrementTravelers = () => {
    setTravelerCount((prev) => {
      const next = Math.min(prev + 1, 9);
      setFlightFilters((f) => ({ ...f, passengers: String(next) }));
      return next;
    });
  };

  const decrementTravelers = () => {
    setTravelerCount((prev) => {
      const next = Math.max(prev - 1, 1);
      setFlightFilters((f) => ({ ...f, passengers: String(next) }));
      return next;
    });
  };

  // ===== AI STATE =====
  const [aiLoading, setAiLoading] = useState(false);
  const [aiConversation, setAiConversation] = useState([]);
  const [aiError, setAiError] = useState(null);
  const [aiResponse, setAiResponse] = useState('');
  const [aiBundles, setAiBundles] = useState([]);
  const [aiSessionId, setAiSessionId] = useState(null);
  const [aiPrompt, setAiPrompt] = useState('');

  // AI Modal states
  const [showPriceAnalysis, setShowPriceAnalysis] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [selectedBundle, setSelectedBundle] = useState(null);

  const RESULTS_LIMIT = 10;

  // ===== COMMON BOOK NAV HELPER =====
  const goToBookingSummary = (bookingType, listing) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    navigate('/booking/summary', {
      state: { bookingType, listing },
    });
  };

  // ===== BOOKING HANDLERS =====
  const handleClickBookFlight = (flight) => goToBookingSummary('flight', flight);
  const handleClickBookHotel = (hotel) => goToBookingSummary('hotel', hotel);
  const handleClickBookCar = (car) => goToBookingSummary('car', car);

  const renderResultsToolbar = (type, count) => {
    const chips = filterChipOptions[type] || [];
    const selected = activeFilterChips[type] || new Set();
    const sort = sortOption[type];

    const typeLabel = type === 'stays' ? 'stays' : type === 'ai' ? 'plans' : type;

    return (
      <div className="kayak-results-toolbar">
        <div className="toolbar-left">
          <div className="toolbar-title">
            Showing {count || 0} {typeLabel} • updated just now
          </div>
          <div className="toolbar-chips">
            {chips.map((chip) => {
              const active = selected.has(chip);
              return (
                <button
                  key={chip}
                  type="button"
                  className={`kayak-chip ${active ? 'active' : ''}`}
                  onClick={() => toggleChip(type, chip)}
                >
                  {chip}
                </button>
              );
            })}
          </div>
        </div>
        <div className="toolbar-right">
          <label className="toolbar-label" htmlFor={`${type}-sort`}>Sort by</label>
          <select
            id={`${type}-sort`}
            className="toolbar-select"
            value={sort}
            onChange={(e) => handleSortChange(type, e.target.value)}
          >
            {(sortOptions[type] || []).map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  const renderSideRail = (type) => (
    <aside className="kayak-rail">
      <div className="rail-card rail-trend">
        <div className="rail-card-header">
          <span className="rail-title">Price trend</span>
          <span className="rail-pill">Beta</span>
        </div>
        <div className="rail-sparkline">
          <span className="rail-sparkline-line" />
        </div>
        <p className="rail-text">Prices are steady for the next 7 days.</p>
        <button className="rail-button" type="button">Create price alert</button>
      </div>

      <div className="rail-card rail-map">
        <div className="rail-map-placeholder">
          Map view for {type} (coming soon)
        </div>
      </div>

      <div className="rail-card rail-trust">
        <div className="rail-title">Why book with us</div>
        <ul>
          <li>Compare 100s of sites in one search</li>
          <li>See fees before checkout</li>
          <li>Free-cancel options highlighted</li>
        </ul>
      </div>
    </aside>
  );

  const syncSearchParams = (overrides = {}) => {
    const next = new URLSearchParams(searchParams);
    // Flights
    next.set('f_origin', flightFilters.origin || '');
    next.set('f_dest', flightFilters.destination || '');
    next.set('f_depart', flightFilters.departureDate || '');
    next.set('f_return', flightFilters.returnDate || '');
    next.set('f_sort', sortOption.flights);
    // Hotels
    next.set('h_city', hotelFilters.city || '');
    next.set('h_checkin', hotelFilters.checkInDate || '');
    next.set('h_checkout', hotelFilters.checkOutDate || '');
    next.set('h_sort', sortOption.stays);
    // Cars
    next.set('c_loc', carFilters.location || '');
    next.set('c_pick', carFilters.pickupDate || '');
    next.set('c_drop', carFilters.dropoffDate || '');
    next.set('c_sort', sortOption.cars);

    Object.entries(overrides).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });
    setSearchParams(next, { replace: true });
  };

  // Hydrate filters from URL on first mount
  useEffect(() => {
    const origin = searchParams.get('f_origin') || '';
    const dest = searchParams.get('f_dest') || '';
    const depart = searchParams.get('f_depart') || '';
    const ret = searchParams.get('f_return') || '';
    const fSort = searchParams.get('f_sort');

    const hCity = searchParams.get('h_city') || '';
    const hIn = searchParams.get('h_checkin') || '';
    const hOut = searchParams.get('h_checkout') || '';
    const hSort = searchParams.get('h_sort');

    const cLoc = searchParams.get('c_loc') || '';
    const cPick = searchParams.get('c_pick') || '';
    const cDrop = searchParams.get('c_drop') || '';
    const cSort = searchParams.get('c_sort');

    setFlightFilters((prev) => ({ ...prev, origin, destination: dest, departureDate: depart, returnDate: ret }));
    setHotelFilters((prev) => ({ ...prev, city: hCity, checkInDate: hIn, checkOutDate: hOut }));
    setCarFilters((prev) => ({ ...prev, location: cLoc, pickupDate: cPick, dropoffDate: cDrop }));

    setSortOption((prev) => ({
      ...prev,
      flights: fSort || prev.flights,
      stays: hSort || prev.stays,
      cars: cSort || prev.cars,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== BUILD PARAMS HELPERS =====
  const buildFlightParams = (page) => {
    const params = { page, limit: RESULTS_LIMIT };
    const { origin, destination, departureDate, returnDate } = flightFilters;
    const { minPrice, maxPrice, airline, maxStops } = advancedFlightFilters;
    if (origin) params.origin = origin;
    if (destination) params.destination = destination;
    if (departureDate) params.departureDate = departureDate;
    if (returnDate) params.returnDate = returnDate;
    if (minPrice) params.minPrice = minPrice;
    if (maxPrice) params.maxPrice = maxPrice;
    if (airline) params.airline = airline;
    if (maxStops !== '') params.maxStops = maxStops;
    return params;
  };

  const buildHotelParams = (page) => {
    const params = { page, limit: RESULTS_LIMIT };
    const { city, checkInDate, checkOutDate } = hotelFilters;
    const { minStarRating, maxStarRating, minPrice, maxPrice, amenities } = advancedHotelFilters;
    if (city) params.city = city;
    if (checkInDate) params.checkInDate = checkInDate;
    if (checkOutDate) params.checkOutDate = checkOutDate;
    if (minStarRating) params.minStarRating = minStarRating;
    if (maxStarRating) params.maxStarRating = maxStarRating;
    if (minPrice) params.minPrice = minPrice;
    if (maxPrice) params.maxPrice = maxPrice;
    if (amenities) params.amenities = amenities;
    return params;
  };

  const buildCarParams = (page) => {
    const params = { page, limit: RESULTS_LIMIT };
    const { location, pickupDate, dropoffDate } = carFilters;
    const { carType, minPrice, maxPrice } = advancedCarFilters;
    if (location) params.location = location;
    if (pickupDate) params.pickupDate = pickupDate;
    if (dropoffDate) params.dropoffDate = dropoffDate;
    if (carType) params.carType = carType;
    if (minPrice) params.minPrice = minPrice;
    if (maxPrice) params.maxPrice = maxPrice;
    return params;
  };

  // ===== FETCHERS =====
  const fetchFlights = async (page = 1) => {
    setFlightLoading(true);
    setFlightError('');
    try {
      const params = buildFlightParams(page);
      const response = await api.get('/search/flights', { params });
      const { data, pagination } = response.data;
      setFlightResults(data || []);
      setFlightPagination(pagination || null);
      setFlightLoadedOnce(true);
      setStatusMessage(`Flights updated • ${data?.length || 0} results`);
      syncSearchParams({ f_page: page });
    } catch (err) {
      console.error('Error searching flights:', err);
      setFlightError('Failed to fetch flights. Please try again.');
      setStatusMessage('Could not load flights');
    } finally {
      setFlightLoading(false);
    }
  };

  const fetchHotels = async (page = 1) => {
    setHotelLoading(true);
    setHotelError('');
    try {
      const params = buildHotelParams(page);
      const response = await api.get('/search/hotels', { params });
      const { data, pagination } = response.data;
      setHotelResults(data || []);
      setHotelPagination(pagination || null);
      setHotelLoadedOnce(true);
      setStatusMessage(`Hotels updated • ${data?.length || 0} results`);
      syncSearchParams({ h_page: page });
    } catch (err) {
      console.error('Error searching hotels:', err);
      setHotelError('Failed to fetch hotels. Please try again.');
      setStatusMessage('Could not load hotels');
    } finally {
      setHotelLoading(false);
    }
  };

  const fetchCars = async (page = 1) => {
    setCarLoading(true);
    setCarError('');
    try {
      const params = buildCarParams(page);
      const response = await api.get('/search/cars', { params });
      const { data, pagination } = response.data;
      setCarResults(data || []);
      setCarPagination(pagination || null);
      setCarLoadedOnce(true);
      setStatusMessage(`Cars updated • ${data?.length || 0} results`);
      syncSearchParams({ c_page: page });
    } catch (err) {
      console.error('Error searching cars:', err);
      setCarError('Failed to fetch cars. Please try again.');
      setStatusMessage('Could not load cars');
    } finally {
      setCarLoading(false);
    }
  };

  // ===== AI SEARCH HANDLER =====
  const handleAiPromptSubmit = async (e) => {
    e?.preventDefault?.();
    if (!aiPrompt.trim()) return;

    setAiLoading(true);
    setAiError(null);

    setAiConversation(prev => [...prev, { role: 'user', content: aiPrompt }]);

    try {
      const response = await sendChatMessage(aiPrompt, userId, aiSessionId);
      setAiResponse(response.response || '');
      setAiBundles(response.bundles || []);
      if (response.session_id) setAiSessionId(response.session_id);

      setAiConversation(prev => [...prev, {
        role: 'assistant',
        content: response.response || ''
      }]);
    } catch (err) {
      console.error('AI search error:', err);
      setAiError('Failed to get AI recommendations. Please try again.');
      setAiConversation(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      }]);
    } finally {
      setAiLoading(false);
      setAiPrompt('');
    }
  };

  // ===== AI ACTION HANDLERS =====
  const handleWatchCreate = async (bundle) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    try {
      await createWatch({
        user_id: userId,
        listing_type: 'hotel',
        listing_id: bundle?.hotel?.listing_id || bundle.bundle_id,
        listing_name: bundle.name,
        watch_type: 'price',
        threshold: bundle.total_price * 0.9,
        current_value: bundle.total_price
      });
      alert('Watch created! You\'ll be notified when the price drops.');
    } catch (err) {
      console.error('Failed to create watch:', err);
      alert('Failed to create watch. Please try again.');
    }
  };

  const handleBookClick = (bundle) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    navigate('/booking/summary', {
      state: {
        bookingType: 'bundle',
        listing: bundle,
        flight: bundle.flight,
        hotel: bundle.hotel
      }
    });
  };

  const handleBookingComplete = (result) => {
    setShowQuoteModal(false);
    navigate('/booking/confirmation', { state: { booking: result } });
  };

  // ===== FORM SUBMIT HANDLERS =====
  const handleFlightsSubmit = (e) => {
    e?.preventDefault?.();
    fetchFlights(1);
  };
  const handleHotelsSubmit = (e) => {
    e?.preventDefault?.();
    fetchHotels(1);
  };
  const handleCarsSubmit = (e) => {
    e?.preventDefault?.();
    fetchCars(1);
  };

  // ===== AUTO-LOAD BEHAVIOUR =====
  useEffect(() => {
    if (!flightLoadedOnce) fetchFlights(1);
  }, [flightLoadedOnce]);

  useEffect(() => {
    if (activeTab === 'stays' && !hotelLoadedOnce) fetchHotels(1);
  }, [activeTab, hotelLoadedOnce]);

  useEffect(() => {
    if (activeTab === 'cars' && !carLoadedOnce) fetchCars(1);
  }, [activeTab, carLoadedOnce]);

  // Auto-refresh on filter changes after initial load (debounced)
  useEffect(() => {
    if (!autoSearch || !flightLoadedOnce) return undefined;
    const handle = window.setTimeout(() => fetchFlights(1), 450);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightFilters, advancedFlightFilters, sortOption.flights]);

  useEffect(() => {
    if (!autoSearch || !hotelLoadedOnce) return undefined;
    const handle = window.setTimeout(() => fetchHotels(1), 450);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelFilters, advancedHotelFilters, sortOption.stays]);

  useEffect(() => {
    if (!autoSearch || !carLoadedOnce) return undefined;
    const handle = window.setTimeout(() => fetchCars(1), 450);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carFilters, advancedCarFilters, sortOption.cars]);

  // ===== RENDER RESULTS =====
  const renderFlightResults = () => {
    if (flightLoading) {
      return renderSkeleton('flight', 6);
    }
    if (flightError) {
      return <div className="kayak-error">{flightError}</div>;
    }
    if (!flightResults.length) {
      return (
        <div className="kayak-empty-state">
          <div className="kayak-empty-icon">✈️</div>
          <h3 className="kayak-empty-title">No flights found</h3>
          <p className="kayak-empty-text">Try adjusting your search criteria</p>
        </div>
      );
    }

    return (
      <>
        {renderResultsToolbar('flights', flightResults.length)}

        <div className="kayak-results-shell">
          <div className="kayak-results-list flights-list">
            {flightResults.map((flight, idx) => {
              const price = formatPrice(flight.price);
              const stopsNum = typeof flight.stops === 'number' ? flight.stops : 0;
              const stopsText = stopsNum === 0 ? 'Nonstop' : `${stopsNum} stop${stopsNum > 1 ? 's' : ''}`;
              const badge = idx === 0 ? 'Best' : stopsNum === 0 ? 'Fastest' : 'Value';

              const rawDepart = flight.departure_time || '';
              const departTime = rawDepart.includes(':') ? rawDepart :
                rawDepart === 'Morning' ? '8:00 AM' :
                rawDepart === 'Early_Morning' ? '6:00 AM' :
                rawDepart === 'Afternoon' ? '2:00 PM' :
                rawDepart === 'Evening' ? '6:00 PM' :
                rawDepart === 'Night' ? '9:00 PM' : '12:00 PM';

              const rawArrive = flight.arrival_time || '';
              const arriveTime = rawArrive.includes(':') ? rawArrive :
                rawArrive === 'Morning' ? '11:00 AM' :
                rawArrive === 'Early_Morning' ? '9:00 AM' :
                rawArrive === 'Afternoon' ? '5:00 PM' :
                rawArrive === 'Evening' ? '9:00 PM' :
                rawArrive === 'Night' ? '11:30 PM' : '3:00 PM';

              const rawDuration = flight.duration;
              let duration = '3h 30m';
              if (typeof rawDuration === 'number') {
                const hours = Math.floor(rawDuration);
                const mins = Math.round((rawDuration - hours) * 100);
                duration = `${hours}h ${mins}m`;
              } else if (typeof rawDuration === 'string' && rawDuration.includes('h')) {
                duration = rawDuration;
              }

              return (
                <div key={flight.listing_id || idx} className="kayak-flight-card">
                  <div className="kayak-flight-body">
                    <div className="kayak-flight-top">
                      <div className="kayak-flight-airline">
                        <div className="kayak-flight-airline-logo">✈️</div>
                        <div>
                          <div className="kayak-flight-airline-name">{flight.airline || 'Airline'}</div>
                          <div className="kayak-flight-meta-small">{flight.cabin || 'Economy'} • {stopsText}</div>
                        </div>
                      </div>
                      <div className={`kayak-badge ${badge === 'Best' ? 'primary' : 'muted'}`}>{badge}</div>
                    </div>

                    <div className="kayak-flight-main">
                      <div className="kayak-flight-timeblock">
                        <span className="kayak-flight-time">{departTime}</span>
                        <span className="kayak-flight-airport">{flight.origin}</span>
                      </div>
                      <div className="kayak-flight-duration">
                        <span className="kayak-flight-duration-text">{duration}</span>
                        <div className="kayak-flight-duration-line"></div>
                        <span className="kayak-flight-stops">{stopsText}</span>
                      </div>
                      <div className="kayak-flight-timeblock">
                        <span className="kayak-flight-time">{arriveTime}</span>
                        <span className="kayak-flight-airport">{flight.destination}</span>
                      </div>
                    </div>

                    <div className="kayak-flight-meta-row">
                      <span className="kayak-pill">🧳 Carry-on</span>
                      <span className="kayak-pill muted">CO₂ 12% lower</span>
                      <span className="kayak-pill outline">{stopsText}</span>
                      <span className="kayak-pill outline">Wi‑Fi</span>
                    </div>
                  </div>

                  <div className="kayak-flight-price">
                    <span className="kayak-flight-price-amount">{price}</span>
                    <span className="kayak-flight-price-label">Round trip</span>
                    <button
                      className="kayak-flight-select-btn"
                      onClick={() => handleClickBookFlight(flight)}
                    >
                      Select
                    </button>
                    <button type="button" className="kayak-save-btn" aria-label="Save flight">♡</button>
                  </div>
                </div>
              );
            })}
          </div>

          {renderSideRail('flights')}
        </div>

        {flightPagination && (
          <div className="kayak-pagination">
            <button
              className="kayak-pagination-btn"
              disabled={flightPagination.currentPage <= 1}
              onClick={() => fetchFlights(flightPagination.currentPage - 1)}
            >
              Previous
            </button>
            <span className="kayak-pagination-info">
              Page {flightPagination.currentPage} of {flightPagination.totalPages}
            </span>
            <button
              className="kayak-pagination-btn"
              disabled={flightPagination.currentPage >= flightPagination.totalPages}
              onClick={() => fetchFlights(flightPagination.currentPage + 1)}
            >
              Next
            </button>
          </div>
        )}
      </>
    );
  };

  const renderHotelResults = () => {
    if (hotelLoading) {
      return renderSkeleton('hotel', 6);
    }
    if (hotelError) {
      return <div className="kayak-error">{hotelError}</div>;
    }
    if (!hotelResults.length) {
      return (
        <div className="kayak-empty-state">
          <div className="kayak-empty-icon">🏨</div>
          <h3 className="kayak-empty-title">No hotels found</h3>
          <p className="kayak-empty-text">Try adjusting your search criteria</p>
        </div>
      );
    }

    return (
      <>
        {renderResultsToolbar('stays', hotelResults.length)}

        <div className="kayak-results-shell">
          <div className="kayak-results-list">
            {hotelResults.map((hotel, idx) => {
              const name = hotel.name || hotel.hotelName || 'Hotel';
              const price = hotel.pricePerNight ?? hotel.price ?? null;
              const priceText = formatPrice(price);
              const star = hotel.starRating ?? hotel.stars ?? null;
              const neighborhood = hotel.city || hotel.location || '';
              const original = price && typeof price === 'number' ? `$${Math.round(price * 1.15)}` : null;
              const reviews = hotel.reviewCount || hotel.reviews || 0;

              return (
                <div key={hotel.listing_id || idx} className="kayak-hotel-card">
                  <div className="kayak-result-image">
                    {hotel.imageUrl ? (
                      <img src={hotel.imageUrl} alt={name} />
                    ) : (
                      <div className="kayak-result-image-placeholder">🏨</div>
                    )}
                    {star && <span className="kayak-image-badge">{star}★</span>}
                  </div>

                  <div className="kayak-hotel-body">
                    <div className="kayak-hotel-top">
                      <div>
                        <h3 className="kayak-result-title">{name}</h3>
                        <p className="kayak-result-subtitle">{neighborhood}</p>
                        <div className="kayak-rating-row">
                          {renderStars(star)}
                          <span className="kayak-rating-count">{reviews ? `${reviews} reviews` : 'New'}</span>
                        </div>
                        <div className="kayak-hotel-perks">
                          {Array.isArray(hotel.amenities) && hotel.amenities.slice(0, 3).map((a, i) => (
                            <span key={i} className="kayak-pill">{a}</span>
                          ))}
                          <span className="kayak-pill muted">Breakfast included</span>
                        </div>
                      </div>
                      <div className="kayak-badge muted">Guest favorite</div>
                    </div>

                    <div className="kayak-hotel-meta">
                      <span className="kayak-pill outline">Free cancellation</span>
                      <span className="kayak-pill outline">Pay at property</span>
                      <span className="kayak-pill muted">No resort fees</span>
                      <span className="kayak-pill">Map view</span>
                    </div>
                  </div>

                  <div className="kayak-result-price-section">
                    {original && <span className="kayak-price-strike">{original}</span>}
                    <span className="kayak-result-price">{priceText}</span>
                    <span className="kayak-result-price-label">per night • taxes extra</span>
                    <button
                      className="kayak-result-book-btn"
                      onClick={() => handleClickBookHotel(hotel)}
                    >
                      View deal
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {renderSideRail('stays')}
        </div>

        {hotelPagination && (
          <div className="kayak-pagination">
            <button
              className="kayak-pagination-btn"
              disabled={hotelPagination.currentPage <= 1}
              onClick={() => fetchHotels(hotelPagination.currentPage - 1)}
            >
              Previous
            </button>
            <span className="kayak-pagination-info">
              Page {hotelPagination.currentPage} of {hotelPagination.totalPages}
            </span>
            <button
              className="kayak-pagination-btn"
              disabled={hotelPagination.currentPage >= hotelPagination.totalPages}
              onClick={() => fetchHotels(hotelPagination.currentPage + 1)}
            >
              Next
            </button>
          </div>
        )}
      </>
    );
  };

  const renderCarResults = () => {
    if (carLoading) {
      return renderSkeleton('car', 6);
    }
    if (carError) {
      return <div className="kayak-error">{carError}</div>;
    }
    if (!carResults.length) {
      return (
        <div className="kayak-empty-state">
          <div className="kayak-empty-icon">🚗</div>
          <h3 className="kayak-empty-title">No cars found</h3>
          <p className="kayak-empty-text">Try adjusting your search criteria</p>
        </div>
      );
    }

    return (
      <>
        {renderResultsToolbar('cars', carResults.length)}

        <div className="kayak-results-shell">
          <div className="kayak-results-list">
            {carResults.map((car, idx) => {
              const type = car.carType || car.type || 'Car';
              const price = car.pricePerDay ?? car.dailyPrice ?? car.price ?? null;
              const priceText = formatPrice(price);
              const supplier = car.company || car.vendor || 'Supplier';
              const doors = car.doors || car.doorCount;
              const transmission = car.transmission || 'Automatic';
              const fuel = car.fuel || car.fuelPolicy || 'Fuel policy';

              return (
                <div key={car.listing_id || idx} className="kayak-car-card">
                  <div className="kayak-result-image">
                    {car.imageUrl ? (
                      <img src={car.imageUrl} alt={type} />
                    ) : (
                      <div className="kayak-result-image-placeholder">🚗</div>
                    )}
                    <span className="kayak-image-badge">{supplier}</span>
                  </div>

                  <div className="kayak-car-body">
                    <div className="kayak-car-top">
                      <div>
                        <h3 className="kayak-result-title">{type}</h3>
                        <p className="kayak-result-subtitle">{car.location || ''}</p>
                        <div className="kayak-hotel-perks">
                          {car.seats && <span className="kayak-pill">{car.seats} seats</span>}
                          {doors && <span className="kayak-pill">{doors} doors</span>}
                          {car.bags && <span className="kayak-pill muted">{car.bags} bags</span>}
                          <span className="kayak-pill outline">{transmission}</span>
                          <span className="kayak-pill muted">{fuel}</span>
                          <span className="kayak-pill outline">Free cancellation</span>
                        </div>
                      </div>
                      <div className="kayak-badge muted">No prepay</div>
                    </div>
                  </div>

                  <div className="kayak-result-price-section">
                    <span className="kayak-result-price">{priceText}</span>
                    <span className="kayak-result-price-label">per day</span>
                    <button
                      className="kayak-result-book-btn"
                      onClick={() => handleClickBookCar(car)}
                    >
                      Select
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {renderSideRail('cars')}
        </div>

        {carPagination && (
          <div className="kayak-pagination">
            <button
              className="kayak-pagination-btn"
              disabled={carPagination.currentPage <= 1}
              onClick={() => fetchCars(carPagination.currentPage - 1)}
            >
              Previous
            </button>
            <span className="kayak-pagination-info">
              Page {carPagination.currentPage} of {carPagination.totalPages}
            </span>
            <button
              className="kayak-pagination-btn"
              disabled={carPagination.currentPage >= carPagination.totalPages}
              onClick={() => fetchCars(carPagination.currentPage + 1)}
            >
              Next
            </button>
          </div>
        )}
      </>
    );
  };

  const renderAiResults = () => {
    if (aiLoading) {
      return (
        <div className="kayak-loading">
          <div className="kayak-loading-spinner"></div>
          <span className="kayak-loading-text">AI is thinking...</span>
        </div>
      );
    }
    if (aiError) {
      return <div className="kayak-error">{aiError}</div>;
    }
    if (!aiBundles.length && !aiResponse) {
      return (
        <div className="kayak-empty-state">
          <div className="kayak-empty-icon">✨</div>
          <h3 className="kayak-empty-title">Ask me anything about your trip</h3>
          <p className="kayak-empty-text">I can help you find flights, hotels, and plan your perfect vacation</p>
        </div>
      );
    }

    return (
      <>
        {aiBundles.length > 0 && (
          <>
            <div className="kayak-results-header">
              <span className="kayak-results-count">{aiBundles.length} recommendations</span>
            </div>
            <div className="kayak-results-list">
              {aiBundles.map((bundle, idx) => (
                <div key={bundle.bundle_id || idx} className="kayak-result-card">
                  <div className="kayak-result-image">
                    <div className="kayak-result-image-placeholder">✨</div>
                  </div>
                  <div className="kayak-result-content">
                    <div className="kayak-result-header">
                      <div>
                        <h3 className="kayak-result-title">{bundle.name || 'Travel Bundle'}</h3>
                        <p className="kayak-result-subtitle">{bundle.description || ''}</p>
                        <div className="kayak-result-meta">
                          {bundle.flight && <span className="kayak-result-tag">✈️ Flight included</span>}
                          {bundle.hotel && <span className="kayak-result-tag">🏨 Hotel included</span>}
                        </div>
                      </div>
                      <div className="kayak-result-price-section">
                        <span className="kayak-result-price">
                          ${bundle.total_price?.toFixed(0) || '—'}
                        </span>
                        <span className="kayak-result-price-label">total</span>
                        <button
                          className="kayak-result-book-btn"
                          onClick={() => handleBookClick(bundle)}
                        >
                          Book Now
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </>
    );
  };

  // Get headline based on active tab
  const getHeadline = () => {
    switch (activeTab) {
      case 'stays': return 'Compare hotel deals from 100s of sites';
      case 'cars': return 'Compare rental cars from 100s of sites';
      case 'ai': return 'Plan your perfect trip with AI';
      default: return 'Compare flight deals from 100s of sites';
    }
  };

  return (
    <div className="kayak-home">
      {/* Hero Section */}
      <section className="kayak-hero">
        <div className="kayak-hero-container">
          <div className="kayak-hero-main">
            {/* Headline */}
            <h1 className="kayak-headline">
              {getHeadline()}<span className="kayak-headline-dot">.</span>
            </h1>

            {/* Tabs - Square Icon Style matching real Kayak */}
            <div className="kayak-tabs">
              <button
                className={`kayak-tab ${activeTab === 'flights' ? 'active' : ''}`}
                onClick={() => handleTabChange('flights')}
              >
                <div className="kayak-tab-icon-box">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
                  </svg>
                </div>
                <span className="kayak-tab-label">Flights</span>
              </button>
              <button
                className={`kayak-tab ${activeTab === 'stays' ? 'active' : ''}`}
                onClick={() => handleTabChange('stays')}
              >
                <div className="kayak-tab-icon-box">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 14c1.66 0 3-1.34 3-3S8.66 8 7 8s-3 1.34-3 3 1.34 3 3 3zm12-7h-8v5h8V7zm-8 7v7H4V14h7zm2 0h8v7h-8v-7z"/>
                  </svg>
                </div>
                <span className="kayak-tab-label">Stays</span>
              </button>
              <button
                className={`kayak-tab ${activeTab === 'cars' ? 'active' : ''}`}
                onClick={() => handleTabChange('cars')}
              >
                <div className="kayak-tab-icon-box">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
                  </svg>
                </div>
                <span className="kayak-tab-label">Cars</span>
              </button>
              <button
                className={`kayak-tab ${activeTab === 'packages' ? 'active' : ''}`}
                onClick={() => handleTabChange('flights')}
              >
                <div className="kayak-tab-icon-box">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13.127 14.56l1.43-1.43 6.44 6.443L19.57 21zm4.293-5.73l2.86-2.86c.39-.39.39-1.02 0-1.41l-1.41-1.41c-.39-.39-1.02-.39-1.41 0l-2.86 2.86 2.82 2.82zM5.95 5.98c-3.94 3.94-3.94 10.32 0 14.26l1.41-1.41c-3.16-3.16-3.16-8.28 0-11.44l-1.41-1.41zm2.83 2.83c-2.36 2.36-2.36 6.19 0 8.54l1.41-1.41c-1.57-1.57-1.57-4.12 0-5.69l-1.41-1.44z"/>
                  </svg>
                </div>
                <span className="kayak-tab-label">Packages</span>
              </button>
              <button
                className={`kayak-tab ${activeTab === 'ai' ? 'active' : ''}`}
                onClick={() => handleTabChange('ai')}
              >
                <div className="kayak-tab-icon-box ai-mode">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                  </svg>
                </div>
                <span className="kayak-tab-label">AI Mode</span>
              </button>
            </div>

          {/* Search Box */}
          <div className="kayak-search-shell">
            {/* Flights Search Form - Kayak Style Inline */}
            {activeTab === 'flights' && (
              <form onSubmit={handleFlightsSubmit}>
                {/* Top row: Trip type and bags dropdown */}
                <div className="kayak-form-toprow">
                  <button type="button" className="kayak-dropdown-trigger">
                    {tripType === 'round' ? 'Round-trip' : tripType === 'oneway' ? 'One-way' : 'Multi-city'}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                  <button type="button" className="kayak-dropdown-trigger">
                    0 bags
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                </div>

                {/* Single horizontal search bar */}
                <div className="kayak-search-bar">
                  <div className="kayak-search-field kayak-search-field-from">
                    <input
                      type="text"
                      placeholder="From?"
                      value={flightFilters.origin}
                      onChange={(e) => setFlightFilters(f => ({ ...f, origin: e.target.value }))}
                    />
                    {flightFilters.origin && (
                      <button type="button" className="kayak-field-clear" onClick={() => setFlightFilters(f => ({ ...f, origin: '' }))}>×</button>
                    )}
                  </div>
                  <button type="button" className="kayak-swap-btn" aria-label="Swap origin and destination">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>
                    </svg>
                  </button>
                  <div className="kayak-search-field kayak-search-field-to">
                    <input
                      type="text"
                      placeholder="To?"
                      value={flightFilters.destination}
                      onChange={(e) => setFlightFilters(f => ({ ...f, destination: e.target.value }))}
                    />
                  </div>
                  <div className="kayak-search-divider"></div>
                  <div className="kayak-search-field kayak-search-field-dates">
                    <div className="kayak-date-wrapper">
                      <input
                        type="date"
                        value={flightFilters.departureDate}
                        onChange={(e) => setFlightFilters(f => ({ ...f, departureDate: e.target.value }))}
                      />
                      {!flightFilters.departureDate && <span className="kayak-date-placeholder">Depart</span>}
                    </div>
                    <span className="kayak-date-separator">–</span>
                    <div className="kayak-date-wrapper">
                      <input
                        type="date"
                        value={flightFilters.returnDate}
                        onChange={(e) => setFlightFilters(f => ({ ...f, returnDate: e.target.value }))}
                      />
                      {!flightFilters.returnDate && <span className="kayak-date-placeholder">Return</span>}
                    </div>
                  </div>
                  <div className="kayak-search-divider"></div>
                  <div className="kayak-search-field kayak-search-field-travelers">
                    <span>{travelerCount} adult{travelerCount > 1 ? 's' : ''}, {cabinLabels[cabinClass]}</span>
                  </div>
                  <button type="submit" className="kayak-search-btn" disabled={flightLoading}>
                    Search
                  </button>
                </div>
              </form>
            )}

            {/* Hotels Search Form - Kayak Style Inline */}
            {activeTab === 'stays' && (
              <form onSubmit={handleHotelsSubmit}>
                <div className="kayak-form-toprow">
                  <button type="button" className="kayak-dropdown-trigger">
                    {hotelFilters.rooms || 1} room
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                </div>

                <div className="kayak-search-bar">
                  <div className="kayak-search-field kayak-search-field-destination">
                    <input
                      type="text"
                      placeholder="Where to?"
                      value={hotelFilters.city}
                      onChange={(e) => setHotelFilters(f => ({ ...f, city: e.target.value }))}
                    />
                  </div>
                  <div className="kayak-search-divider"></div>
                  <div className="kayak-search-field kayak-search-field-dates">
                    <div className="kayak-date-wrapper">
                      <input
                        type="date"
                        value={hotelFilters.checkInDate}
                        onChange={(e) => setHotelFilters(f => ({ ...f, checkInDate: e.target.value }))}
                      />
                      {!hotelFilters.checkInDate && <span className="kayak-date-placeholder">Check-in</span>}
                    </div>
                    <span className="kayak-date-separator">–</span>
                    <div className="kayak-date-wrapper">
                      <input
                        type="date"
                        value={hotelFilters.checkOutDate}
                        onChange={(e) => setHotelFilters(f => ({ ...f, checkOutDate: e.target.value }))}
                      />
                      {!hotelFilters.checkOutDate && <span className="kayak-date-placeholder">Check-out</span>}
                    </div>
                  </div>
                  <div className="kayak-search-divider"></div>
                  <div className="kayak-search-field kayak-search-field-travelers">
                    <span>{hotelFilters.guests || 2} guests</span>
                  </div>
                  <button type="submit" className="kayak-search-btn" disabled={hotelLoading}>
                    Search
                  </button>
                </div>
              </form>
            )}

            {/* Cars Search Form - Kayak Style Inline */}
            {activeTab === 'cars' && (
              <form onSubmit={handleCarsSubmit}>
                <div className="kayak-form-toprow">
                  <button type="button" className="kayak-dropdown-trigger">
                    Same drop-off
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                </div>

                <div className="kayak-search-bar">
                  <div className="kayak-search-field kayak-search-field-destination">
                    <input
                      type="text"
                      placeholder="Pick-up location"
                      value={carFilters.location}
                      onChange={(e) => setCarFilters(f => ({ ...f, location: e.target.value }))}
                    />
                  </div>
                  <div className="kayak-search-divider"></div>
                  <div className="kayak-search-field kayak-search-field-dates">
                    <div className="kayak-date-wrapper">
                      <input
                        type="date"
                        value={carFilters.pickupDate}
                        onChange={(e) => setCarFilters(f => ({ ...f, pickupDate: e.target.value }))}
                      />
                      {!carFilters.pickupDate && <span className="kayak-date-placeholder">Pick-up</span>}
                    </div>
                    <span className="kayak-date-separator">–</span>
                    <div className="kayak-date-wrapper">
                      <input
                        type="date"
                        value={carFilters.dropoffDate}
                        onChange={(e) => setCarFilters(f => ({ ...f, dropoffDate: e.target.value }))}
                      />
                      {!carFilters.dropoffDate && <span className="kayak-date-placeholder">Drop-off</span>}
                    </div>
                  </div>
                  <button type="submit" className="kayak-search-btn" disabled={carLoading}>
                    Search
                  </button>
                </div>
              </form>
            )}

            {/* AI Search Panel */}
            {activeTab === 'ai' && (
              <div className="kayak-ai-panel">
                {aiConversation.length > 0 && (
              <div className="kayak-ai-conversation">
                {aiConversation.map((msg, idx) => (
                  <div key={idx} className={`kayak-ai-message ${msg.role}`}>
                    <div className="kayak-ai-message-avatar">
                      {msg.role === 'user' ? '👤' : '✨'}
                    </div>
                    <div className="kayak-ai-message-content">
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>
                )}
                <form onSubmit={handleAiPromptSubmit}>
                  <div className="kayak-ai-input-row">
                    <div className="kayak-ai-icon">✨</div>
                    <input
                      type="text"
                      className="kayak-ai-input"
                      placeholder="Ask me to plan your trip..."
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                    />
                    <button type="submit" className="kayak-ai-send-btn" disabled={aiLoading || !aiPrompt.trim()}>
                      →
                    </button>
                  </div>
                </form>
                <div className="kayak-ai-suggestions">
                  <button
                    className="kayak-ai-suggestion"
                    onClick={() => setAiPrompt('Find me a beach vacation under $2000')}
                  >
                    Beach vacation under $2000
                  </button>
                  <button
                    className="kayak-ai-suggestion"
                    onClick={() => setAiPrompt('Plan a weekend getaway to New York')}
                  >
                    Weekend in New York
                  </button>
                  <button
                    className="kayak-ai-suggestion"
                    onClick={() => setAiPrompt('Family trip to Disney World')}
                  >
                    Family trip to Disney
                  </button>
                </div>
              </div>
            )}
          </div>
          </div>

          {/* Photo Collage - Matching real Kayak layout */}
          <div className="kayak-hero-collage">
            <div className="kayak-collage-grid">
              <div className="kayak-collage-item kayak-collage-main">
                <img src="https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=500&h=300&fit=crop" alt="Tropical beach" />
              </div>
              <div className="kayak-collage-item">
                <img src="https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=300&h=200&fit=crop" alt="European street" />
              </div>
              <div className="kayak-collage-item">
                <img src="https://images.unsplash.com/photo-1464037866556-6812c9d1c72e?w=300&h=200&fit=crop" alt="Desert landscape" />
              </div>
              <div className="kayak-collage-item kayak-collage-tall">
                <img src="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=300&h=400&fit=crop" alt="Airplane window view" />
              </div>
              <div className="kayak-collage-item">
                <img src="https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=300&h=200&fit=crop" alt="Mountain lake" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Cards Section */}
      <section className="kayak-features">
        <div className="kayak-features-container">
          <div className="kayak-feature-card">
            <div className="kayak-feature-icons">
              <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/JetBlue_Airways_Logo.svg/200px-JetBlue_Airways_Logo.svg.png" alt="JetBlue" className="kayak-airline-logo" />
              <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Southwest_Airlines_logo_2014.svg/200px-Southwest_Airlines_logo_2014.svg.png" alt="Southwest" className="kayak-airline-logo" />
              <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Delta_logo.svg/200px-Delta_logo.svg.png" alt="Delta" className="kayak-airline-logo" />
              <img src="https://upload.wikimedia.org/wikipedia/en/thumb/e/e0/United_Airlines_Logo.svg/200px-United_Airlines_Logo.svg.png" alt="United" className="kayak-airline-logo" />
            </div>
            <h3 className="kayak-feature-title">Save when you compare</h3>
            <p className="kayak-feature-text">More deals. More sites. One search.</p>
          </div>

          <div className="kayak-feature-card">
            <div className="kayak-feature-avatars">
              <div className="kayak-avatar-circle" style={{background: '#ff6b6b'}}>
                <span>JD</span>
              </div>
              <div className="kayak-avatar-circle" style={{background: '#4ecdc4'}}>
                <span>AS</span>
              </div>
              <div className="kayak-avatar-circle" style={{background: '#ffe66d'}}>
                <span>MK</span>
              </div>
            </div>
            <h3 className="kayak-feature-title">41,000,000+</h3>
            <p className="kayak-feature-text">searches this week</p>
          </div>

          <div className="kayak-feature-card">
            <div className="kayak-feature-stars">
              <span className="kayak-star">★</span>
              <span className="kayak-star">★</span>
              <span className="kayak-star">★</span>
              <span className="kayak-star">★</span>
              <span className="kayak-star">★</span>
            </div>
            <h3 className="kayak-feature-title">Travelers love us</h3>
            <p className="kayak-feature-text">1M+ ratings on our app</p>
          </div>
        </div>
      </section>

      {/* Travel Deals Section */}
      <section className="kayak-deals">
        <div className="kayak-deals-header">
          <h2 className="kayak-deals-title">Travel deals under $223</h2>
          <a href="#" className="kayak-deals-link">Explore more →</a>
        </div>
      </section>

      {/* Results Section */}
      <section className="kayak-results">
        {activeTab === 'flights' && renderFlightResults()}
        {activeTab === 'stays' && renderHotelResults()}
        {activeTab === 'cars' && renderCarResults()}
        {activeTab === 'ai' && renderAiResults()}
      </section>

      {/* AI Modals */}
      {showPriceAnalysis && selectedBundle && (
        <AiPriceAnalysis
          bundleId={selectedBundle.bundle_id}
          onClose={() => setShowPriceAnalysis(false)}
          onBook={() => {
            setShowPriceAnalysis(false);
            handleBookClick(selectedBundle);
          }}
        />
      )}

      {showQuoteModal && selectedBundle && (
        <AiQuoteModal
          bundle={selectedBundle}
          userId={userId}
          onClose={() => setShowQuoteModal(false)}
          onBookingComplete={handleBookingComplete}
        />
      )}
    </div>
  );
};

export default HomeSearchPage;
