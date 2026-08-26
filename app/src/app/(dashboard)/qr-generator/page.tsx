import React from 'react';
import { getBadgeStudentsAction } from '@/lib/actions/students';
import { QrGeneratorView } from './qr-generator-view';

export default async function QrGeneratorPage() {
  const res = await getBadgeStudentsAction();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">QR Badge Generator</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Generate, download high-res badge graphics, and print official student membership ID cards.
        </p>
      </div>

      <QrGeneratorView students={res.success ? res.data : []} />
    </div>
  );
}
