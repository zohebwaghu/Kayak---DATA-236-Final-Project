// src/components/layout/Navbar.jsx
import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  selectIsAuthenticated,
  selectUser,
  logout,
} from '../../store/slices/authSlice';
import './Navbar.css';

const Navbar = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const isAuthenticated = useSelector(selectIsAuthenticated);
  const user = useSelector(selectUser);

  const [menuOpen, setMenuOpen] = useState(false);

  // NEW: avatar URL loaded from localStorage
  const [avatarUrl, setAvatarUrl] = useState('');
  const userId = user?.userId || null;

  const handleBrandClick = (e) => {
    e.preventDefault();
    navigate('/');
  };

  const handleSignInClick = () => {
    navigate('/login');
  };

  const handleAvatarClick = () => {
    setMenuOpen((prev) => !prev);
  };

  const handleGoProfile = () => {
    setMenuOpen(false);
    navigate('/profile');
  };

  const handleGoBookings = () => {
    setMenuOpen(false);
    navigate('/my-bookings');
  };

  const handleLogout = () => {
    setMenuOpen(false);
    dispatch(logout());
    navigate('/');
  };

  // Close dropdown whenever the route changes
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Initial read + lightweight polling to stay in sync with local profile image
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

    // Initial load
    readAvatar();

    // Poll every 1.5s while this user is logged in
    const intervalId = window.setInterval(readAvatar, 1500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [userId]);

  const firstInitial =
    (user?.firstName && user.firstName.trim().charAt(0).toUpperCase()) ||
    (user?.email && user.email.trim().charAt(0).toUpperCase()) ||
    '?';

  return (
    <header className="kayak-navbar-wrapper">
      <nav className="navbar navbar-expand-lg kayak-navbar">
        <div className="container-fluid">
          {/* Left: Brand */}
          <button
            type="button"
            className="navbar-brand kayak-logo-btn"
            onClick={handleBrandClick}
          >
            <span className="kayak-logo-text">Kayak</span>
          </button>

          {/* Right: Auth controls */}
          <div className="ms-auto d-flex align-items-center">
            {!isAuthenticated ? (
              <button
                type="button"
                className="btn kayak-signin-btn"
                onClick={handleSignInClick}
              >
                <span className="kayak-signin-icon me-2">👤</span>
                <span>Sign in</span>
              </button>
            ) : (
              <div className="kayak-user-menu">
                <button
                  type="button"
                  className="kayak-avatar-btn"
                  onClick={handleAvatarClick}
                  aria-expanded={menuOpen}
                  aria-haspopup="true"
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Profile"
                      className="kayak-avatar-image"
                    />
                  ) : (
                    <span className="kayak-avatar-initial">{firstInitial}</span>
                  )}
                </button>

                {menuOpen && (
                  <div className="kayak-user-dropdown" role="menu">
                    <button
                      type="button"
                      className="dropdown-item"
                      onClick={handleGoProfile}
                    >
                      Profile
                    </button>
                    <button
                      type="button"
                      className="dropdown-item"
                      onClick={handleGoBookings}
                    >
                      My bookings
                    </button>
                    <div className="dropdown-divider" />
                    <button
                      type="button"
                      className="dropdown-item dropdown-item-danger"
                      onClick={handleLogout}
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
