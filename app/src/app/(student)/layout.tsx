import React from 'react';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { Header } from '@/components/layout/header';
import Link from 'next/link';
import { QrCode, History } from 'lucide-react';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user || user.role !== 'student') {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col">
      <Header user={user} />
      <main className="flex-1 p-4 sm:p-6 max-w-xl w-full mx-auto pb-24">{children}</main>

      {/* Student Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-[#0B1120]/95 backdrop-blur-xl border-t border-slate-800/80 px-6 flex items-center justify-around z-40">
        <Link
          href="/my-qr"
          className="flex flex-col items-center justify-center py-1 px-4 text-slate-300 hover:text-amber-400 transition-colors"
        >
          <QrCode className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">My Badge</span>
        </Link>
        <Link
          href="/my-attendance"
          className="flex flex-col items-center justify-center py-1 px-4 text-slate-300 hover:text-amber-400 transition-colors"
        >
          <History className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">Attendance History</span>
        </Link>
      </nav>
    </div>
  );
}
