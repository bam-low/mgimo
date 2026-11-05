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
    def docker(args):
        return json.loads(subprocess.check_output(['docker', '--host=unix:///var/run/docker.sock'] + args, env=env, stderr=subprocess.PIPE))
    compose = Path(__file__).resolve().with_name('compose.yaml')
    c = docker(['compose', '--profile', 'ops', '--env-file', sys.argv[1], '-f', str(compose), 'config', '--format', 'json'])
    s = c['services']
    assert set(s) == {'app', 'db', 'tools', 'cleanup'}
    assert set(c['networks']) == {'private', 'edge'} and c['networks']['private']['internal'] is True
    assert set(s['db']['networks']) == {'private'} and not s['db'].get('ports')
    assert s['db']['image'] == 'postgres:17-bookworm@sha256:839fbb5a4942a7758dd93e18b42ea5649807491a0545b5eeeb8f0b8bb11857a5'
    ports = s['app']['ports']
    assert len(ports) == 1 and ports[0]['host_ip'] == '127.0.0.1' and ports[0]['target'] == 3000
    assert {x['source'] for x in s['app']['secrets']} == {'runtime.env', 'db-ca.pem'}
    for name in ['app', 'tools', 'cleanup']:
        v = s[name]
        assert re.fullmatch(r'(sha256:[a-f0-9]{64}|[^\s]+@sha256:[a-f0-9]{64})', v['image'])
        image = docker(['image', 'inspect', v['image']])[0]
        assert image['Architecture'] == 'amd64' and image['Os'] == 'linux'
        i = image['Config']
        assert i['User'] == '1000:1000' and i['Labels']['io.campus.role'] == ('tools' if name == 'tools' else 'runtime')
        assert v['read_only'] and 'ALL' in v['cap_drop'] and 'no-new-privileges:true' in v['security_opt']
        assert v['mem_limit'] and v['pids_limit']
        if name != 'app':
            assert not v.get('ports')
    print('PASS host preflight: immutable images/roles, private DB, loopback, restricted runtime; NO DEPLOY')
except Exception:
    print('STOP host preflight failed; do not start app', file=sys.stderr)
    sys.exit(1)
