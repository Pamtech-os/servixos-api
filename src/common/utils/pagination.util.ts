const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function resolvePagination(
  page?: number,
  limit?: number,
): PaginationParams {
  const p = page ?? DEFAULT_PAGE;
  const l = limit ?? DEFAULT_LIMIT;
  return { page: p, limit: l, skip: (p - 1) * l };
}

export function buildMeta(
  page: number,
  limit: number,
  total: number,
): PaginationMeta {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
