'use client';

import React, { useState, useTransition } from 'react';
import { Event, EventStatus, SlotType } from '@/lib/types/models';
import {
  createEventWithSlotsAction,
  toggleEventStatusAction,
  deleteEventAction,
} from '@/lib/actions/events';
import { Calendar, Plus, MapPin, Clock, Trash2, Power, Layers } from 'lucide-react';

interface EventsViewProps {
  initialEvents: Event[];
  userRole: string;
}

export function EventsView({ initialEvents, userRole }: EventsViewProps) {
  const [events, setEvents] = useState<Event[]>(initialEvents);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  // Modal Form State
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [venue, setVenue] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<EventStatus>('Open');
  const [slots, setSlots] = useState<
    Array<{ label: string; slot_type: SlotType; opens_at: string; closes_at: string }>
  >([]);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleAddSlot = () => {
    setSlots((prev) => [
      ...prev,
      {
        label: `Window #${prev.length + 1}`,
        slot_type: 'am_in',
        opens_at: startsAt || new Date().toISOString().slice(0, 16),
        closes_at: startsAt || new Date().toISOString().slice(0, 16),
      },
    ]);
  };

  const handleRemoveSlot = (index: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSlotChange = (index: number, field: string, value: string) => {
    setSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await createEventWithSlotsAction({
        name,
        starts_at: new Date(startsAt).toISOString(),
        venue,
        description,
        status,
        slots: slots.map((s) => ({
          ...s,
          opens_at: new Date(s.opens_at).toISOString(),
          closes_at: new Date(s.closes_at).toISOString(),
        })),
      });

      if (!res.success) {
        showToast(res.error, 'err');
        return;
      }

      setEvents((prev) => [res.data, ...prev]);
      showToast('Event created with attendance slots!');
      setIsModalOpen(false);
      setName('');
      setVenue('');
      setDescription('');
      setSlots([]);
    });
  };

  const handleToggleStatus = (ev: Event) => {
    const nextStatus: EventStatus = ev.status === 'Open' ? 'Closed' : 'Open';
    startTransition(async () => {
      const res = await toggleEventStatusAction(ev.id, nextStatus);
      if (!res.success) {
        showToast(res.error, 'err');
        return;
      }
      setEvents((prev) =>
        prev.map((e) => (e.id === ev.id ? { ...e, status: nextStatus } : e))
      );
      showToast(`Event marked as ${nextStatus}.`);
    });
  };

  const handleDeleteEvent = (ev: Event) => {
    if (!confirm(`Delete "${ev.name}" and all associated attendance records? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await deleteEventAction(ev.id);
      if (!res.success) {
        showToast(res.error, 'err');
        return;
      }
      setEvents((prev) => prev.filter((e) => e.id !== ev.id));
      showToast('Event deleted.');
    });
  };

  return (
    <div className="space-y-4">
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

      {/* Header Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          Showing {events.length} event{events.length === 1 ? '' : 's'}
        </p>
        {userRole === 'admin' && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Event</span>
          </button>
        )}
      </div>

      {/* Events List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {events.length === 0 ? (
          <div className="col-span-2 p-12 text-center text-xs text-slate-500 bg-[#151E33] border border-slate-800 rounded-2xl">
            No events created yet.
          </div>
        ) : (
          events.map((ev) => {
            const dt = new Date(ev.starts_at);
            const mon = dt.toLocaleDateString('en-US', { month: 'short' });
            const day = dt.getDate();
            const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return (
              <div
                key={ev.id}
                className="p-5 bg-[#151E33] border border-slate-800 rounded-2xl flex flex-col justify-between space-y-4 hover:border-slate-700 transition-colors shadow-lg"
              >
                <div className="flex items-start gap-4">
                  {/* Date Block */}
                  <div className="shrink-0 w-12 h-14 rounded-xl bg-[#0B1120] border border-slate-800 flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] uppercase font-bold text-amber-400">{mon}</span>
                    <span className="text-lg font-bold text-white leading-none mt-0.5">{day}</span>
                  </div>

                  {/* Main Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-white truncate">{ev.name}</h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                          ev.status === 'Open'
                            ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {ev.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" /> {timeStr}
                      </span>
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 text-slate-500" /> {ev.venue}
                      </span>
                    </div>

                    {ev.description && (
                      <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                        {ev.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Slots Breakdown */}
                {ev.slots && ev.slots.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-[#0B1120]/70 border border-slate-800/80 space-y-1.5 text-[11px]">
                    <div className="font-semibold text-slate-300 flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-400">
                      <Layers className="w-3 h-3" /> Time Windows
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {ev.slots.map((slot) => (
                        <div key={slot.id} className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300">
                          <b className="text-white">{slot.label}</b>
                          <div className="text-[10px] text-slate-500">
                            {new Date(slot.opens_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                            {new Date(slot.closes_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Card Actions (Admin only) */}
                {userRole === 'admin' && (
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/60">
                    <button
                      onClick={() => handleToggleStatus(ev)}
                      disabled={isPending}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#0B1120] border border-slate-800 text-slate-300 hover:text-white flex items-center gap-1 transition-colors"
                    >
                      <Power className="w-3 h-3" />
                      {ev.status === 'Open' ? 'Close' : 'Reopen'}
                    </button>
                    <button
                      onClick={() => handleDeleteEvent(ev)}
                      disabled={isPending}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-red-950/40 border border-red-900/60 text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Create Event Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#151E33] border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white">Create New Event</h3>
            <form onSubmit={handleCreateEvent} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Event Title</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. ACS General Assembly 2026"
                  className="w-full bg-[#0B1120] border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Event Date & Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="w-full bg-[#0B1120] border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Venue</label>
                  <input
                    type="text"
                    required
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    placeholder="e.g. PSU Gymnasium"
                    className="w-full bg-[#0B1120] border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief agenda or instructions..."
                  className="w-full bg-[#0B1120] border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
                />
              </div>

              {/* Attendance Slots Configuration */}
              <div className="pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="text-xs font-bold text-white block">Attendance Time Slots</label>
                    <span className="text-[11px] text-slate-400">Add mandatory scan windows (e.g. Morning Time-In).</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddSlot}
                    className="px-2.5 py-1 bg-[#0B1120] border border-slate-700 rounded-lg text-xs text-amber-400 font-semibold hover:border-amber-500"
                  >
                    + Add Slot
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {slots.map((slot, index) => (
                    <div key={index} className="p-3 bg-[#0B1120] border border-slate-700/80 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <input
                          type="text"
                          value={slot.label}
                          onChange={(e) => handleSlotChange(index, 'label', e.target.value)}
                          placeholder="e.g. Morning Time-In"
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white flex-1 mr-2"
                        />
                        <select
                          value={slot.slot_type}
                          onChange={(e) => handleSlotChange(index, 'slot_type', e.target.value)}
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 mr-2"
                        >
                          <option value="am_in">AM In</option>
                          <option value="am_out">AM Out</option>
                          <option value="pm_in">PM In</option>
                          <option value="pm_out">PM Out</option>
                          <option value="other">Other</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleRemoveSlot(index)}
                          className="text-red-400 hover:text-red-300 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-slate-400 block mb-0.5">Opens At</span>
                          <input
                            type="datetime-local"
                            value={slot.opens_at}
                            onChange={(e) => handleSlotChange(index, 'opens_at', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-xs"
                          />
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-0.5">Closes At</span>
                          <input
                            type="datetime-local"
                            value={slot.closes_at}
                            onChange={(e) => handleSlotChange(index, 'closes_at', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors"
                >
                  {isPending ? 'Creating...' : 'Create Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
