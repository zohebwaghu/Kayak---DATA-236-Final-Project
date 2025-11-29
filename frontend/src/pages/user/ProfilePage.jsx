// src/pages/user/ProfilePage.jsx
import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { logout } from '../../store/slices/authSlice';
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

const initialPaymentState = {
  methodType: '', // credit_card | debit_card | paypal | stripe
  cardholderName: '',
  last4: '',
  brand: '',
  expiryMonth: '',
  expiryYear: '',
  sameAsProfile: true,
  billingStreet: '',
  billingCity: '',
  billingState: '',
  billingZip: '',
};

const ProfilePage = () => {
  const authState = useSelector((state) => state.auth);
  const authUser = authState?.user;
  const userId = authUser?.userId;

  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Tabs: personal | payment
  const [activeTab, setActiveTab] = useState('personal');

  // Avatar
  const [avatarDataUrl, setAvatarDataUrl] = useState('');

  // Payment (local only)
  const [paymentForm, setPaymentForm] = useState(initialPaymentState);
  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState('');

  // Delete account
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

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

  const avatarStorageKey = userId ? `kayak_avatar_${userId}` : null;
  const paymentStorageKey = userId ? `kayak_payment_${userId}` : null;

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

  // ========= LOAD AVATAR FROM LOCALSTORAGE =========
  useEffect(() => {
    if (!avatarStorageKey) return;
    try {
      const raw = localStorage.getItem(avatarStorageKey);
      if (raw) {
        setAvatarDataUrl(raw);
      }
    } catch {
      // ignore
    }
  }, [avatarStorageKey]);

  // ========= LOAD PAYMENT DETAILS FROM LOCALSTORAGE =========
  useEffect(() => {
    if (!paymentStorageKey) return;
    try {
      const raw = localStorage.getItem(paymentStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setPaymentForm((prev) => ({
          ...prev,
          ...parsed,
        }));
      } else {
        setPaymentForm(initialPaymentState);
      }
    } catch {
      // ignore
    }
  }, [paymentStorageKey]);

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

  // ========= AVATAR HANDLERS (LOCAL ONLY) =========

  const handleAvatarFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !avatarStorageKey) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      try {
        localStorage.setItem(avatarStorageKey, result);
      } catch {
        // ignore storage errors
      }
      setAvatarDataUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarUploadClick = () => {
    const input = document.getElementById('profile-avatar-input');
    if (input) {
      input.click();
    }
  };

  const handleAvatarClear = () => {
    if (!avatarStorageKey) return;
    try {
      localStorage.removeItem(avatarStorageKey);
    } catch {
      // ignore
    }
    setAvatarDataUrl('');
  };

  // ========= PAYMENT HANDLERS (LOCAL ONLY) =========

  const handlePaymentChange = (field) => (e) => {
    const value = e.target.value;
    setPaymentForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handlePaymentCheckbox = (e) => {
    const checked = e.target.checked;
    setPaymentForm((prev) => ({
      ...prev,
      sameAsProfile: checked,
    }));
  };

  const handlePaymentSubmit = (e) => {
    e.preventDefault();
    if (!paymentStorageKey) {
      setPaymentError('Unable to save payment details. Please log in again.');
      return;
    }

    setPaymentError('');
    setPaymentSuccess('');
    setPaymentSaving(true);

    try {
      localStorage.setItem(paymentStorageKey, JSON.stringify(paymentForm));
      setPaymentSuccess('Payment details saved on this device.');
      setIsEditingPayment(false);
    } catch {
      setPaymentError('Failed to save payment details. Please try again.');
    } finally {
      setPaymentSaving(false);
    }
  };

  const handleClearPayment = () => {
    if (!paymentStorageKey) return;
    try {
      localStorage.removeItem(paymentStorageKey);
    } catch {
      // ignore
    }
    setPaymentForm(initialPaymentState);
    setPaymentError('');
    setPaymentSuccess('Payment details cleared.');
    setIsEditingPayment(false);
  };

  // ========= DELETE ACCOUNT HANDLER =========

  const handleDeleteAccount = async () => {
    if (!userId) {
      setDeleteError('User ID missing. Please log in again.');
      return;
    }

    const confirm = window.confirm(
      'Are you sure you want to permanently delete your account? This cannot be undone.'
    );
    if (!confirm) return;

    setDeleting(true);
    setDeleteError('');

    try {
      await api.delete(`/users/${userId}`);

      // Clear auth state and redirect to home (or login)
      dispatch(logout());
      navigate('/');
    } catch (err) {
      console.error(
        'Error deleting account:',
        err?.response?.status,
        err?.response?.data || err?.message
      );
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Failed to delete account. Please try again.';
      setDeleteError(msg);
    } finally {
      setDeleting(false);
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
            View and update the personal details and contact information used
            for bookings.
          </p>
        </div>

        <div className="row justify-content-center">
          <div className="col-lg-8 col-md-10">
            <div className="profile-card">
              <div className="profile-card-header">
                <div className="profile-avatar-circle">
                  {avatarDataUrl ? (
                    <img
                      src={avatarDataUrl}
                      alt="Profile"
                      className="profile-avatar-image"
                    />
                  ) : (
                    form.firstName?.[0]?.toUpperCase() ||
                    authUser?.firstName?.[0]?.toUpperCase() ||
                    'U'
                  )}
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
                <>
                  {/* Tabs */}
                  <div className="profile-tabs-wrapper">
                    <div className="profile-tabs">
                      <button
                        type="button"
                        className={`profile-tab ${
                          activeTab === 'personal' ? 'active' : ''
                        }`}
                        onClick={() => setActiveTab('personal')}
                      >
                        Personal info
                      </button>
                      <button
                        type="button"
                        className={`profile-tab ${
                          activeTab === 'payment' ? 'active' : ''
                        }`}
                        onClick={() => setActiveTab('payment')}
                      >
                        Payment details
                      </button>
                    </div>
                  </div>

                  {/* PERSONAL TAB */}
                  {activeTab === 'personal' && (
                    <form onSubmit={handleSubmit}>
                      {successMessage && (
                        <div className="alert alert-success">
                          {successMessage}
                        </div>
                      )}

                      {/* Account info (always read-only) */}
                      <div className="profile-section">
                        <h2 className="profile-section-title">
                          Account details
                        </h2>
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
                            <label className="form-label">
                              Address line 2
                            </label>
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

                        {/* Avatar upload row – below city/state/zip */}
                        <div className="profile-avatar-upload-row">
                          <label className="form-label">Profile photo</label>
                          <div className="profile-avatar-upload-controls">
                            <input
                              id="profile-avatar-input"
                              type="file"
                              accept="image/*"
                              className="d-none"
                              onChange={handleAvatarFileChange}
                            />
                            <button
                              type="button"
                              className="btn profile-avatar-upload-btn"
                              onClick={handleAvatarUploadClick}
                            >
                              Upload photo
                            </button>
                            {avatarDataUrl && (
                              <button
                                type="button"
                                className="btn profile-avatar-remove-btn"
                                onClick={handleAvatarClear}
                              >
                                Remove
                              </button>
                            )}
                            <span className="profile-avatar-help">
                              Stored only on this device.
                            </span>
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

                  {/* PAYMENT TAB */}
                  {activeTab === 'payment' && (
                    <form onSubmit={handlePaymentSubmit}>
                      {paymentSuccess && (
                        <div className="alert alert-success">
                          {paymentSuccess}
                        </div>
                      )}
                      {paymentError && (
                        <div className="alert alert-danger">
                          {paymentError}
                        </div>
                      )}

                      <div className="profile-section">
                        <h2 className="profile-section-title">
                          Saved payment method
                        </h2>
                        <p className="profile-payment-helper">
                          These details are stored locally on this device to
                          help you check out faster. We do not charge your card
                          from this page.
                        </p>

                        <div className="row g-3">
                          {/* Method type */}
                          <div className="col-md-4">
                            <label className="form-label">Payment type</label>
                            {isEditingPayment ? (
                              <select
                                className="form-select"
                                value={paymentForm.methodType}
                                onChange={handlePaymentChange('methodType')}
                              >
                                <option value="">Select type</option>
                                <option value="credit_card">Credit card</option>
                                <option value="debit_card">Debit card</option>
                                <option value="paypal">PayPal</option>
                                <option value="stripe">Stripe</option>
                              </select>
                            ) : (
                              <div className="profile-readonly-value">
                                {renderValue(
                                  paymentForm.methodType
                                    ? paymentForm.methodType.replace('_', ' ')
                                    : '',
                                  'Not added yet'
                                )}
                              </div>
                            )}
                          </div>

                          {/* Cardholder / last4 / brand */}
                          <div className="col-md-4">
                            <label className="form-label">
                              Cardholder name
                            </label>
                            {isEditingPayment ? (
                              <input
                                type="text"
                                className="form-control"
                                placeholder="Name on card"
                                value={paymentForm.cardholderName}
                                onChange={handlePaymentChange('cardholderName')}
                              />
                            ) : (
                              <div className="profile-readonly-value">
                                {renderValue(
                                  paymentForm.cardholderName,
                                  'Not added yet'
                                )}
                              </div>
                            )}
                          </div>
                          <div className="col-md-2">
                            <label className="form-label">Last 4 digits</label>
                            {isEditingPayment ? (
                              <input
                                type="text"
                                className="form-control"
                                maxLength={4}
                                placeholder="1234"
                                value={paymentForm.last4}
                                onChange={handlePaymentChange('last4')}
                              />
                            ) : (
                              <div className="profile-readonly-value">
                                {renderValue(
                                  paymentForm.last4,
                                  'Not added yet'
                                )}
                              </div>
                            )}
                          </div>
                          <div className="col-md-2">
                            <label className="form-label">Card brand</label>
                            {isEditingPayment ? (
                              <input
                                type="text"
                                className="form-control"
                                placeholder="Visa"
                                value={paymentForm.brand}
                                onChange={handlePaymentChange('brand')}
                              />
                            ) : (
                              <div className="profile-readonly-value">
                                {renderValue(
                                  paymentForm.brand,
                                  'Not added yet'
                                )}
                              </div>
                            )}
                          </div>

                          {/* Expiry */}
                          <div className="col-md-2">
                            <label className="form-label">Expiry month</label>
                            {isEditingPayment ? (
                              <input
                                type="text"
                                className="form-control"
                                placeholder="MM"
                                maxLength={2}
                                value={paymentForm.expiryMonth}
                                onChange={handlePaymentChange('expiryMonth')}
                              />
                            ) : (
                              <div className="profile-readonly-value">
                                {renderValue(
                                  paymentForm.expiryMonth,
                                  'Not added yet'
                                )}
                              </div>
                            )}
                          </div>
                          <div className="col-md-2">
                            <label className="form-label">Expiry year</label>
                            {isEditingPayment ? (
                              <input
                                type="text"
                                className="form-control"
                                placeholder="YYYY"
                                maxLength={4}
                                value={paymentForm.expiryYear}
                                onChange={handlePaymentChange('expiryYear')}
                              />
                            ) : (
                              <div className="profile-readonly-value">
                                {renderValue(
                                  paymentForm.expiryYear,
                                  'Not added yet'
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Billing address */}
                      <div className="profile-section">
                        <h2 className="profile-section-title">
                          Billing address
                        </h2>
                        <div className="mb-2">
                          {isEditingPayment ? (
                            <div className="form-check">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                id="billing-same-as-profile"
                                checked={paymentForm.sameAsProfile}
                                onChange={handlePaymentCheckbox}
                              />
                              <label
                                className="form-check-label"
                                htmlFor="billing-same-as-profile"
                              >
                                Same as profile address
                              </label>
                            </div>
                          ) : (
                            <div className="profile-readonly-value">
                              {paymentForm.sameAsProfile
                                ? 'Same as profile address'
                                : 'Custom billing address'}
                            </div>
                          )}
                        </div>

                        <div className="row g-3">
                          <div className="col-12">
                            <label className="form-label">Street</label>
                            {isEditingPayment ? (
                              paymentForm.sameAsProfile ? (
                                <div className="profile-readonly-value">
                                  {renderValue(
                                    form.street,
                                    'Not added yet'
                                  )}
                                </div>
                              ) : (
                                <input
                                  type="text"
                                  className="form-control"
                                  placeholder="123 Main St"
                                  value={paymentForm.billingStreet}
                                  onChange={handlePaymentChange(
                                    'billingStreet'
                                  )}
                                />
                              )
                            ) : (
                              <div className="profile-readonly-value">
                                {paymentForm.sameAsProfile
                                  ? renderValue(form.street, 'Not added yet')
                                  : renderValue(
                                      paymentForm.billingStreet,
                                      'Not added yet'
                                    )}
                              </div>
                            )}
                          </div>
                          <div className="col-md-6">
                            <label className="form-label">City</label>
                            {isEditingPayment ? (
                              paymentForm.sameAsProfile ? (
                                <div className="profile-readonly-value">
                                  {renderValue(form.city, 'Not added yet')}
                                </div>
                              ) : (
                                <input
                                  type="text"
                                  className="form-control"
                                  placeholder="San Jose"
                                  value={paymentForm.billingCity}
                                  onChange={handlePaymentChange('billingCity')}
                                />
                              )
                            ) : (
                              <div className="profile-readonly-value">
                                {paymentForm.sameAsProfile
                                  ? renderValue(form.city, 'Not added yet')
                                  : renderValue(
                                      paymentForm.billingCity,
                                      'Not added yet'
                                    )}
                              </div>
                            )}
                          </div>
                          <div className="col-md-3">
                            <label className="form-label">State</label>
                            {isEditingPayment ? (
                              paymentForm.sameAsProfile ? (
                                <div className="profile-readonly-value">
                                  {renderValue(form.state, 'Not added yet')}
                                </div>
                              ) : (
                                <input
                                  type="text"
                                  className="form-control"
                                  placeholder="CA"
                                  maxLength={2}
                                  value={paymentForm.billingState}
                                  onChange={handlePaymentChange('billingState')}
                                />
                              )
                            ) : (
                              <div className="profile-readonly-value">
                                {paymentForm.sameAsProfile
                                  ? renderValue(form.state, 'Not added yet')
                                  : renderValue(
                                      paymentForm.billingState,
                                      'Not added yet'
                                    )}
                              </div>
                            )}
                          </div>
                          <div className="col-md-3">
                            <label className="form-label">ZIP code</label>
                            {isEditingPayment ? (
                              paymentForm.sameAsProfile ? (
                                <div className="profile-readonly-value">
                                  {renderValue(form.zipCode, 'Not added yet')}
                                </div>
                              ) : (
                                <input
                                  type="text"
                                  className="form-control"
                                  placeholder="95112"
                                  value={paymentForm.billingZip}
                                  onChange={handlePaymentChange('billingZip')}
                                />
                              )
                            ) : (
                              <div className="profile-readonly-value">
                                {paymentForm.sameAsProfile
                                  ? renderValue(form.zipCode, 'Not added yet')
                                  : renderValue(
                                      paymentForm.billingZip,
                                      'Not added yet'
                                    )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Payment footer */}
                      <div className="profile-footer profile-payment-footer">
                        <div className="profile-payment-note">
                          Saved locally for faster booking. You can update or
                          clear these any time.
                        </div>
                        <div className="profile-footer-buttons">
                          {isEditingPayment ? (
                            <>
                              <button
                                type="button"
                                className="btn profile-cancel-btn"
                                onClick={() => {
                                  // revert from localStorage or reset
                                  if (paymentStorageKey) {
                                    try {
                                      const raw =
                                        localStorage.getItem(
                                          paymentStorageKey
                                        );
                                      if (raw) {
                                        const parsed = JSON.parse(raw);
                                        setPaymentForm({
                                          ...initialPaymentState,
                                          ...parsed,
                                        });
                                      } else {
                                        setPaymentForm(initialPaymentState);
                                      }
                                    } catch {
                                      setPaymentForm(initialPaymentState);
                                    }
                                  } else {
                                    setPaymentForm(initialPaymentState);
                                  }
                                  setPaymentError('');
                                  setPaymentSuccess('');
                                  setIsEditingPayment(false);
                                }}
                                disabled={paymentSaving}
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                className="btn profile-save-btn"
                                disabled={paymentSaving}
                              >
                                {paymentSaving ? 'Saving…' : 'Save details'}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn profile-edit-btn"
                                onClick={() => {
                                  setPaymentError('');
                                  setPaymentSuccess('');
                                  setIsEditingPayment(true);
                                }}
                              >
                                Edit payment
                              </button>
                              <button
                                type="button"
                                className="btn profile-delete-payment-btn"
                                onClick={handleClearPayment}
                              >
                                Clear payment
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>

            {/* Delete account section */}
            {!loading && (
              <div className="profile-danger-wrapper">
                {deleteError && (
                  <div className="alert alert-danger mb-2">{deleteError}</div>
                )}
                <div className="profile-danger-card">
                  <div className="profile-danger-title">Delete account</div>
                  <p className="profile-danger-text">
                    Deleting your account will permanently remove your profile
                    and booking data. This action cannot be undone.
                  </p>
                  <button
                    type="button"
                    className="btn profile-delete-btn"
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                  >
                    {deleting ? 'Deleting…' : 'Delete account'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
