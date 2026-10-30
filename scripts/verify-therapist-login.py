#!/usr/bin/env python3
"""Prove a therapist can actually sign in to the live portal, without a browser.

Story E16-S3. Walks the exact chain a browser walks, with curl and a cookie
jar, and prints every hop:

    1. GET  /api/auth/csrf                      (NextAuth CSRF token)
    2. POST /api/auth/signin/cognito            (-> Cognito /oauth2/authorize)
    3. GET  /oauth2/authorize                   (302 to the hosted UI /login)
    4. GET  /login                              (scrape _csrf + form action)
    5. POST /login   username + password        (302 back with ?code=...)
    6. GET  /api/auth/callback/cognito?code=... (code exchange, client secret)
    7. GET  /dashboard                          (must be 200, not /auth)
    8. GET  /api/auth/session                   (who the portal thinks you are)
    9. GET  /api/trpc/clients.list              (session accepted by the API)

The password is read from SSM (/<prefix>/<slug>/password) and never printed,
logged, committed, or passed on a command line. Output is metadata only.

Usage:
    AWS_REGION=ap-south-1 python3 scripts/verify-therapist-login.py ananya.rao@okuvu.in
    AWS_REGION=ap-south-1 python3 scripts/verify-therapist-login.py --all
    ... --base https://okuvu.in --prefix /evia-beta/therapists

Exit code 0 only when every requested email reaches a 200 dashboard with a
session bound to that email.
"""

import argparse
import html as htmlmod
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

SEED_EMAILS = [
    "ananya.rao@okuvu.in",
    "priya.nair@okuvu.in",
    "rohan.mehta@okuvu.in",
]

HOSTED_UI = "https://okuvu-therapists.auth.ap-south-1.amazoncognito.com"


def ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def say(msg: str) -> None:
    print(f"[{ts()}] {msg}", flush=True)


class Session:
    """One browser's worth of state: a cookie jar file plus curl wrappers."""

    def __init__(self, jar: str):
        self.jar = jar

    def _run(self, extra, dash=True):
        args = ["curl", "-sS", "-b", self.jar, "-c", self.jar]
        if dash:
            args += ["-D", "-", "-o", "/dev/null"]
        p = subprocess.run(args + extra, capture_output=True, text=True)
        if p.returncode != 0:
            raise SystemExit(f"curl failed: {p.stderr.strip()}")
        return p.stdout

    def headers(self, extra):
        return self._run(extra, dash=True)

    def body(self, extra):
        return self._run(extra, dash=False)

    @staticmethod
    def header(block: str, name: str):
        m = re.search(r"^" + re.escape(name) + r":\s*(.+?)\s*$", block, re.M | re.I)
        return m.group(1) if m else None


def password_for(email: str, prefix: str) -> str:
    slug = email.split("@")[0]
    name = f"{prefix}/{slug}/password"
    p = subprocess.run(
        ["aws", "ssm", "get-parameter", "--name", name, "--with-decryption",
         "--query", "Parameter.Value", "--output", "text"],
        capture_output=True, text=True,
    )
    if p.returncode != 0:
        raise SystemExit(f"SSM read failed for {name}: {p.stderr.strip()}")
    return p.stdout.strip()


def sign_in(email: str, base: str, prefix: str, workdir: str) -> str | None:
    """Hops 1-6 of the browser chain, and only those hops.

    NextAuth csrf -> POST /api/auth/signin/cognito -> /oauth2/authorize ->
    hosted UI /login -> authorization code -> /api/auth/callback/cognito.
    Returns the cookie-jar path on success, None on any failure.

    Factored out of verify() so other scripts can sign a therapist in and then
    act as that therapist (scripts/verify-conversation-flow.py does requestChatAccess
    and reads the transcript as them). Two copies of six auth hops is exactly
    the kind of duplication that drifts the moment the hosted UI changes.
    """
    password = password_for(email, prefix)
    masked = f"{password[:2]}**{password[-2:]}" if len(password) > 5 else "****"
    say(f"=== {email} (password from SSM, masked {masked}, len {len(password)}) ===")

    jar = os.path.join(workdir, f"{email.split('@')[0]}.cookies")
    if os.path.exists(jar):
        os.unlink(jar)
    s = Session(jar)

    def grab(pattern: str, text: str, what: str) -> str:
        hit = re.search(pattern, text)
        if not hit:
            say(f"   FAIL: could not read {what}")
            raise SystemExit(2)
        return hit.group(1)

    csrf = grab(r'"csrfToken":"([^"]+)"', s.body([f"{base}/api/auth/csrf"]), "NextAuth csrfToken")
    say(f"1. csrfToken={csrf[:12]}… ({len(csrf)} chars)")

    signin = s.body(["-X", "POST", f"{base}/api/auth/signin/cognito",
                     "--data-urlencode", f"csrfToken={csrf}",
                     "--data-urlencode", f"callbackUrl={base}/dashboard",
                     "--data-urlencode", "json=true",
                     "-H", "Content-Type: application/x-www-form-urlencoded"])
    authz = grab(r'"url":"([^"]+)"', signin, "authorize URL").replace("\\u0026", "&")
    say(f"2. authorize -> {authz}")

    h = s.headers([authz])
    say(f"3. {h.splitlines()[0]} -> {Session.header(h, 'location')}")
    if not Session.header(h, "location"):
        say("   FAIL: authorize did not redirect to the hosted UI")
        return False

    page = s.body(["-L", authz])
    m = re.search(r'name="_csrf"\s+value="([^"]+)"', page) or re.search(
        r'value="([^"]+)"\s+name="_csrf"', page)
    fa = re.search(r'<form[^>]*action="([^"]+)"', page)
    if not m or not fa:
        say(f"   FAIL: hosted login page unparseable ({len(page)} bytes)")
        return False
    ui_csrf = htmlmod.unescape(m.group(1))
    form_action = HOSTED_UI + htmlmod.unescape(fa.group(1))
    say(f"4. hosted /login {len(page)} bytes, _csrf={ui_csrf[:8]}…, action={form_action.split('?')[0]}")

    # The form action carries client_id/redirect_uri/state; posting to bare
    # /login gets "Internal server error" from the hosted UI.
    h = s.headers(["-X", "POST", form_action,
                   "--data-urlencode", f"_csrf={ui_csrf}",
                   "--data-urlencode", f"username={email}",
                   "--data-urlencode", f"password={password}",
                   "--data-urlencode", "cognitoAsfData=",
                   "-H", "Content-Type: application/x-www-form-urlencoded",
                   "-H", f"Referer: {HOSTED_UI}/login"])
    loc = Session.header(h, "location")
    say(f"5. {h.splitlines()[0]} -> {loc}")
    if not loc or "code=" not in loc:
        say("   FAIL: no authorization code (wrong password, or hosted-UI error)")
        return False
    code = grab(r"[?&]code=([^&]+)", loc, "authorization code")
    state = grab(r"state=([^&]+)", loc, "state")
    say(f"   code={code[:8]}… ({len(code)} chars), state={state[:8]}…")

    h = s.headers([loc])
    loc2 = Session.header(h, "location")
    say(f"6. {h.splitlines()[0]} -> {loc2}")
    if loc2 and "error" in loc2:
        say(f"   FAIL: NextAuth refused the sign-in: {loc2}")
        return False


    return jar


def verify(email: str, base: str, prefix: str, workdir: str) -> bool:
    jar = sign_in(email, base, prefix, workdir)
    if jar is None:
        return False
    s = Session(jar)

    out = subprocess.run(
        ["curl", "-sS", "-b", jar, "-c", jar, "-D", f"{workdir}/dash.hdr",
         "-o", f"{workdir}/dash.html", "-w", "%{http_code}", f"{base}/dashboard"],
        capture_output=True, text=True).stdout
    dash_status = out.strip()
    dash_headers = open(f"{workdir}/dash.hdr").read()
    say(f"7. GET /dashboard -> {dash_status} location={Session.header(dash_headers, 'location')}")
    plain = re.sub(r"<script.*?</script>", " ", open(f"{workdir}/dash.html").read(), flags=re.S)
    plain = htmlmod.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", plain))).strip()
    say(f"   body: {plain[:200]}")
    ok_dash = dash_status == "200"

    sess = s.body([f"{base}/api/auth/session"])
    say(f"8. session = {sess}")
    ok_session = email in sess

    trpc = subprocess.run(
        ["curl", "-sS", "-b", jar, "-w", " [HTTP %{http_code}]", "-G",
         f"{base}/api/trpc/clients.list",
         "--data-urlencode", "batch=1",
         "--data-urlencode", 'input={"0":{"json":null}}'],
        capture_output=True, text=True).stdout
    say(f"9. clients.list = {trpc[:200]}")

    ok = ok_dash and ok_session
    say(f"RESULT {email}: {'PASS' if ok else 'FAIL'} (dashboard {dash_status}, session bound to email: {ok_session})")
    return ok


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("emails", nargs="*")
    ap.add_argument("--all", action="store_true", help="verify the three seed therapists")
    ap.add_argument("--base", default="https://okuvu.in")
    ap.add_argument("--prefix", default="/evia-beta/therapists")
    a = ap.parse_args()

    emails = a.emails or (SEED_EMAILS if a.all else [])
    if not emails:
        ap.error("pass at least one email, or --all")

    workdir = tempfile.mkdtemp(prefix="e16s3-")
    try:
        results = {e: verify(e, a.base, a.prefix, workdir) for e in emails}
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
    print()
    for e, ok in results.items():
        print(f"  {e:<24} {'PASS' if ok else 'FAIL'}")
    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
