import { describe, expect, it, vi } from 'vitest';
import { collectAllPages } from '@/lib/collect-pages';

describe('collectAllPages', () => {
  it('fetches every result page for export and print commands', async () => {
    const load = vi.fn(async (page: number) => ({
      items: page === 1 ? ['one', 'two'] : ['three'],
      total: 3,
      page,
      pageSize: 2,
    }));

    await expect(collectAllPages(load)).resolves.toEqual(['one', 'two', 'three']);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('stops when a short page proves there is no more data', async () => {
    const load = vi.fn(async (page: number) => ({
      items: page === 1 ? ['one'] : [],
      total: 100,
      page,
      pageSize: 100,
    }));

    await expect(collectAllPages(load)).resolves.toEqual(['one']);
    expect(load).toHaveBeenCalledOnce();
  });
});
