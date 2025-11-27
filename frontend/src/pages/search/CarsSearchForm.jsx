// src/pages/search/CarsSearchForm.jsx
import React from 'react';

const CarsSearchForm = ({ filters, loading, onSubmit, onFieldChange }) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <div className="flights-search-panel">
      <form className="flights-form" onSubmit={handleSubmit}>
        <div className="flights-field">
          <label className="flights-label" htmlFor="carLocation">
            Location
          </label>
          <input
            id="carLocation"
            className="flights-input"
            type="text"
            placeholder="All airports, New York"
            value={filters.location || ''}
            onChange={(e) => onFieldChange('location', e.target.value)}
          />
        </div>

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
            <option value="">Any</option>
            <option value="SUV">SUV</option>
            <option value="Sedan">Sedan</option>
            <option value="Compact">Compact</option>
            <option value="Van">Van</option>
          </select>
        </div>

        <div className="flights-field">
          <label className="flights-label" htmlFor="carMinPrice">
            Min price
          </label>
          <input
            id="carMinPrice"
            className="flights-input"
            type="number"
            min="0"
            value={filters.minPrice || ''}
            onChange={(e) => onFieldChange('minPrice', e.target.value)}
          />
        </div>

        <div className="flights-field">
          <label className="flights-label" htmlFor="carMaxPrice">
            Max price
          </label>
          <input
            id="carMaxPrice"
            className="flights-input"
            type="number"
            min="0"
            value={filters.maxPrice || ''}
            onChange={(e) => onFieldChange('maxPrice', e.target.value)}
          />
        </div>

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
    </div>
  );
};

export default CarsSearchForm;
