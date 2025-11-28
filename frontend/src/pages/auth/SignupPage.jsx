// src/pages/auth/SignupPage.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';

const initialState = {
  userId: '',
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
  // kept for payload compatibility (not shown in UI)
  phone: '',
  street: '',
  line2: '',
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
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Basic client-side checks
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const ssnPattern = /^[0-9]{3}-[0-9]{2}-[0-9]{4}$/;
    if (!ssnPattern.test(formData.userId)) {
      setError('User ID must be in SSN format: ###-##-####');
      return;
    }

    try {
      setLoading(true);

      // 🔧 Minimal fix: don't send address with undefined fields
      const payload = {
        userId: formData.userId.trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        password: formData.password,
        // optional fields – user will fill on profile page
        phone: formData.phone?.trim() || '',
        // NOTE: no `address` field here, backend treats it as optional
      };

      await api.post('/auth/register', payload);

      setSuccess('Account created successfully. You can now log in.');
      setFormData(initialState);

      // Short delay so success message is visible
      setTimeout(() => navigate('/login'), 800);
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Signup failed. Please check your details and try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-page-bg min-vh-100 d-flex align-items-center justify-content-center">
      <div className="card signup-card shadow-lg border-0 rounded-4">
        <div className="card-body p-4 p-md-5">
          {/* Header */}
          <div className="mb-4 text-center text-md-start">
            <h1 className="fw-bold display-6 mb-1">
              Welcome to <span className="kayak-word">Kayak</span>
              <span className="kayak-accent-dot">.</span>
            </h1>
            <h5 className="fw-semibold text-muted">
              Let&apos;s get you going<span className="kayak-accent-dot">.</span>
            </h5>
            <p className="text-muted mt-2 mb-0">
              Just a few details to create your account. You can complete your profile later.
            </p>
          </div>

          {/* Alerts */}
          {error && (
            <div className="alert alert-danger py-2" role="alert">
              {error}
            </div>
          )}
          {success && (
            <div className="alert alert-success py-2" role="alert">
              {success}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            {/* Row 1: User ID + Email */}
            <div className="row g-3">
              <div className="col-md-4">
                <label className="form-label fw-semibold">
                  User ID (SSN) <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  className="form-control"
                  name="userId"
                  placeholder="123-45-6789"
                  value={formData.userId}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="col-md-8">
                <label className="form-label fw-semibold">
                  Email <span className="text-danger">*</span>
                </label>
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
            </div>

            {/* Row 2: Name */}
            <div className="row g-3 mt-1">
              <div className="col-md-6">
                <label className="form-label fw-semibold">
                  First name <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  className="form-control"
                  name="firstName"
                  placeholder="Enter First Name"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-semibold">
                  Last name <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  className="form-control"
                  name="lastName"
                  placeholder="Enter Last Name"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            {/* Row 3: Passwords */}
            <div className="row g-3 mt-1">
              <div className="col-md-6">
                <label className="form-label fw-semibold">
                  Password <span className="text-danger">*</span>
                </label>
                <input
                  type="password"
                  className="form-control"
                  name="password"
                  placeholder="Enter a password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-semibold">
                  Confirm password <span className="text-danger">*</span>
                </label>
                <input
                  type="password"
                  className="form-control"
                  name="confirmPassword"
                  placeholder="Re-enter password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            {/* Submit */}
            <div className="mt-4 d-flex flex-column flex-md-row align-items-center justify-content-between gap-2">
              <button
                type="submit"
                className="btn btn-kayak px-4 py-2"
                disabled={loading}
              >
                {loading ? 'Creating account...' : 'Create account'}
              </button>
              <p className="small text-muted mb-0 text-center text-md-end">
                By signing up you accept our{' '}
                <span className="text-decoration-underline">terms of use</span>{' '}
                and{' '}
                <span className="text-decoration-underline">
                  privacy policy
                </span>
                .
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;
