// src/store/slices/authSlice.js
import { createSlice } from '@reduxjs/toolkit';

// Try to hydrate from localStorage so login persists on refresh
const storedAuth = (() => {
  try {
    const raw = localStorage.getItem('kayak_auth');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
})();

const initialState = {
  accessToken: storedAuth?.accessToken || null,
  user: storedAuth?.user || null, // { userId, email, firstName, lastName, role }
};

const saveToStorage = (state) => {
  try {
    if (state.accessToken && state.user) {
      localStorage.setItem(
        'kayak_auth',
        JSON.stringify({
          accessToken: state.accessToken,
          user: state.user,
        })
      );
    } else {
      localStorage.removeItem('kayak_auth');
    }
  } catch {
    // ignore storage errors
  }
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginSuccess(state, action) {
      // payload: { accessToken, user }
      state.accessToken = action.payload.accessToken;
      state.user = action.payload.user;
      saveToStorage(state);
    },
    logout(state) {
      state.accessToken = null;
      state.user = null;
      saveToStorage(state);
    },
    setUser(state, action) {
      state.user = { ...state.user, ...action.payload };
      saveToStorage(state);
    },
  },
});

export const { loginSuccess, logout, setUser } = authSlice.actions;

export const selectAuth = (state) => state.auth;
export const selectAccessToken = (state) => state.auth.accessToken;
export const selectUser = (state) => state.auth.user;
export const selectIsAuthenticated = (state) => !!state.auth.accessToken;
export const selectUserRole = (state) => state.auth.user?.role ?? 'user';

export default authSlice.reducer;
