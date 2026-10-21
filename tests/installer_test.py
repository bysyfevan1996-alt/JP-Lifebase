"""Isolated archive/health tests; imports never deploy or access a database."""
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import subprocess
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location('installer', Path(__file__).resolve().parents[1] / 'ops/install-vps.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)

class InstallerTests(unittest.TestCase):
    def make_archive(self, target, entries):
        with tarfile.open(target, 'w:gz') as package:
            for name, data in entries:
                entry = tarfile.TarInfo(name)
                entry.size = len(data)
                package.addfile(entry,io.BytesIO(data))

    def test_archive_verifies_required_files_checksums_and_extra_entries(self):
        payload = {name:b'fixture' for name in installer.REQUIRED}
        payload['package.json'] = b'{"version":"0.1.1"}'
        files = [{'path':name,'sha256':installer.hashlib.sha256(data).hexdigest()} for name,data in sorted(payload.items())]
        manifest = {'format':1,'releaseId':'20261021T080000Z-m0','version':'0.1.1','schemaVersion':1,'files':files,'sourceSha256':installer.hashlib.sha256(installer.canonical(files)).hexdigest()}
        entries = list(payload.items())+[('release-manifest.json',installer.canonical(manifest))]
        with tempfile.TemporaryDirectory() as directory:
            archive=Path(directory)/'release.tar.gz'
            self.make_archive(archive,entries)
            self.assertEqual(installer.inspect_archive(archive),manifest)
            for bad in [entries+[('../escape',b'bad')],entries+[('extra.txt',b'bad')],entries+[('server.mjs',b'duplicate')],[(name,b'changed' if name=='server.mjs' else data) for name,data in entries],[(name,data) for name,data in entries if name!='schema.mjs']]:
                self.make_archive(archive,bad)
                with self.assertRaises(RuntimeError):
                    installer.inspect_archive(archive)

    def test_health_checks_candidate_identity_and_admin_boundary(self):
        manifest={'releaseId':'test','sourceSha256':'checksum','schemaVersion':1,'version':'0.1.1'}
        responses={'/api/health':{**manifest,'ok':True,'datasetVersion':'dataset'},'/api/session':{'user':None},'/api/topics?lang=original':{'topics':[]},'/api/denki/catalog':{'version':'dataset','months':['2026-10']}}
        def fetch(base, route):
            if route=='/api/admin/overview':
                raise urllib.error.HTTPError(base,401,'Unauthenticated',None,None)
            return responses[route]
        with patch.object(installer,'fetch_json',side_effect=fetch):
            self.assertTrue(installer.check_health('unused',manifest)['ok'])
            responses['/api/health']['releaseId']='wrong'
            with self.assertRaises(RuntimeError):
                installer.check_health('unused',manifest)

    def test_unknown_or_incompatible_rollback_is_not_selected(self):
        with tempfile.TemporaryDirectory() as directory:
            old=Path(directory)
            self.assertIsNone(installer.compatible_recovery(old,1))
            (old/'release-manifest.json').write_text('{"schemaVersion":2}')
            self.assertIsNone(installer.compatible_recovery(old,1))
            (old/'release-manifest.json').write_text('{"schemaVersion":1}')
            self.assertEqual(installer.compatible_recovery(old,1),{'schemaVersion':1})

    def test_restart_failure_recovers_only_known_compatible_code(self):
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory)
            old=base/'old'
            old.mkdir()
            candidate=base/'candidate'
            candidate.mkdir()
            metadata={'releaseId':'candidate','schemaVersion':1}
            recovery={'releaseId':'recovery','schemaVersion':1}
            (old/'release-manifest.json').write_text(json.dumps(recovery))
            with patch.object(installer,'switch_link') as switch,patch.object(installer.subprocess,'run',side_effect=[subprocess.CalledProcessError(1,'restart'),None]) as run,patch.object(installer,'check_health') as health:
                with self.assertRaisesRegex(RuntimeError,'schema-compatible code release was restored'):
                    installer.activate_release(base,candidate,old,metadata)
                self.assertEqual(run.call_count,2)
                self.assertEqual(switch.call_args_list[1].args[1],old)
                health.assert_called_once_with('http://127.0.0.1:8797',recovery)
            (old/'release-manifest.json').unlink()
            with patch.object(installer,'switch_link') as switch,patch.object(installer.subprocess,'run',side_effect=subprocess.CalledProcessError(1,'restart')) as run:
                with self.assertRaisesRegex(RuntimeError,'NOT restored'):
                    installer.activate_release(base,candidate,old,metadata)
                self.assertEqual(run.call_count,1)
                self.assertEqual(switch.call_count,1)

if __name__=='__main__':
    unittest.main()
