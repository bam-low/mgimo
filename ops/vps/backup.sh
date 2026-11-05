#!/bin/bash
set +x
set -euo pipefail
umask 077
cd /opt/campus/current
[[ -s /etc/campus/backup-recipients.txt ]] || exit 1
mkdir -p /var/backups/campus /srv/campus-backup-export
[[ $(df -Pk /var/backups/campus | awk 'NR==2 {print $4}') -gt 2097152 ]] || { logger -p daemon.err 'CAMPUS backup refused: low disk'; exit 1; }
tmp=$(mktemp /var/backups/campus/.partial.XXXXXXXX)
trap 'rm -f "$tmp"' EXIT
docker compose --env-file /etc/campus/release.env -f ops/vps/compose.yaml exec -T -u postgres db sh -c 'export PGPASSWORD="$(cat /run/secrets/pg-admin-pw)"; exec pg_dump -U campus_admin -d campus --format=custom --no-owner --no-acl' | age -R /etc/campus/backup-recipients.txt > "$tmp"
[[ -s $tmp ]] || exit 1
file=campus-$(date -u +%Y%m%dT%H%M%SZ).dump.age
mv "$tmp" "/var/backups/campus/$file"
install -g campus-backup -m 640 "/var/backups/campus/$file" "/srv/campus-backup-export/$file"
chmod 750 /srv/campus-backup-export
chown root:campus-backup /srv/campus-backup-export
find /var/backups/campus /srv/campus-backup-export -maxdepth 1 -type f -name 'campus-*.dump.age' -mmin +10080 -delete
logger 'CAMPUS encrypted backup completed; offsite transfer still required'
