import { describe, expect, it, vi } from 'vitest';
import { buildBadgePrintDocument, openBadgePrintWindow } from '@/lib/badges/print-badges';

describe('badge printing', () => {
  it('opens the print window without popup-blocking feature flags', () => {
    const printWindow = { opener: null } as unknown as Window;
    const open = vi.fn(() => printWindow);
    vi.stubGlobal('window', { open });

    expect(openBadgePrintWindow()).toBe(printWindow);
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(printWindow.opener).toBeNull();
  });

  it('builds a printable document containing every rendered badge', () => {
    const document = buildBadgePrintDocument(['data:image/png;base64,one', 'data:image/png;base64,two']);

    expect(document).toContain('A4 portrait');
    expect(document).toContain('window.print()');
    expect(document).toContain("window.addEventListener('load'");
    expect(document.match(/<img /g)).toHaveLength(2);
    expect(document).toContain('data:image/png;base64,one');
    expect(document).toContain('data:image/png;base64,two');
  });
});
