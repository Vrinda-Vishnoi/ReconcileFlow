import { useAuthStore } from '../stores/authStore';
import { API_BASE_URL } from './config';

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, message: string, data: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = useAuthStore.getState().token;
  
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
  });

  let data;
  try {
    data = await response.json();
  } catch (e) {
    data = null;
  }

  if (!response.ok) {
    if (response.status === 401) {
      useAuthStore.getState().logout();
    }
    let errorMessage = data?.message || data?.error || 'An error occurred';
    if (data?.details && Array.isArray(data.details) && data.details.length > 0) {
      errorMessage = data.details[0].message; // Get the specific Zod validation error
    }
    throw new ApiError(response.status, errorMessage, data);
  }

  return data;
}

export const api = {
  get: (url: string) => fetchWithAuth(url),
  post: (url: string, data?: any) => fetchWithAuth(url, { method: 'POST', body: JSON.stringify(data) }),
  put: (url: string, data?: any) => fetchWithAuth(url, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (url: string) => fetchWithAuth(url, { method: 'DELETE' }),
};
