export interface PaginationParams {
  page: number;
  limit: number;
}

export function parsePagination(query: { page?: string; limit?: string }): PaginationParams {
  const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20", 10) || 20));
  return { page, limit };
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  { page, limit }: PaginationParams
) {
  return {
    data,
    page,
    limit,
    total_pages: Math.ceil(total / limit),
    total,
  };
}
