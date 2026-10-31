/**
 * Orbixa Store — Centralized REST API Client (client.ts)
 * Uses environment-based public configuration (`VITE_API_BASE_URL`).
 * Never stores secrets in frontend code or browser storage.
 */

function resolveApiBaseUrl(): string {
  try {
    const viteEnv = (import.meta as any)?.env?.VITE_API_BASE_URL;
    if (viteEnv && typeof viteEnv === 'string' && viteEnv.trim()) {
      return viteEnv.trim().replace(/\/$/, '');
    }
  } catch {
    // Ignore when not running under Vite
  }
  if (typeof window !== 'undefined') {
    const winOverride = (window as any).__ORBIXA_API_BASE_URL__;
    if (winOverride && typeof winOverride === 'string') {
      return winOverride.trim().replace(/\/$/, '');
    }
    if (window.location && window.location.origin && window.location.origin.startsWith('http')) {
      if (window.location.port !== '5173') {
        return `${window.location.origin.replace(/\/$/, '')}/api/v1`;
      }
    }
  }
  return 'http://localhost:5000/api/v1';
}

export const API_BASE_URL = resolveApiBaseUrl();

let activeCsrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  activeCsrfToken = token;
}

export function getCsrfToken(): string | null {
  return activeCsrfToken;
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const base = resolveApiBaseUrl();
  const url = `${base}/${endpoint.replace(/^\//, '')}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (activeCsrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes((options.method || 'GET').toUpperCase())) {
    headers['X-CSRF-Token'] = activeCsrfToken;
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/csv')) {
    const textData = await response.text();
    if (!response.ok) {
      throw new Error(`CSV Export Error (${response.status})`);
    }
    return textData as unknown as T;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.message || `API Error (${response.status})`) as Error & {
      status?: number;
      code?: string;
      payload?: any;
    };
    err.status = response.status;
    err.code = data.error || 'API_ERROR';
    err.payload = data;
    throw err;
  }
  return data as T;
}
