'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { logoutAction } from '@/lib/actions/auth';
import { SessionUser } from '@/lib/types/actions';
import { LogOut, Wifi, WifiOff } from 'lucide-react';
import Image from 'next/image';

interface HeaderProps {
  user: SessionUser;
  academicYear?: string;
  semester?: string;
}

export function Header({ user, academicYear = '2026-2027', semester = 'First Semester' }: HeaderProps) {
  const router = useRouter();
  const [isOnline, setIsOnline] = React.useState(true);

  React.useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleLogout = async () => {
    await logoutAction();
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="h-16 border-b border-[#E5EBE5] bg-white/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5 md:hidden">
          <div className="relative w-8 h-8 rounded-full overflow-hidden border border-emerald-700/20 shadow-xs">
            <Image src="/icon-192.png" alt="ACS Logo" fill className="object-cover" />
          </div>
          <div>
            <span className="font-extrabold text-base tracking-tight text-[#1B4332]">Alienista</span>
            <div className="text-[9px] text-[#2D6A4F] font-semibold tracking-wide">ACS · PSU</div>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-700 bg-[#EBF5EE] px-3.5 py-1.5 rounded-full border border-[#D1E7D7] font-medium">
          <span className="w-2 h-2 rounded-full bg-[#2D6A4F] animate-pulse"></span>
          <span>{academicYear} · {semester}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Connectivity Status Pill */}
        <div className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border font-medium ${
          isOnline
            ? 'bg-[#EBF5EE] text-[#1B4332] border-[#C2E0CC]'
            : 'bg-amber-50 text-amber-900 border-amber-200'
        }`}>
          {isOnline ? <Wifi className="w-3.5 h-3.5 text-[#2D6A4F]" /> : <WifiOff className="w-3.5 h-3.5 text-amber-700" />}
          <span className="hidden xs:inline">{isOnline ? 'Online' : 'Offline'}</span>
        </div>

        {/* User profile & Logout */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-bold text-slate-900">{user.name}</div>
            <div className="text-[10px] text-[#2D6A4F] uppercase tracking-wider font-semibold">{user.role}</div>
          </div>
          <button
            onClick={handleLogout}
            title="Log Out"
            className="p-2 rounded-xl hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
