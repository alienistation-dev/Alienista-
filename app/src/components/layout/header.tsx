'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { logoutAction } from '@/lib/actions/auth';
import { SessionUser } from '@/lib/types/actions';
import { LogOut, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import Image from 'next/image';

interface HeaderProps {
  user: SessionUser;
  academicYear?: string;
  semester?: string;
}

export function Header({ user, academicYear = '2026-2027', semester = 'First Semester' }: HeaderProps) {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(true);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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

  const handleConfirmLogout = async () => {
    setIsLoggingOut(true);
    await logoutAction();
    router.push('/login');
    router.refresh();
  };

  return (
    <>
      <header className="h-16 border-b border-[#E5EBE5] bg-white/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 md:hidden">
            <div className="relative w-8 h-8 rounded-full overflow-hidden border border-emerald-700/20 shadow-xs">
              <Image src="/icon-192.png" alt="ACS Logo" fill sizes="32px" className="object-cover" />
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
              onClick={() => setShowLogoutModal(true)}
              title="Log Out"
              className="p-2 rounded-xl hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5EBE5] rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-slate-900 font-bold text-base">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <span>Log Out of Alienista?</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to end your session as <b>{user.name}</b> ({user.role})?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                className="px-4 py-2 rounded-xl text-xs text-slate-500 hover:text-slate-800 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isLoggingOut}
                onClick={handleConfirmLogout}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-colors shadow-xs"
              >
                {isLoggingOut ? 'Logging Out...' : 'Log Out'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
