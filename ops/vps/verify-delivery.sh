#!/bin/bash
# Verify only. No image load, container start, SSH or deployment.
set -euo pipefail
[[ $# == 2 && -f $1 && -d $2 ]] || { echo 'STOP pinned allowed_signers path and release directory required' >&2; exit 1; }
signers=$(realpath "$1")
cd "$2"
ssh-keygen -Y verify -f "$signers" -I campus-release-owner -n campus-vps-release -s SHA256SUMS.sig < SHA256SUMS
python3 - <<'PY'
import re
from pathlib import Path
rows=Path('SHA256SUMS').read_text().splitlines()
expected={'runtime.tar.gz','tools.tar.gz','config.tar','release.json'}
if len(rows)!=4 or any(not re.fullmatch(r'[a-f0-9]{64}  [a-z.]+',x) for x in rows) or {x[66:] for x in rows}!=expected:
    raise SystemExit('STOP unexpected manifest')
PY
sha256sum --check --strict SHA256SUMS
echo 'PASS owner signature and file integrity; loading/deploy still requires separate approval'
