"""Behavior tests of the trusted format and coordinator. No owner keys or live VPS."""
import copy
import hashlib
import importlib.util
import io
import json
import os
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("coordinator", ROOT / "ops/app-update/server.py")
server = importlib.util.module_from_spec(spec); spec.loader.exec_module(server)
f = server.fmt


from app_update_fixture import fixture, sums


class FormatTests(unittest.TestCase):
    def test_complete_package_signature_and_tampering(self):
        with tempfile.TemporaryDirectory() as name:
            d = Path(name); r = d / "release"; r.mkdir(); fixture(r)
            key = d / "ephemeral"
            subprocess.run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(key)], check=True)
            signers = d / "signers"; signers.write_text(f.IDENTITY+" "+key.with_suffix('.pub').read_text())
            subprocess.run(["ssh-keygen", "-Y", "sign", "-f", str(key), "-n", f.NAMESPACE, str(r / "SHA256SUMS")], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.assertEqual(f.verify(r, True, signers)["runId"], "123")
            (r / "app-release.json").write_text('{}')
            with self.assertRaises(ValueError): f.verify(r, True, signers)
            key.unlink(); key.with_suffix('.pub').unlink()

    def test_reject_extra_and_symlink_files(self):
        for kind in ('extra', 'symlink'):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as name:
                r = Path(name); fixture(r)
                if kind == 'extra': (r / 'database.tar.gz').write_bytes(b'x')
                else:
                    (r / 'runtime.tar.gz').unlink(); (r / 'runtime.tar.gz').symlink_to('/etc/passwd')
                with self.assertRaises(ValueError): f.verify(r)

    def test_reject_duplicates_and_security_gate(self):
        with self.assertRaises(ValueError): f.loads('{"a":1,"a":2}')
        with tempfile.TemporaryDirectory() as name:
            r=Path(name); m=fixture(r); s=f.loads((r/'runtime-security.json').read_bytes())
            for v in ({"Severity":"CRITICAL"}, {"Severity":"HIGH","FixedVersion":"2"}):
                s['runtime']['Results']=[{'Vulnerabilities':[v]}]
                with self.assertRaises(ValueError): f.validate(m,s)

    def test_archive_id_cannot_be_replaced_by_matching_metadata(self):
        with tempfile.TemporaryDirectory() as name:
            r=Path(name); m=fixture(r)
            security=f.loads((r/'runtime-security.json').read_bytes())
            m['runtimeImage']='sha256:'+'9'*64
            security['runtime']['Metadata']['ImageID']=m['runtimeImage']
            f.write(r/'runtime-security.json',security)
            m['securitySHA256']=f.sha(r/'runtime-security.json')
            f.write(r/'app-release.json',m); sums(r)
            with self.assertRaises(ValueError): f.verify(r)

    def test_archive_link_is_rejected_even_with_matching_checksum(self):
        with tempfile.TemporaryDirectory() as name:
            r=Path(name); fixture(r)
            entries=[]
            with tarfile.open(r/'runtime.tar.gz') as archive:
                for member in archive:
                    entries.append((member,archive.extractfile(member).read()))
            with tarfile.open(r/'runtime.tar.gz','w:gz') as archive:
                for member,data in entries: archive.addfile(member,io.BytesIO(data))
                link=tarfile.TarInfo('escape'); link.type=tarfile.SYMTYPE; link.linkname='/etc/passwd'; archive.addfile(link)
            sums(r)
            with self.assertRaises(ValueError): f.verify(r)

    def test_server_snapshot_refuses_hardlinks_and_fifo(self):
        with tempfile.TemporaryDirectory() as name:
            r=Path(name); incoming=r/'incoming'; incoming.mkdir(); fixture(incoming); (incoming/'SHA256SUMS.sig').write_text('fixture')
            dest=r/'snapshot'; dest.mkdir()
            os.link(incoming/'app-release.json',r/'hardlink')
            u=server.Updater({"stateDir":str(r),"envFile":str(r/'env'),"compose":str(r/'compose.yaml'),"project":"isolated"})
            with self.assertRaises(ValueError): u.snapshot(incoming,dest)

    def test_contract_changes_block_packaging(self):
        c=f.contract(subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip())
        self.assertGreater(len(c['configuration']), 20)
        self.assertEqual(len(c['migrations']),8)

    def test_refuse_environment_shell_syntax(self):
        with tempfile.TemporaryDirectory() as name:
            r=Path(name); p=r/'env'; p.write_text('CAMPUS_APP_IMAGE=$(touch /tmp/never)\n')
            u=server.Updater({"stateDir":str(r),"envFile":str(p),"compose":str(r/'compose.yaml'),"project":"isolated"})
            with self.assertRaises(ValueError): u.env()

    def test_compare_real_database_identity_ledger_and_configuration(self):
        u=server.Updater({"stateDir":"/tmp","envFile":"/tmp/no","compose":"/tmp/compose.yaml","project":"isolated"})
        target={'databaseImage':'expected','contract':{'migrations':[{'name':'one'}]}}
        state={'target':target,'fingerprint':'config','runtimeImage':'runtime'}
        with patch.object(u,'fingerprint',return_value='config'), patch.object(u,'database',return_value={'image':'expected'}), patch.object(u,'ledger',return_value=[{'name':'one'}]), patch.object(u,'current_app',return_value={'Image':'runtime'}):
            self.assertEqual(u.compatible({'target':target},state)['image'],'expected')
            for method,value in [('database',{'image':'changed'}),('ledger',[]),('fingerprint','changed'),('current_app',{'Image':'other'})]:
                with self.subTest(method=method),patch.object(u,method,return_value=value),self.assertRaises(ValueError): u.compatible({'target':target},state)


class RecoveryTests(unittest.TestCase):
    def test_recover_keeps_pending_if_previous_app_cannot_start(self):
        with tempfile.TemporaryDirectory() as name:
            root=Path(name)
            u=server.Updater({"stateDir":str(root),"envFile":str(root/'env'),"compose":str(root/'compose.yaml'),"project":"isolated"})
            previous={'runtimeImage':'sha256:'+'a'*64,'sourceCommit':'a'*40,'fingerprint':'same','target':{'contract':{'migrations':[]}}}
            f.write(u.journal,{'previous':previous,'database':{'container':'same'},'timers':['campus-backup.timer']})
            with patch.object(u,'database',return_value={'container':'same'}), patch.object(u,'fingerprint',return_value='same'), patch.object(u,'ledger',return_value=[]), patch.object(u,'set_image') as set_image, patch.object(u,'dc',side_effect=ValueError('start failed')):
                with self.assertRaises(ValueError): u.recover()
                set_image.assert_called_once_with(previous['runtimeImage'])
            self.assertTrue(u.journal.exists())
            self.assertFalse(u.state_path.exists())

    def test_recover_refuses_changed_database_before_switch(self):
        with tempfile.TemporaryDirectory() as name:
            root=Path(name)
            u=server.Updater({"stateDir":str(root),"envFile":str(root/'env'),"compose":str(root/'compose.yaml'),"project":"isolated"})
            f.write(u.journal,{'previous':{'runtimeImage':'sha256:'+'a'*64},'database':{'container':'old'},'timers':[]})
            with patch.object(u,'database',return_value={'container':'changed'}), patch.object(u,'set_image') as switch:
                with self.assertRaises(ValueError): u.recover()
                switch.assert_not_called()
            self.assertTrue(u.journal.exists())

    def test_recover_refuses_schema_or_configuration_drift(self):
        for fingerprint, ledger in [('changed', []), ('same', [{'name':'unexpected'}])]:
            with self.subTest(fingerprint=fingerprint), tempfile.TemporaryDirectory() as name:
                root=Path(name)
                u=server.Updater({"stateDir":str(root),"envFile":str(root/'env'),"compose":str(root/'compose.yaml'),"project":"isolated"})
                previous={'runtimeImage':'sha256:'+'a'*64,'fingerprint':'same','target':{'contract':{'migrations':[]}}}
                f.write(u.journal,{'previous':previous,'database':{'container':'same'},'timers':[]})
                with patch.object(u,'database',return_value={'container':'same'}), patch.object(u,'fingerprint',return_value=fingerprint), patch.object(u,'ledger',return_value=ledger), patch.object(u,'set_image') as switch:
                    with self.assertRaises(ValueError): u.recover()
                    switch.assert_not_called()
                self.assertTrue(u.journal.exists())

    def test_recover_restores_state_and_only_original_timers(self):
        with tempfile.TemporaryDirectory() as name:
            root=Path(name)
            u=server.Updater({"stateDir":str(root),"envFile":str(root/'env'),"compose":str(root/'compose.yaml'),"project":"isolated"})
            previous={'runtimeImage':'sha256:'+'a'*64,'sourceCommit':'a'*40,'fingerprint':'same','target':{'contract':{'migrations':[]}}}
            f.write(u.journal,{'previous':previous,'database':{'container':'same'},'timers':['campus-cleanup.timer']})
            with patch.object(u,'database',return_value={'container':'same'}), patch.object(u,'fingerprint',return_value='same'), patch.object(u,'ledger',return_value=[]), patch.object(u,'set_image'), patch.object(u,'dc') as dc, patch.object(u,'smoke'), patch.object(u,'timer_action') as timers:
                self.assertEqual(u.recover()['status'],'ROLLED_BACK')
                self.assertEqual(dc.call_args.args,('up','-d','--no-deps','--wait','--wait-timeout','120','app'))
                timers.assert_called_once_with('start',['campus-cleanup.timer'])
            self.assertFalse(u.journal.exists())
            self.assertEqual(f.loads(u.state_path.read_bytes()),previous)


if __name__=='__main__': unittest.main()
