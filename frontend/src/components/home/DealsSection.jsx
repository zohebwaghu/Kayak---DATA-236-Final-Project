// src/components/home/DealsSection.jsx
import React, { useState, useEffect } from 'react';
import { fetchDeals } from '../../api/homeService';
import './home.css';

const DealsSection = ({ onDealClick }) => {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDeals = async () => {
      setLoading(true);
      const data = await fetchDeals();
      setDeals(data);
      setLoading(false);
    };

    loadDeals();
  }, []);

  const getTypeIcon = (type) => {
    switch (type) {
      case 'flight': return 'bi-airplane-fill';
      case 'hotel': return 'bi-building';
      case 'car': return 'bi-car-front-fill';
      default: return 'bi-tag-fill';
    }
  };

  // Don't render if no deals
  if (!loading && deals.length === 0) {
    return null;
  }

  // Find max discount for badge
  const maxDiscount = deals.length > 0
    ? Math.max(...deals.map(d => d.discount))
    : 0;

  return (
    <section className="deals-section">
      <div className="deals-header">
        <div className="deals-title-row">
          <h2 className="deals-title">
            <i className="bi bi-lightning-charge-fill deals-title-icon" />
            Today's deals
          </h2>
          {maxDiscount > 0 && (
            <span className="deals-badge">Up to {maxDiscount}% off</span>
          )}
        </div>
        <p className="deals-subtitle">Limited-time offers on flights and hotels</p>
      </div>

      <div className="deals-scroll-container">
        <div className="deals-scroll">
          {loading ? (
            // Loading skeleton
            [1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="deal-card deal-card--loading">
                <div className="deal-skeleton" />
              </div>
            ))
          ) : (
            deals.map((deal) => (
              <button
                key={deal.id}
                className="deal-card"
                onClick={() => onDealClick && onDealClick(deal)}
              >
                <div className="deal-header">
                  <span className={`deal-type deal-type--${deal.type}`}>
                    <i className={`bi ${getTypeIcon(deal.type)}`} />
                    {deal.type}
                  </span>
                  <span className="deal-discount">-{deal.discount}%</span>
                </div>

                <div className="deal-content">
                  <h3 className="deal-title">{deal.title}</h3>
                  <p className="deal-subtitle">{deal.subtitle}</p>
                  <p className="deal-dates">{deal.dates}</p>
                </div>

                <div className="deal-footer">
                  <div className="deal-prices">
                    <span className="deal-original-price">${deal.originalPrice}</span>
                    <span className="deal-price">
                      ${deal.dealPrice}
                      {deal.perDay && <span className="deal-per">/day</span>}
                    </span>
                  </div>
                  <span className="deal-cta">
                    View deal <i className="bi bi-arrow-right" />
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </section>
  );
};

export default DealsSection;
