// src/components/layout/Navbar.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  selectIsAuthenticated,
  selectUser,
  selectUserRole,
  logout,
} from '../../store/slices/authSlice';
import './Navbar.css';

const Navbar = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const dropdownRef = useRef(null);

  const isAuthenticated = useSelector(selectIsAuthenticated);
  const user = useSelector(selectUser);
  const userRole = useSelector(selectUserRole);

  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');

  const userId = user?.userId || null;

  // Navigation items for mobile menu with SVG icons
  const navIcons = {
    flights: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
      </svg>
    ),
    stays: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M7 14c1.66 0 3-1.34 3-3S8.66 8 7 8s-3 1.34-3 3 1.34 3 3 3zm12-7h-8v5h8V7zm-8 7v7H4V14h7zm2 0h8v7h-8v-7z"/>
      </svg>
    ),
    cars: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
      </svg>
    ),
    ai: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
      </svg>
    ),
  };

  const navItems = [
    { path: '/search/flights', label: 'Flights', iconKey: 'flights' },
    { path: '/search/hotels', label: 'Stays', iconKey: 'stays' },
    { path: '/search/cars', label: 'Cars', iconKey: 'cars' },
    { path: '/search/ai', label: 'KAYAK.ai', iconKey: 'ai' },
  ];

  const isActive = (path) => location.pathname.startsWith(path);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close menus on route change
  useEffect(() => {
    setMenuOpen(false);
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Load avatar from localStorage
  useEffect(() => {
    if (!userId) {
      setAvatarUrl('');
      return;
    }

    const storageKey = `kayak_avatar_${userId}`;
    const readAvatar = () => {
      try {
        const raw = localStorage.getItem(storageKey);
        setAvatarUrl(raw || '');
      } catch {
        setAvatarUrl('');
      }
    };

    readAvatar();
    const intervalId = window.setInterval(readAvatar, 1500);
    return () => window.clearInterval(intervalId);
  }, [userId]);

  const firstInitial =
    (user?.firstName && user.firstName.trim().charAt(0).toUpperCase()) ||
    (user?.email && user.email.trim().charAt(0).toUpperCase()) ||
    '?';

  const handleLogout = () => {
    setMenuOpen(false);
    dispatch(logout());
    navigate('/');
  };

  return (
    <header className="kayak-header">
      <nav className="kayak-nav">
        <div className="kayak-nav-container">
          {/* Left: Hamburger + Logo */}
          <div className="kayak-nav-left">
            <button
              className="kayak-hamburger-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Menu"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>

            <Link to="/" className="kayak-logo" aria-label="Kayak home">
              <span className="kayak-logo-box">K</span>
              <span className="kayak-logo-box">A</span>
              <span className="kayak-logo-box">Y</span>
              <span className="kayak-logo-box">A</span>
              <span className="kayak-logo-box">K</span>
            </Link>
          </div>

          {/* Right Section - Clean like real Kayak */}
          <div className="kayak-nav-right">
            <button className="kayak-heart-btn" aria-label="Favorites">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
            </button>

            {!isAuthenticated ? (
              <Link to="/login" className="kayak-signin-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <span>Sign in</span>
              </Link>
            ) : (
              <div className="kayak-user-section" ref={dropdownRef}>
                <Link to="/my-bookings" className="kayak-trips-link">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  <span>Trips</span>
                </Link>

                <button
                  type="button"
                  className="kayak-avatar-btn"
                  onClick={() => setMenuOpen(!menuOpen)}
                  aria-expanded={menuOpen}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Profile" className="kayak-avatar-img" />
                  ) : (
                    <div className="kayak-avatar-placeholder">
                      {firstInitial}
                    </div>
                  )}
                  <svg
                    className={`kayak-avatar-chevron ${menuOpen ? 'open' : ''}`}
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>

                {menuOpen && (
                  <div className="kayak-dropdown">
                    <div className="kayak-dropdown-header">
                      <div className="kayak-dropdown-user-info">
                        <span className="kayak-dropdown-name">
                          {user?.firstName} {user?.lastName}
                        </span>
                        <span className="kayak-dropdown-email">{user?.email}</span>
                      </div>
                    </div>

                    <div className="kayak-dropdown-body">
                      <Link to="/profile" className="kayak-dropdown-item" onClick={() => setMenuOpen(false)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                          <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                        <span>My Account</span>
                      </Link>

                      <Link to="/my-bookings" className="kayak-dropdown-item" onClick={() => setMenuOpen(false)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                          <line x1="16" y1="13" x2="8" y2="13"></line>
                          <line x1="16" y1="17" x2="8" y2="17"></line>
                        </svg>
                        <span>My Bookings</span>
                      </Link>

                      {(userRole === 'admin' || userRole === 'host') && (
                        <>
                          <div className="kayak-dropdown-divider"></div>
                          <Link
                            to="/admin"
                            className="kayak-dropdown-item kayak-dropdown-item-highlight"
                            onClick={() => setMenuOpen(false)}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="3"></circle>
                              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                            </svg>
                            <span>{userRole === 'admin' ? 'Admin Dashboard' : 'Host Dashboard'}</span>
                          </Link>
                        </>
                      )}
                    </div>

                    <div className="kayak-dropdown-footer">
                      <button
                        type="button"
                        className="kayak-dropdown-item kayak-dropdown-logout"
                        onClick={handleLogout}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                          <polyline points="16 17 21 12 16 7"></polyline>
                          <line x1="21" y1="12" x2="9" y2="12"></line>
                        </svg>
                        <span>Sign out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="kayak-mobile-menu">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`kayak-mobile-link ${isActive(item.path) ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="kayak-mobile-icon">{navIcons[item.iconKey]}</span>
                <span>{item.label}</span>
              </Link>
            ))}
            {!isAuthenticated && (
              <div className="kayak-mobile-auth">
                <Link to="/login" className="kayak-mobile-auth-btn" onClick={() => setMobileMenuOpen(false)}>
                  Log in
                </Link>
                <Link to="/signup" className="kayak-mobile-auth-btn primary" onClick={() => setMobileMenuOpen(false)}>
                  Sign up
                </Link>
              </div>
            )}
          </div>
        )}
      </nav>
    </header>
  );
};

export default Navbar;
