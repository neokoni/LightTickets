import { apiFetch } from './client';
import type { StorageConfig, StorageS3Config, StorageTestResult } from '@/types/storage';

export function apiGetStorageConfig() {
  return apiFetch<StorageConfig>('/admin/storage', { method: 'GET' });
}

export function apiUpdateStorageConfig(data: {
  driver: 'local' | 's3';
  uploadDir?: string;
  s3?: Partial<StorageS3Config>;
}) {
  return apiFetch<StorageConfig>('/admin/storage', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function apiTestS3Connection() {
  return apiFetch<StorageTestResult>('/admin/storage/test', {
    method: 'POST',
  });
}
