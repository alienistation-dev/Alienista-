import React from 'react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F7F4] text-slate-900 p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
