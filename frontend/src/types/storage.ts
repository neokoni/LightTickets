export const StorageDriver = {
  LOCAL: 'local',
  S3: 's3',
} as const;

export type StorageDriver = (typeof StorageDriver)[keyof typeof StorageDriver];

export interface StorageS3Config {
  endpoint: string;
  region?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  presignExpiry: number;
}

export interface StorageConfig {
  driver: StorageDriver;
  uploadDir: string;
  s3?: StorageS3Config;
}

export interface StorageTestResult {
  success: boolean;
  message: string;
}
