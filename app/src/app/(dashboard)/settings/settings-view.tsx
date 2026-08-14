'use client';

import React, { useState, useTransition } from 'react';
import { Officer, OrganizationSettings } from '@/lib/types/models';
import {
  addOfficerAction,
  resetOfficerPinAction,
  deleteOfficerAction,
  advanceSemesterAction,
  updateAdminCredentialsAction,
} from '@/lib/actions/settings';
import { Settings, Shield, UserCheck, Plus, Trash2, KeyRound, ArrowRight, Lock, Save } from 'lucide-react';

export function SettingsView({
  initialSettings,
  initialOfficers,
}: {
  initialSettings: OrganizationSettings;
  initialOfficers: Officer[];
}) {
  const [settings, setSettings] = useState<OrganizationSettings>(initialSettings);
  const [officers, setOfficers] = useState<Officer[]>(initialOfficers);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  // New Officer Form
  const [officerName, setOfficerName] = useState('');
  const [officerPin, setOfficerPin] = useState('');

  // Reset PIN modal
  const [resetModalOfficer, setResetModalOfficer] = useState<Officer | null>(null);
  const [newPin, setNewPin] = useState('');

  // Admin Credentials Form
  const [currentAdminPassword, setCurrentAdminPassword] = useState('');
  const [newAdminUsername, setNewAdminUsername] = useState(settings.admin_username || 'admin');
  const [newAdminPassword, setNewAdminPassword] = useState('');

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleUpdateAdminCreds = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAdminPassword) {
      showToast('Please enter your current admin password to apply changes.', 'err');
      return;
    }

    startTransition(async () => {
      const res = await updateAdminCredentialsAction({
        currentPassword: currentAdminPassword,
        newUsername: newAdminUsername,
        newPassword: newAdminPassword || undefined,
      });

      if (!res.success) {
        showToast(res.error, 'err');
        return;
      }

      showToast('Admin credentials updated successfully!');
      setCurrentAdminPassword('');
      setNewAdminPassword('');
    });
  };

  const handleAddOfficer = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await addOfficerAction(officerName, officerPin);
      if (!res.success) {
        showToast(res.error, 'err');
        return;
      }
      setOfficers((prev) => [...prev, res.data]);
      showToast(`Officer ${officerName} added successfully!`);
      setOfficerName('');
      setOfficerPin('');
    });
  };

  const handleResetPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalOfficer) return;
    startTransition(async () => {
      const res = await resetOfficerPinAction(resetModalOfficer.id, newPin);
      if (!res.success) {
        showToast(res.error, 'err');
        return;
      }
      showToast(`PIN for ${resetModalOfficer.name} updated!`);
      setResetModalOfficer(null);
      setNewPin('');
    });
  };

  const handleDeleteOfficer = (o: Officer) => {
    if (!confirm(`Delete officer account "${o.name}"?`)) return;
    startTransition(async () => {
      const res = await deleteOfficerAction(o.id);
      if (!res.success) {
        showToast(res.error, 'err');
        return;
      }
      setOfficers((prev) => prev.filter((item) => item.id !== o.id));
      showToast(`Officer ${o.name} removed.`);
    });
  };

  const handleAdvanceSemester = () => {
    const isPromotion = settings.semester === 'Second Semester';
    const confirmMsg = isPromotion
      ? 'Start next Academic Year & Promote Students?\n\nAll active students will advance one year level (4th Year → Alumni). Attendance records will be preserved.'
      : 'Advance to Second Semester of current Academic Year?\n\nStudent year levels will remain unchanged.';

    if (!confirm(confirmMsg)) return;

    startTransition(async () => {
      const res = await advanceSemesterAction();
      if (!res.success) {
        showToast(res.error, 'err');
        return;
      }
      showToast(res.data.message);
      window.location.reload();
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {toast && (
        <div
          className={`p-3 rounded-xl text-xs font-medium border ${
            toast.type === 'ok'
              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
              : 'bg-red-950/60 border-red-800 text-red-300'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Admin Credentials & Master Login Card */}
      <div className="p-6 bg-[#151E33] border border-slate-800 rounded-2xl shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Shield className="w-4 h-4 text-amber-400" />
          <span>Admin Master Credentials</span>
        </h3>
        <p className="text-xs text-slate-400">
          Set the shared executive board login credentials (default: <b>admin</b> / <b>admin123</b>).
        </p>

        <form onSubmit={handleUpdateAdminCreds} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Admin Username</label>
              <input
                type="text"
                required
                value={newAdminUsername}
                onChange={(e) => setNewAdminUsername(e.target.value)}
                placeholder="admin"
                className="w-full bg-[#0B1120] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">New Password (leave blank to keep current)</label>
              <input
                type="password"
                value={newAdminPassword}
                onChange={(e) => setNewAdminPassword(e.target.value)}
                placeholder="New password (min 6 chars)"
                className="w-full bg-[#0B1120] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-amber-400 mb-1">Current Password (required to save changes)</label>
            <input
              type="password"
              required
              value={currentAdminPassword}
              onChange={(e) => setCurrentAdminPassword(e.target.value)}
              placeholder="Current admin password (default: admin123)"
              className="w-full bg-[#0B1120] border border-amber-500/40 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Update Credentials</span>
            </button>
          </div>
        </form>
      </div>

      {/* Current Term Card */}
      <div className="p-6 bg-[#151E33] border border-slate-800 rounded-2xl shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Settings className="w-4 h-4 text-amber-400" />
          <span>Academic Term Management</span>
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-[#0B1120] border border-slate-800 rounded-xl">
            <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider block mb-1">
              Current Semester
            </span>
            <span className="text-lg font-bold text-white">{settings.semester}</span>
          </div>
          <div className="p-4 bg-[#0B1120] border border-slate-800 rounded-xl">
            <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider block mb-1">
              Academic Year
            </span>
            <span className="text-lg font-bold text-white">{settings.academic_year}</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-300 leading-relaxed">
            {settings.semester === 'First Semester' ? (
              <span>Move term forward to <b>Second Semester</b> (maintains student year levels).</span>
            ) : (
              <span>Start <b>First Semester</b> of next academic year and <b>promote all active students one year level</b>.</span>
            )}
          </div>
          <button
            onClick={handleAdvanceSemester}
            disabled={isPending}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 shrink-0 transition-colors shadow-sm"
          >
            <span>Advance Term</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Officer Roster & Access Control */}
      <div className="p-6 bg-[#151E33] border border-slate-800 rounded-2xl shadow-xl space-y-5">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-amber-400" />
          <span>Officer Roster & Access Control</span>
        </h3>

        {/* Add Officer Inline Form */}
        <form onSubmit={handleAddOfficer} className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            required
            placeholder="Officer Full Name"
            value={officerName}
            onChange={(e) => setOfficerName(e.target.value)}
            className="flex-1 bg-[#0B1120] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
          />
          <input
            type="password"
            required
            placeholder="PIN (min 4 digits)"
            value={officerPin}
            onChange={(e) => setOfficerPin(e.target.value)}
            className="w-full sm:w-40 bg-[#0B1120] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
          />
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-sm shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Officer</span>
          </button>
        </form>

        {/* Officers Table */}
        <div className="border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B1120] text-slate-400">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Officer Name</th>
                <th className="py-2.5 px-4 font-semibold">Status</th>
                <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {officers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-slate-500">
                    No officer accounts created yet.
                  </td>
                </tr>
              ) : (
                officers.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-900/40">
                    <td className="py-3 px-4 font-semibold text-white">{o.name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                        {o.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setResetModalOfficer(o);
                            setNewPin('');
                          }}
                          className="text-[11px] text-amber-400 hover:underline flex items-center gap-1"
                        >
                          <KeyRound className="w-3 h-3" /> Reset PIN
                        </button>
                        <button
                          onClick={() => handleDeleteOfficer(o)}
                          className="text-[11px] text-red-400 hover:underline flex items-center gap-1 ml-2"
                        >
                          <Trash2 className="w-3 h-3" /> Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reset PIN Modal */}
      {resetModalOfficer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#151E33] border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-white">Reset Officer PIN: {resetModalOfficer.name}</h3>
            <form onSubmit={handleResetPinSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">New PIN (min 4 digits)</label>
                <input
                  type="password"
                  required
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  className="w-full bg-[#0B1120] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetModalOfficer(null)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs"
                >
                  Save New PIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
