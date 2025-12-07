// src/pages/search/CarsSearchForm.jsx
import React, { useState } from 'react';

const CarsSearchForm = ({ filters, loading, onSubmit, onFieldChange }) => {
  const [showFilters, setShowFilters] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <div className="flights-search-panel">
      <form className="flights-form" onSubmit={handleSubmit}>
        {/* Pick-up location */}
        <div className="flights-field" style={{ flex: '2' }}>
          <label className="flights-label" htmlFor="carLocation">
            Pick-up location
          </label>
          <input
            id="carLocation"
            className="flights-input"
            type="text"
            placeholder="Airport, city, or address"
            value={filters.location || ''}
            onChange={(e) => onFieldChange('location', e.target.value)}
          />
        </div>

        {/* Pick-up date */}
        <div className="flights-field flights-field--date">
          <label className="flights-label" htmlFor="pickUpDate">
            Pick-up
          </label>
          <input
            id="pickUpDate"
            className="flights-input"
            type="date"
            value={filters.pickUpDate || ''}
            onChange={(e) => onFieldChange('pickUpDate', e.target.value)}
          />
        </div>

        {/* Drop-off date */}
        <div className="flights-field flights-field--date">
          <label className="flights-label" htmlFor="dropOffDate">
            Drop-off
          </label>
          <input
            id="dropOffDate"
            className="flights-input"
            type="date"
            value={filters.dropOffDate || ''}
            onChange={(e) => onFieldChange('dropOffDate', e.target.value)}
          />
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
            <label className="flights-label" htmlFor="carType">
              Car type
            </label>
            <select
              id="carType"
              className="flights-select"
              value={filters.carType || ''}
              onChange={(e) => onFieldChange('carType', e.target.value)}
            >
              <option value="">Any type</option>
              <option value="Economy">Economy</option>
              <option value="Compact">Compact</option>
              <option value="Sedan">Sedan</option>
              <option value="SUV">SUV</option>
              <option value="Van">Van</option>
              <option value="Luxury">Luxury</option>
            </select>
          </div>

          <div className="flights-field">
            <label className="flights-label" htmlFor="carMinPrice">
              Min price/day
            </label>
            <input
              id="carMinPrice"
              className="flights-input"
              type="number"
              min="0"
              placeholder="$0"
              value={filters.minPrice || ''}
              onChange={(e) => onFieldChange('minPrice', e.target.value)}
            />
          </div>

          <div className="flights-field">
            <label className="flights-label" htmlFor="carMaxPrice">
              Max price/day
            </label>
            <input
              id="carMaxPrice"
              className="flights-input"
              type="number"
              min="0"
              placeholder="$200"
              value={filters.maxPrice || ''}
              onChange={(e) => onFieldChange('maxPrice', e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CarsSearchForm;
