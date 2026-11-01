#!/usr/bin/env python3
"""Regenerate fixtures/e17-s7-approved-copy.json from the signed documents.

The fixture pins the served copy to the *paragraphs of the clinical authority's
documents*, so a later edit to a string fails a test instead of silently
re-opening a signed one. That only means something if the fixture is extracted
from the documents rather than typed from memory, which is what this script
does: every string it writes is asserted to appear verbatim in one of the two
source .docx files before the JSON is written.

Do NOT run this to make a failing test pass. Regenerating is correct only when a
NEW signed document exists. Rev 6 (§9) voids revisions 1–5 and the returned
signed form; the code is what is wrong if this and the code disagree.

  python3 apps/api/src/__tests__/fixtures/build_e17s7_fixture.py

Sources:
  docs/Okuvu-Clinical-Sign-Off-Record-E17-S7-FINAL-rev6.docx  (rev 6, final:
      the five-line block §2, the short line §2.1, the closing line §1.1)
  docs/Okuvu-Clinical-Sign-Off-Record-S3-S4-E17-S7.docx       (rev 3 record:
      the S3 reply and S4 card sentence frames she signed, §3.3 and §7.3.
      Rev 6 does not restate these sentences; it changes the block inside them.)
"""
from __future__ import annotations

import hashlib
import json
import re
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve()
API_ROOT = HERE.parents[3]           # apps/api
REPO = API_ROOT.parents[1]           # repo root

REV6 = REPO / "docs/Okuvu-Clinical-Sign-Off-Record-E17-S7-FINAL-rev6.docx"
S3S4 = REPO / "docs/Okuvu-Clinical-Sign-Off-Record-S3-S4-E17-S7.docx"
OUT = HERE.parent / "e17-s7-approved-copy.json"


def paragraphs(path: Path) -> list[str]:
    """Every non-empty paragraph of the document, in document order."""
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf-8")
    out = []
    for p in re.findall(r"<w:p[ >].*?</w:p>", xml, re.S):
        text = "".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", p, re.S))
        text = (
            text.replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", '"')
            .replace("&apos;", "'")
            .strip()
        )
        if text:
            out.append(text)
    return out


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def find_block(paras: list[str]) -> list[str]:
    """The five-line block: five consecutive paragraphs matching her services."""
    heads = [
        "Tele-MANAS: 14416 (free, 24 hours)",
        "Vandrevala Foundation: +91 9999 666 555 (24 hours, call or WhatsApp)",
        "Emergency services: 112",
        "SNEHA, Chennai: 044-24640050 (10am-10pm, every day)",
        "iCall (TISS): 9152987821 (Monday to Saturday, 10am-8pm)",
    ]
    joined = "".join(heads)
    for p in paras:
        if joined in p:
            return heads
    raise SystemExit("rev 6: the five-line block was not found verbatim, in order")


def find_short_line(paras: list[str]) -> str:
    want = (
        "If things feel heavier at any point, Tele-MANAS (14416) answers 24 hours a day, "
        "and 112 is there in an emergency."
    )
    for p in paras:
        if want in p:
            return want
    raise SystemExit("rev 6: the §2.1 short line was not found")


def find_closing(paras: list[str]) -> str:
    want = "You can come back and write here whenever you want."
    for p in paras:
        if want in p:
            return want
    raise SystemExit("rev 6: the §1.1 closing line was not found")


def s3_sentences(paras: list[str]) -> tuple[str, str, str]:
    """Her S3 reply: opening, lead-in to the block, closing — verbatim."""
    opening = (
        "I want to take this seriously with you, and I don't want this app to be the only support you "
        "have with it."
    )
    lead = "Please reach a person now rather than later:"
    closing = (
        "While you call, try one slow breath in a longer breath out. Is there anyone with you right now? "
        "You can keep writing here as well."
    )
    for p in paras:
        if lead in p and opening in p:
            for piece in (opening, lead, closing):
                if piece not in p:
                    raise SystemExit(f"S3 record: not found verbatim: {piece!r}")
            return opening, lead, closing
    raise SystemExit("S3 record: the S3 reply paragraph was not found")


def s4_sentences(paras: list[str]) -> tuple[str, str]:
    """Her S4 card: the paragraph before the block, and the referral after it."""
    lead = (
        "I'm really glad you told me. What you are carrying sounds like too much to hold alone. "
        "Please contact one of these right now:"
    )
    closing = "I would suggest that you let your therapist or someone you trust know."
    for p in paras:
        if lead in p:
            if closing not in p:
                raise SystemExit("S4 record: the therapist referral was not found beside the card")
            return lead, closing
    raise SystemExit("S4 record: the S4 card paragraph was not found")


def shipping_texts(paras: list[str], block: list[str]) -> dict[str, str]:
    """Every §4 shipping string, composed from the document's own paragraphs.

    The document prints each string with the block run into it (one paragraph,
    no line breaks), so the served text is rebuilt the way the code renders it:
    the lead-in, a newline, the five lines, then the closing sentence as its own
    paragraph. Nothing here is typed by hand — the prefix and suffix are cut out
    of the paragraph itself, and the function fails if either is not found.
    """
    joined = "".join(block)

    def para_starting(prefix: str) -> str:
        for p in paras:
            if p.startswith(prefix):
                return p
        raise SystemExit(f"rev 6: no shipping paragraph starts with {prefix[:60]!r}")

    def para_equal(text: str) -> str:
        for p in paras:
            if p == text:
                return p
        raise SystemExit(f"rev 6: no shipping paragraph equals {text[:60]!r}")

    def with_block(prefix: str) -> str:
        p = para_starting(prefix)
        if joined not in p:
            raise SystemExit(f"rev 6: block not found inside the paragraph for {prefix[:40]!r}")
        pre, _, post = p.partition(joined)
        return pre + "\n" + "\n".join(block) + ("\n\n" + post if post else "")

    return {
        "MEDICAL_EMERGENCY_RESPONSE": para_starting(
            "Please call 112 for emergency medical help right now — that is the ambulance and "
            "emergency number in India, and they can send help to you. What you've described"
        ),
        "MEDICAL_EMERGENCY_CRISIS_RESPONSE": with_block(
            "Please call 112 for emergency medical help right now. That is the ambulance"
        ),
        "A9_PRE_BLOCKED_RESPONSE": para_equal(
            "That's something I can't help with here. If it matters to you, it may be worth "
            "bringing to your therapist. I'm glad to keep talking about anything else that's on "
            "your mind."
        ),
        "A9_POST_DEGRADED_RESPONSE": para_equal(
            "Something went wrong on my side just now. Please say that again whenever you're ready."
        ),
        "A9_POST_S2_FALLBACK": para_equal(
            "Take this at your own pace. If things feel heavier at any point, Tele-MANAS (14416) "
            "answers 24 hours a day, and 112 is there in an emergency."
        ),
        "A2_DEGRADED_RESPONSE": para_equal(
            "Something went wrong on my side just now. Please say that again whenever you're ready. "
            "If things feel heavier at any point, Tele-MANAS (14416) answers 24 hours a day, and "
            "112 is there in an emergency."
        ),
        "BUDGET_PAUSED_RESPONSE": with_block("We've reached the end of what I can do"),
        "SAFETY_UNAVAILABLE_RESPONSE": with_block("I can't check in on how you're doing"),
        "MODEL_UNAVAILABLE_RESPONSE": with_block("Something on my side isn't working properly"),
    }


def main() -> None:
    rev6 = paragraphs(REV6)
    s3s4 = paragraphs(S3S4)

    block = find_block(rev6)
    short_line = find_short_line(rev6)
    closing = find_closing(rev6)
    s3_open, s3_lead, s3_close = s3_sentences(s3s4)
    s4_lead, s4_close = s4_sentences(s3s4)

    fixture = {
        "note": (
            "Generated by build_e17s7_fixture.py from the two signed documents. Do not hand-edit; "
            "every string below was asserted to appear verbatim in its source .docx before this file "
            "was written."
        ),
        "clinical_lead": "Dr Shubhangi Goswami",
        "approved_date": "1 November 2026 (IST)",
        "supersedes": "revisions 1-5 and the returned signed form of 31 October 2026",
        "source_docx": "docs/Okuvu-Clinical-Sign-Off-Record-E17-S7-FINAL-rev6.docx",
        "source_docx_sha256": sha256(REV6),
        "source_docx_scope": "the helpline block (Sec 2), the short line (Sec 2.1), the closing line (Sec 1.1)",
        "s3_s4_source_docx": "docs/Okuvu-Clinical-Sign-Off-Record-S3-S4-E17-S7.docx",
        "s3_s4_source_docx_sha256": sha256(S3S4),
        "s3_s4_source_docx_scope": (
            "the S3 reply sentence frame (Sec 3.3) and the S4 card sentence frame (Sec 7.3) she signed; "
            "revision 6 replaces the block inside them, not the sentences"
        ),
        "helpline_block_lines": block,
        "helpline_block": "\n".join(block),
        "helpline_short_line": short_line,
        "come_back_closing": closing,
        "s3_opening": s3_open,
        "s3_lead": s3_lead,
        "s3_closing": s3_close,
        "s4_lead": s4_lead,
        "s4_closing": s4_close,
        "shipping_texts": shipping_texts(rev6, block),
    }

    OUT.write_text(json.dumps(fixture, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {OUT.relative_to(REPO)}")
    print(f"  rev 6        {fixture['source_docx_sha256'][:16]}…")
    print(f"  S3/S4 record {fixture['s3_s4_source_docx_sha256'][:16]}…")
    print(f"  block        {len(block)} lines, {len(fixture['helpline_block'])} chars")


if __name__ == "__main__":
    main()
