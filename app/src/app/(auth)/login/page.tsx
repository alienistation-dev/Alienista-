'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { loginAction, changeStudentPasswordAction } from '@/lib/actions/auth';
import { UserRole } from '@/lib/types/models';
import { QrCode, Shield, UserCheck, GraduationCap, KeyRound, ArrowRight, Lock, User } from 'lucide-react';

interface RoleConfig {
  label: string;
  badge: string;
  icon: typeof UserCheck;
  identifierLabel: string;
  identifierPlaceholder: string;
  secretLabel: string;
  secretPlaceholder: string;
  helperText?: string;
  buttonLabel: string;
}

const ROLE_CONFIGS: Record<UserRole, RoleConfig> = {
  officer: {
    label: 'Officer',
    badge: 'Scanning Duty',
    icon: UserCheck,
    identifierLabel: 'Officer Full Name',
    identifierPlaceholder: 'e.g. Juan Dela Cruz',
    secretLabel: '4-Digit PIN',
    secretPlaceholder: '••••',
    helperText: 'Enter your authorized executive officer PIN.',
    buttonLabel: 'Sign In as Officer',
  },
  student: {
    label: 'Student',
    badge: 'Student Portal',
    icon: GraduationCap,
    identifierLabel: 'Student UID or Student Number',
    identifierPlaceholder: 'e.g. ST-2026-0001 or 2023-8-0044',
    secretLabel: 'Student Password',
    secretPlaceholder: '••••••••',
    helperText: 'Default password is your LAST NAME in CAPITAL letters.',
    buttonLabel: 'Sign In as Student',
  },
  admin: {
    label: 'Admin',
    badge: 'Master Control',
    icon: Shield,
    identifierLabel: 'Admin Username',
    identifierPlaceholder: 'admin',
    secretLabel: 'Admin Password',
    secretPlaceholder: '••••••••',
    helperText: 'Default credentials: admin / admin123',
    buttonLabel: 'Sign In as Admin',
  },
};

export default function LoginPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [role, setRole] = useState<UserRole>('officer');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // First-login password change state for students
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [firstLoginStudentUid, setFirstLoginStudentUid] = useState('');
  const [currentPassInput, setCurrentPassInput] = useState('');
  const [newPassInput, setNewPassInput] = useState('');
  const [confirmPassInput, setConfirmPassInput] = useState('');

  const currentConfig = ROLE_CONFIGS[role];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    startTransition(async () => {
      const res = await loginAction({ role, identifier, password });
      if (!res.success) {
        setError(res.error);
        return;
      }

      if (res.data.role === 'student' && res.data.must_change_password) {
        setFirstLoginStudentUid(identifier);
        setCurrentPassInput(password);
        setShowPasswordChange(true);
        return;
      }

      if (res.data.role === 'student') {
        router.push('/my-qr');
      } else {
        router.push('/');
      }
      router.refresh();
    });
  };

  const handlePasswordChangeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassInput !== confirmPassInput) {
      setError('New passwords do not match.');
      return;
    }
    if (newPassInput.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    startTransition(async () => {
      const res = await changeStudentPasswordAction({
        identifier: firstLoginStudentUid,
        currentPassword: currentPassInput,
        newPassword: newPassInput,
      });

      if (!res.success) {
        setError(res.error);
        return;
      }

      setShowPasswordChange(false);
      router.push('/my-qr');
      router.refresh();
    });
  };

  return (
    <div className="bg-[#151E33] border border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
      {/* Brand Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-3 shadow-inner">
          <QrCode className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">AttendQR</h1>
        <p className="text-xs text-amber-400 font-semibold uppercase tracking-wider mt-1">
          Association of Computer Scientists
        </p>
      </div>

      {error && (
        <div className="mb-5 p-3.5 rounded-xl bg-red-950/60 border border-red-800/80 text-red-300 text-xs font-medium leading-relaxed">
          {error}
        </div>
      )}

      {/* Role Selection: 3 Dynamic Choices */}
      <div className="space-y-1.5 mb-5">
        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
          Select Your Access Role:
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(['officer', 'student', 'admin'] as UserRole[]).map((r) => {
            const cfg = ROLE_CONFIGS[r];
            const Icon = cfg.icon;
            const isSelected = role === r;

            return (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRole(r);
                  setError('');
                  setIdentifier('');
                  setPassword('');
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all text-center ${
                  isSelected
                    ? 'bg-[#0B1120] border-amber-500/80 text-amber-400 shadow-md shadow-amber-500/10'
                    : 'bg-[#0B1120]/50 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <Icon className={`w-5 h-5 mb-1.5 ${isSelected ? 'text-amber-400' : 'text-slate-500'}`} />
                <span className="text-xs font-bold leading-tight">{cfg.label}</span>
                <span className="text-[9px] text-slate-500 font-medium mt-0.5">{cfg.badge}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Unified Dynamic Form */}
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
            <span>{currentConfig.identifierLabel}</span>
            <span className="text-[10px] text-amber-400 font-mono font-normal uppercase">{role}</span>
          </label>
          <div className="relative">
            <User className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
            <input
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={currentConfig.identifierPlaceholder}
              className="w-full bg-[#0B1120] border border-slate-700/80 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/80 transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            {currentConfig.secretLabel}
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={currentConfig.secretPlaceholder}
              className="w-full bg-[#0B1120] border border-slate-700/80 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/80 transition-colors"
            />
          </div>
          {currentConfig.helperText && (
            <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
              {currentConfig.helperText}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full mt-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 disabled:opacity-50"
        >
          {isPending ? 'Verifying...' : currentConfig.buttonLabel}
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      {/* First-Login Password Change Modal for Students */}
      {showPasswordChange && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#151E33] border border-amber-500/40 rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <KeyRound className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">Change Temporary Password</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Please set a permanent password for your student account before continuing.
            </p>
            <form onSubmit={handlePasswordChangeSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">New Password (min 6 chars)</label>
                <input
                  type="password"
                  required
                  value={newPassInput}
                  onChange={(e) => setNewPassInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#0B1120] border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassInput}
                  onChange={(e) => setConfirmPassInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#0B1120] border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <button
                type="submit"
                disabled={isPending}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs mt-2 transition-colors"
              >
                {isPending ? 'Updating...' : 'Set Password & Enter Portal'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
