// src/components/home/TrustSection.jsx
import React, { useState, useEffect } from 'react';
import { fetchStats, fetchAirlines } from '../../api/homeService';
import './home.css';

const TrustSection = () => {
  const [stats, setStats] = useState([
    { value: '—', label: 'Flights' },
    { value: '—', label: 'Hotels' },
    { value: '—', label: 'Car rentals' },
  ]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      // Fetch stats and airlines in parallel
      const [statsData, airlinesData] = await Promise.all([
        fetchStats(),
        fetchAirlines(6),
      ]);

      setStats(statsData);
      setPartners(airlinesData);
      setLoading(false);
    };

    loadData();
  }, []);

  return (
    <section className="trust-section">
      <div className="trust-content">
        <div className="trust-message">
          <h3 className="trust-title">
            Search hundreds of travel sites at once
          </h3>
          <p className="trust-subtitle">
            Compare prices from 100s of airlines and booking sites to find the best deals
          </p>
        </div>

        <div className="trust-stats">
          {stats.map((stat, index) => (
            <div key={index} className="trust-stat">
              <span className={`trust-stat-value ${loading ? 'trust-stat-value--loading' : ''}`}>
                {stat.value}
              </span>
              <span className="trust-stat-label">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>

      {partners.length > 0 && (
        <div className="trust-partners">
          <span className="trust-partners-label">Featured partners:</span>
          <div className="trust-partners-list">
            {partners.map((partner, index) => (
              <span key={index} className="trust-partner-badge">
                {partner}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default TrustSection;
