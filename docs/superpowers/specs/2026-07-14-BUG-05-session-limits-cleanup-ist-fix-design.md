# BUG-05: Session Limits Cleanup UTC/IST Cutoff Mismatch

**ClickUp task:** https://app.clickup.com/t/86d3nev2p
**Story:** BUG-05
**Severity:** Critical
**Date:** 2026-07-14

---

## Problem

The cleanup endpoint at `apps/worker/src/routes/cleanup.ts:34-39` computes its deletion cutoff using `Date.UTC()` (UTC-anchored), but `SessionLimit.date_ist` rows are bucketed by IST date via `getISTDateString()`. A UTC cutoff compared against IST-keyed data deletes rows up to 5h30m early — e.g., rows written at 2 AM IST (= 8:30 PM UTC previous day) get deleted a full day before their IST-date expires.

```typescript
// Current (wrong) — UTC cutoff against IST-bucketed data:
const todayUTC = new Date(Date.UTC(
  now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()
));
const cutoff = new Date(todayUTC.getTime() - retentionDays * 24 * 60 * 60 * 1000);

await getPrisma().sessionLimit.deleteMany({
  where: { date_ist: { lt: cutoff } }  // UTC cutoff vs IST field
});
```

## Solution

### 1. Add `getISTDateString` to `@evia/shared-types`

Move the utility to the workspace package that both apps already depend on. Add an optional `date` parameter for flexibility (defaults to `new Date()` for backward compatibility).

**File:** `packages/shared-types/index.ts`

```typescript
export function getISTDateString(date?: Date): string {
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const target = date ?? new Date();
  const parts = formatter.formatToParts(target);
  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const day = parts.find(p => p.type === 'day')!.value;
  return `${year}-${month}-${day}`;
}
```

### 2. Update `apps/api/src/lib/session-limits.ts`

Remove the local `getISTDateString` definition, import from `@evia/shared-types` instead. Re-export so callers (`session-handler.ts`) continue to work unchanged.

```typescript
import { getISTDateString } from '@evia/shared-types';
export { getISTDateString };
```

### 3. Fix `apps/worker/src/routes/cleanup.ts`

Compute an IST-anchored cutoff string using `getISTDateString()`, then compare `date_ist` against the string directly:

```typescript
import { getISTDateString } from '@evia/shared-types';

const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
const cutoffIST = getISTDateString(cutoffDate);

const result = await getPrisma().sessionLimit.deleteMany({
  where: { date_ist: { lt: cutoffIST } },
});
```

The `cutoff_date` in the response should also reflect the IST date, not UTC:

```typescript
cutoff_date: cutoffIST,  // instead of cutoff.toISOString().slice(0, 10)
```

### 4. Add test: `apps/worker/src/__tests__/cleanup.test.ts`

Unit test using the same mock patterns as `summary.test.ts` (mock `getPrisma`, `sessionLimit.deleteMany`). Test cases:

- A row keyed to today's IST date (`getISTDateString()`) is NOT deleted by the cleanup endpoint
- A row with an older IST date IS deleted

## Acceptance Criteria

- [x] Cutoff computed using `getISTDateString()` — not `Date.UTC()`
- [x] Rows written at IST midnight are not deleted before their IST-date expires
- [x] Unit test: a row keyed to today's IST date is not deleted by the cleanup job

## Files Changed

| File | Change |
|------|--------|
| `packages/shared-types/index.ts` | Add `getISTDateString(date?)` export |
| `apps/api/src/lib/session-limits.ts` | Remove local def, import from `@evia/shared-types` |
| `apps/worker/src/routes/cleanup.ts` | Use `getISTDateString()` for cutoff |
| `apps/worker/src/__tests__/cleanup.test.ts` | New unit test |

## Verification

```bash
cd apps/api && pnpm test        # Existing tests must pass
cd apps/worker && pnpm test     # Existing + new test must pass
cd apps/api && pnpm typecheck
cd apps/worker && pnpm typecheck
```
