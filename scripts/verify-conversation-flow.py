#!/usr/bin/env python3
"""E16-S5 / E16-S9 — walk the therapist journey against the live portal as a
real signed-in therapist, and assert what actually renders.

Why this exists: E16-S9's conversation view and E16-S5's "open client, review
the conversation" step were both unverifiable from the database alone. A row
count proves a TherapistClient exists; it does not prove the portal will show
that client to that therapist, that requestChatAccess succeeds, or that the
transcript renders. This script signs in through the same six hops a browser
walks (imported from verify-therapist-login.py, not reimplemented), then acts as
that therapist over HTTPS.

Sequence, per therapist:

    1. sign_in                       (NextAuth + Cognito hosted UI)
    2. GET  /api/trpc/clients.list   (the caseload, scoped to this therapist)
    3. POST /api/trpc/clients.requestChatAccess  (the real portal mutation)
    4. GET  /clients/<id>/conversation           (must render the transcript)
    5. GET  /clients/<id>                        (client detail)

Then a negative control with a therapist who is NOT assigned to the client:
their caseload must be empty and the conversation page must not leak a turn.
Without that control, "the transcript rendered" could just mean the access
check is missing.

Usage:
    AWS_REGION=ap-south-1 python3 scripts/verify-conversation-flow.py
    ... --therapist ananya.rao@okuvu.in --other priya.nair@okuvu.in
    ... --base https://okuvu.in --prefix /evia-beta/therapists

Exit code 0 only when every assertion holds. Metadata only in the output — no
password, no session cookie, no client name or phone number.
"""

import argparse
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))


def load_login_module():
    path = os.path.join(HERE, "verify-therapist-login.py")
    spec = importlib.util.spec_from_file_location("verify_therapist_login", path)
    if spec is None or spec.loader is None:
        raise SystemExit(f"cannot load {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


vtl = load_login_module()

# Text that only exists in the seeded fixture (scripts/seed-client-demo.sql).
# Used to prove the rendered page carries real Turn rows, not an empty shell.
SEED_MARKERS = [
    "the breathing thing before my review",
    "twenty minutes",
    "Skipping it after a bad night",
]

BASE = "https://okuvu.in"

failures = []


def check(ok: bool, label: str, detail: str = "") -> bool:
    mark = "PASS" if ok else "FAIL"
    print(f"   [{mark}] {label}{(' — ' + detail) if detail else ''}", flush=True)
    if not ok:
        failures.append(label)
    return ok


def curl(jar: str, args: list[str]) -> str:
    p = subprocess.run(
        ["curl", "-sS", "-b", jar, "-c", jar, *args],
        capture_output=True, text=True,
    )
    if p.returncode != 0:
        raise SystemExit(f"curl failed: {p.stderr.strip()}")
    return p.stdout


def get_page(jar: str, url: str) -> tuple[str, str]:
    """(status, body) for one GET, following nothing — a redirect is the
    answer we want to see, not something to hide."""
    out = subprocess.run(
        ["curl", "-sS", "-b", jar, "-c", jar, "-w", "\n%{http_code}", url],
        capture_output=True, text=True,
    ).stdout
    body, _, status = out.rpartition("\n")
    return status.strip(), body


def trpc_query(jar: str, path: str, payload: dict | None = None) -> tuple[str, str]:
    """GET a tRPC query with the same batch envelope the portal's client uses.

    batch=1 matters: without it the server answers a single object, and a
    batch link in the caller cannot read it. Values are urlencoded by curl
    rather than string-spliced, because the input is JSON.
    """
    # Deliberately NOT batched. In batch mode this router wants input as
    # {"0": <input>}, and sending the un-batched raw object there answers
    # "expected object, received undefined" — a 400 that looks like a schema
    # problem and is actually an envelope mismatch. Single-request mode takes
    # the raw input object and answers a single (non-array) result.
    args = ["-G", f"{BASE}/api/trpc/{path}"]
    if payload is not None:
        args += ["--data-urlencode", "input=" + json.dumps(payload)]
    out = subprocess.run(
        ["curl", "-sS", "-b", jar, "-c", jar, *args, "-w", "\n%{http_code}"],
        capture_output=True, text=True,
    ).stdout
    body, _, status = out.rpartition("\n")
    return status.strip(), body


def unwrap_batch(body: str):
    """[{"result":{"data":X}}] -> X. Returns None when the envelope is an error
    or unparseable, so callers can treat 'no data' as a failure.

    Both shapes are accepted on purpose: this portal answers a plain `data`
    for procedures whose return type needs no custom serialisation, and
    `data.json` for the ones that do. Assuming only the second shape silently
    reports an empty caseload, which is exactly the wrong failure to have on a
    roster check.
    """
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        return None
    item = parsed[0] if isinstance(parsed, list) else parsed
    try:
        data = item["result"]["data"]
    except (KeyError, TypeError):
        return None
    if isinstance(data, dict) and "json" in data:
        return data["json"]
    return data


def describe_caseload(payload) -> list[dict]:
    """An empty caseload comes back as an empty array, so absence is
    unambiguous — but an auth or server error unwraps to None, which must NOT
    read as 'empty'. Callers assert on the HTTP status alongside this."""
    return payload if isinstance(payload, list) else []


def run(therapist: str, other: str, base: str, prefix: str, workdir: str,
        run_tag: str) -> None:
    global BASE
    BASE = base
    print(f"\n=== {therapist} ===", flush=True)

    jar = vtl.sign_in(therapist, base, prefix, workdir)
    if jar is None:
        check(False, "sign_in", "see the six hops above")
        return

    status, body = trpc_query(jar, "clients.list")
    caseload = describe_caseload(unwrap_batch(body))
    check(status == "200" and len(caseload) >= 1,
          "caseload lists the assigned client",
          f"HTTP {status}, {len(caseload)} client(s)")
    if not caseload:
        return

    client_id = caseload[0]["id"]
    print(f"   client id = {client_id} (status {caseload[0].get('status')}, "
          f"carePlan {caseload[0].get('carePlan')})", flush=True)

    # The real portal mutation, not a hand-written timestamp.
    mutation = curl(jar, [
        "-X", "POST",
        "-H", "Content-Type: application/json",
        # Raw input object, not a {"json": ...} envelope: this router has no
        # superjson transformer, so the envelope reaches zod as a nested object
        # and fails validation with "expected string, path clientUserId".
        "--data", json.dumps({"clientUserId": client_id}),
        f"{base}/api/trpc/clients.requestChatAccess",
    ])
    # A repeat run inside the 30-day re-ask cap answers BAD_REQUEST with
    # "You already asked recently". That is the rule working, not a failure:
    # what this step needs is a chat-access window, and one already exists.
    already_asked = "already asked recently" in mutation
    mutation_payload = unwrap_batch(mutation)
    ok_mutation = bool(mutation_payload and mutation_payload.get("success")) or already_asked
    check(ok_mutation, "requestChatAccess succeeds (or was already requested)",
          mutation[:180])

    status, page = get_page(jar, f"{base}/clients/{client_id}/conversation")
    check(status == "200", "conversation page renders", f"HTTP {status}")
    missing = [m for m in SEED_MARKERS if m not in page]
    check(not missing, "transcript carries the seeded turns",
          f"{len(SEED_MARKERS) - len(missing)}/{len(SEED_MARKERS)} markers present")
    check(page.count('>Client<') >= 3 and page.count('>Agent<') >= 3,
          "turns are labelled Client/Agent",
          f"{page.count('>Client<')} client rows, {page.count('>Agent<')} agent rows")
    check("No access to this conversation" not in page,
          "no access-refusal notice on the assigned transcript")

    status, detail = get_page(jar, f"{base}/clients/{client_id}")
    check(status == "200", "client detail renders", f"HTTP {status}")

    # E16-S5's last step: the therapist writes a note. Saved through the real
    # notes.addNote mutation, and the text says plainly that it is a smoke-test
    # note — a clinical notes table should never contain a row that pretends
    # to be clinical.
    note_text = f"E16-S5 smoke test note (run {run_tag}) — not clinical guidance, safe to delete."
    saved = curl(jar, [
        "-X", "POST",
        "-H", "Content-Type: application/json",
        "--data", json.dumps({"clientUserId": client_id, "noteText": note_text}),
        f"{base}/api/trpc/notes.addNote",
    ])
    check(bool(unwrap_batch(saved)), "note save succeeds", saved[:160])

    # The notes page is a client component: it fetches notes through tRPC at
    # runtime, so the server HTML never contains a note body. Asserting on the
    # HTML was my mistake, not a product defect — the page returns 200 either
    # way. The honest check is the query the page itself issues.
    status, notes_page = get_page(jar, f"{base}/clients/{client_id}/notes")
    check(status == "200", "notes page renders", f"HTTP {status}")

    status, notes_body = trpc_query(jar, "notes.listNotes", {"clientId": client_id})
    notes = unwrap_batch(notes_body)
    bodies = [
        (n.get("noteText") or n.get("note_text") or "")
        for n in (notes if isinstance(notes, list) else [])
    ]
    check(status == "200" and any(note_text in b for b in bodies),
          "saved note is returned by notes.listNotes",
          f"HTTP {status}, {len(bodies)} note(s) returned")

    # --- negative control: a therapist who is not on this client's roster ---
    print(f"\n=== negative control: {other} ===", flush=True)
    other_jar = vtl.sign_in(other, base, prefix, workdir)
    if other_jar is None:
        check(False, "negative control sign_in")
        return

    status, body = trpc_query(other_jar, "clients.list")
    other_caseload = describe_caseload(unwrap_batch(body))
    check(status == "200" and len(other_caseload) == 0,
          "unassigned therapist sees an empty caseload",
          f"HTTP {status}, {len(other_caseload)} client(s)")

    status, page = get_page(other_jar, f"{base}/clients/{client_id}/conversation")
    leaked = [m for m in SEED_MARKERS if m in page]
    check(status in ("200", "307", "404") and not leaked,
          "unassigned therapist cannot read the transcript",
          f"HTTP {status}, {len(leaked)} seeded marker(s) leaked")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--therapist", default="ananya.rao@okuvu.in")
    ap.add_argument("--other", default="priya.nair@okuvu.in")
    ap.add_argument("--base", default="https://okuvu.in")
    ap.add_argument("--prefix", default="/evia-beta/therapists")
    ap.add_argument("--run-tag", default="1", help="labels the smoke-test note")
    a = ap.parse_args()

    workdir = tempfile.mkdtemp(prefix="e16-flow-")
    try:
        run(a.therapist, a.other, a.base, a.prefix, workdir, a.run_tag)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    print()
    if failures:
        print(f"RESULT: FAIL ({len(failures)} assertion(s))")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("RESULT: PASS — every assertion held")
    return 0


if __name__ == "__main__":
    sys.exit(main())
