export interface ParsedPagination {
  page: number;
  limit: number;
  skip: number;
  sort: Record<string, 1 | -1>;
  search?: string;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Parses the page/limit/sort/search query params every list endpoint accepts. */
export function parsePaginationQuery(query: Record<string, unknown>): ParsedPagination {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit) || DEFAULT_LIMIT));

  let sort: Record<string, 1 | -1> = { createdAt: -1 };
  if (typeof query.sort === 'string' && query.sort.trim()) {
    sort = {};
    for (const field of query.sort.split(',')) {
      const trimmed = field.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('-')) sort[trimmed.slice(1)] = -1;
      else sort[trimmed] = 1;
    }
  }

  const search = typeof query.search === 'string' && query.search.trim() ? query.search.trim() : undefined;

  return { page, limit, skip: (page - 1) * limit, sort, search };
}
