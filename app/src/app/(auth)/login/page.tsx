'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { loginAction, changeStudentPasswordAction } from '@/lib/actions/auth';
import { UserRole } from '@/lib/types/models';
import { QrCode, Shield, UserCheck, GraduationCap, KeyRound, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [role, setRole] = useState<UserRole>('officer');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  // First-login password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [firstLoginStudentUid, setFirstLoginStudentUid] = useState('');
  const [currentPassInput, setCurrentPassInput] = useState('');
  const [newPassInput, setNewPassInput] = useState('');
  const [confirmPassInput, setConfirmPassInput] = useState('');

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
    <div className="bg-[#151E33] border border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
      {/* Brand Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-3">
          <QrCode className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">AttendQR</h1>
        <p className="text-xs text-amber-400/90 font-medium uppercase tracking-wider mt-1">
          Association of Computer Scientists
        </p>
      </div>

      {error && (
        <div className="mb-5 p-3 rounded-lg bg-red-950/50 border border-red-800/60 text-red-300 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Role Selection Tabs */}
      <div className="grid grid-cols-3 gap-1 bg-[#0B1120] p-1 rounded-xl mb-6 border border-slate-800">
        <button
          type="button"
          onClick={() => { setRole('officer'); setError(''); }}
          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
            role === 'officer'
              ? 'bg-[#151E33] text-amber-400 shadow-sm border border-slate-700/50'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" />
          Officer
        </button>
        <button
          type="button"
          onClick={() => { setRole('student'); setError(''); }}
          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
            role === 'student'
              ? 'bg-[#151E33] text-amber-400 shadow-sm border border-slate-700/50'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <GraduationCap className="w-3.5 h-3.5" />
          Student
        </button>
        <button
          type="button"
          onClick={() => { setRole('admin'); setError(''); }}
          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
            role === 'admin'
              ? 'bg-[#151E33] text-amber-400 shadow-sm border border-slate-700/50'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          Admin
        </button>
      </div>

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            {role === 'admin' ? 'Admin Email / Username' : role === 'officer' ? 'Officer Full Name' : 'Student UID / Student No.'}
          </label>
          <div className="relative">
            <input
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={role === 'admin' ? 'admin@psu.edu.ph' : role === 'officer' ? 'e.g. Juan Dela Cruz' : 'e.g. ST-2026-0001'}
              className="w-full bg-[#0B1120] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/80 transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            {role === 'officer' ? 'Officer PIN' : 'Password'}
          </label>
          <div className="relative">
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={role === 'officer' ? '••••' : '••••••••'}
              className="w-full bg-[#0B1120] border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/80 transition-colors"
            />
          </div>
          {role === 'student' && (
            <p className="text-[11px] text-slate-400 mt-1.5">
              Default password is your <b className="text-slate-300 font-semibold">LAST NAME</b> in capital letters.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full mt-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-semibold py-2.5 px-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 disabled:opacity-50"
        >
          {isPending ? 'Authenticating...' : 'Sign In'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      {/* First-Login Password Change Modal */}
      {showPasswordChange && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#151E33] border border-amber-500/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400 mb-4">
              <KeyRound className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">First-Time Login</h3>
            </div>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Please set a secure permanent password for your student account before continuing.
            </p>
            <form onSubmit={handlePasswordChangeSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">New Password (min 6 chars)</label>
                <input
                  type="password"
                  required
                  value={newPassInput}
                  onChange={(e) => setNewPassInput(e.target.value)}
                  className="w-full bg-[#0B1120] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassInput}
                  onChange={(e) => setConfirmPassInput(e.target.value)}
                  className="w-full bg-[#0B1120] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <button
                type="submit"
                disabled={isPending}
                className="w-full bg-amber-500 text-slate-950 font-semibold py-2 rounded-lg text-sm mt-3"
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
