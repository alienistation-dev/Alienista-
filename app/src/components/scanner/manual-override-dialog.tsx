'use client';

import React, { useState, useTransition } from 'react';
import { Student, Event } from '@/lib/types/models';
import { manualAttendanceOverrideAction } from '@/lib/actions/attendance';
import { UserCheck, Search } from 'lucide-react';

interface ManualOverrideProps {
  students: Student[];
  events: Event[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ManualOverrideDialog({ students, events, isOpen, onClose, onSuccess }: ManualOverrideProps) {
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id || '');
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const currentEvent = events.find((e) => e.id === selectedEventId);

  const filteredStudents = students.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.full_name.toLowerCase().includes(q) ||
      s.uid.toLowerCase().includes(q) ||
      s.student_number.toLowerCase().includes(q)
    );
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId || !selectedEventId) {
      setError('Please select a student and an event.');
      return;
    }
    setError('');

    startTransition(async () => {
      const res = await manualAttendanceOverrideAction({
        student_id: selectedStudentId,
        event_id: selectedEventId,
        slot_id: selectedSlotId || null,
      });

      if (!res.success) {
        setError(res.error);
        return;
      }

      onSuccess();
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#151E33] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-base">
          <UserCheck className="w-5 h-5" />
          <span>Manual Attendance Entry</span>
        </div>
        <p className="text-xs text-slate-400">
          Admin override: record verified present attendance for a student who was not scanned.
        </p>

        {error && (
          <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-800 text-red-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Event Picker */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Target Event</label>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full bg-[#0B1120] border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} ({ev.status})
                </option>
              ))}
            </select>
          </div>

          {/* Slot Picker if Event has slots */}
          {currentEvent?.slots && currentEvent.slots.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Attendance Window Slot</label>
              <select
                value={selectedSlotId}
                onChange={(e) => setSelectedSlotId(e.target.value)}
                className="w-full bg-[#0B1120] border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
              >
                <option value="">Default / General</option>
                {currentEvent.slots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} ({s.slot_type})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Student Picker with Search */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Select Student</label>
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search student..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#0B1120] border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-100"
              />
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1 pr-1 border border-slate-800 rounded-xl p-1 bg-[#0B1120]/60">
              {filteredStudents.slice(0, 20).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setSelectedStudentId(st.id)}
                  className={`w-full text-left p-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                    selectedStudentId === st.id
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span className="font-medium">{st.full_name}</span>
                  <span className="font-mono text-[10px] text-slate-400">{st.uid}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !selectedStudentId}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors disabled:opacity-50"
            >
              {isPending ? 'Recording...' : 'Record Attendance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
