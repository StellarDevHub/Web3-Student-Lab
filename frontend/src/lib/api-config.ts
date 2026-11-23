import { getPublicEnv } from './env';

export const API_BASE_URL = getPublicEnv().apiUrl;
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/v\d+$/, '');

export function getWorkspaceId() {
  if (typeof window === 'undefined') {
    return 'default';
  }

  return localStorage.getItem('workspace_id') || 'default';
}
