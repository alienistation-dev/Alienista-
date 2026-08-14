'use client';

import React from 'react';
import Link from 'next/link';
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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#0B1120]/95 backdrop-blur-xl border-t border-slate-800/80 px-2 flex items-center justify-around z-40">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = pathname === tab.href;

        if (tab.isPrimary) {
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center justify-center -mt-5"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-amber-500 to-amber-400 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/30 border-2 border-[#0B1120]">
                <Icon className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-semibold text-amber-400 mt-1">{tab.label}</span>
            </Link>
          );
        }

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-lg transition-colors ${
              isActive ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium mt-1">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
