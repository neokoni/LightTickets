export interface PaginatedResponse<T> {
  tickets: T[];
  total: number;
  page: number;
  pageSize: number;
}

export class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}
