// src/pages/search/HotelsSearchForm.jsx
import React, { useState } from 'react';

const HotelsSearchForm = ({ filters, loading, onSubmit, onFieldChange }) => {
  const [showFilters, setShowFilters] = useState(false);
  const [guests, setGuests] = useState('2');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <div className="flights-search-panel">
      <form className="flights-form" onSubmit={handleSubmit}>
        {/* Destination */}
        <div className="flights-field" style={{ flex: '2' }}>
          <label className="flights-label" htmlFor="hotelCity">
            Where to?
          </label>
          <input
            id="hotelCity"
            className="flights-input"
            type="text"
            placeholder="New York, Paris, Tokyo..."
            value={filters.city || ''}
            onChange={(e) => onFieldChange('city', e.target.value)}
          />
        </div>

        {/* Check-in */}
        <div className="flights-field flights-field--date">
          <label className="flights-label" htmlFor="checkIn">
            Check-in
          </label>
          <input
            id="checkIn"
            className="flights-input"
            type="date"
            value={filters.checkIn || ''}
            onChange={(e) => onFieldChange('checkIn', e.target.value)}
          />
        </div>

        {/* Check-out */}
        <div className="flights-field flights-field--date">
          <label className="flights-label" htmlFor="checkOut">
            Check-out
          </label>
          <input
            id="checkOut"
            className="flights-input"
            type="date"
            value={filters.checkOut || ''}
            onChange={(e) => onFieldChange('checkOut', e.target.value)}
          />
        </div>

        {/* Guests */}
        <div className="flights-field flights-field--travelers">
          <label className="flights-label" htmlFor="guests">
            Guests
          </label>
          <select
            id="guests"
            className="flights-select"
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
          >
            <option value="1">1 guest</option>
            <option value="2">2 guests</option>
            <option value="3">3 guests</option>
            <option value="4">4+ guests</option>
          </select>
        </div>

        {/* Search button */}
        <div className="flights-search-button-wrapper">
          <button
            type="submit"
            className="flights-search-button"
            disabled={loading}
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
      </form>

      {/* Filters toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          type="button"
          className="flights-filters-toggle"
          onClick={() => setShowFilters(!showFilters)}
        >
          <i className="bi bi-sliders" />
          Filters
          <i className={`bi bi-chevron-${showFilters ? 'up' : 'down'}`} style={{ fontSize: '0.7rem' }} />
        </button>
      </div>

      {/* Expandable filters panel */}
      {showFilters && (
        <div className="flights-filters-panel">
          <div className="flights-field">
            <label className="flights-label" htmlFor="minStarRating">
              Min stars
            </label>
            <select
              id="minStarRating"
              className="flights-select"
              value={filters.minStarRating || ''}
              onChange={(e) => onFieldChange('minStarRating', e.target.value)}
            >
              <option value="">Any</option>
              <option value="3">3+ stars</option>
              <option value="4">4+ stars</option>
              <option value="5">5 stars</option>
            </select>
          </div>

          <div className="flights-field">
            <label className="flights-label" htmlFor="hotelMinPrice">
              Min price
            </label>
            <input
              id="hotelMinPrice"
              className="flights-input"
              type="number"
              min="0"
              placeholder="$0"
              value={filters.minPrice || ''}
              onChange={(e) => onFieldChange('minPrice', e.target.value)}
            />
          </div>

          <div className="flights-field">
            <label className="flights-label" htmlFor="hotelMaxPrice">
              Max price
            </label>
            <input
              id="hotelMaxPrice"
              className="flights-input"
              type="number"
              min="0"
              placeholder="$1000"
              value={filters.maxPrice || ''}
              onChange={(e) => onFieldChange('maxPrice', e.target.value)}
            />
          </div>

          <div className="flights-field">
            <label className="flights-label" htmlFor="amenities">
              Amenities
            </label>
            <input
              id="amenities"
              className="flights-input"
              type="text"
              placeholder="Wi-Fi, Pool, Gym..."
              value={filters.amenities || ''}
              onChange={(e) => onFieldChange('amenities', e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default HotelsSearchForm;
