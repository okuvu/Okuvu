# Care Plan Save Redirect — Design Spec

## Story

Therapist Portal — Program Evia page post-save navigation.

## Problem

When a therapist reaches `/clients/[id]/program` (e.g. via Dashboard → client detail →
"Manage" → Program Evia), selects a care plan, and clicks **Save care plan**, the current
implementation only shows a "✓ Care plan saved" toast and stays on the page. The therapist
must then click **Cancel** (or use the breadcrumb) to return to the client detail page.

## Desired behavior

After a successful care plan save, the therapist is redirected back to the client detail
page (`/clients/[id]`) — the page they came from in the dashboard flow.

## Approach

**Toast, then redirect.** On save success:

1. Show the existing "✓ Care plan saved" toast.
2. After a ~1000ms delay, navigate to `/clients/${clientId}` via `router.push`.

This gives visual confirmation before leaving, and matches the Cancel button's existing
destination so the destination is predictable regardless of how the page was reached.

## Files changed

- `apps/therapist-portal/src/app/clients/[id]/program/page.tsx`

## Implementation details

In the `setCarePlan` mutation's `onSuccess` callback (`program/page.tsx:77`):

- Keep `setErrorToast(null)` and `await carePlanQuery.refetch()`.
- Call `setShowToast(true)` to show the success toast.
- Replace the existing `setTimeout(() => setShowToast(false), 3000)` with a
  `setTimeout` that calls `router.push(`/clients/${clientId}`)` after ~1000ms.
  The toast unmounts automatically when the page navigates away.

## Error handling

Unchanged. On mutation error the user stays on the page and sees the existing red error
toast for 5s.

## Out of scope

- No changes to the **Cancel** button, the breadcrumb, or the dashboard.
- No changes to the save mutation itself or the care plan data model.
- No visual/design-system changes.

## Testing

- Manual: from the dashboard, open a client's Program Evia page, change the care plan,
  save, and confirm the toast shows then the browser returns to the client detail page.
- Confirm the client detail page reflects the updated care plan after redirect.
