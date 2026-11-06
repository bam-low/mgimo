#!/usr/bin/env python3
"""Host read-only preflight using Python/Docker, no Node or socket in containers."""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

try:
    if len(sys.argv) != 2:
        raise ValueError('release.env required')
    env = dict(os.environ)
    for key in ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']:
        env.pop(key, None)
    def require(value):
        if not value:
            raise ValueError('Unsafe release')
    def docker(args):
        return json.loads(subprocess.check_output(['docker', '--host=unix:///var/run/docker.sock'] + args, env=env, stderr=subprocess.PIPE))
    compose = Path(__file__).resolve().with_name('compose.yaml')
    c = docker(['compose', '--profile', 'ops', '--env-file', sys.argv[1], '-f', str(compose), 'config', '--format', 'json'])
    s = c['services']
    require(set(s) == {'app', 'db', 'tools', 'cleanup'})
    require(set(c['networks']) == {'private', 'edge'} and c['networks']['private']['internal'] is True)
    require(set(s['db']['networks']) == {'private'} and not s['db'].get('ports'))
    require(s['db']['user'] == '70:70')
    ports = s['app']['ports']
    require(len(ports) == 1 and ports[0]['host_ip'] == '127.0.0.1' and ports[0]['target'] == 3000)
    require({x['source'] for x in s['app']['secrets']} == {'runtime.env', 'db-ca.pem'})
    require({x['source'] for x in s['tools']['secrets']} == {'migration.env', 'runtime-db.env', 'db-ca.pem'})
    for name in ['app', 'tools', 'cleanup', 'db']:
        v = s[name]
        require(re.fullmatch(r'(sha256:[a-f0-9]{64}|[^\s]+@sha256:[a-f0-9]{64})', v['image']))
        image = docker(['image', 'inspect', v['image']])[0]
        require(image['Architecture'] == 'amd64' and image['Os'] == 'linux')
        i = image['Config']
        require(i['User'] == ('70:70' if name == 'db' else '1000:1000') and v['user'] == i['User'])
        require(i['Labels']['io.campus.role'] == ('database' if name == 'db' else 'tools' if name == 'tools' else 'runtime'))
        require(v['read_only'] and 'ALL' in v['cap_drop'] and 'no-new-privileges:true' in v['security_opt'])
        require(v['mem_limit'] and v['pids_limit'])
        if name != 'app':
            require(not v.get('ports'))
    print('PASS host preflight: immutable images/roles, private DB, loopback, restricted runtime; NO DEPLOY')
except Exception:
    print('STOP host preflight failed; do not start app', file=sys.stderr)
    sys.exit(1)
