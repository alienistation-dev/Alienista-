'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SessionUser } from '@/lib/types/actions';
import {
  LayoutDashboard,
  Users,
  Calendar,
  QrCode,
  BadgePercent,
  BarChart3,
  Smartphone,
  Settings,
} from 'lucide-react';

export function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();

  const navItems = [
    { label: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['admin', 'officer'] },
    { label: 'Students', href: '/students', icon: Users, roles: ['admin', 'officer'] },
    { label: 'Events', href: '/events', icon: Calendar, roles: ['admin', 'officer'] },
    { label: 'QR Scanner', href: '/scanner', icon: QrCode, roles: ['admin', 'officer'] },
    { label: 'QR Generator', href: '/qr-generator', icon: BadgePercent, roles: ['admin', 'officer'] },
    { label: 'Statistics', href: '/statistics', icon: BarChart3, roles: ['admin', 'officer'] },
    { label: 'Device Audit Log', href: '/device-log', icon: Smartphone, roles: ['admin', 'officer'] },
    { label: 'Settings', href: '/settings', icon: Settings, roles: ['admin'] },
  ];

  const filteredNav = navItems.filter((item) => item.roles.includes(user.role));

  return (
    <aside className="hidden md:flex flex-col w-64 border-r border-slate-800/80 bg-[#0B1120] shrink-0 h-screen sticky top-0">
      <div className="h-16 px-6 flex items-center gap-3 border-b border-slate-800/80">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
          <QrCode className="w-5 h-5" />
        </div>
        <div>
          <div className="font-bold text-sm text-white tracking-tight">AttendQR</div>
          <div className="text-[10px] text-amber-400 font-medium tracking-wide uppercase">ACS PSU Palawan</div>
        </div>
      </div>

      <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
        {filteredNav.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
