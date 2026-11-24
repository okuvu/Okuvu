-- Safety flags: the urgent marker.
--
-- One additive boolean, default false, no backfill. The harm-to-someone screen
-- (owner's approval, 24 Nov 2026) is the only writer that sets it true: the
-- client is describing a risk to another person rather than their own, so the
-- portal pins that flag to the top of the client's Safety card and the alert
-- email leads with "URGENT".
--
-- Defaulting to false is the whole migration for existing rows. Every flag
-- already recorded keeps exactly the treatment it has today, and an insert that
-- says nothing about urgency is treated as not urgent — the safe direction for
-- a marker that raises a therapist's attention: a missing marker must never
-- claim urgency, because a stream of false urgent alerts is how the real one
-- gets missed.

ALTER TABLE "SafetyFlag" ADD COLUMN "urgent" BOOLEAN NOT NULL DEFAULT false;
