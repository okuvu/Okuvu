> [!IMPORTANT]
> Replace all placeholder text below with your actual content. Do not use HTML comments (`<!-- -->`) to hide or wrap content — the CI validation strips them and will reject empty sections. If you need to re-trigger the PR review after fixing the description, comment `/opencode review`.

## Story

**Story:** (e.g. E4-S02)
**ClickUp task:** (paste full URL)

---

## What changed

(2-4 sentences describing what you built in this PR.)


---

## Test evidence


**For backend stories:**
- [ ] Endpoint responds correctly (paste curl command or screenshot link)
- [ ] Acceptance criteria from the ClickUp task are met (copy and check off each one below)

**For Flutter stories:**
- [ ] UI renders correctly (attach screenshot or screen recording)
- [ ] Tested on a real device, not just the emulator
- [ ] Acceptance criteria from the ClickUp task are met (copy and check off each one below)

**Acceptance criteria (copy from ClickUp task):**
- [ ]
- [ ]
- [ ]

---

## Checklist

- [ ] `.env.example` updated if any new environment variables were added
- [ ] No credentials, service account keys, or `.env` values committed
- [ ] `LOCAL_DEV_BYPASS_AUTH` is not hardcoded as `true` in any non-local code path
- [ ] No new types that duplicate what already exists in `packages/shared-types/`
- [ ] The "AI Coding Notes — Common mistakes" from the ClickUp spec were checked and avoided
- [ ] Story acceptance criteria are all met (confirmed above in test evidence)
