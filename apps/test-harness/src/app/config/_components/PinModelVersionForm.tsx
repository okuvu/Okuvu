'use client';

import { useState } from 'react';
import { useEnvironment } from '@/lib/environment-context';
import { trpc } from '@/trpc/client';

/**
 * PI-only pin form. Callers must gate rendering of this component on
 * session.user.role === 'PI' (done in ConfigRegistryClient) — this
 * component doesn't re-check role since the mutation itself enforces
 * FORBIDDEN server-side regardless.
 */
export default function PinModelVersionForm() {
  const { environment } = useEnvironment();
  const utils = trpc.useUtils();

  const [provider, setProvider] = useState<'openrouter' | 'gemini'>('openrouter');
  const [modelVersion, setModelVersion] = useState('meta-llama/llama-3.1-8b-instruct');
  const [promptHash, setPromptHash] = useState('');
  const [temperature, setTemperature] = useState('0.7');
  const [safetySettings, setSafetySettings] = useState('default');
  const [suiteVersion, setSuiteVersion] = useState('v1.0');

  const pinMutation = trpc.testConfig.pinModelVersion.useMutation({
    onSuccess: () => {
      utils.testConfig.getLatestPin.invalidate({ environment });
    },
  });

  const promptRegistry = trpc.testConfig.getPromptRegistry.useQuery();

  const fillLiveHash = () => {
    const first = promptRegistry.data?.[0];
    if (first) setPromptHash(first.contentHash);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    pinMutation.mutate({
      environment,
      model_version: modelVersion,
      provider,
      prompt_hash: promptHash,
      temperature: Number(temperature),
      safety_settings: safetySettings,
      suite_version: suiteVersion,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] p-[var(--spacing-md)]"
    >
      <h3 className="text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-surface)]">
        Pin model config for <span className="font-mono">{environment}</span>
      </h3>

      <label className="flex flex-col gap-1 text-[var(--text-body-sm)]">
        Provider
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as 'openrouter' | 'gemini')}
          className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-2 py-1"
        >
          <option value="openrouter">openrouter</option>
          <option value="gemini">gemini</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-[var(--text-body-sm)]">
        Model version
        <input
          type="text"
          required
          value={modelVersion}
          onChange={(e) => setModelVersion(e.target.value)}
          className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-2 py-1"
        />
      </label>

      <label className="flex flex-col gap-1 text-[var(--text-body-sm)]">
        Prompt hash
        <div className="flex gap-2">
          <input
            type="text"
            required
            value={promptHash}
            onChange={(e) => setPromptHash(e.target.value)}
            className="flex-1 rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-2 py-1 font-mono text-xs"
          />
          <button
            type="button"
            onClick={fillLiveHash}
            className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-2 py-1 text-xs text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-container-high)]"
          >
            Use live hash
          </button>
        </div>
      </label>

      <label className="flex flex-col gap-1 text-[var(--text-body-sm)]">
        Temperature
        <input
          type="number"
          step="0.1"
          min="0"
          max="2"
          required
          value={temperature}
          onChange={(e) => setTemperature(e.target.value)}
          className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-2 py-1"
        />
      </label>

      <label className="flex flex-col gap-1 text-[var(--text-body-sm)]">
        Safety settings
        <input
          type="text"
          required
          value={safetySettings}
          onChange={(e) => setSafetySettings(e.target.value)}
          className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-2 py-1"
        />
      </label>

      <label className="flex flex-col gap-1 text-[var(--text-body-sm)]">
        Suite version
        <input
          type="text"
          required
          value={suiteVersion}
          onChange={(e) => setSuiteVersion(e.target.value)}
          className="rounded-[var(--radius-lg)] border border-[var(--color-outline-variant)] px-2 py-1"
        />
      </label>

      <button
        type="submit"
        disabled={pinMutation.isPending}
        className="rounded-[var(--radius-lg)] bg-[var(--color-primary)] px-3 py-1.5 text-[var(--text-label-sm)] font-[var(--text-label-sm--font-weight)] text-[var(--color-on-primary)] disabled:opacity-50"
      >
        {pinMutation.isPending ? 'Pinning…' : 'Pin new config'}
      </button>

      {pinMutation.error ? (
        <p className="text-[var(--text-body-sm)] text-[var(--color-error)]">
          {pinMutation.error.message}
        </p>
      ) : null}
      {pinMutation.isSuccess ? (
        <p className="text-[var(--text-body-sm)] text-[var(--color-primary)]">Pinned.</p>
      ) : null}
    </form>
  );
}
