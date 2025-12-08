// src/pages/admin/AdminDashboardPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api/axios';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import './AdminDashboardPage.css';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1', '#d084d0'];

const AdminDashboardPage = () => {
  const [activeTab, setActiveTab] = useState('analytics');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);

  // Analytics data
  const [topProperties, setTopProperties] = useState([]);
  const [cityRevenue, setCityRevenue] = useState([]);
  const [topSellers, setTopSellers] = useState([]);
  const [pageClicks, setPageClicks] = useState([]);
  const [listingClicks, setListingClicks] = useState([]);
  const [leastSeen, setLeastSeen] = useState([]);
  const [reviews, setReviews] = useState([]);

  // Management data
  const [listings, setListings] = useState([]);
  const [users, setUsers] = useState([]);
  const [bills, setBills] = useState([]);
  const [selectedListing, setSelectedListing] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedBill, setSelectedBill] = useState(null);

  // Search/filter states
  const [listingSearch, setListingSearch] = useState('');
  const [listingType, setListingType] = useState('hotels');
  const [userSearch, setUserSearch] = useState('');
  const [billDate, setBillDate] = useState('');
  const [billMonth, setBillMonth] = useState('');
  const [billYear, setBillYear] = useState('');

  // Form states for adding/editing
  const [showListingForm, setShowListingForm] = useState(false);
  const [listingFormData, setListingFormData] = useState({});

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const currentYear = new Date().getFullYear();

      const [topPropsRes, cityRes, sellersRes, pageRes, listingRes, leastRes, reviewsRes] = await Promise.all([
        api.get(`/admin/analytics/revenue/top-properties?year=${currentYear}`),
        api.get(`/admin/analytics/revenue/city-wise?year=${currentYear}`),
        api.get('/admin/analytics/providers/top-sellers'),
        api.get('/admin/analytics/clicks/page'),
        api.get('/admin/analytics/clicks/listings'),
        api.get('/admin/analytics/least-seen'),
        api.get('/admin/analytics/reviews')
      ]);

      setTopProperties(topPropsRes.data.data || []);
      setCityRevenue(cityRes.data.data || []);
      setTopSellers(sellersRes.data.data || []);
      setPageClicks(pageRes.data.data || []);
      setListingClicks(listingRes.data.data || []);
      setLeastSeen(leastRes.data.data || []);
      setReviews(reviewsRes.data.data || []);
    } catch (err) {
      console.error('Error loading analytics:', err);
      setError('Failed to load analytics. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { type: listingType, limit: 50 };
      if (listingSearch) params.search = listingSearch;

      const res = await api.get('/admin/listings', { params });
      setListings(res.data.data || []);
    } catch (err) {
      console.error('Error loading listings:', err);
      setError('Failed to load listings. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [listingSearch, listingType]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { limit: 50 };
      if (userSearch) params.search = userSearch;

      const res = await api.get('/admin/users', { params });
      setUsers(res.data.data || []);
    } catch (err) {
      console.error('Error loading users:', err);
      setError('Failed to load users. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [userSearch]);

  const loadBills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { limit: 50 };
      if (billDate) params.date = billDate;
      if (billMonth) params.month = billMonth;
      if (billYear) params.year = billYear;

      const res = await api.get('/admin/billing', { params });
      setBills(res.data.data || []);
    } catch (err) {
      console.error('Error loading bills:', err);
      setError('Failed to load bills. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [billDate, billMonth, billYear]);

  useEffect(() => {
    const run = async () => {
      if (activeTab === 'analytics') {
        await loadAnalytics();
      } else if (activeTab === 'listings') {
        await loadListings();
      } else if (activeTab === 'users') {
        await loadUsers();
      } else if (activeTab === 'billing') {
        await loadBills();
      }
    };
    run();
  }, [activeTab, loadAnalytics, loadListings, loadUsers, loadBills]);

  const handleAddListing = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/admin/listings', {
        type: listingType,
        data: listingFormData
      });
      setStatusMessage('Listing added successfully!');
      setShowListingForm(false);
      setListingFormData({});
      loadListings();
    } catch (err) {
      console.error('Error adding listing:', err);
      setError('Failed to add listing. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateListing = async (id) => {
    setLoading(true);
    setError(null);
    try {
      await api.put(`/admin/listings/${id}`, {
        type: listingType,
        data: selectedListing
      });
      setStatusMessage('Listing updated successfully!');
      setSelectedListing(null);
      loadListings();
    } catch (err) {
      console.error('Error updating listing:', err);
      setError('Failed to update listing. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteListing = async (id) => {
    if (!window.confirm('Are you sure you want to delete this listing?')) return;

    setLoading(true);
    setError(null);
    try {
      await api.delete(`/admin/listings/${id}?type=${listingType}`);
      setStatusMessage('Listing deleted successfully!');
      loadListings();
    } catch (err) {
      console.error('Error deleting listing:', err);
      setError('Failed to delete listing. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.put(`/admin/users/${selectedUser.user_id}`, {
        firstName: selectedUser.first_name,
        lastName: selectedUser.last_name,
        email: selectedUser.email,
        phone: selectedUser.phone_number,
        role: selectedUser.role
      });
      setStatusMessage('User updated successfully!');
      setSelectedUser(null);
      loadUsers();
    } catch (err) {
      console.error('Error updating user:', err);
      setError('Failed to update user. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleViewBill = async (billingId) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/admin/billing/${billingId}`);
      setSelectedBill(res.data);
    } catch (err) {
      console.error('Error fetching bill:', err);
      setError('Failed to fetch bill details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>Admin Dashboard</h1>
        <p>Manage listings, users, billing, and view analytics</p>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
          <button type="button" className="btn-close" onClick={() => setError(null)}></button>
        </div>
      )}
      {statusMessage && (
        <div className="alert alert-success" role="alert">
          {statusMessage}
          <button type="button" className="btn-close" onClick={() => setStatusMessage(null)}></button>
        </div>
      )}

      {/* Tabs */}
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            Analytics & Reports
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'listings' ? 'active' : ''}`}
            onClick={() => setActiveTab('listings')}
          >
            Listings Management
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            User Management
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'billing' ? 'active' : ''}`}
            onClick={() => setActiveTab('billing')}
          >
            Billing
          </button>
        </li>
      </ul>

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div className="analytics-tab">
          {loading && <div className="text-center"><div className="spinner-border" role="status"></div></div>}

          <div className="row mb-4">
            <div className="col-md-6">
              <h3>Top 10 Properties by Revenue (Year {new Date().getFullYear()})</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topProperties}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="listing_id" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="total_revenue" fill="#8884d8" name="Revenue ($)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="col-md-6">
              <h3>City-wise Revenue (Year {new Date().getFullYear()})</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={cityRevenue}
                    dataKey="total_revenue"
                    nameKey="city"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label
                  >
                    {cityRevenue.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="row mb-4">
            <div className="col-md-12">
              <h3>Top 10 Providers - Properties Sold Last Month</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topSellers}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="listing_id" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="properties_sold" fill="#82ca9d" name="Properties Sold" />
                  <Bar yAxisId="right" dataKey="revenue" fill="#ffc658" name="Revenue ($)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="row mb-4">
            <div className="col-md-6">
              <h3>Clicks per Page</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={pageClicks}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="page" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="clicks" fill="#0088FE" name="Clicks" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="col-md-6">
              <h3>Property/Listing Clicks</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={listingClicks}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="listingId" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="clicks" fill="#00C49F" name="Clicks" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="row mb-4">
            <div className="col-md-6">
              <h3>Least Seen Sections</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={leastSeen}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="section" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="views" fill="#FF8042" name="Views" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="col-md-6">
              <h3>Reviews on Properties</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={reviews}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="listingId" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="reviewCount" fill="#8884d8" name="Review Count" />
                  <Bar yAxisId="right" dataKey="avgRating" fill="#82ca9d" name="Avg Rating" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Listings Tab */}
      {activeTab === 'listings' && (
        <div className="listings-tab">
          <div className="mb-3 d-flex justify-content-between align-items-center">
            <div className="d-flex gap-2">
              <select
                className="form-select"
                style={{ width: 'auto' }}
                value={listingType}
                onChange={(e) => setListingType(e.target.value)}
              >
                <option value="hotels">Hotels</option>
                <option value="flights">Flights</option>
                <option value="cars">Cars</option>
              </select>
              <input
                type="text"
                className="form-control"
                placeholder="Search listings..."
                value={listingSearch}
                onChange={(e) => setListingSearch(e.target.value)}
                style={{ width: '300px' }}
              />
            </div>
            <button
              className="btn btn-primary"
              onClick={() => setShowListingForm(true)}
            >
              Add New Listing
            </button>
          </div>

          {showListingForm && (
            <div className="card mb-3">
              <div className="card-header">Add New {listingType.charAt(0).toUpperCase() + listingType.slice(1)}</div>
              <div className="card-body">
                <form onSubmit={handleAddListing}>
                  {listingType === 'hotels' && (
                    <>
                      <div className="mb-3">
                        <label className="form-label">Hotel Name</label>
                        <input
                          type="text"
                          className="form-control"
                          value={listingFormData.name || ''}
                          onChange={(e) => setListingFormData({ ...listingFormData, name: e.target.value })}
                          required
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label">City</label>
                        <input
                          type="text"
                          className="form-control"
                          value={listingFormData.address?.city || ''}
                          onChange={(e) => setListingFormData({
                            ...listingFormData,
                            address: { ...listingFormData.address, city: e.target.value }
                          })}
                          required
                        />
                      </div>
                    </>
                  )}
                  {listingType === 'flights' && (
                    <>
                      <div className="mb-3">
                        <label className="form-label">Airline</label>
                        <input
                          type="text"
                          className="form-control"
                          value={listingFormData.airline || ''}
                          onChange={(e) => setListingFormData({ ...listingFormData, airline: e.target.value })}
                          required
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label">Origin</label>
                        <input
                          type="text"
                          className="form-control"
                          value={listingFormData.origin || ''}
                          onChange={(e) => setListingFormData({ ...listingFormData, origin: e.target.value })}
                          required
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label">Destination</label>
                        <input
                          type="text"
                          className="form-control"
                          value={listingFormData.destination || ''}
                          onChange={(e) => setListingFormData({ ...listingFormData, destination: e.target.value })}
                          required
                        />
                      </div>
                    </>
                  )}
                  {listingType === 'cars' && (
                    <>
                      <div className="mb-3">
                        <label className="form-label">Car Name</label>
                        <input
                          type="text"
                          className="form-control"
                          value={listingFormData.name || ''}
                          onChange={(e) => setListingFormData({ ...listingFormData, name: e.target.value })}
                          required
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label">Location</label>
                        <input
                          type="text"
                          className="form-control"
                          value={listingFormData.location || ''}
                          onChange={(e) => setListingFormData({ ...listingFormData, location: e.target.value })}
                          required
                        />
                      </div>
                    </>
                  )}
                  <div className="d-flex gap-2">
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {loading ? 'Adding...' : 'Add Listing'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setShowListingForm(false);
                        setListingFormData({});
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="table-responsive">
            <table className="table table-striped">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name/Details</th>
                  <th>Location</th>
                  <th>Price</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((listing) => (
                  <tr key={listing._id}>
                    <td>{listing._id}</td>
                    <td>{listing.name || listing.airline || listing.carType}</td>
                    <td>{listing.address?.city || listing.origin || listing.location}</td>
                    <td>${listing.price || listing.current_price || 'N/A'}</td>
                    <td>
                      <button
                        className="btn btn-sm btn-primary me-2"
                        onClick={() => setSelectedListing(listing)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDeleteListing(listing._id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedListing && (
            <div className="modal-backdrop show" style={{ opacity: 0.5 }}></div>
          )}
          {selectedListing && (
            <div className="modal show d-block" tabIndex="-1">
              <div className="modal-dialog">
                <div className="modal-content">
                  <div className="modal-header">
                    <h5 className="modal-title">Edit {listingType.charAt(0).toUpperCase() + listingType.slice(1)}</h5>
                    <button type="button" className="btn-close" onClick={() => setSelectedListing(null)}></button>
                  </div>
                  <div className="modal-body">
                    <form id="editListingForm" onSubmit={(e) => { e.preventDefault(); handleUpdateListing(selectedListing._id); }}>
                      {listingType === 'hotels' && (
                        <>
                          <div className="mb-3">
                            <label className="form-label">Hotel Name</label>
                            <input
                              type="text"
                              className="form-control"
                              value={selectedListing.name || ''}
                              onChange={(e) => setSelectedListing({ ...selectedListing, name: e.target.value })}
                              required
                            />
                          </div>
                          <div className="mb-3">
                            <label className="form-label">City</label>
                            <input
                              type="text"
                              className="form-control"
                              value={selectedListing.address?.city || ''}
                              onChange={(e) => setSelectedListing({
                                ...selectedListing,
                                address: { ...selectedListing.address, city: e.target.value }
                              })}
                              required
                            />
                          </div>
                          <div className="mb-3">
                            <label className="form-label">Price per Night</label>
                            <input
                              type="number"
                              className="form-control"
                              value={selectedListing.price || ''}
                              onChange={(e) => setSelectedListing({ ...selectedListing, price: parseFloat(e.target.value) })}
                              required
                            />
                          </div>
                        </>
                      )}
                      {listingType === 'flights' && (
                        <>
                          <div className="mb-3">
                            <label className="form-label">Airline</label>
                            <input
                              type="text"
                              className="form-control"
                              value={selectedListing.airline || ''}
                              onChange={(e) => setSelectedListing({ ...selectedListing, airline: e.target.value })}
                              required
                            />
                          </div>
                          <div className="mb-3">
                            <label className="form-label">Origin</label>
                            <input
                              type="text"
                              className="form-control"
                              value={selectedListing.origin || ''}
                              onChange={(e) => setSelectedListing({ ...selectedListing, origin: e.target.value })}
                              required
                            />
                          </div>
                          <div className="mb-3">
                            <label className="form-label">Destination</label>
                            <input
                              type="text"
                              className="form-control"
                              value={selectedListing.destination || ''}
                              onChange={(e) => setSelectedListing({ ...selectedListing, destination: e.target.value })}
                              required
                            />
                          </div>
                          <div className="mb-3">
                            <label className="form-label">Price</label>
                            <input
                              type="number"
                              className="form-control"
                              value={selectedListing.price || ''}
                              onChange={(e) => setSelectedListing({ ...selectedListing, price: parseFloat(e.target.value) })}
                              required
                            />
                          </div>
                        </>
                      )}
                      {listingType === 'cars' && (
                        <>
                          <div className="mb-3">
                            <label className="form-label">Car Name</label>
                            <input
                              type="text"
                              className="form-control"
                              value={selectedListing.name || ''}
                              onChange={(e) => setSelectedListing({ ...selectedListing, name: e.target.value })}
                              required
                            />
                          </div>
                          <div className="mb-3">
                            <label className="form-label">Location</label>
                            <input
                              type="text"
                              className="form-control"
                              value={selectedListing.location || ''}
                              onChange={(e) => setSelectedListing({ ...selectedListing, location: e.target.value })}
                              required
                            />
                          </div>
                          <div className="mb-3">
                            <label className="form-label">Price per Day</label>
                            <input
                              type="number"
                              className="form-control"
                              value={selectedListing.price || ''}
                              onChange={(e) => setSelectedListing({ ...selectedListing, price: parseFloat(e.target.value) })}
                              required
                            />
                          </div>
                        </>
                      )}
                    </form>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={() => setSelectedListing(null)}>Cancel</button>
                    <button type="submit" form="editListingForm" className="btn btn-primary" disabled={loading}>
                      {loading ? 'Updating...' : 'Update Listing'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="users-tab">
          <div className="mb-3">
            <input
              type="text"
              className="form-control"
              placeholder="Search users..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              style={{ width: '300px' }}
            />
          </div>

          <div className="table-responsive">
            <table className="table table-striped">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.user_id}>
                    <td>{user.user_id}</td>
                    <td>{user.first_name} {user.last_name}</td>
                    <td>{user.email}</td>
                    <td>{user.phone_number}</td>
                    <td>{user.role}</td>
                    <td>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => setSelectedUser(user)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedUser && (
            <div className="modal-backdrop show" style={{ opacity: 0.5 }}></div>
          )}
          {selectedUser && (
            <div className="modal show d-block" tabIndex="-1">
              <div className="modal-dialog">
                <div className="modal-content">
                  <div className="modal-header">
                    <h5 className="modal-title">Edit User</h5>
                    <button type="button" className="btn-close" onClick={() => setSelectedUser(null)}></button>
                  </div>
                  <div className="modal-body">
                    <form id="editUserForm" onSubmit={(e) => { e.preventDefault(); handleUpdateUser(); }}>
                      <div className="mb-3">
                        <label className="form-label">First Name</label>
                        <input
                          type="text"
                          className="form-control"
                          value={selectedUser.first_name || ''}
                          onChange={(e) => setSelectedUser({ ...selectedUser, first_name: e.target.value })}
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label">Last Name</label>
                        <input
                          type="text"
                          className="form-control"
                          value={selectedUser.last_name || ''}
                          onChange={(e) => setSelectedUser({ ...selectedUser, last_name: e.target.value })}
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label">Email</label>
                        <input
                          type="email"
                          className="form-control"
                          value={selectedUser.email || ''}
                          onChange={(e) => setSelectedUser({ ...selectedUser, email: e.target.value })}
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label">Role</label>
                        <select
                          className="form-select"
                          value={selectedUser.role || 'user'}
                          onChange={(e) => setSelectedUser({ ...selectedUser, role: e.target.value })}
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                    </form>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={() => setSelectedUser(null)}>Cancel</button>
                    <button type="submit" form="editUserForm" className="btn btn-primary" disabled={loading}>
                      {loading ? 'Updating...' : 'Update User'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Billing Tab */}
      {activeTab === 'billing' && (
        <div className="billing-tab">
          <div className="mb-3 d-flex gap-2 align-items-center">
            <input
              type="date"
              className="form-control"
              placeholder="Filter by date"
              value={billDate}
              onChange={(e) => setBillDate(e.target.value)}
              style={{ width: 'auto' }}
            />
            <input
              type="number"
              className="form-control"
              placeholder="Month (1-12)"
              value={billMonth}
              onChange={(e) => setBillMonth(e.target.value)}
              min="1"
              max="12"
              style={{ width: '100px' }}
            />
            <input
              type="number"
              className="form-control"
              placeholder="Year"
              value={billYear}
              onChange={(e) => setBillYear(e.target.value)}
              style={{ width: '120px' }}
            />
            <button
              className="btn btn-outline-secondary"
              onClick={() => {
                setBillDate('');
                setBillMonth('');
                setBillYear('');
              }}
            >
              Clear Filters
            </button>
          </div>

          <div className="table-responsive">
            <table className="table table-striped">
              <thead>
                <tr>
                  <th>Billing ID</th>
                  <th>User</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <tr key={bill.invoiceId}>
                    <td>{bill.invoiceId}</td>
                    <td>{bill.first_name} {bill.last_name}</td>
                    <td>${bill.amount}</td>
                    <td>{bill.status}</td>
                    <td>{new Date(bill.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => handleViewBill(bill.invoiceId)}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedBill && (
            <div className="modal-backdrop show" style={{ opacity: 0.5 }}></div>
          )}
          {selectedBill && (
            <div className="modal show d-block" tabIndex="-1">
              <div className="modal-dialog">
                <div className="modal-content">
                  <div className="modal-header">
                    <h5 className="modal-title">Bill Details</h5>
                    <button type="button" className="btn-close" onClick={() => setSelectedBill(null)}></button>
                  </div>
                  <div className="modal-body">
                    <p><strong>Billing ID:</strong> {selectedBill.invoiceId}</p>
                    <p><strong>User:</strong> {selectedBill.first_name} {selectedBill.last_name}</p>
                    <p><strong>Email:</strong> {selectedBill.email}</p>
                    <p><strong>Phone:</strong> {selectedBill.phone_number}</p>
                    <hr />
                    <p><strong>Booking Type:</strong> {selectedBill.booking_type}</p>
                    <p><strong>Booking Status:</strong> {selectedBill.booking_status}</p>
                    <hr />
                    <p><strong>Amount:</strong> ${selectedBill.amount}</p>
                    <p><strong>Status:</strong> <span className={`badge bg-${selectedBill.status === 'paid' ? 'success' : 'warning'}`}>{selectedBill.status}</span></p>
                    <p><strong>Date:</strong> {new Date(selectedBill.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={() => setSelectedBill(null)}>Close</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminDashboardPage;
