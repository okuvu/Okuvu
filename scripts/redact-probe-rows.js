#!/usr/bin/env node
/**
 * E16-S11 — redaction for the in-VPC DB probe's result rows.
 *
 * `scripts/in-vpc-db-task.sh --sql` prints the query's rows as JSON, and the
 * container's stdout lands in /ecs/evia-beta/api. Two events in the 14-day
 * baseline were exactly that: `RETURNING email, id, name, created_at` from the
 * therapist seed, i.e. a therapist's full name and address written into a log
 * group. The probe is a general SQL runner, so the fix cannot be "stop
 * selecting those columns" — it has to be "never print a personal value".
 *
 * Every string value is walked and:
 *   - a value under a personal-data column (email/mail/name/phone/mobile/
 *     address) is replaced wholesale by <redacted:column>;
 *   - any other string keeps its content with any embedded address replaced by
 *     <redacted:email> (free text fields can carry one);
 *   - ints, bools, dates and uuids are untouched — the internal id is what makes
 *     a probe result debuggable, and it is not itself personal data.
 *
 * The script is embedded into the probe task by in-vpc-db-task.sh (base64 in
 * the container command) and can be run directly on a JSON array of rows:
 *
 *     curl -s … | node scripts/redact-probe-rows.js
 *     echo '[{"email":"a@b.in","id":"…"}]' | node scripts/redact-probe-rows.js
 *
 * Exits 2 with a message when stdin is not JSON, so a broken probe is loud
 * rather than silently printing something unredacted.
 */

'use strict';

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// An international number as it actually appears in a row: a `+` country code
// followed by grouped digits, e.g. `+91 98765 43210` or `+91-98765-43210`. The
// digit-count guard (8..15, the ITU E.164 ceiling) rejects dates and timestamps,
// which can look similar but carry fewer digits and never a leading `+`.
const PHONE_INTL = /(?<![\w+])\+\d[\d \-().]{6,18}\d(?![\w])/g;
// A bare 10-digit Indian mobile, optionally prefixed 91.
const PHONE_BARE = /(?<![\w.+-])(?:91)?[6-9]\d{9}(?![\w.])/g;

// Column-name match. Anchored on word boundaries so `client_user_id` and
// `created_at` are left alone while `email`, `e_mail`, `full_name`,
// `phone_number`, `therapist_name` are all caught.
const PII_KEY = /(^|_)(e_?mail|name|full_name|first_name|last_name|phone|mobile|phone_number|address)($|_)/i;

function phoneDigits(value) {
  return value.replace(/\D/g, '').length;
}

function scrubString(value, key) {
  if (key && PII_KEY.test(key)) {
    return '<redacted:' + key + '>';
  }
  return value
    .replace(EMAIL, '<redacted:email>')
    .replace(PHONE_INTL, (m) => (phoneDigits(m) >= 8 && phoneDigits(m) <= 15 ? '<redacted:phone>' : m))
    .replace(PHONE_BARE, '<redacted:phone>');
}

function scrub(value, key) {
  if (typeof value === 'string') return scrubString(value, key);
  if (Array.isArray(value)) return value.map((item) => scrub(item, key));
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = scrub(value[k], k);
    return out;
  }
  return value;
}

module.exports = { scrub, scrubString, PII_KEY };

if (require.main === module) {
  const fs = require('node:fs');
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
    const parsed = JSON.parse(raw);
    process.stdout.write(JSON.stringify(scrub(parsed)) + '\n');
  } catch (err) {
    process.stderr.write('redact-probe-rows: stdin is not JSON: ' + err.message + '\n');
    process.exit(2);
  }
}
