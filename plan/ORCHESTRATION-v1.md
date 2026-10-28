# Okuvu — Orchestration plan v1.0: ten agents, one gate-keeper

**Date** 28 Oct 2026 · **Orchestrator** the agent (single accountable verifier)
**Backlog of record** `plan/launch-backlog.psv` (35 stories, 6 epics, 31.25 dev-days)
**Schedule model** `plan/schedule.py` — parses the backlog, refuses unknown deps, cycles
or unassigned stories, then list-schedules under an agent pool with critical-path
priority. Every hour quoted below is produced by that script, not estimated by hand.

**Target** the three release outcomes in 30 hours of wall clock.

---

## 1. What the model says

| Scenario | Agent-hours | Makespan | Verdict |
|---|---|---|---|
| Best case, comp 0.30 (agents 3.3x the human estimate) | 67.0 | 14.6 h | headroom |
| Risk-adjusted, comp 0.45–0.50 | 99.6 | 21.8 h | the number to hold me to |
| Agents no faster than the human estimate, comp 1.0 | 211.2 | 47.0 h | fails 30 h |
| Break-even | — | 30.0 h at comp 0.63 | agents must be **1.58x** faster than the human estimate |

Observed in this session, on comparable infrastructure stories (E15-S4 root cause plus
the lean resize): roughly 10x. The 1.58x bar is therefore not the risk. **The risk is
dependency stalls and my own verification queue, not agent throughput.**

25 of 35 stories are agent-executable (24.75 dev-days). 6 stories are human or calendar
owned (5.00 dev-days). 4 stories are gated behind a human or calendar story and cannot
be scheduled at all: E19-S6, E19-S7, E20-S1, E20-S3.

## 2. The agent pool

Ten specialists, each owning a lane of the backlog, plus the orchestrator. Lanes are cut
by *surface touched*, not by epic, so two agents rarely edit the same file.

| Agent | Stories | Load (risk-adj) | Scope |
|---|---|---|---|
| A10-ci | E15-S1, S2, S3, S4 | 9.4 h | merge to develop, webhook, build-to-deploy, api health |
| A1-infra | E15-S5, S6, E16-S1, S2 | 7.4 h | terraform state truth, logs/alarms, DNS, listener rules |
| A2-model | E17-S2 | 1.1 h | Bedrock quota and access from the task role |
| A3-runtime | E17-S1, S3, S6 | 10.5 h | Converse API path, agent roster merge, token budgets |
| A4-safety | E17-S4, S5 | 6.6 h | fail-closed behaviour, evaluation gate |
| A5-portal | E16-S3, S4 | 7.8 h | Cognito pool, schema migration |
| A6-verify | E16-S5, S6, E18-S4, E20-S1 | 8.3 h | journey proof, restore drill, device smoke, pilot run |
| A7-security | E16-S7, E20-S2 | 4.8 h | DPDP checklist, on-call runbook |
| A8-android | E18-S1, S2, S3, S5 | 4.2 h | keystore, versioning, bundle, APK |
| A9-store | E19-S2, S3, S4 | 6.9 h | privacy policy, listing assets, declarations |

Deliberately **not** one agent per story: A1 and A10 were one lane in the first model and
it ran to 14.4 h of serial work, making the platform the whole critical path. Splitting
CI from terraform took the makespan from 14.4 h to 10.1 h of platform work.

## 3. How agents know about each other's dependencies

This is the part that decides whether the plan works. Four mechanisms, all mechanical.

**The backlog is the contract.** A child receives its story IDs, the exact acceptance
criterion text verbatim, its dependency IDs, and for each dependency the *evidence file
path* it must read before starting. It never decides for itself whether a dependency is
met.

**Evidence, not reports.** Every story produces `evidence/<story-id>.md` containing the
command run, its raw output and a timestamp. A dependent story starts by reading that
file. A child that cannot read green evidence must return `BLOCKED: <what is missing>`
and stop — improvising past a dependency is the failure mode this design exists to stop.

**One worktree per agent.** Each child runs `git worktree add ../wt-<agent> <branch>` and
commits there. No agent pushes to develop, ever. It returns branch, commit SHA, evidence
path and an explicit "what I did not do" list. The orchestrator reviews the diff and
merges. Two agents editing `apps/api` cannot corrupt each other's tree this way.

**Terraform is serialised through the orchestrator.** A1-infra and A10-ci both touch
infrastructure. Agents may run `terraform plan` freely; only the orchestrator runs
`apply`, on a queue, one at a time. Concurrent applies against the same state file is the
one hazard that produces a silently wrong stack rather than a failed command.

**Run ledger.** `plan/run-ledger.psv` tracks per story: state (todo / ready / running /
verified / blocked), branch, commit, evidence path, verifier verdict. It is the only
place status lives. A story is `verified` when the orchestrator has personally run its
acceptance command — a child's claim of success is never accepted as evidence.

## 4. Waves (risk-adjusted, hours from start)

**Wave 0 — t+0 to 2.7h.** E15-S1 (A10: merge to develop, build green), E17-S2 (A2: task
role can invoke the model, quota recorded), E18-S1 (A8: real keystore — needs Rajwant's
custody decision, can proceed with generation meanwhile). Three stories, no dependencies,
which is exactly what the backlog says: those three are the only work that can start cold.

**Wave 1 — t+2.7 to 5.7h.** Seven in parallel: E15-S4 (api to 2/2), E16-S1 (apex DNS),
E16-S3 (Cognito), E16-S7 (DPDP), E17-S1 (Converse path), E18-S3 (prod bundle), E18-S4
(device smoke). This wave is wide because A1, A5, A7, A3, A6, A8 all unblock at once off
E15-S1 and E15-S4.

**Wave 2 — t+4.2 to 8.4h.** E16-S2 (listener rules), E18-S5 (APK), E19-S2 (privacy URL),
E15-S2 (webhook), E15-S5 (terraform truth), E19-S4 (declarations), E15-S3 (auto-deploy
plus a tested rollback).

**Wave 3 — t+6.6 to 10.5h.** E17-S3 (roster merge), E17-S4 (fail-closed), E16-S4 (schema
migration), E16-S5 (journey x3), E15-S6 (logs/alarms), E19-S3 (listing assets).

**Wave 4 — t+10.5 to 14.6h.** E17-S5 (eval gate), E17-S6 (token budgets), E16-S6
(restore drill), E20-S2 (runbook). Then the gated tail: E17-S7 clinical, E19-S6
submission, E19-S7 approval, E20-S1 pilot, E20-S3 claims.

**Critical path, 25.9 h of agent work:** E15-S1 → E15-S4 → E17-S1 → E17-S3 → E17-S4 →
E16-S5 → E19-S3. Note what is *not* on it: the entire Android lane (4.2 h, finishes at
5.1 h) and the store lane. Android is never the bottleneck; the agent lane is.

## 5. The orchestrator's own budget

Verification is serial and it is mine: 25 stories x ~15 min = 6.3 h, plus merges and
serialised applies, call it 8 h. That fits inside a 22 h makespan with room, but it sets
the rule: **no more than four stories returned at once**, or the verification queue
becomes the constraint instead of the agents. The tool limit is 10 concurrent children;
the plan uses 7 as the working maximum for that reason.

## 6. Where Rajwant is needed

Eight items, roughly 2–3 hours of his time, but three of them are on the calendar path
and cannot be delegated.

1. **Play Console account — is one open, and is it personal or organisation?** Decides
   whether a 14-day closed test with 12 opt-in testers applies. This is the only input
   that moves the launch date by two weeks and it blocks E19-S1 and E19-S5. Asked twice,
   still unanswered. **Needed before hour 10.**
2. **Keystore custody (E18-S1).** The agent generates the RSA-4096 key; he must store the
   password offline and confirm where. Losing it means never updating the app on Play.
3. **15 testers' email addresses** if the account is personal, recruited at hour 10, not
   hour 25.
4. **Clinical sign-off (E17-S7)** — Shubhangi's written approval on the exact agent copy
   and technique list at the eval-gate commit. He chases; nobody can compress it.
5. **Launch claims approval (E20-S3)** — same authority, after the runbook.
6. **Play uploads and identity/device verification** — Google 2FA and ID documents are
   his, by policy never mine.
7. **The budget email** — SNS confirmation link for the $250 alert is still pending.
8. **The sacrifice decision** if we slip: cut listing polish, the side-loadable APK, then
   pilot size down to three therapists. Never cut fail-closed behaviour, the eval gate,
   the restore drill, or the no-claim-before-sign-off rule.

## 7. What 30 hours does and does not buy

Within 30 hours, if the model holds: therapist portal answering at okuvu.in, agent live
on `qwen.qwen3-32b-v1:0` behind a recorded eval gate, signed APK in hand, signed bundle
uploaded and under Play review, runbook and restore drill done.

Not within 30 hours, by physics rather than effort: Play's review queue (typically 1–7
days), the 14-day closed test if the account is personal, and the clinical authority's
turnaround. So the honest commitment is *"all three targets built, submitted and
internally usable in 30 hours; store approval lands when Google lands it."*

## 8. Kill criteria for the orchestration itself

- Two agents return `BLOCKED` on the same dependency in one wave — stop, the dependency
  contract is wrong, re-cut the lane.
- The verification queue exceeds 4 pending stories for more than 2 hours — pause spawning
  until it drains.
- Any story needs a terraform apply while another is mid-apply — the lane split failed.
- E17-S5 misses its threshold after two prompt iterations — escalate to re-plan, per
  section 8 of the launch plan.
