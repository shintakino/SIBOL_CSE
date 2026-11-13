#!/usr/bin/env python3
"""Install/update the independent CI gateway without printing credentials."""
import argparse
import os
import re
import shutil
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--token-file', type=Path)
args = parser.parse_args()
source = Path(__file__).resolve().parent
target = Path.home() / '.config' / 'sibol-deploy'
target.mkdir(parents=True, exist_ok=True, mode=0o700)
target.chmod(0o700)
env_file = target / '.env'
if args.token_file:
    token = args.token_file.read_text().strip()
    if not re.fullmatch(r'[A-Za-z0-9_+/=-]{40,}', token):
        raise SystemExit('Invalid tunnel token file')
    descriptor = os.open(env_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, 'w') as handle:
        handle.write('SIBOL_DEPLOY_TUNNEL_TOKEN=' + token + '\n')
if not env_file.exists():
    raise SystemExit('First install requires --token-file pointing to a private Cloudflare tunnel token')
env_file.chmod(0o600)
for original, name, mode in [('docker-compose.gateway.yml', 'compose.yml', 0o600), ('cloudflared-gateway.yml', 'cloudflared-gateway.yml', 0o644)]:
    shutil.copyfile(source / original, target / name)
    (target / name).chmod(mode)
subprocess.run(['docker', 'compose', '--project-directory', str(target), '--env-file', str(env_file), '-f', str(target / 'compose.yml'), 'up', '-d', '--wait'], check=True)
print('Independent deployment gateway installed; private configuration is outside the checkout.')
