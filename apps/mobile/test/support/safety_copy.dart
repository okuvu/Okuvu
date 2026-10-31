// GENERATED FROM THE API SOURCE — do not hand-edit the string constants.
//
// Every constant below is the *verbatim* value the api serves, extracted
// from apps/api/src/pipeline/fallbacks.ts and apps/api/src/lib/canned-response.ts
// at the commit under test (see evidence/E17-S11.md §2 for the extraction
// command and the length check). The point of copying them rather than
// re-typing them is that a test asserting on an approximation of the served
// copy proves nothing about the copy that is actually served.
//
// E17-S7 (31 Oct 2026): the S3 and S4 values are now the clinical lead's signed
// text, and the fixed replies carry her corrected helpline list. The loader used
// for this regeneration imports the constants and marshals them to JSON, so the
// escapes below are generated rather than typed.
//
// ignore_for_file: prefer_single_quotes

/// S3 — the deterministic grounding reply (A8_S3_GROUNDING_RESPONSE). E17-S7: the clinical lead's signed text.
const String a8S3GroundingResponse =
    "I want to take this seriously with you, and I don't want this app to be the only support you have with it.\n\nPlease reach a person now rather than later: Tele-MANAS: 14416 (24×7) Vandrevala Foundation: +91 9999666555 Sneha, Chennai: 044-24640050 iCall (TISS): 9152987821 — Mon–Sat, 8 am–9 pm\n\nWhile you call, try one slow breath in, a longer breath out. Is there anyone with you right now? You can keep writing here as well.";

/// S4 crisis reply (CRISIS_SIGNAL payload.message). E17-S7: the clinical lead's signed card.
const String crisisResponse =
    "I'm really glad you told me. What you are carrying sounds too much to hold alone. Please contact one of these right now: Tele-MANAS: 14416 (24×7) Vandrevala Foundation: +91 9999666555 Sneha, Chennai: 044-24640050 iCall (TISS): 9152987821 — Mon–Sat, 8 am–9 pm\n\nI would suggest that you let your therapist or someone you trust know.";

/// S9 medical floor, no crisis overlap
const String medicalEmergencyResponse =
    "Please call 112 for emergency medical help right now — that is the ambulance and emergency number in India, and they can send help to you. What you've described is a medical emergency, so please don't wait for me on this one: make the call first, and put it on speaker if you can. I'm here, and I'll stay with you while you do.";

/// S9 medical floor, crisis overlap. E17-S7: the helpline sentence is her corrected list.
const String medicalEmergencyCrisisResponse =
    "Please call 112 for emergency medical help right now — that is the ambulance and emergency number in India, and they can send help to you. I can also hear that there is more than the physical side to this, and I don't want you to carry that alone: once you've called, please reach one of these: Tele-MANAS: 14416 (24×7) Vandrevala Foundation: +91 9999666555 Sneha, Chennai: 044-24640050 iCall (TISS): 9152987821 — Mon–Sat, 8 am–9 pm. I'm here, and I'll stay with you.";

/// classifier unreachable. E17-S7: the helpline sentence is her corrected list.
const String safetyUnavailableResponse =
    "I'm still here with you. I can't check in on how you're doing the way I usually do right now, and I'd rather say that plainly than answer you without knowing. If things are feeling like too much in the meantime, please reach one of these: Tele-MANAS: 14416 (24×7) Vandrevala Foundation: +91 9999666555 Sneha, Chennai: 044-24640050 iCall (TISS): 9152987821 — Mon–Sat, 8 am–9 pm. I'm not going anywhere.";

/// reply model unreachable. E17-S7: the helpline sentence is her corrected list.
const String modelUnavailableResponse =
    "I'm here with you, and I'm listening. Something on my side isn't working properly just now, so I don't want to answer you with words I can't stand behind. If it's feeling heavy in the meantime, please reach one of these: Tele-MANAS: 14416 (24×7) Vandrevala Foundation: +91 9999666555 Sneha, Chennai: 044-24640050 iCall (TISS): 9152987821 — Mon–Sat, 8 am–9 pm. Say it again whenever you're ready — I'll still be here.";

/// E17-S6 budget refusal. E17-S7: the helpline sentence is her corrected list.
const String budgetPausedResponse =
    "I'm still here with you. We've reached the end of what I can do in this conversation for now, so I have to pause here — it's not something you said, and it isn't about how you're doing. If things feel like too much in the meantime, please reach one of these: Tele-MANAS: 14416 (24×7) Vandrevala Foundation: +91 9999666555 Sneha, Chennai: 044-24640050 iCall (TISS): 9152987821 — Mon–Sat, 8 am–9 pm. I'll be ready to pick this up with you again soon.";

/// generic canned-response fallback
const String safeFallback =
    "I'm here to support you. Could you tell me more about how you're feeling?";
