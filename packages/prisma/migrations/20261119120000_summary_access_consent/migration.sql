-- Summary-only consent.
--
-- The app has always shown this switch as "Chat summaries — see the themes
-- from what you discuss", and the therapist's request banner has always said
-- "themes ... not your messages". The column behind that switch was named
-- chat_access_* and the portal read it as permission to show the raw
-- transcript (clients.conversation), which is a promise no client agreed to.
--
-- This rename makes the column mean exactly what every client-facing sentence
-- already said: session SUMMARIES, never messages. The four columns keep their
-- data. Narrowing what a grant unlocks is safe — the client approved less —
-- while revoking and re-asking would withdraw a consent nobody withdrew.
--
-- Nothing is backfilled. A row whose boolean was set by the old therapist-side
-- attestation (admin.assignClient) carries no summary_access_granted_at, so it
-- still opens nothing: every read gate measures the 30-day window from the
-- client's own approval timestamp, and a flag with no timestamp is inert.
--
-- The transcript route and page are deleted in the same release. After this
-- migration no column, route or screen exposes raw conversation to a therapist.

ALTER TABLE "TherapistClient" RENAME COLUMN "chat_access_granted" TO "summary_access_granted";
ALTER TABLE "TherapistClient" RENAME COLUMN "chat_access_requested_at" TO "summary_access_requested_at";
ALTER TABLE "TherapistClient" RENAME COLUMN "chat_access_granted_at" TO "summary_access_granted_at";
ALTER TABLE "TherapistClient" RENAME COLUMN "chat_access_closed_at" TO "summary_access_closed_at";
