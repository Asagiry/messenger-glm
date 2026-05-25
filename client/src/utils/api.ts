const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

async function request(path: string, options: RequestInit = {}): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  post: (path: string, body: any) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  get: (path: string) => request(path, { method: 'GET' }),
  patch: (path: string, body: any) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path: string, body?: any) => request(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
};
