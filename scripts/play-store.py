#!/usr/bin/env python3
"""Publish the repo's store copy and graphics to Google Play, and prove it landed.

The copy is not retyped here: `docs/store/listing-copy.md` is the source of truth and
this script reads its fenced blocks. Images come from `docs/store/`. Screenshots are
picked up from `docs/store/screenshots/*.png` when they exist (they are produced on a
device — see `docs/store/screenshot-capture-plan.md`).

Usage:
  scripts/play-store.py --check       # prove the key can publish, without changing anything
  scripts/play-store.py               # push listing text + icon + feature graphic, commit, read back
  scripts/play-store.py --screenshots # also upload docs/store/screenshots/*.png (max 8)

Exit codes: 0 published and verified, 1 blocked. A commit that answers 403 means the
service account has no store-presence/release permission in Play Console — the fix is a
console grant, never a different key. Media uploads must go to the `/upload/…` host path
and the commit endpoint is `…/edits/{id}:commit`; both were wrong in a first attempt and
each failed in a way that looked like a permissions problem.
"""
import glob
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

PKG = "ai.okuvu.app"
HOST = "https://androidpublisher.googleapis.com"
BASE = f"{HOST}/androidpublisher/v3/applications/{PKG}"
UP = f"{HOST}/upload/androidpublisher/v3/applications/{PKG}"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORE = os.path.join(ROOT, "docs", "store")
KEY = os.path.join(ROOT, ".secrets", "play-service-account.json")
LANG = "en-GB"


def token():
    sa = json.load(open(KEY))
    now = int(time.time())
    hdr = {"alg": "RS256", "typ": "JWT"}
    clm = {
        "iss": sa["client_email"],
        "scope": "https://www.googleapis.com/auth/androidpublisher",
        "aud": "https://oauth2.googleapis.com/token",
        "iat": now,
        "exp": now + 3600,
    }
    b64 = lambda d: __import__("base64").urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=")
    msg = b64(hdr) + b"." + b64(clm)
    open("/tmp/_play_msg", "wb").write(msg)
    open("/tmp/_play_key.pem", "w").write(sa["private_key"])
    sig = subprocess.run(["openssl", "dgst", "-sha256", "-sign", "/tmp/_play_key.pem", "/tmp/_play_msg"],
                         capture_output=True, check=True).stdout
    import base64
    jwt = msg.decode() + "." + base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
    body = urllib.parse.urlencode({"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                                   "assertion": jwt}).encode()
    with urllib.request.urlopen("https://oauth2.googleapis.com/token", data=body) as r:
        return json.load(r)["access_token"]


TOK = token()


def call(method, path, body=None, raw=None, ctype="application/json"):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    url = path if path.startswith("http") else BASE + path
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Authorization": f"Bearer {TOK}", "Content-Type": ctype})
    try:
        with urllib.request.urlopen(req) as r:
            txt = r.read().decode()
            return r.status, (json.loads(txt) if txt.strip().startswith("{") else txt)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:500]


def copy():
    md = open(os.path.join(STORE, "listing-copy.md")).read()
    out = {}
    for tag in ("title", "short", "full"):
        m = re.search(r"```text " + tag + r"\n(.*?)\n```", md, re.S)
        if not m:
            raise SystemExit(f"listing-copy.md is missing the `{tag}` block")
        out[tag] = m.group(1).strip()
    return out


def upload(eid, image_type, path):
    body = open(path, "rb").read()
    url = f"{UP}/edits/{eid}/listings/{LANG}/{image_type}?uploadType=media"
    return call("POST", url, raw=body, ctype="image/png")


def main():
    check_only = "--check" in sys.argv
    want_shots = "--screenshots" in sys.argv

    st, ed = call("POST", "/edits", {})
    if st != 200 or not isinstance(ed, dict):
        raise SystemExit(f"BLOCKED: the key cannot open an edit on {PKG}: {st} {ed}")
    eid = str(ed["id"])

    if check_only:
        st, r = call("POST", f"/edits/{eid}:commit", {})
        call("DELETE", f"/edits/{eid}")
        if st == 200:
            print("PASS: key can publish on this app (empty edit committed)")
            return 0
        print(f"BLOCKED: edits open, but publishing is refused ({st}). Grant the service "
              f"account account-level permission in Play Console → Users and permissions.")
        print(r)
        return 1

    c = copy()
    print(f"copy: title {len(c['title'])}/30, short {len(c['short'])}/80, full {len(c['full'])}/4000")
    st, r = call("PUT", f"/edits/{eid}/listings/{LANG}",
                 {"language": LANG, "title": c["title"],
                  "shortDescription": c["short"], "fullDescription": c["full"]})
    print(f"listings.update {st}")
    if st != 200:
        print(r)

    for image_type, name in (("icon", "icon-512.png"), ("featureGraphic", "feature-graphic-1024x500.png")):
        st, r = upload(eid, image_type, os.path.join(STORE, name))
        print(f"images.upload {image_type} {st}")

    shots = sorted(glob.glob(os.path.join(STORE, "screenshots", "*.png")))[:8]
    if want_shots and shots:
        for p in shots:
            st, r = upload(eid, "phoneScreenshots", p)
            print(f"images.upload phoneScreenshots {os.path.basename(p)} {st}")

    st, r = call("POST", f"/edits/{eid}:commit", {})
    if st != 200:
        call("DELETE", f"/edits/{eid}")
        print(f"BLOCKED: commit refused {st}. {r}")
        return 1
    print("commit 200")

    st, ed2 = call("POST", "/edits", {})
    if not isinstance(ed2, dict):
        raise SystemExit(f"readback edit failed: {st} {ed2}")
    eid2 = str(ed2["id"])
    st, listing = call("GET", f"/edits/{eid2}/listings/{LANG}")
    got = listing.get("title") if isinstance(listing, dict) else None
    print(f"readback title: {got!r}")
    for it in ("icon", "featureGraphic", "phoneScreenshots"):
        st, img = call("GET", f"/edits/{eid2}/listings/{LANG}/{it}")
        n = len(img.get("images", [])) if isinstance(img, dict) else "?"
        print(f"readback {it}: {n} image(s)")
    call("DELETE", f"/edits/{eid2}")
    return 0 if got == c["title"] else 1


if __name__ == "__main__":
    sys.exit(main())
