// src/App.js
import React from 'react';
import { Routes, Route } from 'react-router-dom';

import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import Navbar from './components/layout/Navbar';

// Pages
import HomeSearchPage from './pages/search/HomeSearchPage';
import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import ProfilePage from './pages/user/ProfilePage';
import MyBookingsPage from './pages/bookings/MyBookingsPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import BookingSummaryPage from './pages/bookings/BookingSummaryPage';
import PaymentPage from './pages/bookings/PaymentPage';

function App() {
  return (
    <>
      <Navbar />

      <Routes>
        {/* Home / main search hero (flights/stays/cars/AI tabs) */}
        <Route path="/" element={<HomeSearchPage />} />

        {/* Auth */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        {/* Profile – currently not protected for debugging */}
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/user/profile" element={<ProfilePage />} />

        {/* Protected user routes */}
        <Route path="/my-bookings" element={<ProtectedRoute />}>
          <Route index element={<MyBookingsPage />} />
        </Route>

        {/* Booking flow (summary + payment) */}
        <Route path="/booking" element={<ProtectedRoute />}>
          <Route path="summary" element={<BookingSummaryPage />} />
          <Route path="payment" element={<PaymentPage />} />
        </Route>

        {/* Admin routes */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminDashboardPage />
            </AdminRoute>
          }
        />

        {/* Fallback: any unknown route goes to home */}
        <Route path="*" element={<HomeSearchPage />} />
      </Routes>
    </>
  );
}

export default App;
