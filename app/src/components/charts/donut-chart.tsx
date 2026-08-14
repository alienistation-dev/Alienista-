'use client';

import React from 'react';

export function DonutChart({ present, total }: { present: number; total: number }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, present / total) : 0;
  const off = c * (1 - pct);

  return (
    <div className="relative flex items-center justify-center">
      <svg width="120" height="120" viewBox="0 0 120 120" className="transform -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#1E293B" strokeWidth="12" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="#2F6B4F"
          strokeWidth="12"
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute text-center">
        <span className="text-xl font-bold text-white tracking-tight">{Math.round(pct * 100)}%</span>
      </div>
    </div>
  );
}
