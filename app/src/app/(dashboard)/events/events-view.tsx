'use client';

import React, { useState, useTransition } from 'react';
import { Event, EventStatus, SlotType } from '@/lib/types/models';
import {
  createEventWithSlotsAction,
  toggleEventStatusAction,
  deleteEventAction,
} from '@/lib/actions/events';
import { Plus, MapPin, Clock, Trash2, Power, Layers } from 'lucide-react';

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
  const [weight, setWeight] = useState(1);
  const [slots, setSlots] = useState<
    Array<{
      label: string;
      slot_type: SlotType;
      opens_at: string;
      late_cutoff_at: string;
      closes_at: string;
      late_penalty_percent: number;
      is_required: boolean;
    }>
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
        late_cutoff_at: startsAt || new Date().toISOString().slice(0, 16),
        closes_at: startsAt
          ? new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString().slice(0, 16)
          : new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
        late_penalty_percent: 0,
        is_required: true,
      },
    ]);
  };

  const handleRemoveSlot = (index: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSlotChange = (index: number, field: string, value: string | number | boolean) => {
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
        status: 'Open',
        weight,
        slots: slots.map((s) => ({
          ...s,
          opens_at: new Date(s.opens_at).toISOString(),
          late_cutoff_at: s.late_cutoff_at ? new Date(s.late_cutoff_at).toISOString() : null,
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
      setWeight(1);
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
          className={`p-3 rounded-2xl text-xs font-semibold border ${
            toast.type === 'ok'
              ? 'bg-secondary border-primary/25 text-secondary-foreground'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Header Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 font-medium">
          Showing {events.length} event{events.length === 1 ? '' : 's'}
        </p>
        {userRole === 'admin' && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-primary hover:bg-primary/90 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Event</span>
          </button>
        )}
      </div>

      {/* Events List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {events.length === 0 ? (
          <div className="col-span-2 rounded-2xl border border-border bg-white p-12 text-center text-xs text-muted-foreground">
            No events scheduled yet.
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
                className="p-5 bg-white border border-border rounded-3xl flex flex-col justify-between space-y-4 hover:border-slate-300 transition-colors shadow-xs"
              >
                <div className="flex items-start gap-4">
                  {/* Date Block */}
                  <div className="shrink-0 w-12 h-14 rounded-2xl bg-secondary border border-primary/25 flex flex-col items-center justify-center text-center">
                    <span className="text-xs uppercase font-extrabold text-primary">{mon}</span>
                    <span className="text-lg font-extrabold text-primary leading-none mt-0.5">{day}</span>
                  </div>

                  {/* Main Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-900 truncate">{ev.name}</h3>
                      <span className="text-xs font-bold text-slate-500">{ev.weight || 1} pts</span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold shrink-0 ${
                          ev.status === 'Open'
                            ? 'bg-secondary text-secondary-foreground border border-primary/25'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {ev.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                      <span className="flex items-center gap-1 font-medium">
                        <Clock className="w-3 h-3 text-primary" /> {timeStr}
                      </span>
                      <span className="flex items-center gap-1 truncate font-medium">
                        <MapPin className="w-3 h-3 text-primary" /> {ev.venue}
                      </span>
                    </div>

                    {ev.description && (
                      <p className="text-xs text-slate-600 mt-2 line-clamp-2 leading-relaxed">
                        {ev.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Slots Breakdown */}
                {ev.slots && ev.slots.length > 0 && (
                  <div className="p-3 rounded-2xl bg-muted border border-border space-y-1.5 text-xs">
                    <div className="font-bold text-primary flex items-center gap-1 text-xs uppercase tracking-wider">
                      <Layers className="w-3 h-3" /> Time Windows
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {ev.slots.map((slot) => (
                        <div key={slot.id} className="p-2 rounded-xl bg-white border border-border text-slate-700">
                          <b className="text-slate-900">{slot.label}</b>
                          <div className="text-xs text-slate-500 mt-0.5">
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
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                    <button
                      onClick={() => handleToggleStatus(ev)}
                      disabled={isPending}
                      className="px-3 py-1 rounded-xl text-xs font-semibold bg-muted border border-border text-slate-700 hover:text-slate-900 flex items-center gap-1 transition-colors"
                    >
                      <Power className="w-3 h-3 text-primary" />
                      {ev.status === 'Open' ? 'Close' : 'Reopen'}
                    </button>
                    <button
                      onClick={() => handleDeleteEvent(ev)}
                      disabled={isPending}
                      className="px-3 py-1 rounded-xl text-xs font-semibold bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 flex items-center gap-1 transition-colors"
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-border rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-extrabold text-primary">Create New Event</h3>
            <form onSubmit={handleCreateEvent} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Event Title</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. ACS General Assembly 2026"
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Event Date & Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Venue</label>
                  <input
                    type="text"
                    required
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    placeholder="e.g. PSU Gymnasium"
                    className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief agenda or guidelines..."
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Event Weight (1-20 points)</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  required
                  value={weight}
                  onChange={(e) => setWeight(Number(e.target.value))}
                  className="w-28 bg-muted border border-border rounded-xl px-3 py-2 text-xs text-slate-900"
                />
              </div>

              {/* Attendance Slots Configuration */}
              <div className="pt-2 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="text-xs font-bold text-slate-900 block">Attendance Time Windows</label>
                    <span className="text-xs text-slate-500">Configure active scan windows (e.g. Morning Time-In).</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddSlot}
                    className="px-3 py-1 bg-secondary border border-primary/25 rounded-xl text-xs text-secondary-foreground font-bold hover:bg-primary/15"
                  >
                    + Add Slot
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {slots.map((slot, index) => (
                    <div key={index} className="p-3 bg-muted border border-border rounded-2xl space-y-2">
                      <div className="flex items-center justify-between">
                        <input
                          type="text"
                          value={slot.label}
                          onChange={(e) => handleSlotChange(index, 'label', e.target.value)}
                          placeholder="e.g. Morning Time-In"
                          className="bg-white border border-border rounded-xl px-2.5 py-1 text-xs text-slate-900 flex-1 mr-2"
                        />
                        <select
                          value={slot.slot_type}
                          onChange={(e) => handleSlotChange(index, 'slot_type', e.target.value)}
                          className="bg-white border border-border rounded-xl px-2.5 py-1 text-xs text-slate-700 mr-2"
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
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-slate-500 font-medium block mb-0.5">Opens At</span>
                          <input
                            type="datetime-local"
                            value={slot.opens_at}
                            onChange={(e) => handleSlotChange(index, 'opens_at', e.target.value)}
                            className="w-full bg-white border border-border rounded-xl px-2 py-1 text-slate-800 text-xs"
                          />
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium block mb-0.5">Late After</span>
                          <input
                            type="datetime-local"
                            value={slot.late_cutoff_at}
                            onChange={(e) => handleSlotChange(index, 'late_cutoff_at', e.target.value)}
                            className="w-full bg-white border border-border rounded-xl px-2 py-1 text-slate-800 text-xs"
                          />
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium block mb-0.5">Closes At</span>
                          <input
                            type="datetime-local"
                            value={slot.closes_at}
                            onChange={(e) => handleSlotChange(index, 'closes_at', e.target.value)}
                            className="w-full bg-white border border-border rounded-xl px-2 py-1 text-slate-800 text-xs"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <label className="flex items-center gap-2 text-slate-600">
                          <input
                            type="checkbox"
                            checked={slot.is_required}
                            onChange={(e) => handleSlotChange(index, 'is_required', e.target.checked)}
                          />
                          Required slot
                        </label>
                        <label className="flex items-center gap-2 text-slate-600">
                          Late penalty
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={slot.late_penalty_percent}
                            onChange={(e) => handleSlotChange(index, 'late_penalty_percent', Number(e.target.value))}
                            className="w-16 bg-white border border-border rounded-lg px-2 py-1 text-slate-800"
                          />
                          %
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-500 hover:text-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs transition-colors"
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
