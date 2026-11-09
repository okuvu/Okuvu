'use client';

import { useMemo, useState } from 'react';
import {
  isAnswerPresent,
  validateWorksheetAnswers,
  visibleFields,
  worksheetProgress,
  type WorksheetAnswers,
  type WorksheetAnswerValue,
  type WorksheetContent,
  type WorksheetField,
  type WorksheetRowColumn,
} from '@okuvu/shared-types/worksheet';

/**
 * The therapist's preview of a worksheet.
 *
 * This renders the SAME content object the app renders, and gets its step list,
 * its branching and its required-field rules from the same shared functions, so
 * "the therapist sees exactly what the client sees" is structural rather than a
 * promise. Copy is never written here: every question, helper line, example and
 * button label comes out of the approved document.
 *
 * Preview-only differences, deliberate and shown to the therapist:
 * - dictation is an app affordance and cannot run in a browser, so the voice
 *   piece renders as a note instead of a microphone;
 * - nothing is saved, flagged or sent.
 */

interface Props {
  content: WorksheetContent;
  /** The therapist's personal line, if this assignment carries one. */
  personalNote?: string | null;
  /** Hinglish body, when the worksheet has one, so the preview can switch. */
  hingeContent?: WorksheetContent | null;
}

export function WorksheetRunner({ content, personalNote, hingeContent }: Props) {
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const active = language === 'hi' && hingeContent ? hingeContent : content;

  const [answers, setAnswers] = useState<WorksheetAnswers>({});
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);

  const steps = useMemo(() => visibleFields(active, answers), [active, answers]);
  const safeIndex = Math.min(index, Math.max(steps.length - 1, 0));
  const field = steps[safeIndex];
  const progress = worksheetProgress(active, answers);
  const errors = useMemo(() => validateWorksheetAnswers(active, answers), [active, answers]);

  const fieldErrors = field ? errors.filter((e) => e.startsWith(`${field.id}:`)) : [];
  const blocked = fieldErrors.length > 0 && field?.required === true;

  function setAnswer(id: string, value: WorksheetAnswerValue | undefined) {
    setAnswers((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[id];
      else next[id] = value;
      return next;
    });
  }

  if (steps.length === 0) {
    return <p className="text-sm text-gray-500">This worksheet has no pieces to show.</p>;
  }

  if (finished) {
    return (
      <div className="space-y-4">
        <ProgressBar value={1} />
        {active.closing?.text && <p className="text-base text-gray-900">{active.closing.text}</p>}
        <div className="flex flex-wrap gap-2">
          {(active.closing?.buttons ?? []).map((button) => (
            <button
              key={button.action}
              type="button"
              disabled
              className="rounded-lg bg-royal-purple px-4 py-2 text-sm font-medium text-white opacity-60"
              title="Preview only"
            >
              {button.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          End of worksheet. In the app these buttons finish the worksheet, and where the copy offers
          it, save an answer to the client&rsquo;s Treasure Box.
        </p>
        <button
          type="button"
          onClick={() => {
            setAnswers({});
            setIndex(0);
            setFinished(false);
          }}
          className="text-sm font-medium text-royal-purple underline"
        >
          Start the preview again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ProgressBar value={steps.length <= 1 ? 1 : safeIndex / steps.length} />

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          Piece {safeIndex + 1} of {steps.length}
        </span>
        <span>
          {progress.answered} of {progress.total} answerable pieces answered
        </span>
      </div>

      {index === 0 && active.intro && (
        <p className="rounded-xl bg-oat-elevated p-4 text-sm leading-relaxed text-gray-700">{active.intro}</p>
      )}

      {field && (
        <FieldView field={field} answers={answers} onChange={setAnswer} personalNote={personalNote} />
      )}

      {field?.therapistNote && personalNote && (
        <div className="rounded-xl border border-hairline bg-oat p-3 text-sm text-gray-700">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Your therapist&rsquo;s note
          </span>
          {personalNote}
        </div>
      )}

      {fieldErrors.length > 0 && (
        <ul className="space-y-1 text-xs text-red-600">
          {fieldErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIndex(Math.max(0, safeIndex - 1))}
          disabled={safeIndex === 0}
          className="rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-40"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => {
            if (safeIndex >= steps.length - 1) setFinished(true);
            else setIndex(safeIndex + 1);
          }}
          disabled={blocked}
          className="rounded-lg bg-royal-purple px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {safeIndex >= steps.length - 1 ? 'Finish' : 'Next'}
        </button>
      </div>

      <div className="flex items-center justify-between border-t border-hairline pt-3">
        <p className="text-[11px] text-gray-500">
          Preview: nothing typed here is saved, checked or sent.
        </p>
        {hingeContent && (
          <div className="flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={language === 'en' ? 'font-semibold text-royal-purple' : 'text-gray-500'}
            >
              English
            </button>
            <span className="text-gray-300">|</span>
            <button
              type="button"
              onClick={() => setLanguage('hi')}
              className={language === 'hi' ? 'font-semibold text-royal-purple' : 'text-gray-500'}
            >
              Hinglish
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className="h-full rounded-full bg-royal-purple transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

interface FieldProps {
  field: WorksheetField;
  answers: WorksheetAnswers;
  onChange: (id: string, value: WorksheetAnswerValue | undefined) => void;
  personalNote?: string | null;
}

function FieldView({ field, answers, onChange }: FieldProps) {
  const value = answers[field.id];

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{field.prompt}</h3>
        {field.helper && <p className="mt-1 text-xs leading-relaxed text-gray-500">{field.helper}</p>}
        {field.example && (
          <p className="mt-1 text-xs italic leading-relaxed text-gray-500">Example: {field.example}</p>
        )}
      </div>

      {field.type === 'instruction' && null}

      {(field.type === 'short_text' || field.type === 'long_text' || field.type === 'closing_reflection') && (
        <textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(field.id, event.target.value || undefined)}
          rows={field.type === 'short_text' ? 2 : 5}
          maxLength={
            field.type === 'short_text'
              ? (field.maxLength ?? 500)
              : field.type === 'long_text'
                ? (field.maxLength ?? 10000)
                : 10000
          }
          className="w-full rounded-xl border border-hairline bg-white p-3 text-sm text-gray-900 focus:border-royal-purple focus:outline-none"
        />
      )}

      {field.type === 'voice_note' && (
        <div className="space-y-2">
          <textarea
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(field.id, event.target.value || undefined)}
            rows={5}
            maxLength={field.maxLength ?? 10000}
            placeholder="In the app this piece can be spoken instead of typed."
            className="w-full rounded-xl border border-hairline bg-white p-3 text-sm text-gray-900 focus:border-royal-purple focus:outline-none"
          />
          <p className="text-xs text-gray-500">
            Dictation runs on the client&rsquo;s phone and only the words are kept — no audio is
            recorded or uploaded. It is not available in this browser preview.
          </p>
        </div>
      )}

      {(field.type === 'scale_0_10' || field.type === 'scale_0_100') && (
        <div className="space-y-2">
          <input
            type="range"
            min={0}
            max={field.type === 'scale_0_10' ? 10 : 100}
            step={1}
            value={typeof value === 'number' ? value : field.type === 'scale_0_10' ? 5 : 50}
            onChange={(event) => onChange(field.id, Number(event.target.value))}
            className="w-full accent-royal-purple"
          />
          <div className="flex justify-between text-[11px] text-gray-500">
            <span>{field.minLabel ?? '0'}</span>
            <span className="font-semibold text-gray-900">
              {typeof value === 'number' ? value : '—'}
              {field.type === 'scale_0_100' ? '%' : ''}
            </span>
            <span>{field.maxLabel ?? (field.type === 'scale_0_100' ? '100' : '10')}</span>
          </div>
        </div>
      )}

      {field.type === 'choice' && (
        <div className="flex flex-col gap-2">
          {field.options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(field.id, option.value)}
              className={`rounded-xl border px-4 py-3 text-left text-sm ${
                value === option.value
                  ? 'border-royal-purple bg-royal-purple/5 font-semibold text-royal-purple'
                  : 'border-hairline bg-white text-gray-800'
              }`}
            >
              {option.label}
              {option.description && (
                <span className="mt-0.5 block text-xs font-normal text-gray-500">{option.description}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {field.type === 'checklist' && (
        <div className="flex flex-col gap-2">
          {field.options.map((option) => {
            const picked = Array.isArray(value) ? (value as string[]) : [];
            const checked = picked.includes(option.value);
            const max = field.maxSelections ?? Number.POSITIVE_INFINITY;
            return (
              <label
                key={option.value}
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
                  checked ? 'border-royal-purple bg-royal-purple/5' : 'border-hairline bg-white'
                } ${!checked && picked.length >= max ? 'opacity-50' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && picked.length >= max}
                  onChange={() => {
                    const next = checked
                      ? picked.filter((v) => v !== option.value)
                      : [...picked, option.value];
                    onChange(field.id, next.length > 0 ? next : undefined);
                  }}
                  className="mt-0.5 accent-royal-purple"
                />
                <span>
                  <span className="block text-gray-900">{option.label}</span>
                  {option.description && (
                    <span className="block text-xs leading-relaxed text-gray-500">{option.description}</span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {field.type === 'feelings_picker' && (
        <FeelingsPicker field={field} value={value} onChange={(v) => onChange(field.id, v)} />
      )}

      {field.type === 'row_list' && <RowList field={field} value={value} onChange={(v) => onChange(field.id, v)} />}

      {field.type === 'datetime' && (
        <div className="flex flex-wrap gap-2">
          {(field.withDate ?? true) && (
            <input
              type="date"
              value={typeof value === 'string' ? value.split('T')[0] ?? '' : ''}
              onChange={(event) => {
                const time = typeof value === 'string' && value.includes('T') ? value.split('T')[1] : '';
                onChange(field.id, event.target.value ? `${event.target.value}${time ? `T${time}` : ''}` : undefined);
              }}
              className="rounded-xl border border-hairline bg-white px-3 py-2 text-sm"
            />
          )}
          {field.withTime && (
            <input
              type="time"
              value={typeof value === 'string' && value.includes('T') ? value.split('T')[1] ?? '' : ''}
              onChange={(event) => {
                const date =
                  typeof value === 'string' && value.includes('T') ? value.split('T')[0] : '';
                if (!event.target.value) {
                  onChange(field.id, date || undefined);
                  return;
                }
                onChange(field.id, date ? `${date}T${event.target.value}` : undefined);
              }}
              className="rounded-xl border border-hairline bg-white px-3 py-2 text-sm"
            />
          )}
        </div>
      )}
    </div>
  );
}

function FeelingsPicker({
  field,
  value,
  onChange,
}: {
  field: Extract<WorksheetField, { type: 'feelings_picker' }>;
  value: WorksheetAnswerValue | undefined;
  onChange: (value: WorksheetAnswerValue | undefined) => void;
}) {
  const picked =
    value && typeof value === 'object' && !Array.isArray(value) && 'picked' in value
      ? value.picked
      : [];
  const strength =
    value && typeof value === 'object' && !Array.isArray(value) && 'strength' in value
      ? (value.strength ?? {})
      : {};
  const max = field.maxSelections ?? 3;
  const byId = new Map(field.feelings.map((f) => [f.id, f]));
  const families = field.feelings.filter((f) => !f.parent);
  const [openFamily, setOpenFamily] = useState<string | null>(null);

  function toggle(id: string) {
    const next = picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id];
    onChange(next.length > 0 ? { picked: next, strength } : undefined);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {families.map((family) => {
          const children = field.feelings.filter((f) => f.parent === family.id);
          const isPicked = picked.includes(family.id);
          return (
            <div key={family.id} className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => (children.length > 0 ? setOpenFamily(openFamily === family.id ? null : family.id) : toggle(family.id))}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  isPicked
                    ? 'border-royal-purple bg-royal-purple text-white'
                    : 'border-hairline bg-white text-gray-800'
                }`}
              >
                {family.label}
                {children.length > 0 && <span className="ml-1 text-xs opacity-70">+</span>}
              </button>
              {openFamily === family.id && children.length > 0 && (
                <div className="ml-2 flex flex-wrap gap-2 border-l border-hairline pl-2">
                  {children.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => toggle(child.id)}
                      disabled={!picked.includes(child.id) && picked.length >= max}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        picked.includes(child.id)
                          ? 'border-royal-purple bg-royal-purple/10 font-semibold text-royal-purple'
                          : 'border-hairline bg-white text-gray-700'
                      } disabled:opacity-40`}
                    >
                      {child.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-gray-500">
        {picked.length} of {max} picked
      </p>

      {field.withStrength && picked.length > 0 && (
        <div className="space-y-3 rounded-xl border border-hairline bg-oat p-3">
          {picked.map((id) => (
            <div key={id}>
              <div className="flex items-center justify-between text-xs text-gray-700">
                <span>{byId.get(id)?.label ?? id}</span>
                <span className="font-semibold">{strength[id] ?? '—'}</span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={strength[id] ?? 5}
                onChange={(event) =>
                  onChange({ picked, strength: { ...strength, [id]: Number(event.target.value) } })
                }
                className="w-full accent-royal-purple"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RowList({
  field,
  value,
  onChange,
}: {
  field: Extract<WorksheetField, { type: 'row_list' }>;
  value: WorksheetAnswerValue | undefined;
  onChange: (value: WorksheetAnswerValue | undefined) => void;
}) {
  const rows = Array.isArray(value) && (value.length === 0 || typeof value[0] === 'object')
    ? (value as Array<Record<string, string | number>>)
    : [];
  const max = field.maxRows ?? 25;

  function update(next: Array<Record<string, string | number>>) {
    onChange(next.length > 0 ? next : undefined);
  }

  return (
    <div className="space-y-2">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex flex-wrap items-end gap-2 rounded-xl border border-hairline bg-white p-2">
          {field.columns.map((column) => (
            <RowCell
              key={column.id}
              column={column}
              value={row[column.id]}
              onChange={(cell) => {
                const next = rows.map((r, i) => (i === rowIndex ? { ...r, [column.id]: cell } : r));
                update(next);
              }}
            />
          ))}
          <button
            type="button"
            onClick={() => update(rows.filter((_, i) => i !== rowIndex))}
            className="ml-auto text-xs text-gray-500 underline"
          >
            Remove
          </button>
        </div>
      ))}
      {rows.length < max && (
        <button
          type="button"
          onClick={() => update([...rows, {}])}
          className="text-sm font-medium text-royal-purple underline"
        >
          {field.addLabel ?? 'Add a row'}
        </button>
      )}
    </div>
  );
}

function RowCell({
  column,
  value,
  onChange,
}: {
  column: WorksheetRowColumn;
  value: string | number | undefined;
  onChange: (value: string | number) => void;
}) {
  if (column.type === 'scale_0_10') {
    return (
      <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-[11px] text-gray-500">
        {column.label}
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={typeof value === 'number' ? value : 5}
          onChange={(event) => onChange(Number(event.target.value))}
          className="accent-royal-purple"
        />
      </label>
    );
  }

  if (column.type === 'datetime') {
    return (
      <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-[11px] text-gray-500">
        {column.label}
        <input
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          className="rounded-lg border border-hairline px-2 py-1 text-sm"
        />
      </label>
    );
  }

  return (
    <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-[11px] text-gray-500">
      {column.label}
      <input
        type="text"
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-hairline px-2 py-1 text-sm"
      />
    </label>
  );
}

/** Kept exported so a page can show "does this worksheet ask anything yet". */
export function previewIsEmpty(content: WorksheetContent): boolean {
  return content.fields.every((f) => f.type === 'instruction') || content.fields.length === 0;
}

export function answeredSomething(answers: WorksheetAnswers): boolean {
  return Object.values(answers).some(isAnswerPresent);
}
