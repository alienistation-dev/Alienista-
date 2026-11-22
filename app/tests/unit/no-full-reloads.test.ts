import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// A full reload re-downloads and re-renders the whole app after a save; refresh server data instead.
const views = [
  'src/app/(dashboard)/settings/settings-view.tsx',
  'src/app/(dashboard)/settings/sanctions-policy-editor.tsx',
  'src/app/(dashboard)/students/student-table.tsx',
];

describe('dashboard views after a save', () => {
  it.each(views)('%s does not reload the page', (view) => {
    expect(readFileSync(resolve(__dirname, '../..', view), 'utf8')).not.toContain('location.reload');
  });
});
