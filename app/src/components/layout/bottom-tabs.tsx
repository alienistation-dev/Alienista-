'use client';

import React from 'react';
import { NavigationLink } from './navigation-link';
import { usePathname } from 'next/navigation';
import { SessionUser } from '@/lib/types/actions';
import {
  LayoutDashboard,
  Users,
  QrCode,
  Calendar,
  BarChart3,
} from 'lucide-react';

export function BottomTabs({ user }: { user: SessionUser }) {
  const pathname = usePathname();

  const tabs = [
    { label: 'Home', href: '/', icon: LayoutDashboard, isPrimary: false },
    { label: 'Students', href: '/students', icon: Users, isPrimary: false },
    { label: 'Scan', href: '/scanner', icon: QrCode, isPrimary: true },
    { label: 'Events', href: '/events', icon: Calendar, isPrimary: false },
    { label: 'Stats', href: '/statistics', icon: BarChart3, isPrimary: false },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-xl border-t border-[#E5EBE5] px-2 flex items-center justify-around z-40 shadow-lg">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = pathname === tab.href;

        if (tab.isPrimary) {
          return (
            <NavigationLink
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center justify-center -mt-5"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#2D6A4F] to-[#40916C] text-white flex items-center justify-center shadow-lg shadow-emerald-900/20 border-2 border-white">
                <Icon className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-bold text-[#1B4332] mt-1">{tab.label}</span>
            </NavigationLink>
          );
        }

        return (
          <NavigationLink
            key={tab.href}
            href={tab.href}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-lg transition-colors ${
              isActive ? 'text-[#2D6A4F] font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium mt-0.5">{tab.label}</span>
          </NavigationLink>
        );
      })}
    </nav>
  );
}
