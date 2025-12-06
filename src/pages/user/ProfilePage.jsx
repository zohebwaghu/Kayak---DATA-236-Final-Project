// src/pages/user/ProfilePage.jsx
import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { logout } from '../../store/slices/authSlice';
import './ProfilePage.css';

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

const STATE_CODES = new Set(US_STATES.map((s) => s.code));
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const zipRegex = /^\d{5}(?:-\d{4})?$/;

const validateEmail = (email) => emailRegex.test(email);
const validateZip = (zip) => zipRegex.test(zip);
const validateStateCode = (state) => STATE_CODES.has(state?.toUpperCase());

const formatPhoneNumber = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

const initialPaymentState = {
  methodType: '',
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
  const [activeTab, setActiveTab] = useState('personal');
  const [avatarDataUrl, setAvatarDataUrl] = useState('');
  const [paymentForm, setPaymentForm] = useState(initialPaymentState);
  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [savedProfile, setSavedProfile] = useState(null);

  const [form, setForm] = useState({
    userId: '', firstName: '', lastName: '', email: '', role: '',
    phone: '', street: '', line2: '', city: '', state: '', zipCode: '',
    createdAt: '', updatedAt: '',
  });

  const avatarStorageKey = userId ? `kayak_avatar_${userId}` : null;
  const paymentStorageKey = userId ? `kayak_payment_${userId}` : null;

  useEffect(() => {
    const loadProfile = async () => {
      if (!authUser || !authUser.userId) {
        setError('Unable to load profile. Please log in again.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
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
      } catch (err) {
        if (authUser) {
          const address = authUser.address || {};
          const fallbackProfile = {
            userId: authUser.userId || '', firstName: authUser.firstName || '',
            lastName: authUser.lastName || '', email: authUser.email || '',
            role: authUser.role || 'user', phone: authUser.phone || '',
            street: address.street || address.line1 || '', line2: address.line2 || '',
            city: address.city || '', state: address.state || '',
            zipCode: address.zipCode || '', createdAt: authUser.createdAt || '',
            updatedAt: authUser.updatedAt || '',
          };
          setForm(fallbackProfile);
          setSavedProfile(fallbackProfile);
        }
        setError(err?.response?.data?.message || 'Failed to load profile.');
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [authUser]);

  useEffect(() => {
    if (!avatarStorageKey || !userId) return;
    const loadAvatar = async () => {
      try {
        const response = await api.get(`/users/${userId}/avatar`);
        if (response.data?.avatarDataUrl) {
          setAvatarDataUrl(response.data.avatarDataUrl);
          return;
        }
      } catch {}
      try {
        const raw = localStorage.getItem(avatarStorageKey);
        if (raw) setAvatarDataUrl(raw);
      } catch {}
    };
    loadAvatar();
  }, [avatarStorageKey, userId]);

  useEffect(() => {
    if (!paymentStorageKey) return;
    try {
      const raw = localStorage.getItem(paymentStorageKey);
      if (raw) setPaymentForm((prev) => ({ ...prev, ...JSON.parse(raw) }));
    } catch {}
  }, [paymentStorageKey]);

  useEffect(() => {
    const fetchPaymentMethods = async () => {
      if (!userId) return;
      try {
        const res = await api.get(`/users/${userId}/payment-methods`);
        const methods = Array.isArray(res.data) ? res.data : [];
        if (methods.length === 0) { setPaymentMethodId(null); return; }
        const primary = methods.find((m) => m.isDefault) || methods[0];
        setPaymentMethodId(primary.methodId);
        const nextForm = {
          ...initialPaymentState,
          methodType: primary.cardType ? 'credit_card' : '',
          cardholderName: primary.cardHolderName || '',
          last4: primary.lastFour || '', brand: primary.cardType || '',
          expiryMonth: primary.expiryMonth || '', expiryYear: primary.expiryYear || '',
        };
        setPaymentForm((prev) => ({ ...prev, ...nextForm }));
        if (paymentStorageKey) {
          try { localStorage.setItem(paymentStorageKey, JSON.stringify(nextForm)); } catch {}
        }
      } catch {}
    };
    fetchPaymentMethods();
  }, [userId, paymentStorageKey]);

  const handleChange = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  const handlePhoneChange = (e) => setForm((prev) => ({ ...prev, phone: formatPhoneNumber(e.target.value) }));
  const handleStateChange = (e) => setForm((prev) => ({ ...prev, state: e.target.value }));
  const handleCancel = () => { if (savedProfile) setForm(savedProfile); setError(''); setSuccessMessage(''); setIsEditing(false); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!userId) { setError('User ID missing.'); return; }
    setError(''); setSuccessMessage('');
    const messages = [];
    if (!form.firstName.trim()) messages.push('First name is required.');
    if (!form.lastName.trim()) messages.push('Last name is required.');
    if (!form.email.trim()) messages.push('Email is required.');
    else if (!validateEmail(form.email.trim())) messages.push('Please enter a valid email.');
    if (form.state && !validateStateCode(form.state.trim())) messages.push('Please select a valid state.');
    if (form.zipCode && !validateZip(form.zipCode.trim())) messages.push('ZIP code must be 5 or 5+4 digits.');
    if (messages.length > 0) { setError(messages.join(' ')); return; }
    setSaving(true);
    try {
      const payload = {
        firstName: form.firstName, lastName: form.lastName, phone: form.phone, email: form.email,
        address: { street: form.street, line2: form.line2, city: form.city, state: form.state, zipCode: form.zipCode },
      };
      const response = await api.put(`/users/${userId}`, payload);
      const updated = response.data || {};
      const updatedAddress = updated.address || {};
      const updatedProfile = {
        userId: updated.userId || form.userId, firstName: updated.firstName || form.firstName,
        lastName: updated.lastName || form.lastName, email: updated.email || form.email,
        role: updated.role || form.role, phone: updated.phone || form.phone,
        street: updatedAddress.street || form.street, line2: updatedAddress.line2 ?? form.line2,
        city: updatedAddress.city || form.city, state: updatedAddress.state || form.state,
        zipCode: updatedAddress.zipCode || form.zipCode, createdAt: updated.createdAt || form.createdAt,
        updatedAt: updated.updatedAt || form.updatedAt,
      };
      setForm(updatedProfile); setSavedProfile(updatedProfile);
      setSuccessMessage('Profile updated successfully.'); setIsEditing(false);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to update profile.');
    } finally { setSaving(false); }
  };

  const handleAvatarFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !avatarStorageKey) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const result = reader.result;
      setAvatarDataUrl(result);
      if (userId) {
        try { await api.put(`/users/${userId}/avatar`, { avatarDataUrl: result }); }
        catch { try { localStorage.setItem(avatarStorageKey, result); } catch {} }
      } else { try { localStorage.setItem(avatarStorageKey, result); } catch {} }
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarUploadClick = () => document.getElementById('profile-avatar-input')?.click();

  const handleAvatarClear = async () => {
    if (!avatarStorageKey) return;
    if (userId) { try { await api.delete(`/users/${userId}/avatar`); } catch {} }
    try { localStorage.removeItem(avatarStorageKey); } catch {}
    setAvatarDataUrl('');
  };

  const handlePaymentChange = (field) => (e) => setPaymentForm((prev) => ({ ...prev, [field]: e.target.value }));
  const handlePaymentCheckbox = (e) => setPaymentForm((prev) => ({ ...prev, sameAsProfile: e.target.checked }));

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!paymentStorageKey || !userId) { setPaymentError('Unable to save. Please log in.'); return; }
    setPaymentError(''); setPaymentSuccess(''); setPaymentSaving(true);
    if (!paymentForm.methodType || !paymentForm.cardholderName || !paymentForm.last4 || !paymentForm.expiryMonth || !paymentForm.expiryYear) {
      setPaymentError('Please fill in all required fields.'); setPaymentSaving(false); return;
    }
    const sanitizedLast4 = (paymentForm.last4 || '').replace(/\D/g, '').slice(-4);
    if (sanitizedLast4.length !== 4) { setPaymentError('Please enter the last 4 digits.'); setPaymentSaving(false); return; }
    const fakeCardNumber = `000000000000${sanitizedLast4}`;
    const cardType = (paymentForm.brand || '').toLowerCase() || paymentForm.methodType || 'card';
    try {
      await api.post(`/users/${userId}/payment-methods`, {
        cardType, cardNumber: fakeCardNumber, expiryMonth: paymentForm.expiryMonth,
        expiryYear: paymentForm.expiryYear, cardHolderName: paymentForm.cardholderName, isDefault: true,
      });
      try {
        const res = await api.get(`/users/${userId}/payment-methods`);
        const methods = Array.isArray(res.data) ? res.data : [];
        if (methods.length > 0) setPaymentMethodId((methods.find((m) => m.isDefault) || methods[0]).methodId);
      } catch {}
      try { localStorage.setItem(paymentStorageKey, JSON.stringify(paymentForm)); } catch {}
      setPaymentSuccess('Payment details saved.'); setIsEditingPayment(false);
    } catch (err) { setPaymentError(err?.response?.data?.message || 'Failed to save payment.'); }
    finally { setPaymentSaving(false); }
  };

  const handleClearPayment = async () => {
    if (!paymentStorageKey && !userId) return;
    setPaymentError(''); setPaymentSuccess('');
    if (userId && paymentMethodId) {
      try { await api.delete(`/users/${userId}/payment-methods/${paymentMethodId}`); }
      catch (err) { setPaymentError(err?.response?.data?.message || 'Failed to clear payment.'); }
    }
    if (paymentStorageKey) { try { localStorage.removeItem(paymentStorageKey); } catch {} }
    setPaymentForm(initialPaymentState); setPaymentMethodId(null);
    setPaymentSuccess('Payment details cleared.'); setIsEditingPayment(false);
  };

  const handleDeleteAccount = async () => {
    if (!userId) { setDeleteError('User ID missing.'); return; }
    if (!window.confirm('Are you sure you want to permanently delete your account?')) return;
    setDeleting(true); setDeleteError('');
    try { await api.delete(`/users/${userId}`); dispatch(logout()); navigate('/'); }
    catch (err) { setDeleteError(err?.response?.data?.message || 'Failed to delete account.'); }
    finally { setDeleting(false); }
  };

  const renderValue = (value, placeholder = 'Not added yet') =>
    value ? <span>{value}</span> : <span className="muted">{placeholder}</span>;

  const displayName = `${form.firstName || ''} ${form.lastName || ''}`.trim() || 'User';
  const firstInitial = form.firstName?.[0]?.toUpperCase() || authUser?.firstName?.[0]?.toUpperCase() || 'U';

  return (
    <div className="kayak-profile-page">
      {/* Hero Header */}
      <div className="kayak-profile-hero">
        <div className="kayak-profile-hero-content">
          <div className="kayak-profile-avatar-large">
            {avatarDataUrl ? <img src={avatarDataUrl} alt="Profile" /> : firstInitial}
          </div>
          <div className="kayak-profile-hero-info">
            <h1 className="kayak-profile-name">{displayName}</h1>
            {form.email && <p className="kayak-profile-email">{form.email}</p>}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="kayak-profile-container">
        {/* Tabs */}
        <div className="kayak-profile-tabs">
          <button type="button" className={`kayak-profile-tab ${activeTab === 'personal' ? 'active' : ''}`} onClick={() => setActiveTab('personal')}>
            Personal info
          </button>
          <button type="button" className={`kayak-profile-tab ${activeTab === 'payment' ? 'active' : ''}`} onClick={() => setActiveTab('payment')}>
            Payment details
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="kayak-profile-loading">
            <div className="kayak-profile-spinner"></div>
            <p>Loading your profile...</p>
          </div>
        )}

        {/* Profile Card */}
        {!loading && (
          <div className="kayak-profile-card">
            <div className="kayak-profile-card-body">
              {/* PERSONAL TAB */}
              {activeTab === 'personal' && (
                <form onSubmit={handleSubmit}>
                  {successMessage && <div className="kayak-profile-alert kayak-profile-alert-success">{successMessage}</div>}
                  {error && <div className="kayak-profile-alert kayak-profile-alert-error">{error}</div>}

                  {/* Account Details */}
                  <div className="kayak-profile-section">
                    <h2 className="kayak-profile-section-title">Account Details</h2>
                    <div className="kayak-profile-grid">
                      <div className="kayak-profile-field">
                        <label className="kayak-profile-label">User ID (SSN)</label>
                        <div className="kayak-profile-value">{renderValue(form.userId, '—')}</div>
                      </div>
                      <div className="kayak-profile-field">
                        <label className="kayak-profile-label">Role</label>
                        <div className="kayak-profile-value">{renderValue(form.role || 'user')}</div>
                      </div>
                    </div>
                  </div>

                  {/* Personal Info */}
                  <div className="kayak-profile-section">
                    <h2 className="kayak-profile-section-title">Personal Info</h2>
                    <div className="kayak-profile-grid">
                      <div className="kayak-profile-field">
                        <label className="kayak-profile-label">First name</label>
                        {isEditing ? (
                          <input type="text" className="kayak-profile-input" placeholder="Enter first name" value={form.firstName} onChange={handleChange('firstName')} />
                        ) : (
                          <div className="kayak-profile-value">{renderValue(form.firstName)}</div>
                        )}
                      </div>
                      <div className="kayak-profile-field">
                        <label className="kayak-profile-label">Last name</label>
                        {isEditing ? (
                          <input type="text" className="kayak-profile-input" placeholder="Enter last name" value={form.lastName} onChange={handleChange('lastName')} />
                        ) : (
                          <div className="kayak-profile-value">{renderValue(form.lastName)}</div>
                        )}
                      </div>
                      <div className="kayak-profile-field">
                        <label className="kayak-profile-label">Email</label>
                        {isEditing ? (
                          <input type="email" className="kayak-profile-input" placeholder="you@example.com" value={form.email} onChange={handleChange('email')} />
                        ) : (
                          <div className="kayak-profile-value">{renderValue(form.email)}</div>
                        )}
                      </div>
                      <div className="kayak-profile-field">
                        <label className="kayak-profile-label">Phone</label>
                        {isEditing ? (
                          <input type="tel" className="kayak-profile-input" placeholder="(555) 123-4567" value={form.phone} onChange={handlePhoneChange} />
                        ) : (
                          <div className="kayak-profile-value">{renderValue(form.phone)}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Address */}
                  <div className="kayak-profile-section">
                    <h2 className="kayak-profile-section-title">Address</h2>
                    <div className="kayak-profile-grid">
                      <div className="kayak-profile-field span-2">
                        <label className="kayak-profile-label">Street</label>
                        {isEditing ? (
                          <input type="text" className="kayak-profile-input" placeholder="123 Main St" value={form.street} onChange={handleChange('street')} />
                        ) : (
                          <div className="kayak-profile-value">{renderValue(form.street)}</div>
                        )}
                      </div>
                      <div className="kayak-profile-field span-2">
                        <label className="kayak-profile-label">Address line 2</label>
                        {isEditing ? (
                          <input type="text" className="kayak-profile-input" placeholder="Apartment, suite, etc." value={form.line2} onChange={handleChange('line2')} />
                        ) : (
                          <div className="kayak-profile-value">{renderValue(form.line2, 'Optional')}</div>
                        )}
                      </div>
                      <div className="kayak-profile-field">
                        <label className="kayak-profile-label">City</label>
                        {isEditing ? (
                          <input type="text" className="kayak-profile-input" placeholder="San Jose" value={form.city} onChange={handleChange('city')} />
                        ) : (
                          <div className="kayak-profile-value">{renderValue(form.city)}</div>
                        )}
                      </div>
                      <div className="kayak-profile-field">
                        <label className="kayak-profile-label">State</label>
                        {isEditing ? (
                          <select className="kayak-profile-select" value={form.state} onChange={handleStateChange}>
                            <option value="">Select state</option>
                            {US_STATES.map((st) => <option key={st.code} value={st.code}>{st.name} ({st.code})</option>)}
                          </select>
                        ) : (
                          <div className="kayak-profile-value">{renderValue(form.state ? US_STATES.find((s) => s.code === form.state)?.name || form.state : '')}</div>
                        )}
                      </div>
                      <div className="kayak-profile-field">
                        <label className="kayak-profile-label">ZIP code</label>
                        {isEditing ? (
                          <input type="text" className="kayak-profile-input" placeholder="95112" value={form.zipCode} onChange={handleChange('zipCode')} />
                        ) : (
                          <div className="kayak-profile-value">{renderValue(form.zipCode)}</div>
                        )}
                      </div>
                    </div>

                    {/* Avatar Upload */}
                    <div className="kayak-profile-avatar-section">
                      <div className="kayak-profile-avatar-preview">
                        {avatarDataUrl ? <img src={avatarDataUrl} alt="Avatar" /> : firstInitial}
                      </div>
                      <div className="kayak-profile-avatar-actions">
                        <input id="profile-avatar-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarFileChange} />
                        <button type="button" className="kayak-profile-avatar-btn" onClick={handleAvatarUploadClick}>Upload photo</button>
                        {avatarDataUrl && <button type="button" className="kayak-profile-avatar-btn remove" onClick={handleAvatarClear}>Remove</button>}
                        <span className="kayak-profile-avatar-help">Stored on this device</span>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="kayak-profile-footer">
                    <div className="kayak-profile-timestamps">
                      {form.updatedAt && <span>Last updated: {new Date(form.updatedAt).toLocaleString()}</span>}
                      {form.createdAt && <span>Member since: {new Date(form.createdAt).toLocaleDateString()}</span>}
                    </div>
                    <div className="kayak-profile-actions">
                      {isEditing ? (
                        <>
                          <button type="button" className="kayak-profile-btn kayak-profile-btn-secondary" onClick={handleCancel} disabled={saving}>Cancel</button>
                          <button type="submit" className="kayak-profile-btn kayak-profile-btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
                        </>
                      ) : (
                        <button type="button" className="kayak-profile-btn kayak-profile-btn-outline" onClick={() => setIsEditing(true)}>Edit profile</button>
                      )}
                    </div>
                  </div>
                </form>
              )}

              {/* PAYMENT TAB */}
              {activeTab === 'payment' && (
                <form onSubmit={handlePaymentSubmit}>
                  {paymentSuccess && <div className="kayak-profile-alert kayak-profile-alert-success">{paymentSuccess}</div>}
                  {paymentError && <div className="kayak-profile-alert kayak-profile-alert-error">{paymentError}</div>}

                  <div className="kayak-profile-section">
                    <h2 className="kayak-profile-section-title">Saved Payment Method</h2>
                    <p className="kayak-profile-payment-helper">
                      These details help you check out faster. We do not charge your card from this page.
                    </p>
                    <div className="kayak-profile-grid">
                      <div className="kayak-profile-field">
                        <label className="kayak-profile-label">Payment type</label>
                        {isEditingPayment ? (
                          <select className="kayak-profile-select" value={paymentForm.methodType} onChange={handlePaymentChange('methodType')}>
                            <option value="">Select type</option>
                            <option value="credit_card">Credit card</option>
                            <option value="debit_card">Debit card</option>
                            <option value="paypal">PayPal</option>
                          </select>
                        ) : (
                          <div className="kayak-profile-value">{renderValue(paymentForm.methodType?.replace('_', ' '))}</div>
                        )}
                      </div>
                      <div className="kayak-profile-field">
                        <label className="kayak-profile-label">Cardholder name</label>
                        {isEditingPayment ? (
                          <input type="text" className="kayak-profile-input" placeholder="Name on card" value={paymentForm.cardholderName} onChange={handlePaymentChange('cardholderName')} />
                        ) : (
                          <div className="kayak-profile-value">{renderValue(paymentForm.cardholderName)}</div>
                        )}
                      </div>
                      <div className="kayak-profile-field">
                        <label className="kayak-profile-label">Last 4 digits</label>
                        {isEditingPayment ? (
                          <input type="text" className="kayak-profile-input" maxLength={4} placeholder="1234" value={paymentForm.last4} onChange={handlePaymentChange('last4')} />
                        ) : (
                          <div className="kayak-profile-value">{renderValue(paymentForm.last4 ? `•••• ${paymentForm.last4}` : '')}</div>
                        )}
                      </div>
                      <div className="kayak-profile-field">
                        <label className="kayak-profile-label">Card brand</label>
                        {isEditingPayment ? (
                          <input type="text" className="kayak-profile-input" placeholder="Visa" value={paymentForm.brand} onChange={handlePaymentChange('brand')} />
                        ) : (
                          <div className="kayak-profile-value">{renderValue(paymentForm.brand)}</div>
                        )}
                      </div>
                      <div className="kayak-profile-field">
                        <label className="kayak-profile-label">Expiry month</label>
                        {isEditingPayment ? (
                          <input type="text" className="kayak-profile-input" placeholder="MM" maxLength={2} value={paymentForm.expiryMonth} onChange={handlePaymentChange('expiryMonth')} />
                        ) : (
                          <div className="kayak-profile-value">{renderValue(paymentForm.expiryMonth)}</div>
                        )}
                      </div>
                      <div className="kayak-profile-field">
                        <label className="kayak-profile-label">Expiry year</label>
                        {isEditingPayment ? (
                          <input type="text" className="kayak-profile-input" placeholder="YYYY" maxLength={4} value={paymentForm.expiryYear} onChange={handlePaymentChange('expiryYear')} />
                        ) : (
                          <div className="kayak-profile-value">{renderValue(paymentForm.expiryYear)}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Billing Address */}
                  <div className="kayak-profile-section">
                    <h2 className="kayak-profile-section-title">Billing Address</h2>
                    {isEditingPayment && (
                      <div className="kayak-profile-checkbox-row">
                        <input type="checkbox" className="kayak-profile-checkbox" id="billing-same" checked={paymentForm.sameAsProfile} onChange={handlePaymentCheckbox} />
                        <label htmlFor="billing-same" className="kayak-profile-checkbox-label">Same as profile address</label>
                      </div>
                    )}
                    <div className="kayak-profile-grid">
                      <div className="kayak-profile-field span-2">
                        <label className="kayak-profile-label">Street</label>
                        <div className="kayak-profile-value">
                          {paymentForm.sameAsProfile ? renderValue(form.street) : renderValue(paymentForm.billingStreet)}
                        </div>
                      </div>
                      <div className="kayak-profile-field">
                        <label className="kayak-profile-label">City</label>
                        <div className="kayak-profile-value">
                          {paymentForm.sameAsProfile ? renderValue(form.city) : renderValue(paymentForm.billingCity)}
                        </div>
                      </div>
                      <div className="kayak-profile-field">
                        <label className="kayak-profile-label">State</label>
                        <div className="kayak-profile-value">
                          {paymentForm.sameAsProfile ? renderValue(form.state) : renderValue(paymentForm.billingState)}
                        </div>
                      </div>
                      <div className="kayak-profile-field">
                        <label className="kayak-profile-label">ZIP code</label>
                        <div className="kayak-profile-value">
                          {paymentForm.sameAsProfile ? renderValue(form.zipCode) : renderValue(paymentForm.billingZip)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="kayak-profile-footer">
                    <div className="kayak-profile-timestamps">
                      <span>Saved locally for faster booking</span>
                    </div>
                    <div className="kayak-profile-actions">
                      {isEditingPayment ? (
                        <>
                          <button type="button" className="kayak-profile-btn kayak-profile-btn-secondary" onClick={() => { setIsEditingPayment(false); setPaymentError(''); setPaymentSuccess(''); }} disabled={paymentSaving}>Cancel</button>
                          <button type="submit" className="kayak-profile-btn kayak-profile-btn-primary" disabled={paymentSaving}>{paymentSaving ? 'Saving...' : 'Save details'}</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="kayak-profile-btn kayak-profile-btn-outline" onClick={() => { setIsEditingPayment(true); setPaymentError(''); setPaymentSuccess(''); }}>Edit payment</button>
                          <button type="button" className="kayak-profile-btn kayak-profile-btn-secondary" onClick={handleClearPayment}>Clear payment</button>
                        </>
                      )}
                    </div>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Danger Zone */}
        {!loading && (
          <div className="kayak-profile-danger-zone">
            {deleteError && <div className="kayak-profile-alert kayak-profile-alert-error">{deleteError}</div>}
            <div className="kayak-profile-danger-card">
              <div className="kayak-profile-danger-info">
                <h3 className="kayak-profile-danger-title">Delete account</h3>
                <p className="kayak-profile-danger-text">Permanently delete your profile and all booking data. This cannot be undone.</p>
              </div>
              <button type="button" className="kayak-profile-btn-danger" onClick={handleDeleteAccount} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete account'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
