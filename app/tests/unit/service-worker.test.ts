import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

const ORIGIN = 'https://alienista.test';
const source = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8');

type Listener = (event: { request?: Request; waitUntil: (p: Promise<unknown>) => void; respondWith: (p: Promise<Response>) => void }) => void;

function createWorker(network: (request: Request) => Promise<Response>, existingCaches: string[] = []) {
  const stores = new Map<string, Map<string, Response>>(existingCaches.map((name) => [name, new Map()]));
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    const key = (input: Request | string) => new URL(typeof input === 'string' ? input : input.url, ORIGIN).href;
    return {
      match: async (input: Request | string) => store.get(key(input))?.clone(),
      put: async (input: Request | string, response: Response) => { store.set(key(input), response); },
      addAll: async (urls: string[]) => { for (const url of urls) store.set(key(url), await network(new Request(key(url)))); },
    };
  };
  const caches = {
    open,
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (input: Request | string) => {
      for (const name of stores.keys()) {
        const hit = await (await open(name)).match(input);
        if (hit) return hit;
      }
      return undefined;
    },
  };
  const listeners: Record<string, Listener> = {};
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: Listener) => { listeners[type] = listener; },
    skipWaiting: () => undefined,
    clients: { claim: () => undefined },
  };
  vm.runInNewContext(source, { self, caches, fetch: network, URL, Request, Response, Promise });

  async function lifecycle(type: 'install' | 'activate') {
    const pending: Promise<unknown>[] = [];
    listeners[type]({ waitUntil: (p) => pending.push(p), respondWith: () => undefined });
    await Promise.all(pending);
  }
  async function request(url: string, init?: { mode?: 'navigate' }) {
    const req = new Request(new URL(url, ORIGIN).href);
    // Request() refuses mode 'navigate'; browsers set it only for page loads.
    if (init?.mode === 'navigate') Object.defineProperty(req, 'mode', { value: 'navigate' });
    let responded: Promise<Response> | undefined;
    listeners.fetch({ request: req, waitUntil: () => undefined, respondWith: (p) => { responded = p; } });
    return responded;
  }
  return { stores, lifecycle, request };
}

let online = true;
const network = async (request: Request) => {
  if (!online) throw new TypeError('Failed to fetch');
  const path = new URL(request.url).pathname;
  const type = path.endsWith('.css') ? 'text/css' : path.endsWith('.html') ? 'text/html' : 'text/plain';
  return new Response(`body of ${path}`, { status: 200, headers: { 'content-type': type } });
};

describe('service worker', () => {
  beforeEach(() => { online = true; });

  it('serves hashed Next.js assets from cache when offline', async () => {
    const worker = createWorker(network);
    await worker.lifecycle('install');
    await worker.lifecycle('activate');
    await (await worker.request('/_next/static/chunks/app.css'))!.text();

    online = false;
    const offline = await worker.request('/_next/static/chunks/app.css');
    expect(offline).toBeDefined();
    const response = await offline!;
    expect(response.headers.get('content-type')).toBe('text/css');
    expect(await response.text()).toBe('body of /_next/static/chunks/app.css');
  });

  it('shows the offline page for navigations, never a cached login page', async () => {
    const worker = createWorker(network);
    await worker.lifecycle('install');
    online = false;
    const response = await (await worker.request('/scanner', { mode: 'navigate' }))!;
    expect(await response.text()).toBe('body of /offline.html');
    expect([...worker.stores.values()].some((store) => [...store.keys()].some((key) => key.endsWith('/login')))).toBe(false);
  });

  it('does not answer non-navigation, non-static requests from the fallback', async () => {
    const worker = createWorker(network);
    await worker.lifecycle('install');
    expect(await worker.request('/scanner?_rsc=abc')).toBeUndefined();
    expect(await worker.request('/api/health')).toBeUndefined();
    expect(await worker.request('https://project.supabase.co/rest/v1/students')).toBeUndefined();
  });

  it('keeps scanner avatar caches when activating', async () => {
    const worker = createWorker(network, ['alienista_avatar_cache_v2_org_event', 'attendqr-shell-v1']);
    await worker.lifecycle('install');
    await worker.lifecycle('activate');
    expect(worker.stores.has('alienista_avatar_cache_v2_org_event')).toBe(true);
    expect(worker.stores.has('attendqr-shell-v1')).toBe(false);
  });
});
