export interface PaginatedResponse<T> {
  tickets: T[];
  total: number;
  page: number;
  pageSize: number;
}

export class ApiError extends Error {
  statusCode: number;
  requestId?: string;
  isCloudflareChallenge: boolean;

  constructor(
    statusCode: number,
    message: string,
    requestId?: string,
    isCloudflareChallenge = false,
  ) {
    super(
      message ||
        [`HTTP ${statusCode}`, requestId ? `Ray ID: ${requestId}` : ''].filter(Boolean).join(' · '),
    );
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.requestId = requestId;
    this.isCloudflareChallenge = isCloudflareChallenge;
  }
}
