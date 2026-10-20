import { SelectQueryBuilder } from 'kysely';
import { executeWithCursorPagination } from '@docmost/db/pagination/cursor-pagination';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';

// Cursor pagination by createdAt desc; `query` must already be ordered by createdAt desc.
export function paginateByCreatedAt<O extends { createdAt: Date }>(
  query: SelectQueryBuilder<any, any, O>,
  pagination: PaginationOptions,
) {
  return executeWithCursorPagination(query, {
    perPage: pagination.limit,
    cursor: pagination.cursor,
    beforeCursor: pagination.beforeCursor,
    fields: [{ expression: 'createdAt', direction: 'desc' }],
    parseCursor: (cursor: any) => ({
      createdAt: new Date(cursor.createdAt),
    }) as any,
  });
}
