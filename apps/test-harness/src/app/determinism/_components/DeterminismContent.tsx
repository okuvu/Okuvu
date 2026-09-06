'use client';

import A8StateMatrix from './A8StateMatrix';
import NRunPanel from './NRunPanel';
import RestartPanel from './RestartPanel';

export default function DeterminismContent() {
  return (
    <div className="flex flex-col gap-[var(--spacing-xl)]">
      <A8StateMatrix />
      <NRunPanel />
      <RestartPanel />
    </div>
  );
}
