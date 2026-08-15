'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { loginAction, changeStudentPasswordAction } from '@/lib/actions/auth';
import { UserRole } from '@/lib/types/models';
import Image from 'next/image';
import { Shield, UserCheck, GraduationCap, KeyRound, ArrowRight, Lock, User } from 'lucide-react';

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
    identifierLabel: 'Student Number',
    identifierPlaceholder: 'e.g. 2026-8-0123',
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
      try {
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
          window.location.href = '/my-qr';
        } else {
          window.location.href = '/';
        }
      } catch (err: any) {
        setError(err?.message || 'Login request failed. Please try again.');
      }
    });
  };

  const [modalError, setModalError] = useState('');

  const handlePasswordChangeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    if (newPassInput !== confirmPassInput) {
      setModalError('New passwords do not match.');
      return;
    }
    if (newPassInput.length < 6) {
      setModalError('Password must be at least 6 characters.');
      return;
    }

    startTransition(async () => {
      try {
        const res = await changeStudentPasswordAction({
          identifier: firstLoginStudentUid,
          currentPassword: currentPassInput,
          newPassword: newPassInput,
        });

        if (!res.success) {
          setModalError(res.error);
          return;
        }

        setShowPasswordChange(false);
        window.location.href = '/my-qr';
      } catch (err: any) {
        setModalError(err?.message || 'Failed to update password.');
      }
    });
  };

  return (
    <div className="bg-white border border-[#E5EBE5] rounded-3xl p-6 sm:p-8 shadow-xl">
      {/* Brand Header with Official Logo */}
      <div className="text-center mb-6">
        <div className="relative inline-block w-16 h-16 rounded-full overflow-hidden border-2 border-[#2D6A4F]/30 shadow-sm mb-3">
          <Image src="/icon-192.png" alt="ACS Logo" fill sizes="64px" className="object-cover" priority />
        </div>
        <h1 className="text-2xl font-extrabold text-[#1B4332] tracking-tight">Alienista</h1>
        <p className="text-xs text-[#2D6A4F] font-semibold uppercase tracking-wider mt-1">
          Association of Computer Scientists · PSU
        </p>
      </div>

      {error && (
        <div className="mb-5 p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold leading-relaxed">
          {error}
        </div>
      )}

      {/* Role Selection: 3 Dynamic Choices */}
      <div className="space-y-2 mb-5">
        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
          Select Access Role:
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
                    ? 'bg-[#EBF5EE] border-[#2D6A4F] text-[#1B4332] font-bold shadow-xs'
                    : 'bg-[#F8FAF9] border-[#E5EBE5] text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                <Icon className={`w-5 h-5 mb-1.5 ${isSelected ? 'text-[#2D6A4F]' : 'text-slate-400'}`} />
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
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
            <span>{currentConfig.identifierLabel}</span>
            <span className="text-[10px] text-[#2D6A4F] font-semibold uppercase">{role}</span>
          </label>
          <div className="relative">
            <User className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={currentConfig.identifierPlaceholder}
              className="w-full bg-[#F8FAF9] border border-[#E5EBE5] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2D6A4F] focus:bg-white transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            {currentConfig.secretLabel}
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={currentConfig.secretPlaceholder}
              className="w-full bg-[#F8FAF9] border border-[#E5EBE5] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#2D6A4F] focus:bg-white transition-colors"
            />
          </div>
          {currentConfig.helperText && (
            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
              {currentConfig.helperText}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full mt-3 bg-[#2D6A4F] hover:bg-[#1B4332] text-white font-bold py-3 px-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-emerald-900/10 disabled:opacity-50"
        >
          {isPending ? 'Verifying...' : currentConfig.buttonLabel}
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      {/* First-Login Password Change Modal */}
      {showPasswordChange && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5EBE5] rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-[#2D6A4F]">
              <KeyRound className="w-6 h-6" />
              <h3 className="text-lg font-bold text-slate-900">Set Permanent Password</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Welcome to Alienista! Please set a secure permanent password for your student account before entering.
            </p>
            {modalError && (
              <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                {modalError}
              </div>
            )}
            <form onSubmit={handlePasswordChangeSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">New Password (min 6 chars)</label>
                <input
                  type="password"
                  required
                  value={newPassInput}
                  onChange={(e) => setNewPassInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#F8FAF9] border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassInput}
                  onChange={(e) => setConfirmPassInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#F8FAF9] border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900"
                />
              </div>
              <button
                type="submit"
                disabled={isPending}
                className="w-full bg-[#2D6A4F] hover:bg-[#1B4332] text-white font-bold py-2.5 rounded-xl text-xs mt-2 transition-colors"
              >
                {isPending ? 'Updating...' : 'Set Password & Continue'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
