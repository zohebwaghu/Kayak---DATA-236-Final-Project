// src/pages/search/FlightsSearchForm.jsx
import React, { useState } from 'react';

const FlightsSearchForm = ({ filters, loading, onSubmit, onFieldChange }) => {
  const [showFilters, setShowFilters] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <div className="flights-search-panel">
      <form className="flights-form" onSubmit={handleSubmit}>
        {/* Origin */}
        <div className="flights-field">
          <label className="flights-label" htmlFor="origin">
            From
          </label>
          <input
            id="origin"
            className="flights-input"
            type="text"
            placeholder="City or airport"
            value={filters.origin || ''}
            onChange={(e) => onFieldChange('origin', e.target.value)}
          />
        </div>

        {/* Destination */}
        <div className="flights-field">
          <label className="flights-label" htmlFor="destination">
            To
          </label>
          <input
            id="destination"
            className="flights-input"
            type="text"
            placeholder="City or airport"
            value={filters.destination || ''}
            onChange={(e) => onFieldChange('destination', e.target.value)}
          />
        </div>

        {/* Dates */}
        <div className="flights-field flights-field--date">
          <label className="flights-label" htmlFor="departureDate">
            Depart
          </label>
          <input
            id="departureDate"
            className="flights-input"
            type="date"
            value={filters.departureDate || ''}
            onChange={(e) => onFieldChange('departureDate', e.target.value)}
          />
        </div>

        <div className="flights-field flights-field--date">
          <label className="flights-label" htmlFor="returnDate">
            Return
          </label>
          <input
            id="returnDate"
            className="flights-input"
            type="date"
            value={filters.returnDate || ''}
            onChange={(e) => onFieldChange('returnDate', e.target.value)}
          />
        </div>

        {/* Travelers (simplified) */}
        <div className="flights-field flights-field--travelers">
          <label className="flights-label" htmlFor="travelers">
            Travelers
          </label>
          <select
            id="travelers"
            className="flights-select"
            defaultValue="1"
          >
            <option value="1">1 adult</option>
            <option value="2">2 adults</option>
            <option value="3">3 adults</option>
            <option value="4">4+ adults</option>
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
            <label className="flights-label" htmlFor="minPrice">
              Min price
            </label>
            <input
              id="minPrice"
              className="flights-input"
              type="number"
              min="0"
              placeholder="$0"
              value={filters.minPrice || ''}
              onChange={(e) => onFieldChange('minPrice', e.target.value)}
            />
          </div>

          <div className="flights-field">
            <label className="flights-label" htmlFor="maxPrice">
              Max price
            </label>
            <input
              id="maxPrice"
              className="flights-input"
              type="number"
              min="0"
              placeholder="$5000"
              value={filters.maxPrice || ''}
              onChange={(e) => onFieldChange('maxPrice', e.target.value)}
            />
          </div>

          <div className="flights-field">
            <label className="flights-label" htmlFor="airline">
              Airline
            </label>
            <input
              id="airline"
              className="flights-input"
              type="text"
              placeholder="Any airline"
              value={filters.airline || ''}
              onChange={(e) => onFieldChange('airline', e.target.value)}
            />
          </div>

          <div className="flights-field">
            <label className="flights-label" htmlFor="maxStops">
              Stops
            </label>
            <select
              id="maxStops"
              className="flights-select"
              value={filters.maxStops ?? ''}
              onChange={(e) => onFieldChange('maxStops', e.target.value)}
            >
              <option value="">Any</option>
              <option value="0">Non-stop</option>
              <option value="1">1 stop max</option>
              <option value="2">2 stops max</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlightsSearchForm;
