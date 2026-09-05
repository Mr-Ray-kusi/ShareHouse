import axios from 'axios';
import { apiOrigin } from './baseUrl';

const api = axios.create({
  baseURL: apiOrigin(),
  withCredentials: true,
});

let accessToken = sessionStorage.getItem('ws_access') || null;
let refreshPromise = null;

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token || null;
  if (token) sessionStorage.setItem('ws_access', token);
  else sessionStorage.removeItem('ws_access');
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && original && !original._retry && !original.url?.includes('/api/auth/refresh')) {
      original._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = api.post('/api/auth/refresh').finally(() => {
            refreshPromise = null;
          });
        }
        const { data } = await refreshPromise;
        setAccessToken(data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (_err) {
        setAccessToken(null);
      }
    }
    return Promise.reject(error);
  }
);

export default api;

export async function downloadFile(url, filename) {
  const { data, headers } = await api.get(url, { responseType: 'blob' });
  if (data?.type && data.type.includes('application/json')) {
    const text = await data.text();
    let message = 'Download failed.';
    try {
      message = JSON.parse(text).message || message;
    } catch {
      message = text || message;
    }
    throw new Error(message);
  }
  const disposition = headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const name = filename || match?.[1] || 'download.xlsx';
  const blobUrl = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}
