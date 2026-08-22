import React from 'react';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { Header } from '@/components/layout/header';
import { NavigationLink } from '@/components/layout/navigation-link';
import { QrCode, History } from 'lucide-react';
import { NavigationMetrics } from '@/components/layout/navigation-metrics';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user || user.role !== 'student') {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-[#F8FAF9] text-slate-900 flex flex-col">
      <NavigationMetrics />
      <Header user={user} />
      <main className="flex-1 p-4 sm:p-6 max-w-xl w-full mx-auto pb-24">{children}</main>

      {/* Student Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-xl border-t border-[#E5EBE5] px-6 flex items-center justify-around z-40 shadow-md">
        <NavigationLink
          href="/my-qr"
          className="flex flex-col items-center justify-center py-1 px-4 text-slate-600 hover:text-[#2D6A4F] transition-colors"
        >
          <QrCode className="w-5 h-5" />
          <span className="text-[10px] font-bold mt-1">My Badge</span>
        </NavigationLink>
        <NavigationLink
          href="/my-attendance"
          className="flex flex-col items-center justify-center py-1 px-4 text-slate-600 hover:text-[#2D6A4F] transition-colors"
        >
          <History className="w-5 h-5" />
          <span className="text-[10px] font-bold mt-1">Attendance History</span>
        </NavigationLink>
      </nav>
    </div>
  );
}
