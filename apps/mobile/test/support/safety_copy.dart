// GENERATED FILE — do not hand-edit.
//
// Every constant below is the *verbatim* value the api serves, dumped from
// apps/api/src/pipeline/fallbacks.ts by importing it and marshalling to JSON
// (see evidence/E17-S7.md, "Regenerate the mobile copy fixture"). Retyping them
// would make the Flutter tests assert on an approximation of the served text
// instead of the text itself.
//
// E17-S7 revision 6 (1 Nov 2026, IST): the helpline block is her final five
// lines, every failure string is her §4 text, and SAFE_FALLBACK no longer
// exists — the generic canned line is gone from the product.
//
// ignore_for_file: prefer_single_quotes

/// S3 — the deterministic grounding reply.
const String a8S3GroundingResponse =
    "I want to take this seriously with you, and I don't want this app to be the only support you have with it.\n\nPlease reach a person now rather than later:\nTele-MANAS: 14416 (free, 24 hours)\nVandrevala Foundation: +91 9999 666 555 (24 hours, call or WhatsApp)\nEmergency services: 112\nSNEHA, Chennai: 044-24640050 (10am-10pm, every day)\niCall (TISS): 9152987821 (Monday to Saturday, 10am-8pm)\n\nWhile you call, try one slow breath in a longer breath out. Is there anyone with you right now? You can keep writing here as well.";

/// S4 crisis reply (CRISIS_SIGNAL payload.message).
const String crisisResponse =
    "I'm really glad you told me. What you are carrying sounds like too much to hold alone. Please contact one of these right now:\nTele-MANAS: 14416 (free, 24 hours)\nVandrevala Foundation: +91 9999 666 555 (24 hours, call or WhatsApp)\nEmergency services: 112\nSNEHA, Chennai: 044-24640050 (10am-10pm, every day)\niCall (TISS): 9152987821 (Monday to Saturday, 10am-8pm)\n\nI would suggest that you let your therapist or someone you trust know.";

/// E17-S13 third-party crisis reply.
const String crisisThirdPartyResponse =
    "I'm really glad you told me — and I want to be straight with you: what you're describing about them sounds serious enough to act on now, not to watch and wait.\n\nIf you can, talk to them directly and ask whether they are thinking about ending their life. Asking does not put the idea there, and it is usually what opens the conversation.\n\nIf they are in immediate danger — they have hurt themselves, they have a plan, or you cannot reach them — call 112 for emergency help, or get them to the nearest emergency department.\n\nYou can also call a crisis line yourself for guidance on how to help someone else at risk. These lines advise family and friends, not only the person in crisis:\nTele-MANAS: 14416 (free, 24 hours)\nVandrevala Foundation: +91 9999 666 555 (24 hours, call or WhatsApp)\nEmergency services: 112\nSNEHA, Chennai: 044-24640050 (10am-10pm, every day)\niCall (TISS): 9152987821 (Monday to Saturday, 10am-8pm)\n\nYou're carrying something heavy, and you don't have to do it alone. I'm here.";

/// S9 medical floor, no crisis overlap.
const String medicalEmergencyResponse =
    "Please call 112 for emergency medical help right now — that is the ambulance and emergency number in India, and they can send help to you. What you've described is a medical emergency, so please don't wait for me on this one: make the call first, and put it on speaker if you can. If you can, unlock the door and stay where you can be reached. If someone is nearby, ask them to help. You can write here again once you've called.";

/// S9 medical floor, crisis overlap.
const String medicalEmergencyCrisisResponse =
    "Please call 112 for emergency medical help right now. That is the ambulance and emergency number in India, and they can send help to you. Once you've called, if you'd like someone to talk to, you can reach:\nTele-MANAS: 14416 (free, 24 hours)\nVandrevala Foundation: +91 9999 666 555 (24 hours, call or WhatsApp)\nEmergency services: 112\nSNEHA, Chennai: 044-24640050 (10am-10pm, every day)\niCall (TISS): 9152987821 (Monday to Saturday, 10am-8pm)";

/// classifier unreachable.
const String safetyUnavailableResponse =
    "I can't check in on how you're doing the way I usually do right now, and I'd rather say that plainly than answer you without knowing. If things are feeling like too much in the meantime, please reach one of these:\nTele-MANAS: 14416 (free, 24 hours)\nVandrevala Foundation: +91 9999 666 555 (24 hours, call or WhatsApp)\nEmergency services: 112\nSNEHA, Chennai: 044-24640050 (10am-10pm, every day)\niCall (TISS): 9152987821 (Monday to Saturday, 10am-8pm)\n\nYou can come back and write here whenever you want.";

/// reply model unreachable.
const String modelUnavailableResponse =
    "Something on my side isn't working properly just now, so I don't want to answer you with words I can't stand behind. If it's feeling heavy in the meantime, please reach one of these:\nTele-MANAS: 14416 (free, 24 hours)\nVandrevala Foundation: +91 9999 666 555 (24 hours, call or WhatsApp)\nEmergency services: 112\nSNEHA, Chennai: 044-24640050 (10am-10pm, every day)\niCall (TISS): 9152987821 (Monday to Saturday, 10am-8pm)\n\nPlease try again in a little while.";

/// E17-S6 budget refusal.
const String budgetPausedResponse =
    "We've reached the end of what I can do in this conversation for now, so I need to pause here. This isn't about anything you said. If things feel like too much in the meantime, please reach one of these:\nTele-MANAS: 14416 (free, 24 hours)\nVandrevala Foundation: +91 9999 666 555 (24 hours, call or WhatsApp)\nEmergency services: 112\nSNEHA, Chennai: 044-24640050 (10am-10pm, every day)\niCall (TISS): 9152987821 (Monday to Saturday, 10am-8pm)\n\nYou can come back and write here whenever you want.";

/// A9-pre blocked mode.
const String a9PreBlockedResponse =
    "That's something I can't help with here. If it matters to you, it may be worth bringing to your therapist. I'm glad to keep talking about anything else that's on your mind.";

/// A9-post degraded (reviewer unavailable).
const String a9PostDegradedResponse =
    "Something went wrong on my side just now. Please say that again whenever you're ready.";

/// A9-post S2 failover (reviewer unavailable at elevated risk).
const String a9PostS2Fallback =
    "Take this at your own pace. If things feel heavier at any point, Tele-MANAS (14416) answers 24 hours a day, and 112 is there in an emergency.";

/// A2 itself failed.
const String a2DegradedResponse =
    "Something went wrong on my side just now. Please say that again whenever you're ready. If things feel heavier at any point, Tele-MANAS (14416) answers 24 hours a day, and 112 is there in an emergency.";

/// E17-S7 rev 6 §2 — the five-line block.
const String helplineBlock =
    "Tele-MANAS: 14416 (free, 24 hours)\nVandrevala Foundation: +91 9999 666 555 (24 hours, call or WhatsApp)\nEmergency services: 112\nSNEHA, Chennai: 044-24640050 (10am-10pm, every day)\niCall (TISS): 9152987821 (Monday to Saturday, 10am-8pm)";

/// E17-S7 rev 6 §2.1 — the short line for failure paths.
const String helplineShortLine =
    "If things feel heavier at any point, Tele-MANAS (14416) answers 24 hours a day, and 112 is there in an emergency.";

/// E17-S7 rev 6 §1.1 — the closing line replacing the promise.
const String comeBackClosing =
    "You can come back and write here whenever you want.";
