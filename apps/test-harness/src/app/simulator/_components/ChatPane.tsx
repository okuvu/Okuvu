'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import type { PerTurnTrace } from '@/lib/trace-export';
import BreathingPulse from './BreathingPulse';
import PanelHeader from './PanelHeader';

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined leading-none ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}

function Avatar({ variant }: { variant: 'user' | 'agent' }) {
  const isUser = variant === 'user';
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[16px] ${
        isUser
          ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
          : 'bg-[var(--color-simulator-surface)] text-[var(--color-primary)]'
      }`}
    >
      <Icon name={isUser ? 'person' : 'spa'} />
    </span>
  );
}

function UserBubble({ message }: { message: string }) {
  return (
    <div className="ml-auto flex max-w-[80%] items-end gap-2">
      <div className="rounded-2xl rounded-br-md bg-[var(--color-primary-container)] px-3 py-2">
        <p className="text-[var(--text-body-main)] text-[var(--color-on-primary-container)]">{message}</p>
      </div>
      <Avatar variant="user" />
    </div>
  );
}

function AgentBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="mr-auto flex max-w-[80%] items-end gap-2">
      <Avatar variant="agent" />
      <div className="rounded-2xl rounded-bl-md border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-2">
        {children}
      </div>
    </div>
  );
}

function SystemCard({ tone, children }: { tone: 'crisis' | 'error'; children: React.ReactNode }) {
  const colorClass =
    tone === 'crisis'
      ? 'border-[var(--color-error)]/30 bg-[var(--color-error-container)] text-[var(--color-on-error-container)]'
      : 'border-[var(--color-outline-variant)] bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)]';
  return (
    <div
      className={`mx-auto flex max-w-[90%] items-start gap-2 rounded-[var(--radius-lg)] border px-3 py-2 text-[var(--text-body-main)] ${colorClass}`}
    >
      <Icon name={tone === 'crisis' ? 'health_and_safety' : 'error'} className="text-[18px]" />
      <span>{children}</span>
    </div>
  );
}

export default function ChatPane({
  turns,
  pendingMessage,
  inputValue,
  onInputChange,
  onSend,
  disabled,
  disabledReason,
  readOnly = false,
}: {
  turns: PerTurnTrace[];
  /** The message currently in flight (mutation pending), rendered as an optimistic bubble. */
  pendingMessage: string | null;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  disabledReason: string | null;
  /** Historical/read-only transcript (e.g. a completed scenario-battery run) — hides the input form. */
  readOnly?: boolean;
}) {
  const [composing, setComposing] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (disabled || !inputValue.trim()) return;
    onSend();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !composing) {
      e.preventDefault();
      if (!disabled && inputValue.trim()) onSend();
    }
  };

  return (
    <div className="flex h-full flex-col rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] shadow-[var(--shadow-soft)]">
      <div className="border-b border-[var(--color-outline-variant)] px-[var(--spacing-md)] py-3">
        <PanelHeader icon="forum">Conversation</PanelHeader>
      </div>
      <div className="flex-1 overflow-y-auto p-[var(--spacing-md)]">
        {turns.length === 0 && !pendingMessage ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-simulator-surface)] text-[var(--color-primary)]">
              <Icon name="chat_bubble" className="text-[22px]" />
            </span>
            <p className="text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
              Start a session, then send a message to begin the conversation.
            </p>
          </div>
        ) : (
          <ol className="flex flex-col gap-3">
            {turns.map((turn) => (
              <li key={turn.turnNumber} className="flex flex-col gap-2">
                <UserBubble message={turn.message} />
                {turn.resultType === 'crisis' ? (
                  <SystemCard tone="crisis">
                    This conversation reached the crisis safety pathway. In a real session, no
                    further agent reply would be sent here.
                  </SystemCard>
                ) : turn.resultType === 'error' ? (
                  <SystemCard tone="error">
                    Something went wrong generating a reply. Try again or start a new session.
                  </SystemCard>
                ) : (
                  <AgentBubble>
                    <p className="text-[var(--text-body-main)] text-[var(--color-on-surface)]">
                      {turn.response}
                    </p>
                  </AgentBubble>
                )}
              </li>
            ))}
            {pendingMessage ? (
              <li className="flex flex-col gap-2">
                <UserBubble message={pendingMessage} />
                <AgentBubble>
                  <p className="flex items-center gap-2 text-[var(--text-body-main)] text-[var(--color-on-surface-variant)]">
                    <BreathingPulse size={10} />
                    Thinking…
                  </p>
                </AgentBubble>
              </li>
            ) : null}
          </ol>
        )}
      </div>

      {readOnly ? null : (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-2 border-t border-[var(--color-outline-variant)] p-[var(--spacing-md)]"
        >
          {disabled && disabledReason ? (
            <p className="text-[var(--text-label-sm)] text-[var(--color-on-surface-variant)]">
              {disabledReason}
            </p>
          ) : null}
          <div className="flex items-end gap-2">
            <textarea
              value={inputValue}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              disabled={disabled}
              placeholder={disabledReason ?? 'Type a message…'}
              rows={2}
              className="flex-1 resize-none rounded-[var(--radius-md)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] px-3 py-2 text-[var(--text-body-main)] text-[var(--color-on-surface)] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={disabled || !inputValue.trim()}
              className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[var(--text-body-main)] font-medium text-[var(--color-on-primary)] transition-colors disabled:bg-[var(--color-surface-container-high)] disabled:text-[var(--color-on-surface-variant)]"
            >
              Send
              <Icon name="send" className="text-[16px]" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
