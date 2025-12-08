// src/components/home/PopularDestinations.jsx
import React, { useState, useEffect } from 'react';
import { fetchPopularDestinations } from '../../api/homeService';
import './home.css';

const PopularDestinations = ({ onDestinationClick }) => {
  const [destinations, setDestinations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDestinations = async () => {
      setLoading(true);
      const data = await fetchPopularDestinations(6);
      setDestinations(data);
      setLoading(false);
    };

    loadDestinations();
  }, []);

  const handleClick = (destination) => {
    if (onDestinationClick) {
      onDestinationClick(destination);
    }
  };

  // Don't render if no destinations
  if (!loading && destinations.length === 0) {
    return null;
  }

  return (
    <section className="destinations-section">
      <div className="destinations-header">
        <h2 className="destinations-title">Popular destinations</h2>
        <p className="destinations-subtitle">Explore trending places from your city</p>
      </div>

      {loading ? (
        <div className="destinations-loading">
          <div className="destinations-grid">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="destination-card destination-card--loading">
                <div className="destination-skeleton" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="destinations-grid">
          {destinations.map((dest, index) => (
            <button
              key={index}
              className="destination-card"
              onClick={() => handleClick(dest)}
            >
              <div className="destination-image-wrapper">
                <img
                  src={dest.image}
                  alt={`${dest.city}, ${dest.country}`}
                  className="destination-image"
                  loading="lazy"
                  onError={(e) => {
                    // Fallback to a default travel image if load fails
                    e.target.src = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=600&h=400&q=85';
                  }}
                />
                <div className="destination-overlay" />
              </div>
              <div className="destination-info">
                <div className="destination-location">
                  <span className="destination-city">{dest.city}</span>
                  <span className="destination-country">{dest.country}</span>
                </div>
                <div className="destination-price">
                  <span className="destination-from">from</span>
                  <span className="destination-amount">${dest.price}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

export default PopularDestinations;
