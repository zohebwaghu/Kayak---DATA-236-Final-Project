// src/pages/search/FlightsSearchForm.jsx
import React from 'react';

const TIME_OF_DAY_OPTIONS = [
  { value: '', label: 'Any time' },
  { value: 'morning', label: 'Morning (5am-12pm)' },
  { value: 'afternoon', label: 'Afternoon (12pm-5pm)' },
  { value: 'evening', label: 'Evening (5pm-9pm)' },
  { value: 'night', label: 'Night (9pm-5am)' },
];

const FlightsSearchForm = ({ filters, loading, onSubmit, onFieldChange }) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <div className="flights-search-panel">
      <form className="flights-form" onSubmit={handleSubmit}>
        <div className="flights-field">
          <label className="flights-label" htmlFor="origin">
            From (origin)
          </label>
          <input
            id="origin"
            className="flights-input"
            type="text"
            placeholder="SFO"
            value={filters.origin || ''}
            onChange={(e) => onFieldChange('origin', e.target.value)}
          />
        </div>

        <div className="flights-field">
          <label className="flights-label" htmlFor="destination">
            To (destination)
          </label>
          <input
            id="destination"
            className="flights-input"
            type="text"
            placeholder="JFK"
            value={filters.destination || ''}
            onChange={(e) => onFieldChange('destination', e.target.value)}
          />
        </div>

        <div className="flights-field">
          <label className="flights-label" htmlFor="departureDate">
            Departure date
          </label>
          <input
            id="departureDate"
            className="flights-input"
            type="date"
            value={filters.departureDate || ''}
            onChange={(e) => onFieldChange('departureDate', e.target.value)}
          />
        </div>

        <div className="flights-field">
          <label className="flights-label" htmlFor="departureTimeOfDay">
            Departure time
          </label>
          <select
            id="departureTimeOfDay"
            className="flights-select"
            value={filters.departureTimeOfDay || ''}
            onChange={(e) => onFieldChange('departureTimeOfDay', e.target.value)}
          >
            {TIME_OF_DAY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flights-field">
          <label className="flights-label" htmlFor="arrivalDate">
            Arrival date
          </label>
          <input
            id="arrivalDate"
            className="flights-input"
            type="date"
            value={filters.arrivalDate || ''}
            onChange={(e) => onFieldChange('arrivalDate', e.target.value)}
          />
        </div>

        <div className="flights-field">
          <label className="flights-label" htmlFor="arrivalTimeOfDay">
            Arrival time
          </label>
          <select
            id="arrivalTimeOfDay"
            className="flights-select"
            value={filters.arrivalTimeOfDay || ''}
            onChange={(e) => onFieldChange('arrivalTimeOfDay', e.target.value)}
          >
            {TIME_OF_DAY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flights-field">
          <label className="flights-label" htmlFor="returnDate">
            Return date
          </label>
          <input
            id="returnDate"
            className="flights-input"
            type="date"
            value={filters.returnDate || ''}
            onChange={(e) => onFieldChange('returnDate', e.target.value)}
          />
        </div>

        <div className="flights-field">
          <label className="flights-label" htmlFor="minPrice">
            Min price
          </label>
          <input
            id="minPrice"
            className="flights-input"
            type="number"
            min="0"
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
            Max stops
          </label>
          <select
            id="maxStops"
            className="flights-select"
            value={filters.maxStops ?? ''}
            onChange={(e) => onFieldChange('maxStops', e.target.value)}
          >
            <option value="">Any</option>
            <option value="0">Non-stop only</option>
            <option value="1">Up to 1 stop</option>
            <option value="2">Up to 2 stops</option>
          </select>
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

export default FlightsSearchForm;
