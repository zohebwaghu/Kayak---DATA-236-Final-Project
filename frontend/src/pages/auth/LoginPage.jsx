// src/pages/auth/LoginPage.jsx
import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { loginSuccess } from '../../store/slices/authSlice';

const LoginPage = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setError('');
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      setLoading(true);

      const payload = {
        email: formData.email.trim(),
        password: formData.password,
      };

      const res = await api.post('/auth/login', payload);

      // Backend contract from User Service
      const { accessToken, user } = res.data || {};

      if (!accessToken || !user) {
        throw new Error('Invalid login response from server.');
      }

      // Save in Redux (also goes to localStorage via slice)
      dispatch(
        loginSuccess({
          accessToken,
          user,
        })
      );

      // Redirect after login – for now send user to Hotels search
      navigate('/search/hotels');
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Login failed. Please check your email and password.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-bg min-vh-100 d-flex align-items-center justify-content-center">
      <div className="card login-card shadow-lg border-0 rounded-4">
        <div className="card-body p-4 p-md-5">
          {/* Header */}
          <div className="mb-4 text-center text-md-start">
            <h1 className="fw-bold display-6 mb-1">
              Welcome back<span className="kayak-accent-dot">.</span>
            </h1>
            <h5 className="fw-semibold text-muted">
              Login to your Kayak Clone account
              <span className="kayak-accent-dot">.</span>
            </h5>
            <p className="text-muted mt-2 mb-0">
              Access your saved searches, bookings, and personalized deals.
            </p>
          </div>

          {/* Alerts */}
          {error && (
            <div className="alert alert-danger py-2" role="alert">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label fw-semibold">Email</label>
              <input
                type="email"
                className="form-control"
                name="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>

            <div className="mb-1">
              <label className="form-label fw-semibold">Password</label>
              <input
                type="password"
                className="form-control"
                name="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
                required
              />
            </div>

            <div className="mb-3 d-flex justify-content-between align-items-center"></div>

            {/* Primary button */}
            <div className="d-grid mb-3">
              <button
                type="submit"
                className="btn btn-kayak py-2"
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Continue with email'}
              </button>
            </div>

            {/* Legal + signup text stacked */}
            <div className="mt-3 login-legal-text">
              <p className="text-muted small mb-1">
                By signing in you accept our{' '}
                <span className="text-decoration-underline">terms of use</span>{' '}
                and{' '}
                <span className="text-decoration-underline">
                  privacy policy
                </span>
                .
              </p>
              <p className="text-muted small mb-0">
                New user?{' '}
                <Link to="/signup" className="fw-semibold text-decoration-none">
                  Create an account
                </Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
