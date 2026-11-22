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
    <aside className="hidden md:flex flex-col w-64 border-r border-border bg-white shrink-0 h-screen sticky top-0 shadow-xs">
      {/* Brand Header */}
      <div className="h-16 px-6 flex items-center gap-3 border-b border-border">
        <div className="relative w-9 h-9 rounded-full overflow-hidden border border-emerald-800/20 shadow-xs shrink-0">
          <Image src="/icon-192.png" alt="ACS Logo" fill sizes="36px" className="object-cover" />
        </div>
        <div>
          <div className="font-extrabold text-base text-primary tracking-tight leading-tight">Alienista</div>
          <div className="text-xs text-primary font-semibold tracking-wide uppercase">ACS · Palawan State U</div>
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
                  ? 'bg-secondary text-secondary-foreground border border-primary/25 shadow-xs'
                  : 'text-slate-600 hover:text-primary hover:bg-muted'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-slate-500'}`} />
              {item.label}
            </NavigationLink>
          );
        })}
      </nav>
    </aside>
  );
}
