// src/pages/bookings/MyBookingsPage.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectUser } from '../../store/slices/authSlice';

/**
 * MyBookingsPage
 *
 * Minimal, safe implementation so that:
 *  - The /my-bookings route renders without runtime errors.
 *  - It does NOT change any existing flows (search, payment, etc.).
 *  - You can later enhance this page to actually fetch & list bookings.
 */
const MyBookingsPage = () => {
  const navigate = useNavigate();
  const user = useSelector(selectUser);

  return (
    <div className="container py-4">
      <h1 className="mb-3">My trips</h1>

      <p className="mb-2">
        {user
          ? `Hi ${user.firstName || ''} ${user.lastName || ''}`.trim()
          : 'Hi there'}
      </p>

      <p className="mb-3">
        Your booking flow completed successfully. This page is a placeholder
        for your upcoming & past trips. You can safely continue using search
        and payment without any impact.
      </p>

      <button
        type="button"
        className="btn btn-primary"
        onClick={() => navigate('/')}
      >
        Back to search
      </button>
    </div>
  );
};

export default MyBookingsPage;
