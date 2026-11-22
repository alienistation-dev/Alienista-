'use client';

import React from 'react';
import { NavigationLink } from './navigation-link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  QrCode,
  Calendar,
  BarChart3,
} from 'lucide-react';

export function BottomTabs() {
  const pathname = usePathname();

  const tabs = [
    { label: 'Home', href: '/', icon: LayoutDashboard, isPrimary: false },
    { label: 'Students', href: '/students', icon: Users, isPrimary: false },
    { label: 'Scan', href: '/scanner', icon: QrCode, isPrimary: true },
    { label: 'Events', href: '/events', icon: Calendar, isPrimary: false },
    { label: 'Stats', href: '/statistics', icon: BarChart3, isPrimary: false },
  ];

  return (
    <nav data-bottom-tabs className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-xl border-t border-border px-2 flex items-center justify-around z-40 shadow-lg">
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
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-primary/80 text-white flex items-center justify-center shadow-lg shadow-emerald-900/20 border-2 border-white">
                <Icon className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold text-primary mt-1">{tab.label}</span>
            </NavigationLink>
          );
        }

        return (
          <NavigationLink
            key={tab.href}
            href={tab.href}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg transition-colors ${
              isActive ? 'text-primary font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-xs font-medium mt-0.5">{tab.label}</span>
          </NavigationLink>
        );
      })}
    </nav>
  );
}
