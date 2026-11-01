"""Extract the api's safety copy verbatim, for evidence/E17-S11.md.

The Flutter tests in apps/mobile/test/support/safety_copy.dart assert on the
strings the api actually serves. This script is how that Dart file was produced:
it reads them out of the TypeScript source rather than anyone retyping them.

    python3 evidence/E17-S11-extract-copy.py

Prints `<CONSTANT> <length>` per constant and writes the JSON to
$TMPDIR/e17s11_copy.json (input for the Dart fixture generator).
"""

import json
import pathlib
import re
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
FALLBACKS = ROOT / 'apps/api/src/pipeline/fallbacks.ts'
CANNED = ROOT / 'apps/api/src/lib/canned-response.ts'

NAMES = [
    'A8_S3_GROUNDING_RESPONSE',
    'CRISIS_RESPONSE',
    'MEDICAL_EMERGENCY_RESPONSE',
    'MEDICAL_EMERGENCY_CRISIS_RESPONSE',
    'SAFETY_UNAVAILABLE_RESPONSE',
    'MODEL_UNAVAILABLE_RESPONSE',
    'BUDGET_PAUSED_RESPONSE',
]


def unescape(s: str) -> str:
    return s.replace('\\n', '\n').replace('\\"', '"').replace('\\`', '`')


def main() -> None:
    src = FALLBACKS.read_text().split('\n')
    out = {}
    for name in NAMES:
        start = next(
            i for i, line in enumerate(src) if line.startswith('export const ' + name + ' =')
        )
        buf, i = [], start
        while i < len(src):
            line = src[i]
            if i > start and (line.startswith('//') or line.startswith('export ')):
                break
            buf.append(line)
            joined = '\n'.join(buf)
            if joined.rstrip().endswith(';') or ('`' in joined and joined.count('`') % 2 == 0):
                break
            i += 1
        expr = '\n'.join(buf).split('=', 1)[1].strip().rstrip(';').strip()
        template = re.fullmatch(r'`(.*)`', expr, re.S)
        if template:
            out[name] = unescape(template.group(1))
        else:
            out[name] = ''.join(
                unescape(p) for p in re.findall(r'"((?:[^"\\]|\\.)*)"', expr)
            )

    safe_fallback = re.search(
        r'export const SAFE_FALLBACK\s*=\s*"(.*?)"', CANNED.read_text()
    )
    assert safe_fallback is not None, 'SAFE_FALLBACK not found in canned-response.ts'
    out['SAFE_FALLBACK'] = safe_fallback.group(1)

    for name, value in out.items():
        print(name, len(value))

    dest = pathlib.Path(tempfile.gettempdir()) / 'e17s11_copy.json'
    dest.write_text(json.dumps(out, indent=1))
    print('wrote ' + str(dest))


if __name__ == '__main__':
    main()
