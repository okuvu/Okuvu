'use client';

import { useState } from 'react';

export interface AppointmentFormValues {
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:mm"
  durationMinutes: number;
  mode: 'video' | 'phone' | 'in_person';
  location: string;
  noteToClient: string;
  repeatWeeklyCount: number;
  remind24h: boolean;
  remind1h: boolean;
}

const DEFAULT_VALUES: AppointmentFormValues = {
  date: '',
  time: '',
  durationMinutes: 50,
  mode: 'video',
  location: '',
  noteToClient: '',
  repeatWeeklyCount: 1,
  remind24h: false,
  remind1h: false,
};

// wireframes P-03 — the create/edit appointment form, reused for both a
// fresh "Schedule a session" and a reschedule (pre-filled). No Dialog/
// Modal component exists anywhere in the portal, so this is an inline
// panel, matching the rest of the portal's established form pattern.
export function AppointmentForm({
  initialValues,
  submitLabel,
  isSubmitting,
  onSubmit,
  onCancel,
  allowRepeat = true,
}: {
  initialValues?: Partial<AppointmentFormValues>;
  submitLabel: string;
  isSubmitting: boolean;
  onSubmit: (values: AppointmentFormValues) => void;
  onCancel: () => void;
  allowRepeat?: boolean;
}) {
  const [values, setValues] = useState<AppointmentFormValues>({
    ...DEFAULT_VALUES,
    ...initialValues,
  });

  function update<K extends keyof AppointmentFormValues>(key: K, value: AppointmentFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
      className="space-y-3 rounded-lg border border-hairline bg-lavender-wash p-4"
    >
      <div className="flex flex-col gap-3 md:flex-row">
        <div className="flex-1">
          <label htmlFor="appt-date" className="mb-1 block text-xs font-medium text-gray-500">Date</label>
          <input
            id="appt-date"
            type="date"
            required
            value={values.date}
            onChange={(e) => update('date', e.target.value)}
            disabled={isSubmitting}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="appt-time" className="mb-1 block text-xs font-medium text-gray-500">Time</label>
          <input
            id="appt-time"
            type="time"
            required
            value={values.time}
            onChange={(e) => update('time', e.target.value)}
            disabled={isSubmitting}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60"
          />
        </div>
        <div className="w-28">
          <label htmlFor="appt-duration" className="mb-1 block text-xs font-medium text-gray-500">Duration (min)</label>
          <input
            id="appt-duration"
            type="number"
            min={5}
            step={5}
            required
            value={values.durationMinutes}
            onChange={(e) => update('durationMinutes', Number(e.target.value))}
            disabled={isSubmitting}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <div className="flex-1">
          <label htmlFor="appt-mode" className="mb-1 block text-xs font-medium text-gray-500">Mode</label>
          <select
            id="appt-mode"
            value={values.mode}
            onChange={(e) => update('mode', e.target.value as AppointmentFormValues['mode'])}
            disabled={isSubmitting}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60"
          >
            <option value="video">Video</option>
            <option value="phone">Phone</option>
            <option value="in_person">In person</option>
          </select>
        </div>
        <div className="flex-1">
          <label htmlFor="appt-location" className="mb-1 block text-xs font-medium text-gray-500">Location / link (optional)</label>
          <input
            id="appt-location"
            type="text"
            value={values.location}
            onChange={(e) => update('location', e.target.value)}
            disabled={isSubmitting}
            placeholder="Meeting link or address"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60"
          />
        </div>
      </div>

      <div>
        <label htmlFor="appt-note" className="mb-1 block text-xs font-medium text-gray-500">Note to client (optional)</label>
        <textarea
          id="appt-note"
          value={values.noteToClient}
          onChange={(e) => update('noteToClient', e.target.value)}
          disabled={isSubmitting}
          rows={2}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60"
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {allowRepeat && (
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <span>Repeat weekly</span>
            <input
              type="number"
              min={1}
              max={52}
              value={values.repeatWeeklyCount}
              onChange={(e) => update('repeatWeeklyCount', Number(e.target.value))}
              disabled={isSubmitting}
              className="w-16 rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 outline-none focus:border-violet focus:ring-1 focus:ring-violet disabled:opacity-60"
            />
            <span>&times;</span>
          </label>
        )}
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={values.remind24h}
            onChange={(e) => update('remind24h', e.target.checked)}
            disabled={isSubmitting}
          />
          Remind 24h before
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={values.remind1h}
            onChange={(e) => update('remind1h', e.target.checked)}
            disabled={isSubmitting}
          />
          Remind 1h before
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !values.date || !values.time}
          className="rounded-lg bg-violet px-4 py-2 text-sm font-medium text-white hover:bg-royal-purple transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
