// src/components/search/SearchCard.jsx
import React from 'react';
import PropTypes from 'prop-types';

/**
 * Generic horizontal search result card.
 *
 * Used for:
 *  - Flights  (no thumbnail)
 *  - Hotels   (thumbnail = hotel image / placeholder)
 *  - Cars     (thumbnail = car image / placeholder)
 *
 * Layout:
 *  [thumb?]  [title + meta/subtitle]        [price + actions]
 */
const SearchCard = ({
  thumbnailUrl,
  thumbnailAlt,
  thumbnailFallback,
  title,
  subtitle,
  meta,
  priceText,
  rightBadge,
  actions,        // 🔹 NEW: optional actions area (e.g., Book button)
}) => {
  const showThumbnail = Boolean(thumbnailUrl || thumbnailFallback);

  return (
    <div className="flight-card">
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
          {rightBadge && (
            <div className="search-card-badge">
              {rightBadge}
            </div>
          )}
        </div>
      </div>

      {/* Price / right side */}
      <div className="flight-card-price">
        {priceText ?? '—'}

        {/* 🔹 Optional actions area (e.g., "Book" button) */}
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
  rightBadge: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  actions: PropTypes.oneOfType([PropTypes.string, PropTypes.node]), // 🔹 NEW
};

export default SearchCard;
