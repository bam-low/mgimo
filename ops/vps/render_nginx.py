#!/usr/bin/env python3
"""Render closed vhost only. No reload/deploy and no public-access switch."""
import argparse
import ipaddress
import re
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--domain', required=True)
p.add_argument('--output', required=True)
p.add_argument('--local-test', action='store_true')
a = p.parse_args()
domain = a.domain
if not re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?', domain):
    p.error('ASCII FQDN required')
try:
    ipaddress.ip_address(domain)
except ValueError:
    pass
else:
    p.error('trusted HTTPS on raw IP is not assumed')
if not a.local_test and '.' not in domain:
    p.error('owned FQDN required')
upstream = 'app:3000' if a.local_test else '127.0.0.1:3000'
host = f'{domain}:18443' if a.local_test else domain
certificate = '/etc/campus/test.crt' if a.local_test else f'/etc/letsencrypt/live/{domain}/fullchain.pem'
key = '/etc/campus/test.key' if a.local_test else f'/etc/letsencrypt/live/{domain}/privkey.pem'
proxy = 'resolver 127.0.0.11 valid=5s; set $campus_upstream http://app:3000; proxy_pass $campus_upstream;' if a.local_test else 'proxy_pass http://127.0.0.1:3000;'
text = f'''# Include at http scope. Generated CLOSED configuration; never disable auth automatically.
limit_req_zone $binary_remote_addr zone=campus_edge:10m rate=60r/s;
log_format campus_safe '$time_iso8601 $status $request_method';
server {{ listen 80 default_server; listen [::]:80 default_server; server_name _; access_log off; error_log /var/log/nginx/campus-error.log crit; return 444; }}
server {{ listen 443 ssl default_server; listen [::]:443 ssl default_server; server_name _; access_log off; error_log /var/log/nginx/campus-error.log crit; ssl_reject_handshake on; }}
server {{
 listen 80; listen [::]:80; server_name {domain};
 access_log off; error_log /var/log/nginx/campus-error.log crit;
 location ^~ /.well-known/acme-challenge/ {{ root /var/lib/letsencrypt; try_files $uri =404; }}
 location / {{ return 308 https://{domain}$request_uri; }}
}}
server {{
 listen 443 ssl; listen [::]:443 ssl; server_name {domain};
 ssl_certificate {certificate}; ssl_certificate_key {key};
 ssl_protocols TLSv1.2 TLSv1.3;
 server_tokens off;
 access_log /var/log/nginx/campus-access.log campus_safe;
 error_log /var/log/nginx/campus-error.log crit;
 client_max_body_size 16k;
 location / {{
  auth_basic "Campus private acceptance";
  auth_basic_user_file /etc/campus/htpasswd;
  limit_req zone=campus_edge burst=200 nodelay;
  limit_req_status 429;
  {proxy}
  proxy_http_version 1.1;
  proxy_set_header Host {host};
  proxy_set_header X-Forwarded-Host {host};
  proxy_set_header Forwarded "";
  proxy_set_header X-Campus-Client-IP $remote_addr;
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-Proto https;
  proxy_read_timeout 60s;
 }}
 # HSTS intentionally absent until real certificate/renewal/access verification.
}}
'''
# Keep the exact same closed ingress gates in the one larger upload location.
start = text.index(' location / {', text.index(' client_max_body_size 16k;'))
end = text.index('\n }', start) + len('\n }')
common = text[start:end]
upload = common.replace(' location / {', r' location ~ "^/api/staff/applications/[0-9a-fA-F-]{36}/documents$" {' + '\n  client_max_body_size 3136k;', 1)
text = text[:start] + upload + '\n' + text[start:]
with Path(a.output).open('x', encoding='utf-8') as f:
    f.write(text)
print('PASS closed Nginx configuration written; no reload/deploy performed')
