// src/components/search/SearchCard.jsx
import React from 'react';
import PropTypes from 'prop-types';

/**
 * Enhanced horizontal search result card.
 *
 * Used for:
 *  - Flights  (no thumbnail, timeline layout)
 *  - Hotels   (thumbnail = hotel image / placeholder)
 *  - Cars     (thumbnail = car image / placeholder)
 *
 * Layout:
 *  [thumb?]  [title + meta/subtitle + badges]  [price + actions]
 */
const SearchCard = ({
  thumbnailUrl,
  thumbnailAlt,
  thumbnailFallback,
  title,
  subtitle,
  meta,
  priceText,
  priceSubtext,
  rightBadge,
  topBadge,
  features,
  actions,
}) => {
  const showThumbnail = Boolean(thumbnailUrl || thumbnailFallback);

  return (
    <div className="flight-card fade-in-up">
      {/* Top badge (e.g., "Best deal", "Recommended") */}
      {topBadge && (
        <div className="search-card-top-badge">
          {topBadge}
        </div>
      )}

      <div className="flight-card-main">
        {/* Thumbnail (optional) */}
        {showThumbnail && (
          <div className="search-card-thumb">
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={thumbnailAlt || 'Result thumbnail'}
                className="search-card-thumb-img"
              />
            ) : (
              <div className="search-card-thumb-fallback">
                {thumbnailFallback}
              </div>
            )}
          </div>
        )}

        {/* Text content */}
        <div className="search-card-text">
          {title && <div className="flight-card-route">{title}</div>}
          {(subtitle || meta) && (
            <div className="flight-card-meta">
              {subtitle && <span>{subtitle}</span>}
              {subtitle && meta && <span> · </span>}
              {meta && <span>{meta}</span>}
            </div>
          )}

          {/* Features row (e.g., "Wi-Fi", "Free cancellation") */}
          {features && features.length > 0 && (
            <div className="search-card-features">
              {features.map((feature, index) => (
                <span key={index} className="search-card-feature">
                  {feature.icon && <i className={`bi ${feature.icon}`} />}
                  {feature.text || feature}
                </span>
              ))}
            </div>
          )}

          {rightBadge && (
            <div className="search-card-badge">
              {rightBadge}
            </div>
          )}
        </div>
      </div>

      {/* Price / right side */}
      <div className="flight-card-price">
        <div className="search-card-price-main">
          {priceText ?? '—'}
        </div>
        {priceSubtext && (
          <div className="search-card-price-sub">
            {priceSubtext}
          </div>
        )}

        {/* Optional actions area (e.g., "Book" button) */}
        {actions && (
          <div className="search-card-actions">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};

SearchCard.propTypes = {
  thumbnailUrl: PropTypes.string,
  thumbnailAlt: PropTypes.string,
  thumbnailFallback: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  title: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  subtitle: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  meta: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  priceText: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  priceSubtext: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  rightBadge: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  topBadge: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  features: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.shape({
        icon: PropTypes.string,
        text: PropTypes.string,
      }),
    ])
  ),
  actions: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
};

export default SearchCard;
