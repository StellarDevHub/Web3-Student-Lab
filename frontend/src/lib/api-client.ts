import axios from 'axios';
import { API_BASE_URL, getWorkspaceId } from './api-config';
import { queueOfflineRequest } from './offline-sync';

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
  const isBrowser = typeof window !== 'undefined';
  const method = config.method?.toLowerCase();

  if (
    isBrowser &&
    !navigator.onLine &&
    method &&
    ['post', 'put', 'patch', 'delete'].includes(method) &&
    config.url
  ) {
    const url = config.baseURL
      ? new URL(config.url, config.baseURL).toString()
      : config.url;

    await queueOfflineRequest({
      url,
      method: method.toUpperCase() as 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      headers: { ...(config.headers as Record<string, string>) },
      body:
        typeof config.data === 'string'
          ? config.data
          : config.data !== undefined
          ? JSON.stringify(config.data)
          : undefined,
    });

    return Promise.reject(
      new Error('Offline: request queued for later synchronization.')
    );
  }

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
  async (error) => {
    const isBrowser = typeof window !== 'undefined';
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (isBrowser) {
        const publicPaths = ['/auth/login', '/auth/register', '/roadmap', '/courses'];
        const isPublicPath = publicPaths.some(p => window.location.pathname.startsWith(p));
        if (!isPublicPath) {
          window.location.href = '/auth/login';
        }
      }
    }

    const config = error.config;
    const method = config?.method?.toLowerCase();
    const shouldQueue =
      isBrowser &&
      !navigator.onLine &&
      method &&
      ['post', 'put', 'patch', 'delete'].includes(method) &&
      config?.url;

    if (shouldQueue) {
      const url = config.baseURL
        ? new URL(config.url, config.baseURL).toString()
        : config.url;

      await queueOfflineRequest({
        url,
        method: method.toUpperCase() as 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        headers: { ...(config.headers as Record<string, string>) },
        body:
          typeof config.data === 'string'
            ? config.data
            : config.data !== undefined
            ? JSON.stringify(config.data)
            : undefined,
      });

      return Promise.reject(
        new Error('Offline: request queued for later synchronization.')
      );
    }

    if (error.response?.data?.error && !error.message) {
      error.message = error.response.data.error;
    }

    return Promise.reject(error);
  }
);

export default apiClient;
