import { apiFetch } from './client'

export interface StorageS3Config {
  endpoint: string
  region?: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
  presignExpiry: number
}

export interface StorageConfig {
  driver: 'local' | 's3'
  uploadDir: string
  s3?: StorageS3Config
}

export interface StorageTestResult {
  success: boolean
  message: string
}

export function apiGetStorageConfig() {
  return apiFetch<StorageConfig>('/admin/storage', { method: 'GET' })
}

export function apiUpdateStorageConfig(data: {
  driver: 'local' | 's3'
  uploadDir?: string
  s3?: Partial<StorageS3Config>
}) {
  return apiFetch<StorageConfig>('/admin/storage', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function apiTestS3Connection() {
  return apiFetch<StorageTestResult>('/admin/storage/test', {
    method: 'POST',
  })
}
