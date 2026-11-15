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
python3 ops/vps/release_manifest.py create "$out" "${CAMPUS_SECURITY_DIR:?complete security reports required}"
(cd "$out" && sha256sum runtime.tar.gz tools.tar.gz database.tar.gz config.tar release.json > SHA256SUMS)
echo 'PASS unsigned release artifact ready; owner must verify CI/source and sign on trusted workstation'
