"""Deploy a verified immutable release; never restore a database automatically."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request

NODE = '/opt/whyfshenlab/node/bin/node'
RUNUSER = '/usr/sbin/runuser'
REQUIRED = {'server.mjs','schema.mjs','migrations.mjs','migration-v2.mjs','migration-v3.mjs','community-content.mjs','content-translation.mjs','content-translation-text.mjs','dist/markdown-core.js','community-policy.mjs','audit-cursor.mjs','release.mjs','topic-state.mjs','sitemap.mjs','auth.mjs','mailer.mjs','avatar.mjs','community-admin.mjs','topic-posting.mjs','topic-attachments.mjs','topic-image.mjs','translation.mjs','package.json','denki/data.mjs','denki/engine.mjs','denki/store.mjs','denki/model.mjs','dist/index.html','dist/denki.html','dist/responsive.css','dist/admin.html','dist/admin.js','dist/composer.js','dist/preferences.js','dist/language-ui.js','ops/verify-migration.mjs','ops/backup.mjs','ops/jplifebase.service','ops/jplifebase-backup.service','ops/jplifebase-backup.timer'}
REQUIRED.update({'migration-v4.mjs','community-interactions.mjs','interaction-mentions.mjs','dist/m4-ui.js','dist/m4-i18n.js','dist/m4.css','dist/content-time.js','dist/reply-writing.js','dist/reply-writing.css','dist/reply-viewport.js'})
REQUIRED.update({'migration-v5.mjs','community-directory.mjs','community-profiles.mjs','community-insights.mjs','community-search.mjs','community-seo.mjs','dist/m5-ui.js','dist/m5-i18n.js','dist/m5.css','dist/m5-admin.js'})
REQUIRED.update({'search-text.mjs','dist/community-directory.js'})

def canonical(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()

def safe_path(name):
    value = name.removeprefix('./')
    path = PurePosixPath(value)
    if not value or path.is_absolute() or '\\' in value or any(part in ('.', '..') or part.startswith('.') for part in value.split('/')):
        raise RuntimeError('Unsafe release path')
    return value

def inspect_archive(archive):
    with tarfile.open(archive) as package:
        members = package.getmembers()
        entries = {}
        for member in members:
            if member.name in ('.', './') and member.isdir():
                continue
            name = safe_path(member.name.rstrip('/'))
            if name in entries or not (member.isdir() or member.isfile()):
                raise RuntimeError('Duplicate or unsupported release entry')
            entries[name] = member
        member = entries.get('release-manifest.json')
        if not member or not member.isfile() or member.size > 2000000:
            raise RuntimeError('Missing or oversized release manifest')
        manifest = json.load(package.extractfile(member))
        if manifest.get('format') != 1 or not re.fullmatch(r'\d{8}T\d{6}Z(?:-[a-z0-9-]+)?', manifest.get('releaseId', '')) or type(manifest.get('schemaVersion')) is not int or manifest['schemaVersion'] < 1:
            raise RuntimeError('Invalid release metadata')
        files = manifest.get('files')
        if not isinstance(files, list) or hashlib.sha256(canonical(files)).hexdigest() != manifest.get('sourceSha256'):
            raise RuntimeError('Invalid source manifest')
        declared = set()
        for item in files:
            name = safe_path(item['path'])
            if name in declared or not re.fullmatch('[0-9a-f]{64}', item.get('sha256','')):
                raise RuntimeError('Invalid file manifest')
            declared.add(name)
            if not (('/' not in name and (name.endswith('.mjs') or name in ('package.json', 'README.md'))) or name.split('/')[0] in ('dist','denki','ops')):
                raise RuntimeError('Unexpected release file')
            if re.search(r'(?:^|/)(?:data|artifacts|node_modules|\.git)(?:/|$)|\.(?:sqlite[^/]*|env|key)$', name):
                raise RuntimeError('Private file in release')
            entry = entries.get(name)
            if not entry or not entry.isfile():
                raise RuntimeError('Incomplete release')
            digest = hashlib.sha256()
            with package.extractfile(entry) as stream:
                while chunk := stream.read(1024 * 1024):
                    digest.update(chunk)
            if digest.hexdigest() != item['sha256']:
                raise RuntimeError('Release file checksum mismatch')
        actual = {name for name, entry in entries.items() if entry.isfile()}
        if not REQUIRED <= declared or actual != declared | {'release-manifest.json'}:
            raise RuntimeError('Incomplete or unlisted release files')
        pkg = json.load(package.extractfile(entries['package.json']))
        if pkg.get('version') != manifest.get('version'):
            raise RuntimeError('Package version mismatch')
        return manifest

def fetch_json(base, route):
    with urllib.request.urlopen(base + route, timeout=3) as response:
        return json.load(response)

def check_health(base, expected):
    health = fetch_json(base, '/api/health')
    for key in ('releaseId','sourceSha256','schemaVersion','version'):
        if health.get(key) != expected[key]:
            raise RuntimeError('Health version mismatch: ' + key)
    if health.get('ok') is not True or not health.get('datasetVersion'):
        raise RuntimeError('Incomplete health response')
    if fetch_json(base, '/api/session').get('user') is not None:
        raise RuntimeError('Anonymous session boundary failed')
    if not isinstance(fetch_json(base, '/api/topics?lang=original').get('topics'), list):
        raise RuntimeError('Topic read check failed')
    try:
        fetch_json(base, '/api/admin/overview')
        raise RuntimeError('Anonymous admin boundary failed')
    except urllib.error.HTTPError as error:
        if error.code != 401:
            raise
    catalog = fetch_json(base, '/api/denki/catalog')
    if not catalog.get('months') or catalog.get('version') != health['datasetVersion']:
        raise RuntimeError('Electricity catalog check failed')
    return health

def compatible_recovery(old, schema_version):
    if not old:
        return None
    try:
        metadata = json.loads((old / 'release-manifest.json').read_text())
        if metadata['schemaVersion'] == schema_version:
            return metadata
    except (OSError, ValueError, KeyError):
        pass
    return None

def switch_link(base, release, name):
    temporary = base / name
    temporary.symlink_to(release, target_is_directory=True)
    temporary.replace(base / 'current')

def activate_release(base,release,old,manifest):
    release_id = manifest['releaseId']
    recovery = compatible_recovery(old,manifest['schemaVersion'])
    switch_link(base,release,'current-'+release_id)
    healthy = False
    try:
        subprocess.run(['systemctl','restart','jplifebase.service'],check=True)
        for _ in range(15):
            try:
                check_health('http://127.0.0.1:8797',manifest)
                healthy = True
                break
            except Exception:
                time.sleep(1)
    except subprocess.CalledProcessError:
        pass  # Restart failures use the same compatibility gate as failed health.
    if not healthy:
        if recovery:
            switch_link(base,old,'recovery-'+release_id)
            subprocess.run(['systemctl','restart','jplifebase.service'],check=True)
            check_health('http://127.0.0.1:8797',recovery)
            raise RuntimeError('Candidate failed; a schema-compatible code release was restored; database retained')
        raise RuntimeError('Candidate failed; unknown/incompatible old code was NOT restored. Database retained; forward repair required')

def deploy(archive):
    import pwd
    manifest = inspect_archive(archive)
    release_id = manifest['releaseId']
    base = Path('/srv/jplifebase')
    data = Path('/var/lib/jplifebase')
    if not Path('/etc/jplifebase/app.env').is_file() or not (data / 'community.sqlite').is_file():
        raise RuntimeError('This updater requires the existing project configuration and database')
    user = pwd.getpwnam('jplifebase')
    old = (base / 'current').resolve(strict=True)
    release = base / 'releases' / release_id
    release.mkdir(parents=True, exist_ok=False)
    with tarfile.open(archive) as package:
        package.extractall(release, filter='data')
    for item in [release, *release.rglob('*')]:
        item.chmod(0o755 if item.is_dir() else 0o644)
    # Verified online backup, then validate a private COPY under the service identity.
    subprocess.run(['systemctl','start','jplifebase-backup.service'], check=True)
    snapshots = sorted(Path('/var/backups/jplifebase').glob('*.sqlite'), key=lambda file: file.stat().st_mtime)
    if not snapshots:
        raise RuntimeError('No pre-release backup')
    validation = data / 'upgrade-validation'
    validation.mkdir(mode=0o700, exist_ok=True)
    os.chown(validation, user.pw_uid, user.pw_gid)
    source = validation / (release_id + '-source.sqlite')
    shutil.copyfile(snapshots[-1], source)
    os.chown(source, user.pw_uid, user.pw_gid)
    source.chmod(0o600)
    work = validation / release_id
    subprocess.run([RUNUSER,'-u','jplifebase','--',NODE,'--max-old-space-size=192',str(release / 'ops/verify-migration.mjs'),str(source),str(work)], check=True)
    # Shadow service cannot send email/translation; no production credential is passed.
    environment = {'PATH':'/usr/bin:/bin','NODE_ENV':'production','PORT':'0','COOKIE_SECURE':'0','JPL_DATA_DIR':str(work),'JPL_SEED':'0','AUTH_TOKEN_SECRET':'isolated-upgrade-validation-only-000000000000','NODE_OPTIONS':'--max-old-space-size=192'}
    # The verified migrated backup is named separately; service opens this copy.
    shutil.copyfile(work / 'migrated.sqlite', work / 'community.sqlite')
    os.chown(work / 'community.sqlite',user.pw_uid,user.pw_gid)
    log = work / 'shadow.log'
    with log.open('w') as output:
        process = subprocess.Popen([RUNUSER,'-u','jplifebase','--',NODE,str(release / 'server.mjs')],cwd=release,env=environment,stdout=output,stderr=output)
        try:
            for _ in range(30):
                match = re.search(r'http://127\.0\.0\.1:\d+', log.read_text())
                if match:
                    check_health(match[0],manifest)
                    break
                if process.poll() is not None:
                    raise RuntimeError('Isolated candidate exited; inspect private shadow log')
                time.sleep(0.3)
            else:
                raise RuntimeError('Isolated candidate did not become ready')
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
    # Keep the working old service until every offline and shadow check has passed.
    activate_release(base,release,old,manifest)
    subprocess.run(['systemctl','start','jplifebase-backup.service'],check=True)
    print(json.dumps({'installed':release_id,'previous':old.name,'sourceSha256':manifest['sourceSha256'],'schemaVersion':manifest['schemaVersion'],'migrationReport':str(work / 'verification.json'),'healthy':True}))

if __name__ == '__main__':
    deploy(Path(sys.argv[1]).resolve())
