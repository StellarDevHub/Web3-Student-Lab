const RAW_API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

export const API_BASE_URL = RAW_API_BASE_URL.replace(/\/+$/, '');
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/v\d+$/, '');

export function getWorkspaceId() {
  if (typeof window === 'undefined') {
    return 'default';
  }

  return localStorage.getItem('workspace_id') || 'default';
}
