'use client';

import React from 'react';
import { NavigationLink } from './navigation-link';
import { usePathname } from 'next/navigation';
import { SessionUser } from '@/lib/types/actions';
import Image from 'next/image';
import {
  LayoutDashboard,
  Users,
  Calendar,
  QrCode,
  BadgePercent,
  BarChart3,
  Smartphone,
  Settings,
  ClipboardCheck,
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
    { label: 'Assessments', href: '/assessments', icon: ClipboardCheck, roles: ['admin'] },
    { label: 'Device Audit Log', href: '/device-log', icon: Smartphone, roles: ['admin', 'officer'] },
    { label: 'Settings', href: '/settings', icon: Settings, roles: ['admin'] },
  ];

  const filteredNav = navItems.filter((item) => item.roles.includes(user.role));

  return (
    <aside className="hidden md:flex flex-col w-64 border-r border-[#E5EBE5] bg-white shrink-0 h-screen sticky top-0 shadow-xs">
      {/* Brand Header */}
      <div className="h-16 px-6 flex items-center gap-3 border-b border-[#E5EBE5]">
        <div className="relative w-9 h-9 rounded-full overflow-hidden border border-emerald-800/20 shadow-xs shrink-0">
          <Image src="/icon-192.png" alt="ACS Logo" fill sizes="36px" className="object-cover" />
        </div>
        <div>
          <div className="font-extrabold text-base text-[#1B4332] tracking-tight leading-tight">Alienista</div>
          <div className="text-[10px] text-[#2D6A4F] font-semibold tracking-wide uppercase">ACS · Palawan State U</div>
        </div>
      </div>

      <nav className="p-3.5 space-y-1.5 flex-1 overflow-y-auto">
        {filteredNav.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <NavigationLink
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-[#EBF5EE] text-[#1B4332] border border-[#C2E0CC] shadow-xs'
                  : 'text-slate-600 hover:text-[#1B4332] hover:bg-[#F4F7F4]'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-[#2D6A4F]' : 'text-slate-500'}`} />
              {item.label}
            </NavigationLink>
          );
        })}
      </nav>
    </aside>
  );
}
