#!/bin/bash
set +x
set -euo pipefail
cd /opt/campus/current
fail=0
[[ $(df -P / | awk 'NR==2 {gsub("%", "", $5); print $5}') -lt 80 ]] || fail=1
[[ $(df -Pi / | awk 'NR==2 {gsub("%", "", $5); print $5}') -lt 80 ]] || fail=1
[[ $(awk '/MemAvailable/ {print $2}' /proc/meminfo) -ge 524288 ]] || fail=1
[[ -n $(find /var/backups/campus -maxdepth 1 -type f -name 'campus-*.dump.age' -mmin -1800 -print -quit 2>/dev/null) ]] || fail=1
systemctl is-active --quiet nginx docker || fail=1
docker compose --env-file /etc/campus/release.env -f ops/vps/compose.yaml ps --format json | python3 -c 'import sys,json; s=sys.stdin.read(); a=json.loads(s) if s.lstrip().startswith("[") else [json.loads(x) for x in s.splitlines() if x]; assert {x["Service"] for x in a if x["State"]=="running" and x.get("Health")=="healthy"} >= {"db","app"}' || fail=1
if [[ $fail == 1 ]]; then mkdir -p /var/lib/campus; touch /var/lib/campus/ATTENTION; logger -p daemon.err 'CAMPUS ops check failed; owner attention required'; exit 1; fi
