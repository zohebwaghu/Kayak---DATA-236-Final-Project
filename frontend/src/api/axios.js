// src/api/axios.js
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3000/api/v1', // API Gateway
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT from localStorage (keeps us decoupled from Redux store here)
api.interceptors.request.use(
  (config) => {
    try {
      const raw = localStorage.getItem('kayak_auth');
      if (raw) {
        const { accessToken } = JSON.parse(raw);
        if (accessToken) {
          config.headers.Authorization = `Bearer ${accessToken}`;
        }
      }
    } catch {
      // ignore
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default api;
