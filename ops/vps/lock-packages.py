#!/usr/bin/env python3
"""Print exact candidates for owner review. Never installs packages or changes apt."""
import platform
import subprocess
from pathlib import Path

os = dict(line.split('=', 1) for line in Path('/etc/os-release').read_text().splitlines() if '=' in line)
if (os.get('ID', '').strip('"'), os.get('VERSION_ID', '').strip('"')) not in [('debian', '13'), ('ubuntu', '24.04')]:
    raise SystemExit('STOP unsupported OS')
if platform.machine() != 'x86_64':
    raise SystemExit('STOP images tested on amd64 only')
packages = ['nginx', 'certbot', 'openssh-server', 'sudo', 'ufw', 'fail2ban', 'unattended-upgrades', 'logrotate', 'systemd-timesyncd', 'age', 'openssl', 'ca-certificates', 'python3', 'docker-ce', 'docker-ce-cli', 'containerd.io', 'docker-buildx-plugin', 'docker-compose-plugin']
lines = []
for package in packages:
    output = subprocess.check_output(['apt-cache', 'policy', package], text=True)
    candidate = next((line.split(':', 1)[1].strip() for line in output.splitlines() if 'Candidate:' in line), '')
    if not candidate or candidate == '(none)':
        raise SystemExit(f'STOP no signed apt candidate for {package}; configure official repositories first')
    lines.append(f'{package}={candidate}')
print('\n'.join(lines))
