import React from 'react';
import { getBadgeStudentsAction } from '@/lib/actions/students';
import { QrGeneratorView } from './qr-generator-view';

export default async function QrGeneratorPage() {
  const res = await getBadgeStudentsAction();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">QR Badge Generator</h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          Generate, download high-res badge graphics, and print official student membership ID cards.
        </p>
      </div>

      <QrGeneratorView
        initialPage={res.success ? res.data : { items: [], total: 0, page: 1, pageSize: 8 }}
      />
    </div>
  );
}
