import { describe, expect, it } from 'vitest';
import manifest from '../../public/manifest.json';

describe('PWA manifest', () => {
  it('declares installable PNG icons at the required sizes', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }),
      expect.objectContaining({ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }),
    ]));
  });
});
