#!/bin/bash
# Local/CI artifact creation only. No registry push, signing key, SSH or deployment.
set -euo pipefail
umask 077
[[ $# == 1 && ! -e $1 ]] || { echo 'STOP new output directory required' >&2; exit 1; }
out=$1
mkdir -m 700 "$out"
docker image save campus24-runtime | gzip -n > "$out/runtime.tar.gz"
docker image save campus24-tools | gzip -n > "$out/tools.tar.gz"
docker image save campus24-db | gzip -n > "$out/database.tar.gz"
tar -cf "$out/config.tar" ops/vps
export CAMPUS_RELEASE_DIR="$out"
python3 - <<'PY'
import json, os, subprocess
from pathlib import Path
image = lambda name: json.loads(subprocess.check_output(['docker','image','inspect',name]))[0]['Id']
p=Path(os.environ['CAMPUS_RELEASE_DIR'])
(p/'release.json').write_text(json.dumps({'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'runtimeImage':image('campus24-runtime'),'toolsImage':image('campus24-tools'),'databaseImage':image('campus24-db'),'architecture':'linux/amd64'},indent=2)+'\n')
PY
(cd "$out" && sha256sum runtime.tar.gz tools.tar.gz database.tar.gz config.tar release.json > SHA256SUMS)
echo 'PASS unsigned release artifact ready; owner must verify CI/source and sign on trusted workstation'
