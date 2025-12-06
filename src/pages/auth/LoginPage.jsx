// src/pages/auth/LoginPage.jsx
// Real Kayak-style Login Page

import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { loginSuccess } from '../../store/slices/authSlice';
import './AuthPages.css';

const LoginPage = () => {
  const [showEmailForm, setShowEmailForm] = useState(false);
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

      const { accessToken, user } = res.data || {};

      if (!accessToken || !user) {
        throw new Error('Invalid login response from server.');
      }

      dispatch(
        loginSuccess({
          accessToken,
          user,
        })
      );

      navigate('/search/flights');
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
    <div className="kayak-auth-page">
      {/* Main Content */}
      <main className="kayak-auth-main">
        <div className="kayak-auth-card">
          <h1 className="kayak-auth-headline">
            Hey, friend.<br />
            Nice seeing you again<span className="kayak-auth-dot">.</span>
          </h1>

          <p className="kayak-auth-benefits-intro">
            Sign in to get some great benefits you're missing out on right now:
          </p>

          <ul className="kayak-auth-benefits">
            <li>Cheaper prices with member-only discounts</li>
            <li>Fast and easy booking with saved details</li>
            <li>Free trip planning, synced to all your devices</li>
          </ul>

          {/* Error Alert */}
          {error && (
            <div className="kayak-auth-alert">
              {error}
            </div>
          )}

          {!showEmailForm ? (
            <>
              {/* Social Login Buttons */}
              <div className="kayak-auth-social-buttons">
                <button className="kayak-auth-social-btn" disabled>
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span>Google</span>
                </button>
                <button className="kayak-auth-social-btn" disabled>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#000">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                  <span>Apple</span>
                </button>
              </div>

              <div className="kayak-auth-divider">
                <span>or</span>
              </div>

              {/* Continue with Email */}
              <button
                className="kayak-auth-email-btn"
                onClick={() => setShowEmailForm(true)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                <span>Continue with email</span>
              </button>
            </>
          ) : (
            /* Email Login Form */
            <form onSubmit={handleSubmit} className="kayak-auth-form">
              <div className="kayak-auth-field">
                <label className="kayak-auth-label">Email address</label>
                <input
                  type="email"
                  className="kayak-auth-input"
                  name="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="kayak-auth-field">
                <label className="kayak-auth-label">Password</label>
                <input
                  type="password"
                  className="kayak-auth-input"
                  name="password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  autoComplete="current-password"
                />
              </div>

              <button
                type="submit"
                className="kayak-auth-submit-btn"
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>

              <button
                type="button"
                className="kayak-auth-back-btn"
                onClick={() => setShowEmailForm(false)}
              >
                Back to other options
              </button>
            </form>
          )}

          {/* Terms */}
          <p className="kayak-auth-terms">
            By adding your email you accept our{' '}
            <a href="#terms">Terms of Use</a> and{' '}
            <a href="#privacy">Privacy Policy</a>.
          </p>

          {/* Footer */}
          <div className="kayak-auth-footer">
            <p>
              Don't have an account?{' '}
              <Link to="/signup" className="kayak-auth-link">
                Create one
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LoginPage;
