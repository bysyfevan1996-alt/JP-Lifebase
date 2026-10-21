import datetime
import os
from pathlib import Path
import shutil
import subprocess
import urllib.request

with urllib.request.urlopen('http://127.0.0.1:8797/api/health', timeout=5) as response:
    if response.status != 200:
        raise RuntimeError('Application is not healthy')
config = Path('/etc/cloudflared/config.yml')
original = config.read_text()
hosts = ('jp-lifebase.com', 'www.jp-lifebase.com')
missing = [host for host in hosts if ('hostname: ' + host + '\n') not in original]
if not missing:
    print('Japan Life Base tunnel routes already exist.')
    raise SystemExit(0)
catchall = '  - service: http_status:404'
if original.count(catchall) != 1:
    raise RuntimeError('Unexpected tunnel configuration; no changes applied')
directory = Path('/var/backups/jplifebase')
directory.mkdir(parents=True, exist_ok=True, mode=0o700)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = directory / ('cloudflared-before-' + stamp + '.yml')
shutil.copy2(config, backup)
backup.chmod(0o600)
lines = ''.join('  - hostname: ' + host + '\n    service: http://127.0.0.1:8797\n' for host in missing)
temporary = config.with_suffix('.jplifebase.yml')
temporary.write_text(original.replace(catchall, lines + catchall))
temporary.chmod(0o600)
subprocess.run(['cloudflared', '--config', str(temporary), 'tunnel', 'ingress', 'validate'], check=True)
temporary.replace(config)
try:
    subprocess.run(['systemctl', 'restart', 'cloudflared'], check=True)
except Exception:
    shutil.copy2(backup, config)
    subprocess.run(['systemctl', 'restart', 'cloudflared'], check=True)
    raise
print('Added only Japan Life Base hostnames; previous tunnel config backed up.')
