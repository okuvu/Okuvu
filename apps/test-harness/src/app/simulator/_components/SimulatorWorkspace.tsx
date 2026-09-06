'use client';

import { useState } from 'react';
import { trpc } from '@/trpc/client';
import { useEnvironment } from '@/lib/environment-context';
import { PERSONA_SCRIPTS, type PersonaId } from '@/lib/persona-scripts';
import { exportTraceToClinicianFormat, type PerTurnTrace } from '@/lib/trace-export';
import { simulateSessionCloseAction } from '@/app/conversations/actions';
import LeftConfigPanel from './LeftConfigPanel';
import ChatPane from './ChatPane';
import FlowStatusPane from './FlowStatusPane';
import ScenarioBattery from './ScenarioBattery';
import CorpusRunner from './CorpusRunner';
import AgentTester from './AgentTester';
import { FAULT_OPTIONS, type FaultOptionId } from './fault-options';
import { choiceLabel, type ScenarioChoice } from './scenario-choice';

interface ActiveSession {
  runId: string;
  uid: string;
  sessionId: string;
}

export default function SimulatorWorkspace() {
  const { environment } = useEnvironment();

  const [selection, setSelection] = useState<ScenarioChoice | null>(null);
  const [recentSelection, setRecentSelection] = useState<ScenarioChoice | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<ScenarioChoice | null>(null);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [turns, setTurns] = useState<PerTurnTrace[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [crisisEnded, setCrisisEnded] = useState(false);
  const [closeMessage, setCloseMessage] = useState<string | null>(null);
  const [faultOption, setFaultOption] = useState<FaultOptionId>('none');
  const [isEndingSession, setIsEndingSession] = useState(false);

  const startSessionMutation = trpc.simulator.startSession.useMutation();

  const sendMessageMutation = trpc.simulator.sendMessage.useMutation({
    onSuccess: (data) => {
      setTurns((prev) => [...prev, data.turn]);
      if (data.resultType === 'crisis') setCrisisEnded(true);
    },
  });

  // Uses mutateAsync (not the mutation's own onSuccess) so the prefill logic
  // below can read `sel` directly instead of relying on a closure over
  // state that may have moved on by the time the request resolves.
  const startWithSelection = async (sel: ScenarioChoice | null) => {
    setPendingSwitch(null);
    const personaArg = sel && sel !== 'custom' ? sel : undefined;
    const data = await startSessionMutation.mutateAsync({ environment, personaId: personaArg });
    setSession({ runId: data.runId, uid: data.uid, sessionId: data.sessionId });
    setTurns([]);
    setCrisisEnded(false);
    setCloseMessage(null);
    setSelection(sel);
    setRecentSelection(sel);
    setInputValue(sel && sel !== 'custom' ? (PERSONA_SCRIPTS[sel][0] ?? '') : '');
  };

  const handleSelectionChange = (sel: ScenarioChoice) => {
    if (!session) {
      // No active session yet — just pick a scenario and prefill its opener
      // (or clear the field for "custom"); the therapist still clicks
      // "Start session" explicitly the first time.
      setSelection(sel);
      setInputValue(sel !== 'custom' ? (PERSONA_SCRIPTS[sel][0] ?? '') : '');
      return;
    }
    if (turns.length === 0) {
      // Session started but nothing sent yet — nothing to lose, switch immediately.
      startWithSelection(sel);
      return;
    }
    // Active conversation has real turns — confirm before discarding it.
    setPendingSwitch(sel);
  };

  const handleStartSession = () => {
    startWithSelection(selection);
  };

  const handleSend = () => {
    if (!session || !inputValue.trim()) return;
    const message = inputValue.trim();
    const fault = FAULT_OPTIONS.find((o) => o.id === faultOption)?.fault ?? undefined;
    setInputValue('');
    setFaultOption('none'); // one-off probe, not a sticky mode — reset immediately on send
    sendMessageMutation.mutate({
      runId: session.runId,
      uid: session.uid,
      sessionId: session.sessionId,
      environment,
      message,
      ...(fault ? { fault } : {}),
    });
  };

  const handleEndSession = async () => {
    if (!session || isEndingSession) return;
    setIsEndingSession(true);
    try {
      const result = await simulateSessionCloseAction({
        sessionId: session.sessionId,
        userId: session.uid,
      });
      if (result.success) {
        setCloseMessage(
          result.data.summaryTriggered
            ? 'Session closed. Summary generated.'
            : 'Session closed.',
        );
      } else {
        setCloseMessage('Session closed.');
      }
      setSession(null);
      setTurns([]);
      setCrisisEnded(false);
    } catch {
      setCloseMessage('Session closed.');
      setSession(null);
      setTurns([]);
      setCrisisEnded(false);
    } finally {
      setIsEndingSession(false);
    }
  };

  const handleExport = () => {
    if (turns.length === 0) return;
    const { json } = exportTraceToClinicianFormat(turns);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `simulator-conversation-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const latestTurn = turns.length > 0 ? turns[turns.length - 1] : null;
  const chatDisabled = !session || sendMessageMutation.isPending || crisisEnded;
  const disabledReason = !session
    ? 'Start a session to begin…'
    : crisisEnded
      ? 'This session reached the crisis pathway — start a new session to continue.'
      : null;

  return (
    <>
      <div className="flex flex-1 min-h-0 flex-col gap-[var(--spacing-md)] overflow-y-auto">
        {pendingSwitch ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-container)] px-3 py-2 text-[var(--text-label-sm)] text-[var(--color-on-warning-container)]">
            <span>
              Switch to &ldquo;{choiceLabel(pendingSwitch)}&rdquo;? This ends the current
              conversation.
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                onClick={() => startWithSelection(pendingSwitch)}
                className="rounded-[var(--radius-md)] bg-[var(--color-warning)] px-3 py-1 text-white"
              >
                Switch
              </button>
              <button
                type="button"
                onClick={() => setPendingSwitch(null)}
                className="rounded-[var(--radius-md)] border border-[var(--color-warning)]/40 px-3 py-1 text-[var(--color-on-warning-container)]"
              >
                Cancel
              </button>
            </span>
          </div>
        ) : null}

        <div
          className="grid min-h-[480px] flex-1 grid-cols-1 gap-[var(--spacing-md)] [grid-template-areas:'chat''config''status'] md:grid-cols-[1fr_280px] md:[grid-template-areas:'config_config''chat_status'] lg:grid-cols-[280px_1fr_320px] lg:[grid-template-areas:'config_chat_status']"
        >
          <div className="[grid-area:config] min-h-0">
            <LeftConfigPanel
              environment={environment}
              selection={selection}
              recentSelection={recentSelection}
              onSelectionChange={handleSelectionChange}
              sessionActive={session !== null}
              onStartSession={handleStartSession}
              starting={startSessionMutation.isPending}
              onEndSession={handleEndSession}
              endSessionDisabled={!session}
              onExport={handleExport}
              exportDisabled={turns.length === 0}
              faultOption={faultOption}
              onFaultChange={setFaultOption}
            />
          </div>

          <div className="[grid-area:chat] min-h-0">
            <ChatPane
              turns={turns}
              pendingMessage={sendMessageMutation.isPending ? (sendMessageMutation.variables?.message ?? null) : null}
              inputValue={inputValue}
              onInputChange={setInputValue}
              onSend={handleSend}
              disabled={chatDisabled}
              disabledReason={disabledReason}
            />
          </div>

          <div className="[grid-area:status] overflow-y-auto">
            {closeMessage ? (
              <div className="mb-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)] text-[var(--text-body-main)] text-[var(--color-on-surface)]">
                {closeMessage}
              </div>
            ) : null}
            <FlowStatusPane latestTurn={latestTurn} />
          </div>
        </div>

        <ScenarioBattery environment={environment} />
        <CorpusRunner environment={environment} />
        <AgentTester />
      </div>

    </>
  );
}
