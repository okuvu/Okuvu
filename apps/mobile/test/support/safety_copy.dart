// GENERATED FROM THE API SOURCE — do not hand-edit the string constants.
//
// Every constant below is the *verbatim* value the api serves, extracted
// from apps/api/src/pipeline/fallbacks.ts and apps/api/src/lib/canned-response.ts
// at the commit under test (see evidence/E17-S11.md §2 for the extraction
// command and the length check). The point of copying them rather than
// re-typing them is that a test asserting on an approximation of the served
// copy proves nothing about the copy that is actually served.
//
// ignore_for_file: prefer_single_quotes

/// S3 — the deterministic grounding reply (A8_S3_GROUNDING_RESPONSE)
const String a8S3GroundingResponse =
    "It sounds like things feel really heavy right now, and I don't want you to sit with that on your own. Let's slow down together — if you can, take a breath with me and tell me what's around you right now.\n\nAnd because this sounds like more than anyone should have to carry alone, please keep a crisis line close by: iCall on 9152987821, or the Vandrevala Foundation on 1860-2662-345. They answer day and night, and you don't need to be in immediate danger to call. If you ever feel you might act on these thoughts, call 112 or go to the nearest emergency department.\n\nI'm here with you.";

/// S4 crisis reply (CRISIS_SIGNAL payload.message)
const String crisisResponse =
    "I'm really glad you told me. What you're carrying right now sounds like too much to hold alone, and I don't want you to be on your own with it. Please reach out to one of these right now — they're ready to talk with you:\n\niCall: 9152987821\nVandrevala Foundation: 1860-2662-345\nNIMHANS: 080-46110007\nSnehi: 044-24640050\nEmergency Services: 112\n\nI'll be here when you're ready to come back.";

/// S9 medical floor, no crisis overlap
const String medicalEmergencyResponse =
    "Please call 112 for emergency medical help right now — that is the ambulance and emergency number in India, and they can send help to you. What you've described is a medical emergency, so please don't wait for me on this one: make the call first, and put it on speaker if you can. I'm here, and I'll stay with you while you do.";

/// S9 medical floor, crisis overlap
const String medicalEmergencyCrisisResponse =
    "Please call 112 for emergency medical help right now — that is the ambulance and emergency number in India, and they can send help to you. I can also hear that there is more than the physical side to this, and I don't want you to carry that alone: once you've called, please reach out to iCall on 9152987821 or the Vandrevala Foundation on 1860-2662-345. I'm here, and I'll stay with you.";

/// classifier unreachable
const String safetyUnavailableResponse =
    "I'm still here with you. I can't check in on how you're doing the way I usually do right now, and I'd rather say that plainly than answer you without knowing. If things are feeling like too much in the meantime, please reach out to iCall on 9152987821 or the Vandrevala Foundation on 1860-2662-345, any time. I'm not going anywhere.";

/// reply model unreachable
const String modelUnavailableResponse =
    "I'm here with you, and I'm listening. Something on my side isn't working properly just now, so I don't want to answer you with words I can't stand behind. If it's feeling heavy in the meantime, iCall on 9152987821 or the Vandrevala Foundation on 1860-2662-345 are there any time. Say it again whenever you're ready — I'll still be here.";

/// E17-S6 budget refusal
const String budgetPausedResponse =
    "I'm still here with you. We've reached the end of what I can do in this conversation for now, so I have to pause here — it's not something you said, and it isn't about how you're doing. If things feel like too much in the meantime, please reach out to iCall on 9152987821 or the Vandrevala Foundation on 1860-2662-345, any time. I'll be ready to pick this up with you again soon.";

/// generic canned-response fallback
const String safeFallback =
    "I'm here to support you. Could you tell me more about how you're feeling?";
