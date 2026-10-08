import React from 'react';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomTabs } from '@/components/layout/bottom-tabs';
import { NavigationMetrics } from '@/components/layout/navigation-metrics';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user || user.role === 'student') {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-[#F8FAF9] text-slate-900 flex">
      <NavigationMetrics />
      <Sidebar user={user} />
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-6">
        <Header user={user} />
        <main className="p-4 sm:p-6 max-w-7xl w-full mx-auto flex-1">{children}</main>
      </div>
      <BottomTabs />
    </div>
  );
}
