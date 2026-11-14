import axios from 'axios';

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  meta: { page?: number; per_page?: number; total?: number } | null;
  error: { code: string; message: string; details: { field?: string; message: string }[] } | null;
  request_id: string;
}

// Core SIMRS API (Yii2) and Node service (dashboard + integration), both through the dev proxy.
export const yiiApi = axios.create({ baseURL: '/yii/api/v1', timeout: 15000 });
export const nodeApi = axios.create({ baseURL: '/node/api/v1', timeout: 15000 });
