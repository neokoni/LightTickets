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
  driver: 'local' | 's3';
  uploadDir: string;
  s3?: StorageS3Config;
}

export interface StorageTestResult {
  success: boolean;
  message: string;
}
