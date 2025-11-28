// src/pages/search/HotelsSearchForm.jsx
import React from 'react';

const HotelsSearchForm = ({ filters, loading, onSubmit, onFieldChange }) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <div className="flights-search-panel">
      <form className="flights-form" onSubmit={handleSubmit}>
        <div className="flights-field">
          <label className="flights-label" htmlFor="hotelCity">
            City
          </label>
          <input
            id="hotelCity"
            className="flights-input"
            type="text"
            placeholder="New York"
            value={filters.city || ''}
            onChange={(e) => onFieldChange('city', e.target.value)}
          />
        </div>

        <div className="flights-field">
          <label className="flights-label" htmlFor="minStarRating">
            Min star rating
          </label>
          <input
            id="minStarRating"
            className="flights-input"
            type="number"
            min="1"
            max="5"
            value={filters.minStarRating || ''}
            onChange={(e) => onFieldChange('minStarRating', e.target.value)}
          />
        </div>

        <div className="flights-field">
          <label className="flights-label" htmlFor="maxStarRating">
            Max star rating
          </label>
          <input
            id="maxStarRating"
            className="flights-input"
            type="number"
            min="1"
            max="5"
            value={filters.maxStarRating || ''}
            onChange={(e) => onFieldChange('maxStarRating', e.target.value)}
          />
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
            placeholder="Wi-Fi, Breakfast, Parking"
            value={filters.amenities || ''}
            onChange={(e) => onFieldChange('amenities', e.target.value)}
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

export default HotelsSearchForm;
