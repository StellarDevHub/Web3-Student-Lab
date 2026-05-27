import axios from 'axios';
import { API_BASE_URL, getWorkspaceId } from './api-config';

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

import { encryptPayload } from './encryption';

// Add token to requests if available
apiClient.interceptors.request.use(async (config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  config.headers['x-workspace-id'] = getWorkspaceId();

  // Handle Payload Encryption for sensitive data
  if (config.data && (config as any).encrypt) {
    try {
      const encrypted = await encryptPayload(config.data);
      config.data = encrypted;
      config.headers['X-Payload-Encryption'] = 'true';
    } catch (error) {
      console.error(
        'Encryption failed, sending as fallback (or block if strictly required):',
        error
      );
    }
  }

  return config;
});

// Handle response errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/auth/login';
    }

    if (error.response?.data?.error && !error.message) {
      error.message = error.response.data.error;
    }

    return Promise.reject(error);
  }
);

export default apiClient;
