// src/pages/user/ProfilePage.jsx
import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import api from '../../api/axios';
import './ProfilePage.css';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const zipRegex = /^\d{5}(?:-\d{4})?$/;

const validateEmail = (email) => emailRegex.test(email);
const validateZip = (zip) => zipRegex.test(zip);
const validateStateCode = (state) =>
  typeof state === 'string' && state.length === 2 && /^[A-Z]{2}$/.test(state);

/**
 * Format a US-style phone number as:
 * (123) 456-7890
 */
const formatPhoneNumber = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 10); // max 10 digits
  const len = digits.length;

  if (len === 0) return '';
  if (len < 4) return digits;
  if (len < 7) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

const ProfilePage = () => {
  const authState = useSelector((state) => state.auth);
  const authUser = authState?.user;
  const userId = authUser?.userId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // We keep a copy of the last saved profile to support "Cancel" cleanly
  const [savedProfile, setSavedProfile] = useState(null);

  const [form, setForm] = useState({
    userId: '',
    firstName: '',
    lastName: '',
    email: '',
    role: '',
    phone: '',
    street: '',
    line2: '',
    city: '',
    state: '',
    zipCode: '',
    createdAt: '',
    updatedAt: '',
  });

  // ========= LOAD PROFILE FROM BACKEND =========
  useEffect(() => {
    const loadProfile = async () => {
      if (!authUser || !authUser.userId) {
        setError('Unable to load profile. Please log in again.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      setSuccessMessage('');

      try {
        // Axios instance already attaches Authorization header via interceptor
        const res = await api.get(`/users/${authUser.userId}`);
        const data = res.data || {};
        const address = data.address || {};

        const initialProfile = {
          userId: data.userId || authUser.userId || '',
          firstName: data.firstName || authUser.firstName || '',
          lastName: data.lastName || authUser.lastName || '',
          email: data.email || authUser.email || '',
          role: data.role || authUser.role || 'user',
          phone: data.phone || authUser.phone || '',
          street: address.street || address.line1 || '',
          line2: address.line2 || '',
          city: address.city || '',
          state: address.state || '',
          zipCode: address.zipCode || '',
          createdAt: data.createdAt || authUser.createdAt || '',
          updatedAt: data.updatedAt || authUser.updatedAt || '',
        };

        setForm(initialProfile);
        setSavedProfile(initialProfile);
        setIsEditing(false);
      } catch (err) {
        console.error(
          'Error loading profile from backend:',
          err?.response?.status,
          err?.response?.data || err?.message
        );

        // Fallback: at least use authUser data so page is not empty
        if (authUser) {
          const address = authUser.address || {};
          const fallbackProfile = {
            userId: authUser.userId || '',
            firstName: authUser.firstName || '',
            lastName: authUser.lastName || '',
            email: authUser.email || '',
            role: authUser.role || 'user',
            phone: authUser.phone || '',
            street: address.street || address.line1 || '',
            line2: address.line2 || '',
            city: address.city || '',
            state: address.state || '',
            zipCode: address.zipCode || '',
            createdAt: authUser.createdAt || '',
            updatedAt: authUser.updatedAt || '',
          };
          setForm(fallbackProfile);
          setSavedProfile(fallbackProfile);
        }

        const msg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          'Failed to load profile. Please try again.';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [authUser]);

  // ========= FORM HANDLERS =========

  const handleChange = (field) => (e) => {
    setForm((prev) => ({
      ...prev,
      [field]: e.target.value,
    }));
  };

  const handlePhoneChange = (e) => {
    const formatted = formatPhoneNumber(e.target.value);
    setForm((prev) => ({
      ...prev,
      phone: formatted,
    }));
  };

  const handleStateChange = (e) => {
    const raw = e.target.value.toUpperCase().slice(0, 2);
    setForm((prev) => ({
      ...prev,
      state: raw,
    }));
  };

  const handleCancel = () => {
    if (savedProfile) {
      setForm(savedProfile);
    }
    setError('');
    setSuccessMessage('');
    setIsEditing(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!userId) {
      setError('User ID missing. Please log in again.');
      return;
    }

    setError('');
    setSuccessMessage('');

    const messages = [];

    if (!form.firstName.trim()) messages.push('First name is required.');
    if (!form.lastName.trim()) messages.push('Last name is required.');
    if (!form.email.trim()) {
      messages.push('Email is required.');
    } else if (!validateEmail(form.email.trim())) {
      messages.push('Please enter a valid email address.');
    }
    if (form.state && !validateStateCode(form.state.trim())) {
      messages.push('State must be a valid 2-letter code (e.g., CA).');
    }
    if (form.zipCode && !validateZip(form.zipCode.trim())) {
      messages.push(
        'ZIP code must be 5 digits or 5+4 digits (e.g., 95112 or 95112-1234).'
      );
    }

    if (messages.length > 0) {
      setError(messages.join(' '));
      return;
    }

    setSaving(true);

    try {
      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        email: form.email,
        address: {
          street: form.street,
          line2: form.line2,
          city: form.city,
          state: form.state,
          zipCode: form.zipCode,
        },
      };

      // baseURL of api already includes /api/v1, so this hits /api/v1/users/:id
      // Authorization header is added by the axios interceptor
      const response = await api.put(`/users/${userId}`, payload);
      const updated = response.data || {};

      const updatedAddress = updated.address || {};
      const updatedProfile = {
        userId: updated.userId || form.userId,
        firstName: updated.firstName || form.firstName,
        lastName: updated.lastName || form.lastName,
        email: updated.email || form.email,
        role: updated.role || form.role || 'user',
        phone: updated.phone || form.phone,
        street: updatedAddress.street || updatedAddress.line1 || form.street,
        line2: updatedAddress.line2 ?? form.line2,
        city: updatedAddress.city || form.city,
        state: updatedAddress.state || form.state,
        zipCode: updatedAddress.zipCode || form.zipCode,
        createdAt: updated.createdAt || form.createdAt,
        updatedAt: updated.updatedAt || form.updatedAt,
      };

      setForm(updatedProfile);
      setSavedProfile(updatedProfile);
      setSuccessMessage('Profile updated successfully.');
      setIsEditing(false);
    } catch (err) {
      console.error(
        'Error updating profile:',
        err?.response?.status,
        err?.response?.data || err?.message
      );
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Failed to update profile. Please check your input.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const renderValue = (value, placeholder = 'Not added yet') =>
    value ? (
      <span>{value}</span>
    ) : (
      <span className="profile-readonly-muted">{placeholder}</span>
    );

  // ========= RENDER =========

  return (
    <div className="profile-page">
      <div className="container">
        <div className="profile-header-row">
          <h1 className="profile-title">Your profile</h1>
          <p className="profile-subtitle">
            View and update the personal details and contact information used for
            bookings.
          </p>
        </div>

        <div className="row justify-content-center">
          <div className="col-lg-8 col-md-10">
            <div className="profile-card">
              <div className="profile-card-header">
                <div className="profile-avatar-circle">
                  {form.firstName?.[0]?.toUpperCase() ||
                    authUser?.firstName?.[0]?.toUpperCase() ||
                    'U'}
                </div>
                <div className="profile-card-header-text">
                  <div className="profile-card-name">
                    {form.firstName || form.lastName
                      ? `${form.firstName} ${form.lastName}`.trim()
                      : 'Unnamed user'}
                  </div>
                  {form.email && (
                    <div className="profile-card-email">{form.email}</div>
                  )}
                </div>
              </div>

              {loading && (
                <div className="alert alert-secondary mb-0">
                  Loading your profile…
                </div>
              )}

              {!loading && error && (
                <div className="alert alert-danger mb-3">{error}</div>
              )}

              {!loading && !error && (
                <form onSubmit={handleSubmit}>
                  {successMessage && (
                    <div className="alert alert-success">{successMessage}</div>
                  )}

                  {/* Account info (always read-only) */}
                  <div className="profile-section">
                    <h2 className="profile-section-title">Account details</h2>
                    <div className="row g-3">
                      <div className="col-md-6">
                        <label className="form-label">User ID (SSN)</label>
                        <div className="profile-readonly-value">
                          {renderValue(form.userId, '—')}
                        </div>
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Role</label>
                        <div className="profile-readonly-value">
                          {renderValue(form.role || 'user', 'user')}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Personal info */}
                  <div className="profile-section">
                    <h2 className="profile-section-title">Personal info</h2>
                    <div className="row g-3">
                      <div className="col-md-6">
                        <label className="form-label">First name</label>
                        {isEditing ? (
                          <input
                            type="text"
                            className="form-control"
                            placeholder="Enter first name"
                            value={form.firstName}
                            onChange={handleChange('firstName')}
                          />
                        ) : (
                          <div className="profile-readonly-value">
                            {renderValue(form.firstName)}
                          </div>
                        )}
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Last name</label>
                        {isEditing ? (
                          <input
                            type="text"
                            className="form-control"
                            placeholder="Enter last name"
                            value={form.lastName}
                            onChange={handleChange('lastName')}
                          />
                        ) : (
                          <div className="profile-readonly-value">
                            {renderValue(form.lastName)}
                          </div>
                        )}
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Email</label>
                        {isEditing ? (
                          <input
                            type="email"
                            className="form-control"
                            placeholder="you@example.com"
                            value={form.email}
                            onChange={handleChange('email')}
                          />
                        ) : (
                          <div className="profile-readonly-value">
                            {renderValue(form.email)}
                          </div>
                        )}
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Phone</label>
                        {isEditing ? (
                          <input
                            type="tel"
                            className="form-control"
                            placeholder="(555) 123-4567"
                            value={form.phone}
                            onChange={handlePhoneChange}
                          />
                        ) : (
                          <div className="profile-readonly-value">
                            {renderValue(form.phone, 'Not added yet')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Address */}
                  <div className="profile-section">
                    <h2 className="profile-section-title">Address</h2>
                    <div className="row g-3">
                      <div className="col-12">
                        <label className="form-label">Street</label>
                        {isEditing ? (
                          <input
                            type="text"
                            className="form-control"
                            placeholder="123 Main St"
                            value={form.street}
                            onChange={handleChange('street')}
                          />
                        ) : (
                          <div className="profile-readonly-value">
                            {renderValue(form.street, 'Not added yet')}
                          </div>
                        )}
                      </div>
                      <div className="col-12">
                        <label className="form-label">Address line 2</label>
                        {isEditing ? (
                          <input
                            type="text"
                            className="form-control"
                            placeholder="Apartment, suite, etc. (optional)"
                            value={form.line2}
                            onChange={handleChange('line2')}
                          />
                        ) : (
                          <div className="profile-readonly-value">
                            {renderValue(form.line2, 'Optional')}
                          </div>
                        )}
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">City</label>
                        {isEditing ? (
                          <input
                            type="text"
                            className="form-control"
                            placeholder="San Jose"
                            value={form.city}
                            onChange={handleChange('city')}
                          />
                        ) : (
                          <div className="profile-readonly-value">
                            {renderValue(form.city, 'Not added yet')}
                          </div>
                        )}
                      </div>
                      <div className="col-md-3">
                        <label className="form-label">State</label>
                        {isEditing ? (
                          <input
                            type="text"
                            className="form-control"
                            maxLength={2}
                            placeholder="CA"
                            value={form.state}
                            onChange={handleStateChange}
                          />
                        ) : (
                          <div className="profile-readonly-value">
                            {renderValue(form.state, 'Not added yet')}
                          </div>
                        )}
                      </div>
                      <div className="col-md-3">
                        <label className="form-label">ZIP code</label>
                        {isEditing ? (
                          <input
                            type="text"
                            className="form-control"
                            placeholder="95112"
                            value={form.zipCode}
                            onChange={handleChange('zipCode')}
                          />
                        ) : (
                          <div className="profile-readonly-value">
                            {renderValue(form.zipCode, 'Not added yet')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Footer row */}
                  <div className="profile-footer">
                    <div className="profile-timestamps">
                      {form.updatedAt && (
                        <div className="profile-timestamp-line">
                          Last updated:{' '}
                          {new Date(form.updatedAt).toLocaleString()}
                        </div>
                      )}
                      {form.createdAt && (
                        <div className="profile-timestamp-line">
                          Member since:{' '}
                          {new Date(form.createdAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>

                    <div className="profile-footer-buttons">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            className="btn profile-cancel-btn"
                            onClick={handleCancel}
                            disabled={saving}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="btn profile-save-btn"
                            disabled={saving}
                          >
                            {saving ? 'Saving…' : 'Save changes'}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn profile-edit-btn"
                          onClick={() => setIsEditing(true)}
                        >
                          Edit profile
                        </button>
                      )}
                    </div>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
