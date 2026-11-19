"""Read-only guard and switch boundaries; real-image proof runs on a restored DB in VPS CI."""
import copy
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('rollback', Path(__file__).parents[1] / 'ops/vps/rollback-app.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.ledger = copy.deepcopy(m.CONTRACT['baseline'] + m.CONTRACT['additive'])
        self.manifest = {'sourceCommit': 'f29c61109a761f2a20a0ecaf02ca6b7bf74f43c3', 'migrations': self.ledger[:9]}

    def test_all_old_notifications_allow_f29(self):
        m.validate_data(self.manifest, self.ledger, sorted(m.KINDS))

    def test_new_or_unknown_notification_blocks(self):
        for kind in ('SCHEDULE_CANCELLED', 'UNKNOWN_FUTURE_EVENT'):
            with self.subTest(kind=kind), self.assertRaisesRegex(ValueError, 'SCHEDULE_CANCELLED'):
                m.validate_data(self.manifest, self.ledger, [kind])

    def test_unknown_source_or_ledger_or_checksum_blocks(self):
        for field in ('source', 'current', 'target'):
            manifest, ledger = copy.deepcopy(self.manifest), copy.deepcopy(self.ledger)
            if field == 'source': manifest['sourceCommit'] = '0' * 40
            if field == 'current': ledger[-1]['sha256'] = '0' * 64
            if field == 'target': manifest['migrations'] = ledger[:8]
            with self.subTest(field=field), self.assertRaises(ValueError):
                m.validate_data(manifest, ledger, [])

    def coordinator(self, guards):
        r = object.__new__(m.Rollback)
        r.a, r.b = {'CAMPUS_APP_IMAGE': 'candidate'}, {'CAMPUS_APP_IMAGE': 'old'}
        r.target = Path('/fixture/target.env')
        r.database = Mock(return_value={'id': 'same-postgresql'})
        r.guard = Mock(side_effect=guards)
        r.run = Mock()
        r.dc = Mock()
        r.inspect = Mock(side_effect=[{'Image': 'candidate', 'State': {'Running': True, 'Health': {'Status': 'healthy'}}},
                                     {'Image': 'old', 'State': {'Health': {'Status': 'healthy'}}}])
        return r

    def test_existing_incompatible_data_never_stops_or_switches_app(self):
        r = self.coordinator([ValueError('SCHEDULE_CANCELLED')])
        with self.assertRaises(ValueError): r.switch()
        r.dc.assert_not_called()
        r.run.assert_not_called()

    def test_second_guard_closes_race_and_resumes_candidate(self):
        r = self.coordinator([None, ValueError('SCHEDULE_CANCELLED')])
        with self.assertRaises(ValueError): r.switch()
        self.assertEqual(r.dc.call_args_list[0].args, (False, 'stop', 'app'))
        self.assertEqual(r.dc.call_args_list[1].args, (False, 'up', '-d', '--no-deps', '--wait', '--wait-timeout', '120', 'app'))
        self.assertEqual(r.dc.call_count, 2)

    def test_allowed_switch_only_touches_application(self):
        r = self.coordinator([None, None])
        with patch('builtins.print'): r.switch()
        self.assertEqual(r.guard.call_count, 2)
        self.assertEqual(r.dc.call_args_list[1].args, (True, 'up', '-d', '--no-deps', '--wait', '--wait-timeout', '120', 'app'))
        self.assertEqual(r.dc.call_count, 2)

    def test_failed_old_runtime_recovers_compatible_candidate(self):
        r = self.coordinator([None, None])
        r.dc.side_effect = [b'', ValueError('health failed'), b'']
        with self.assertRaises(ValueError): r.switch()
        self.assertIs(r.dc.call_args_list[-1].args[0], False)
        self.assertEqual(r.dc.call_args_list[-1].args[-1], 'app')

    def test_f29_migration_prefix_matches_historical_source(self):
        import subprocess, hashlib
        source = self.manifest['sourceCommit']
        files = subprocess.check_output(['git','ls-tree','-r','--name-only',source,'prisma/migrations'], text=True).splitlines()
        expected = [{'name':Path(p).parent.name,'sha256':hashlib.sha256(subprocess.check_output(['git','show',source+':'+p])).hexdigest()} for p in files if p.endswith('/migration.sql')]
        self.assertEqual(expected,self.manifest['migrations'])


if __name__ == '__main__': unittest.main()
