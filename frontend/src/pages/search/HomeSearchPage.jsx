// src/pages/search/HomeSearchPage.jsx
/**
 * Home Search Page - Updated with AI Integration
 * Adds AI state management and connects to AI service
 */

import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import './HomeSearchPage.css';

import FlightsSearchForm from './FlightsSearchForm';
import HotelsSearchForm from './HotelsSearchForm';
import CarsSearchForm from './CarsSearchForm';
import AiModePanel from './AiModePanel';
import AiResults from './AiResults';

import api from '../../api/axios';
import { sendChatMessage, createWatch, generateQuote } from '../../api/aiService';
import SearchResultsList from '../../components/search/SearchResultsList';
import SearchCard from '../../components/search/SearchCard';
import { selectIsAuthenticated, selectUser } from '../../store/slices/authSlice';

// AI Components (lazy load modals)
import AiPriceAnalysis from '../../components/ai/AiPriceAnalysis';
import AiQuoteModal from '../../components/ai/AiQuoteModal';

const HomeSearchPage = () => {
  const [activeTab, setActiveTab] = useState('flights');

  // Redux auth state
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const user = useSelector(selectUser);
  const userId = user?.userId || 'guest_user';
  const navigate = useNavigate();

  // ===== FLIGHTS STATE =====
  const [flightFilters, setFlightFilters] = useState({
    origin: '',
    destination: '',
    departureDate: '',
    returnDate: '',
    minPrice: '',
    maxPrice: '',
    airline: '',
    maxStops: '',
  });
  const [flightResults, setFlightResults] = useState([]);
  const [flightPagination, setFlightPagination] = useState(null);
  const [flightLoading, setFlightLoading] = useState(false);
  const [flightError, setFlightError] = useState('');
  const [flightLoadedOnce, setFlightLoadedOnce] = useState(false);

  // ===== HOTELS STATE =====
  const [hotelFilters, setHotelFilters] = useState({
    city: '',
    minStarRating: '',
    maxStarRating: '',
    minPrice: '',
    maxPrice: '',
    amenities: '',
  });
  const [hotelResults, setHotelResults] = useState([]);
  const [hotelPagination, setHotelPagination] = useState(null);
  const [hotelLoading, setHotelLoading] = useState(false);
  const [hotelError, setHotelError] = useState('');
  const [hotelLoadedOnce, setHotelLoadedOnce] = useState(false);

  // ===== CARS STATE =====
  const [carFilters, setCarFilters] = useState({
    location: '',
    carType: '',
    minPrice: '',
    maxPrice: '',
  });
  const [carResults, setCarResults] = useState([]);
  const [carPagination, setCarPagination] = useState(null);
  const [carLoading, setCarLoading] = useState(false);
  const [carError, setCarError] = useState('');
  const [carLoadedOnce, setCarLoadedOnce] = useState(false);

  // ===== AI STATE =====
  const [aiLoading, setAiLoading] = useState(false);
  const [aiConversation, setAiConversation] = useState([]);
  const [aiError, setAiError] = useState(null);
  const [aiResponse, setAiResponse] = useState('');
  const [aiBundles, setAiBundles] = useState([]);
  const [aiChanges, setAiChanges] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState([]);
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

  // ===== HEADLINE TEXT BY TAB =====
  const getHeading = () => {
    switch (activeTab) {
      case 'stays':
        return 'Compare hotel deals from 100s of sites.';
      case 'cars':
        return 'Compare rental cars from 100s of sites.';
      case 'ai':
        return 'Explore your next destination with AI.';
      case 'flights':
      default:
        return 'Compare flight deals from 100s of sites.';
    }
  };

  // ===== BUILD PARAMS HELPERS =====
  const buildFlightParams = (page) => {
    const params = { page, limit: RESULTS_LIMIT };
    const { origin, destination, departureDate, returnDate, minPrice, maxPrice, airline, maxStops } = flightFilters;
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
    const { city, minStarRating, maxStarRating, minPrice, maxPrice, amenities } = hotelFilters;
    if (city) params.city = city;
    if (minStarRating) params.minStarRating = minStarRating;
    if (maxStarRating) params.maxStarRating = maxStarRating;
    if (minPrice) params.minPrice = minPrice;
    if (maxPrice) params.maxPrice = maxPrice;
    if (amenities) params.amenities = amenities;
    return params;
  };

  const buildCarParams = (page) => {
    const params = { page, limit: RESULTS_LIMIT };
    const { location, carType, minPrice, maxPrice } = carFilters;
    if (location) params.location = location;
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
    } catch (err) {
      console.error('Error searching flights:', err);
      setFlightError('Failed to fetch flights. Please try again.');
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
    } catch (err) {
      console.error('Error searching hotels:', err);
      setHotelError('Failed to fetch hotels. Please try again.');
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
    } catch (err) {
      console.error('Error searching cars:', err);
      setCarError('Failed to fetch cars. Please try again.');
    } finally {
      setCarLoading(false);
    }
  };

  // ===== AI SEARCH HANDLER =====
  const handleAiPromptSubmit = async (prompt) => {
    setAiPrompt(prompt);
    setAiLoading(true);
    setAiError(null);

    // Add user message to conversation
    setAiConversation(prev => [...prev, {
      role: 'user',
      content: prompt
    }]);

    try {
      const response = await sendChatMessage(prompt, userId, aiSessionId);

      setAiResponse(response.response || '');
      setAiBundles(response.bundles || []);
      setAiChanges(response.changes || null);
      setAiSuggestions(response.suggestions || []);

      if (response.session_id) {
        setAiSessionId(response.session_id);
      }

      // Add AI response to conversation
      setAiConversation(prev => [...prev, {
        role: 'assistant',
        content: response.response || ''
      }]);

    } catch (err) {
      console.error('AI search error:', err);
      setAiError('Failed to get AI recommendations. Please try again.');
      
      // Add error message to conversation
      setAiConversation(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      }]);
    } finally {
      setAiLoading(false);
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
        listing_type: 'bundle',
        listing_id: bundle.bundle_id,
        listing_name: bundle.name,
        watch_type: 'price',
        price_threshold: bundle.total_price * 0.9 // Alert if 10% drop
      });
      alert('Watch created! You\'ll be notified when the price drops.');
    } catch (err) {
      console.error('Failed to create watch:', err);
      alert('Failed to create watch. Please try again.');
    }
  };

  const handleAnalyzeClick = (bundle) => {
    setSelectedBundle(bundle);
    setShowPriceAnalysis(true);
  };

  const handleQuoteClick = (bundle) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setSelectedBundle(bundle);
    setShowQuoteModal(true);
  };

  const handleBookClick = (bundle) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    // Navigate to booking with bundle data
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

  // ===== FORM HANDLERS =====
  const handleFlightFilterChange = (field, value) => {
    setFlightFilters((prev) => ({ ...prev, [field]: value }));
  };
  const handleHotelFilterChange = (field, value) => {
    setHotelFilters((prev) => ({ ...prev, [field]: value }));
  };
  const handleCarFilterChange = (field, value) => {
    setCarFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleFlightsSubmit = () => fetchFlights(1);
  const handleHotelsSubmit = () => fetchHotels(1);
  const handleCarsSubmit = () => fetchCars(1);

  const handleFlightsPageChange = (nextPage) => fetchFlights(nextPage);
  const handleHotelsPageChange = (nextPage) => fetchHotels(nextPage);
  const handleCarsPageChange = (nextPage) => fetchCars(nextPage);

  // ===== AUTO-LOAD BEHAVIOUR =====
  useEffect(() => {
    if (!flightLoadedOnce) {
      fetchFlights(1);
    }
  }, [flightLoadedOnce]);

  useEffect(() => {
    if (activeTab === 'stays' && !hotelLoadedOnce) {
      fetchHotels(1);
    }
  }, [activeTab, hotelLoadedOnce]);

  useEffect(() => {
    if (activeTab === 'cars' && !carLoadedOnce) {
      fetchCars(1);
    }
  }, [activeTab, carLoadedOnce]);

  return (
    <div className="home-page">
      <div className="home-page-inner">
        {/* HERO */}
        <section className="home-hero">
          <div className="home-hero-left">
            <h1 className="home-hero-title">{getHeading()}</h1>

            {/* Tabs row */}
            <div className="home-tabs-row">
              <button
                type="button"
                className={`home-tab ${activeTab === 'flights' ? 'home-tab--active' : ''}`}
                onClick={() => setActiveTab('flights')}
              >
                <span className="home-tab-icon" aria-hidden="true">
                  <i className="bi bi-airplane-fill" />
                </span>
                <span className="home-tab-label">Flights</span>
              </button>

              <button
                type="button"
                className={`home-tab ${activeTab === 'stays' ? 'home-tab--active' : ''}`}
                onClick={() => setActiveTab('stays')}
              >
                <span className="home-tab-icon" aria-hidden="true">
                  <i className="bi bi-building" />
                </span>
                <span className="home-tab-label">Stays</span>
              </button>

              <button
                type="button"
                className={`home-tab ${activeTab === 'cars' ? 'home-tab--active' : ''}`}
                onClick={() => setActiveTab('cars')}
              >
                <span className="home-tab-icon" aria-hidden="true">
                  <i className="bi bi-car-front-fill" />
                </span>
                <span className="home-tab-label">Cars</span>
              </button>

              <button
                type="button"
                className={`home-tab ${activeTab === 'ai' ? 'home-tab--active' : ''}`}
                onClick={() => setActiveTab('ai')}
              >
                <span className="home-tab-icon" aria-hidden="true">
                  <i className="bi bi-stars" />
                </span>
                <span className="home-tab-label">AI Mode</span>
              </button>
            </div>

            {/* Search / AI panel */}
            <div className="home-search-panel">
              {activeTab === 'flights' && (
                <FlightsSearchForm
                  filters={flightFilters}
                  loading={flightLoading}
                  onSubmit={handleFlightsSubmit}
                  onFieldChange={handleFlightFilterChange}
                />
              )}

              {activeTab === 'stays' && (
                <HotelsSearchForm
                  filters={hotelFilters}
                  loading={hotelLoading}
                  onSubmit={handleHotelsSubmit}
                  onFieldChange={handleHotelFilterChange}
                />
              )}

              {activeTab === 'cars' && (
                <CarsSearchForm
                  filters={carFilters}
                  loading={carLoading}
                  onSubmit={handleCarsSubmit}
                  onFieldChange={handleCarFilterChange}
                />
              )}

              {activeTab === 'ai' && (
                <AiModePanel 
                  onPromptSubmit={handleAiPromptSubmit} 
                  conversationHistory={aiConversation}
                />
              )}
            </div>
          </div>
        </section>

        {/* RESULTS SECTION */}
        <section className="home-results-section">
          {/* AI Results */}
          {activeTab === 'ai' && (
            <AiResults
              bundles={aiBundles}
              loading={aiLoading}
              error={aiError}
              response={aiResponse}
              changes={aiChanges}
              suggestions={aiSuggestions}
              sessionId={aiSessionId}
              userId={userId}
              onSuggestionClick={handleAiPromptSubmit}
              onWatchCreate={handleWatchCreate}
              onAnalyzeClick={handleAnalyzeClick}
              onQuoteClick={handleQuoteClick}
              onBookClick={handleBookClick}
            />
          )}

          {/* Flights Results */}
          {activeTab === 'flights' && (
            <SearchResultsList
              items={flightResults}
              loading={flightLoading}
              error={flightError}
              pagination={flightPagination}
              onPageChange={handleFlightsPageChange}
              emptyState={
                flightLoadedOnce && !flightLoading && !flightError ? (
                  <div>No flights found. Try adjusting your filters.</div>
                ) : null
              }
              renderItem={(flight) => {
                const title = `${flight.origin} → ${flight.destination}`;
                const departText = flight.departureTime
                  ? `Depart: ${new Date(flight.departureTime).toLocaleString()}`
                  : null;
                const metaParts = [
                  flight.airline || null,
                  typeof flight.stops === 'number'
                    ? `${flight.stops} stop${flight.stops === 1 ? '' : 's'}`
                    : null,
                  departText,
                ].filter(Boolean);
                const priceText =
                  typeof flight.price === 'number' ? `$${flight.price.toFixed(0)}` : '—';

                return (
                  <SearchCard
                    title={title}
                    subtitle={metaParts[0] || null}
                    meta={metaParts.slice(1).join(' · ') || null}
                    priceText={priceText}
                    actions={
                      <button
                        type="button"
                        className="book-btn-kayak"
                        onClick={() => handleClickBookFlight(flight)}
                      >
                        Book
                      </button>
                    }
                  />
                );
              }}
            />
          )}

          {/* Hotels Results */}
          {activeTab === 'stays' && (
            <SearchResultsList
              items={hotelResults}
              loading={hotelLoading}
              error={hotelError}
              pagination={hotelPagination}
              onPageChange={handleHotelsPageChange}
              emptyState={
                hotelLoadedOnce && !hotelLoading && !hotelError ? (
                  <div>No hotels found. Try adjusting your filters.</div>
                ) : null
              }
              renderItem={(hotel) => {
                const name = hotel.name || hotel.hotelName || hotel.propertyName || 'Hotel';
                const city = hotel.city || '';
                const price = hotel.pricePerNight ?? hotel.price ?? hotel.samplePrice ?? null;
                const star = hotel.starRating ?? hotel.stars ?? hotel.rating ?? null;
                let amenitiesText = '';
                if (Array.isArray(hotel.amenities)) {
                  amenitiesText = hotel.amenities.slice(0, 3).join(', ');
                } else if (typeof hotel.amenities === 'string') {
                  amenitiesText = hotel.amenities;
                }
                const title = star ? `${name} · ${star}★` : name;
                const priceText = typeof price === 'number' ? `$${price.toFixed(0)}` : '—';

                return (
                  <SearchCard
                    thumbnailUrl={hotel.imageUrl}
                    thumbnailAlt={name}
                    thumbnailFallback={name.charAt(0)}
                    title={title}
                    subtitle={city}
                    meta={amenitiesText}
                    priceText={priceText}
                    actions={
                      <button
                        type="button"
                        className="book-btn-kayak"
                        onClick={() => handleClickBookHotel(hotel)}
                      >
                        Book
                      </button>
                    }
                  />
                );
              }}
            />
          )}

          {/* Cars Results */}
          {activeTab === 'cars' && (
            <SearchResultsList
              items={carResults}
              loading={carLoading}
              error={carError}
              pagination={carPagination}
              onPageChange={handleCarsPageChange}
              emptyState={
                carLoadedOnce && !carLoading && !carError ? (
                  <div>No cars found. Try adjusting your filters.</div>
                ) : null
              }
              renderItem={(car) => {
                const type = car.carType || car.type || 'Car';
                const price = car.pricePerDay ?? car.dailyPrice ?? car.price ?? null;
                const loc = car.location || '';
                const company = car.company || car.vendor || '';
                const priceText = typeof price === 'number' ? `$${price.toFixed(0)}` : '—';

                return (
                  <SearchCard
                    thumbnailUrl={car.imageUrl}
                    thumbnailAlt={type}
                    thumbnailFallback={type.charAt(0)}
                    title={type}
                    subtitle={loc}
                    meta={company}
                    priceText={priceText}
                    actions={
                      <button
                        type="button"
                        className="book-btn-kayak"
                        onClick={() => handleClickBookCar(car)}
                      >
                        Book
                      </button>
                    }
                  />
                );
              }}
            />
          )}
        </section>
      </div>

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
