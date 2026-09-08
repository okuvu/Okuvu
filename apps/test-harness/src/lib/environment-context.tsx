'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSession } from 'next-auth/react';
import type { TestEnvironment } from '@okuvu/shared-types';

const STORAGE_KEY = 'test-harness-environment';
const DEFAULT_ENVIRONMENT: TestEnvironment = 'sandbox';

export interface EnvironmentEndpoints {
  sandbox: string;
  staging: string;
  beta: string;
}

interface EnvironmentContextValue {
  environment: TestEnvironment;
  setEnvironment: (env: TestEnvironment) => void;
  apiEndpoint: string;
}

const EnvironmentContext = createContext<EnvironmentContextValue | undefined>(undefined);

function readPersistedEnvironment(): TestEnvironment | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'sandbox' || stored === 'staging' || stored === 'beta') {
      return stored;
    }
  } catch {
    // localStorage unavailable (e.g. private browsing) — ignore
  }
  return null;
}

/**
 * Pick a valid environment for the current user, given a candidate.
 * Falls back to the first allowed environment, preferring 'sandbox' if it's
 * in the allowed list, so a user without Beta access can never end up with
 * Beta selected (even from stale localStorage).
 */
function resolveAllowedEnvironment(
  candidate: TestEnvironment | null,
  allowed: TestEnvironment[] | undefined,
): TestEnvironment {
  if (!allowed || allowed.length === 0) {
    return candidate ?? DEFAULT_ENVIRONMENT;
  }
  if (candidate && allowed.includes(candidate)) {
    return candidate;
  }
  if (allowed.includes(DEFAULT_ENVIRONMENT)) {
    return DEFAULT_ENVIRONMENT;
  }
  return allowed[0];
}

export function EnvironmentProvider({
  children,
  endpoints,
}: {
  children: ReactNode;
  endpoints: EnvironmentEndpoints;
}) {
  const { data: session } = useSession();
  const allowedEnvironments = session?.user?.environments;

  const [environment, setEnvironmentState] = useState<TestEnvironment>(DEFAULT_ENVIRONMENT);
  const [hydrated, setHydrated] = useState(false);

  // Rehydrate from localStorage on mount.
  useEffect(() => {
    const persisted = readPersistedEnvironment();
    setEnvironmentState(resolveAllowedEnvironment(persisted, allowedEnvironments));
    setHydrated(true);
    // Only run once on mount — subsequent validation against session
    // happens in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-validate against the session's environments claim whenever it changes
  // (e.g. session loads after mount) so a stale/invalid selection can never
  // stick around.
  useEffect(() => {
    if (!hydrated) return;
    setEnvironmentState((current) => resolveAllowedEnvironment(current, allowedEnvironments));
  }, [allowedEnvironments, hydrated]);

  const setEnvironment = (env: TestEnvironment) => {
    const resolved = resolveAllowedEnvironment(env, allowedEnvironments);
    setEnvironmentState(resolved);
    try {
      window.localStorage.setItem(STORAGE_KEY, resolved);
    } catch {
      // ignore persistence failures
    }
  };

  const apiEndpoint = useMemo(() => endpoints[environment] ?? '', [endpoints, environment]);

  const value = useMemo(
    () => ({ environment, setEnvironment, apiEndpoint }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [environment, apiEndpoint, allowedEnvironments],
  );

  return <EnvironmentContext.Provider value={value}>{children}</EnvironmentContext.Provider>;
}

export function useEnvironment(): EnvironmentContextValue {
  const ctx = useContext(EnvironmentContext);
  if (!ctx) {
    throw new Error('useEnvironment must be used within an EnvironmentProvider');
  }
  return ctx;
}
