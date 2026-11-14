import axios, { AxiosError } from 'axios';

export interface ApiError {
  code: string;
  message: string;
  details: { field?: string; message: string }[];
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  meta: { page?: number; per_page?: number; total?: number } | null;
  error: ApiError | null;
  request_id: string;
}

const TOKEN_KEY = 'simrs.token';

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* storage unavailable: session lasts until reload */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

// Core SIMRS API (Yii2) and Node service (dashboard + integration), both through the dev proxy.
export const yiiApi = axios.create({ baseURL: '/yii/api/v1', timeout: 15000 });
export const nodeApi = axios.create({ baseURL: '/node/api/v1', timeout: 15000 });

for (const client of [yiiApi, nodeApi]) {
  client.interceptors.request.use((config) => {
    const token = tokenStore.get();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
}

// A 401 on any call except login means the session is gone: drop the token and go to /login.
yiiApi.interceptors.response.use(
  (r) => r,
  (error: AxiosError<ApiEnvelope<unknown>>) => {
    const isLogin = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLogin) {
      tokenStore.clear();
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    return Promise.reject(error);
  },
);

/** Normalises any thrown value into the API error shape (network errors included). */
export function toApiError(e: unknown): ApiError {
  const err = e as AxiosError<ApiEnvelope<unknown>>;
  if (err?.response?.data?.error) return err.response.data.error;
  if (err?.code === 'ECONNABORTED') return { code: 'TIMEOUT', message: 'Permintaan melebihi batas waktu', details: [] };
  if (err?.request) return { code: 'NETWORK', message: 'Server tidak dapat dihubungi', details: [] };
  return { code: 'UNKNOWN', message: 'Terjadi kesalahan', details: [] };
}
