// src/pages/auth/SignupPage.jsx
// Real Kayak-style Signup Page

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import './AuthPages.css';

// Valid US states
const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' }, { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
];

const formatPhoneNumber = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

const initialState = {
  userId: '',
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
  phone: '',
  street: '',
  city: '',
  state: '',
  zipCode: '',
};

const SignupPage = () => {
  const [formData, setFormData] = useState(initialState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePhoneChange = (e) => {
    const formatted = formatPhoneNumber(e.target.value);
    setFormData((prev) => ({ ...prev, phone: formatted }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const ssnPattern = /^[0-9]{3}-[0-9]{2}-[0-9]{4}$/;
    if (!ssnPattern.test(formData.userId)) {
      setError('User ID must be in SSN format: ###-##-####');
      return;
    }

    const zipRegex = /^\d{5}(?:-\d{4})?$/;
    if (formData.zipCode && !zipRegex.test(formData.zipCode.trim())) {
      setError('ZIP code must be 5 digits or 5+4 format.');
      return;
    }

    if (formData.phone) {
      const digitsOnly = formData.phone.replace(/\D/g, '');
      if (digitsOnly.length !== 10) {
        setError('Phone number must be 10 digits.');
        return;
      }
    }

    try {
      setLoading(true);

      const payload = {
        userId: formData.userId.trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        password: formData.password,
        phone: formData.phone?.trim() || '',
        address: {
          street: formData.street?.trim() || '',
          city: formData.city?.trim() || '',
          state: formData.state || '',
          zipCode: formData.zipCode?.trim() || '',
        },
      };

      await api.post('/auth/register', payload);
      setSuccess('Account created successfully!');
      setFormData(initialState);
      setTimeout(() => navigate('/login'), 800);
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Signup failed. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="kayak-auth-page">
      {/* Main Content */}
      <main className="kayak-auth-main">
        <div className="kayak-auth-card kayak-auth-card-wide">
          <h1 className="kayak-auth-headline">
            Welcome to KAYAK<span className="kayak-auth-dot">.</span>
          </h1>

          <p className="kayak-auth-benefits-intro">
            Create an account to unlock these benefits:
          </p>

          <ul className="kayak-auth-benefits">
            <li>Cheaper prices with member-only discounts</li>
            <li>Fast and easy booking with saved details</li>
            <li>Free trip planning, synced to all your devices</li>
          </ul>

          {/* Alerts */}
          {error && (
            <div className="kayak-auth-alert">
              {error}
            </div>
          )}
          {success && (
            <div className="kayak-auth-alert" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#16a34a' }}>
              {success}
            </div>
          )}

          {/* Signup Form */}
          <form onSubmit={handleSubmit} className="kayak-auth-form">
            {/* User ID (SSN) */}
            <div className="kayak-auth-field">
              <label className="kayak-auth-label">User ID (SSN format) *</label>
              <input
                type="text"
                className="kayak-auth-input"
                name="userId"
                placeholder="123-45-6789"
                value={formData.userId}
                onChange={handleChange}
                required
              />
            </div>

            {/* Name Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="kayak-auth-field">
                <label className="kayak-auth-label">First name *</label>
                <input
                  type="text"
                  className="kayak-auth-input"
                  name="firstName"
                  placeholder="John"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="kayak-auth-field">
                <label className="kayak-auth-label">Last name *</label>
                <input
                  type="text"
                  className="kayak-auth-input"
                  name="lastName"
                  placeholder="Doe"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            {/* Email & Phone */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="kayak-auth-field">
                <label className="kayak-auth-label">Email *</label>
                <input
                  type="email"
                  className="kayak-auth-input"
                  name="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="kayak-auth-field">
                <label className="kayak-auth-label">Phone</label>
                <input
                  type="tel"
                  className="kayak-auth-input"
                  name="phone"
                  placeholder="(555) 123-4567"
                  value={formData.phone}
                  onChange={handlePhoneChange}
                />
              </div>
            </div>

            {/* Address */}
            <div className="kayak-auth-field">
              <label className="kayak-auth-label">Street address</label>
              <input
                type="text"
                className="kayak-auth-input"
                name="street"
                placeholder="123 Main St"
                value={formData.street}
                onChange={handleChange}
              />
            </div>

            {/* City, State, Zip */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
              <div className="kayak-auth-field">
                <label className="kayak-auth-label">City</label>
                <input
                  type="text"
                  className="kayak-auth-input"
                  name="city"
                  placeholder="San Jose"
                  value={formData.city}
                  onChange={handleChange}
                />
              </div>
              <div className="kayak-auth-field">
                <label className="kayak-auth-label">State</label>
                <select
                  className="kayak-auth-input"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="">Select</option>
                  {US_STATES.map((st) => (
                    <option key={st.code} value={st.code}>
                      {st.code}
                    </option>
                  ))}
                </select>
              </div>
              <div className="kayak-auth-field">
                <label className="kayak-auth-label">ZIP</label>
                <input
                  type="text"
                  className="kayak-auth-input"
                  name="zipCode"
                  placeholder="95112"
                  value={formData.zipCode}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* Passwords */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="kayak-auth-field">
                <label className="kayak-auth-label">Password *</label>
                <input
                  type="password"
                  className="kayak-auth-input"
                  name="password"
                  placeholder="Create password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="kayak-auth-field">
                <label className="kayak-auth-label">Confirm *</label>
                <input
                  type="password"
                  className="kayak-auth-input"
                  name="confirmPassword"
                  placeholder="Confirm password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="kayak-auth-submit-btn"
              disabled={loading}
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          {/* Terms */}
          <p className="kayak-auth-terms">
            By creating an account, you agree to our{' '}
            <a href="#terms">Terms of Use</a> and{' '}
            <a href="#privacy">Privacy Policy</a>.
          </p>

          {/* Footer */}
          <div className="kayak-auth-footer">
            <p>
              Already have an account?{' '}
              <Link to="/login" className="kayak-auth-link">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SignupPage;
