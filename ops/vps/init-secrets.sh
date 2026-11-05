#!/bin/bash
# Owner-run on the hardened host, or inside an isolated local test container.
set +x
set -euo pipefail
umask 077
[[ $# == 3 && $1 == --owner-approved-init && $EUID == 0 ]] || { echo 'STOP explicit root init required' >&2; exit 1; }
out=$2
origin=$3
[[ $out == /* && ! -e $out && $origin =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]] || { echo 'STOP new private path and HTTPS origin required' >&2; exit 1; }
mkdir -m 700 "$out"
admin=$(openssl rand -hex 32); migrator=$(openssl rand -hex 32); runtime=$(openssl rand -hex 32)
auth=$(openssl rand -hex 32); cron=$(openssl rand -hex 32); gate=$(openssl rand -hex 32)
staff=$(openssl rand -hex 32); student1=$(openssl rand -hex 32); student2=$(openssl rand -hex 32)
printf '%s\n' "$admin" > "$out/pg-admin-pw"
printf '%s\n' "$cron" > "$out/cron"
printf '%s\n' "$gate" > "$out/gateway-password"
printf 'owner:%s\n' "$(printf '%s' "$gate" | openssl passwd -6 -stdin)" > "$out/htpasswd"
openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 1095 -subj /CN=Campus-Private-DB-CA -keyout "$out/db-ca.key" -out "$out/db-ca.pem" >/dev/null 2>&1
openssl req -new -newkey rsa:2048 -nodes -subj /CN=db -keyout "$out/db-server.key" -out "$out/db.csr" >/dev/null 2>&1
printf 'subjectAltName=DNS:db\nextendedKeyUsage=serverAuth\n' > "$out/db.ext"
openssl x509 -req -sha256 -days 365 -in "$out/db.csr" -CA "$out/db-ca.pem" -CAkey "$out/db-ca.key" -CAcreateserial -extfile "$out/db.ext" -out "$out/db-server.crt" >/dev/null 2>&1
rm "$out/db.csr" "$out/db.ext"
suffix='?sslmode=verify-full&sslrootcert=/run/secrets/db-ca.pem'
printf 'ADMIN_DATABASE_URL=postgresql://campus_admin:%s@db:5432/campus%s\nMIGRATOR_PASSWORD=%s\nRUNTIME_PASSWORD=%s\n' "$admin" "$suffix" "$migrator" "$runtime" > "$out/bootstrap.env"
printf 'DATABASE_URL=postgresql://campus_migrator:%s@db:5432/campus%s\nDIRECT_DATABASE_URL=postgresql://campus_migrator:%s@db:5432/campus%s\nALLOW_DEMO_SEED=yes\nDEMO_STAFF_PASSWORD=%s\nDEMO_STUDENT1_PASSWORD=%s\nDEMO_STUDENT2_PASSWORD=%s\n' "$migrator" "$suffix" "$migrator" "$suffix" "$staff" "$student1" "$student2" > "$out/migration.env"
printf 'DATABASE_URL=postgresql://campus_runtime:%s@db:5432/campus%s\nBETTER_AUTH_SECRET=%s\nCRON_SECRET=%s\nBETTER_AUTH_URL=%s\nAUTH_TRUSTED_IP_HEADER=x-campus-client-ip\n' "$runtime" "$suffix" "$auth" "$cron" "$origin" > "$out/runtime.env"
chown root:999 "$out/pg-admin-pw" "$out/db-server.key"
chmod 640 "$out/pg-admin-pw" "$out/db-server.key"
chown root:1000 "$out/bootstrap.env" "$out/migration.env" "$out/runtime.env" "$out/cron"
chmod 640 "$out/bootstrap.env" "$out/migration.env" "$out/runtime.env" "$out/cron"
chmod 644 "$out/db-ca.pem" "$out/db-server.crt"
# Host Nginx worker must read htpasswd; owner sets www-data group after installation.
echo 'PASS private secrets and DB TLS initialized; no values printed. Existing files never overwritten.'
