// src/components/AdminRoute.jsx
import React from 'react';
import { useSelector } from 'react-redux';
import { Navigate, Outlet } from 'react-router-dom';
import { selectIsAuthenticated, selectUserRole } from '../store/slices/authSlice';

/**
 * AdminRoute
 *
 * Supports BOTH usage patterns:
 *
 * 1) Wrapper with children (current usage in App.js):
 *    <AdminRoute>
 *      <AdminDashboardPage />
 *    </AdminRoute>
 *
 * 2) Nested routes with Outlet:
 *    <Route element={<AdminRoute />}>
 *      <Route path="/admin" element={<AdminDashboardPage />} />
 *    </Route>
 */
const AdminRoute = ({ children }) => {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const role = useSelector(selectUserRole);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  // If used as a wrapper, render its children
  if (children) {
    return children;
  }

  // If used with nested routes, render the Outlet
  return <Outlet />;
};

export default AdminRoute;
