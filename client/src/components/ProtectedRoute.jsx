// src/components/ProtectedRoute.jsx
import React from 'react';
import { useSelector } from 'react-redux';
import { Navigate, Outlet } from 'react-router-dom';
import { selectIsAuthenticated } from '../store/slices/authSlice';

/**
 * ProtectedRoute
 *
 * Supports BOTH usage patterns:
 *
 * 1) Wrapper with children (current usage in App.js):
 *    <ProtectedRoute>
 *      <MyBookingsPage />
 *    </ProtectedRoute>
 *
 * 2) Nested routes with Outlet:
 *    <Route element={<ProtectedRoute />}>
 *      <Route path="/my-bookings" element={<MyBookingsPage />} />
 *    </Route>
 */
const ProtectedRoute = ({ children }) => {
  const isAuthenticated = useSelector(selectIsAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If used as a wrapper, render its children
  if (children) {
    return children;
  }

  // If used with nested routes, render the Outlet
  return <Outlet />;
};

export default ProtectedRoute;
