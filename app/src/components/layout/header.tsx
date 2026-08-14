'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { logoutAction } from '@/lib/actions/auth';
import { SessionUser } from '@/lib/types/actions';
import { LogOut, QrCode, Wifi, WifiOff } from 'lucide-react';

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
    <header className="h-16 border-b border-slate-800/80 bg-[#0B1120]/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 md:hidden">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <QrCode className="w-4 h-4" />
          </div>
          <span className="font-bold text-sm tracking-tight text-white">AttendQR</span>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 bg-slate-900/60 px-3 py-1.5 rounded-full border border-slate-800">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>{academicYear} · {semester}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Connectivity status pill */}
        <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
          isOnline
            ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50'
            : 'bg-amber-950/40 text-amber-400 border-amber-800/50'
        }`}>
          {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          <span className="hidden xs:inline">{isOnline ? 'Online' : 'Offline'}</span>
        </div>

        {/* User profile & Logout */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-slate-200">{user.name}</div>
            <div className="text-[10px] text-amber-400 uppercase tracking-wider font-medium">{user.role}</div>
          </div>
          <button
            onClick={handleLogout}
            title="Log Out"
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
