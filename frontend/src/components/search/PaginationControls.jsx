// src/components/search/PaginationControls.jsx
import React from 'react';
import PropTypes from 'prop-types';

const PaginationControls = ({ pagination, loading, onPageChange }) => {
  if (!pagination || pagination.totalPages <= 1) return null;

  const { page, totalPages } = pagination;

  const handlePrev = () => {
    if (page > 1 && !loading) {
      onPageChange(page - 1);
    }
  };

  const handleNext = () => {
    if (page < totalPages && !loading) {
      onPageChange(page + 1);
    }
  };

  return (
    <div className="flights-pagination">
      <div className="flights-pagination-info">
        Page {page} of {totalPages}
      </div>
      <div className="flights-pagination-buttons">
        <button
          type="button"
          className="flights-pagination-button"
          disabled={page <= 1 || loading}
          onClick={handlePrev}
        >
          Previous
        </button>
        <button
          type="button"
          className="flights-pagination-button"
          disabled={page >= totalPages || loading}
          onClick={handleNext}
        >
          Next
        </button>
      </div>
    </div>
  );
};

PaginationControls.propTypes = {
  pagination: PropTypes.shape({
    page: PropTypes.number,
    totalPages: PropTypes.number,
    total: PropTypes.number,
  }),
  loading: PropTypes.bool,
  onPageChange: PropTypes.func.isRequired,
};

export default PaginationControls;
