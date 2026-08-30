import type { PaginatedResult } from '@/lib/types/actions';

export async function collectAllPages<T>(
  loadPage: (page: number) => Promise<PaginatedResult<T>>
): Promise<T[]> {
  const items: T[] = [];
  let page = 1;

  while (true) {
    const result = await loadPage(page);
    items.push(...result.items);
    if (result.items.length < result.pageSize || items.length >= result.total) return items;
    page += 1;
  }
}
