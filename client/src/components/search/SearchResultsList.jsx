// src/components/search/SearchResultsList.jsx
import React from 'react';
import PropTypes from 'prop-types';
import PaginationControls from './PaginationControls';

/**
 * Generic result list wrapper.
 *
 * Props:
 *  - items: array of domain objects (flights / hotels / cars)
 *  - renderItem: function(item) => ReactNode   (you will typically render <SearchCard> here)
 *  - loading: boolean
 *  - error: string
 *  - pagination: { page, totalPages, total }
 *  - onPageChange: (nextPage) => void
 *  - emptyState: optional ReactNode when no results
 */
const SearchResultsList = ({
  items,
  renderItem,
  loading,
  error,
  pagination,
  onPageChange,
  emptyState,
}) => {
  return (
    <div className="flights-results">
      {loading && <div className="flights-loading">Loading results…</div>}

      {error && !loading && (
        <div className="flights-error">{error}</div>
      )}

      {!loading && !error && items && items.length === 0 && emptyState && (
        <div className="flights-empty">{emptyState}</div>
      )}

      {!loading && !error && items && items.length > 0 && (
        <>
          <div className="flights-results-meta">
            Showing {items.length} result
            {items.length !== 1 ? 's' : ''}{' '}
            {pagination && typeof pagination.total === 'number' &&
              `out of ${pagination.total} total`}
          </div>

          <div className="flights-result-list">
            {items.map((item, index) => (
              <React.Fragment key={item._id || index}>
                {renderItem(item)}
              </React.Fragment>
            ))}
          </div>

          <PaginationControls
            pagination={pagination}
            loading={loading}
            onPageChange={onPageChange}
          />
        </>
      )}
    </div>
  );
};

SearchResultsList.propTypes = {
  items: PropTypes.arrayOf(PropTypes.any),
  renderItem: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  error: PropTypes.string,
  pagination: PropTypes.shape({
    page: PropTypes.number,
    totalPages: PropTypes.number,
    total: PropTypes.number,
  }),
  onPageChange: PropTypes.func,
  emptyState: PropTypes.node,
};

SearchResultsList.defaultProps = {
  items: [],
  loading: false,
  error: '',
  pagination: null,
  onPageChange: () => {},
  emptyState: null,
};

export default SearchResultsList;
