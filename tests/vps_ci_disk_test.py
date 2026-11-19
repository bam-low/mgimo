"""Exercise deletion boundaries without a real Docker daemon or owner resources."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
from datetime import datetime, timezone
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("disk", Path(__file__).parents[1] / "scripts/vps-ci-disk.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DiskTests(unittest.TestCase):
    def setUp(self):
        printer = patch("builtins.print")
        printer.start()
        self.addCleanup(printer.stop)
        self.workspace = tempfile.TemporaryDirectory()
        self.addCleanup(self.workspace.cleanup)
        self.root = Path(self.workspace.name)
        self.env = {"CAMPUS_CI_DISK_CLEANUP": "1", "GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "github-hosted",
                    "GITHUB_REPOSITORY": "bam-low/mgimo", "GITHUB_WORKSPACE": str(self.root),
                    "GITHUB_RUN_ID": "123", "GITHUB_RUN_ATTEMPT": "1", "GITHUB_JOB": "vps"}
        self.disk = module.Disk(self.root, self.env)
        self.calls = []
        self.images = {k: {"id": "sha256:" + str(i) * 64, "role": role, "architecture": "amd64", "os": "linux", "size": 100}
                       for i, (k, role) in enumerate(module.ROLES.items(), 1)}
        self.disk.docker = self.docker
        self.disk.images = lambda: self.images
        self.disk.init()
        data = self.disk.load()
        data["candidate"] = self.images
        self.disk.save(data)

    def docker(self, args):
        self.calls.append(args)
        if args[0] == "info": return b"/tmp"
        if args[:2] == ["image", "inspect"]:
            key = args[2].removeprefix("campus54-baseline-")
            return json.dumps([{"Id": self.images[key]["id"]}]).encode()
        if args[:2] == ["volume", "inspect"]:
            name = args[2]
            return json.dumps([{"Name": name, "Driver": "local", "CreatedAt": datetime.now(timezone.utc).isoformat(),
                "Labels": {"com.docker.compose.project": name.removesuffix("_pgdata"), "com.docker.compose.volume": "pgdata"}}]).encode()
        return b""

    def proof(self):
        proof = self.disk.evidence / "vps-upgrade.json"
        proof.write_text(json.dumps({"status": "PASS", "candidateImages": {
            "runtimeImage": self.images["runtime"]["id"], "toolsImage": self.images["tools"]["id"], "databaseImage": self.images["db"]["id"]}}))
        (self.disk.evidence / "vps-baseline.json").write_text(json.dumps({k: v["id"] for k, v in self.images.items()}))
        self.disk.capture()

    def scratch(self, role="candidate-context"):
        path = Path(tempfile.mkdtemp(prefix=module.PREFIXES[role], dir="/tmp"))
        self.addCleanup(lambda: __import__('shutil').rmtree(path, ignore_errors=True))
        self.disk.register_path(role, str(path))
        return path

    def test_local_and_self_hosted_cleanup_refused(self):
        for key, value in [("CAMPUS_CI_DISK_CLEANUP", "0"), ("GITHUB_ACTIONS", "false"),
                           ("RUNNER_ENVIRONMENT", "self-hosted"), ("GITHUB_REPOSITORY", "other/repo")]:
            with self.subTest(key=key):
                env = {**self.env, key: value}
                with self.assertRaises(ValueError): module.Disk(self.root, env).cleanup_tests()

    def test_own_scratch_removed_nested_symlink_target_retained(self):
        path = self.scratch()
        target = self.root / "retained"
        target.mkdir()
        (target / "data").write_text("keep")
        (path / "link").symlink_to(target, target_is_directory=True)
        self.disk.remove_paths({"candidate-context"})
        self.assertFalse(path.exists())
        self.assertEqual((target / "data").read_text(), "keep")

    def test_reject_root_external_and_root_symlink(self):
        for path in [self.root, Path("/tmp"), Path("/var/lib/docker"), self.root / "campus-vps-context-invalid"]:
            with self.assertRaises(ValueError): self.disk.register_path("candidate-context", str(path))
        path = Path(tempfile.mktemp(prefix="campus-vps-context-", dir="/tmp"))
        path.symlink_to(self.root, target_is_directory=True)
        self.addCleanup(path.unlink)
        with self.assertRaises(ValueError): self.disk.register_path("candidate-context", str(path))

    def test_reject_replaced_directory(self):
        path = self.scratch()
        old = path.with_name(path.name + "-old")
        path.rename(old)
        self.addCleanup(lambda: __import__('shutil').rmtree(old, ignore_errors=True))
        path.mkdir()
        with self.assertRaises(ValueError): self.disk.remove_paths({"candidate-context"})

    def test_job_identity_change_refused(self):
        self.disk.env["GITHUB_RUN_ID"] = "999"
        with self.assertRaises(ValueError): self.disk.load()

    def test_candidate_id_change_blocks_cleanup(self):
        self.images = {**self.images, "runtime": {**self.images["runtime"], "id": "sha256:" + "9" * 64}}
        with self.assertRaises(ValueError): self.disk.verify_images()

    def test_capture_proof_preserved_and_shared_candidate_ids_not_removed(self):
        self.proof()
        self.disk.cleanup_tests()
        self.assertFalse(any(c[:2] == ["image", "rm"] for c in self.calls))
        self.assertTrue((self.disk.diag / "vps-upgrade.json").exists())
        self.assertEqual(json.loads((self.disk.diag / "status.json").read_text())["scan"], "NOT_STARTED")

    def test_only_recorded_non_candidate_baseline_tags_are_removed(self):
        self.proof()
        baseline = {k: "sha256:" + v * 64 for k, v in zip(module.ROLES, ["a", "b", "c"])}
        (self.disk.evidence / "vps-baseline.json").write_text(json.dumps(baseline))
        original = self.disk.docker
        def historical(args):
            if args[:2] == ["image", "inspect"]:
                self.calls.append(args)
                return json.dumps([{"Id": baseline[args[2].removeprefix("campus54-baseline-")]}]).encode()
            return original(args)
        self.disk.docker = historical
        self.disk.cleanup_tests()
        removed = [c for c in self.calls if c[:2] == ["image", "rm"]]
        self.assertEqual(removed, [["image", "rm", "campus54-baseline-" + k] for k in module.ROLES])
        self.assertFalse(any("--force" in c for c in removed))

    def test_f29_fixture_removed_only_with_matching_recorded_non_candidate_id(self):
        for mismatch in (False, True):
            with self.subTest(mismatch=mismatch):
                self.proof()
                baseline = json.loads((self.disk.evidence / "vps-baseline.json").read_text())
                baseline.update(rollbackSource="f29c61109a761f2a20a0ecaf02ca6b7bf74f43c3", rollbackRuntime="sha256:" + "d" * 64)
                (self.disk.evidence / "vps-baseline.json").write_text(json.dumps(baseline))
                self.calls.clear()
                def inspect(args):
                    if args == ["image", "inspect", "campus71-rollback-runtime"]:
                        self.calls.append(args)
                        return json.dumps([{"Id": "sha256:" + ("e" if mismatch else "d") * 64}]).encode()
                    return self.docker(args)
                self.disk.docker = inspect
                if mismatch:
                    with self.assertRaises(ValueError): self.disk.cleanup_tests()
                    self.assertFalse(any(c[:2] == ["image", "rm"] for c in self.calls))
                else:
                    self.disk.cleanup_tests()
                    self.assertIn(["image", "rm", "campus71-rollback-runtime"], self.calls)

    def test_foreign_project_registration_rejected(self):
        with patch.object(os, "getppid", return_value=100):
            with self.assertRaises(ValueError): self.disk.register_project("campus24-test-999")
            self.disk.register_project("campus24-test-100")

    def test_active_volume_or_foreign_labels_cause_no_destructive_calls(self):
        self.proof()
        with patch.object(os, "getppid", return_value=100): self.disk.register_project("campus24-test-100")
        original = self.disk.docker
        for failure in ["active", "foreign", "old"]:
            def bad(args):
                if failure == "active" and args[:2] == ["ps", "-aq"]: return b"container"
                raw = original(args)
                if args[:2] == ["volume", "inspect"]:
                    item = json.loads(raw)[0]
                    if failure == "foreign": item["Labels"]["com.docker.compose.project"] = "foreign"
                    if failure == "old": item["CreatedAt"] = "2000-01-01T00:00:00Z"
                    return json.dumps([item]).encode()
                return raw
            self.disk.docker = bad
            self.calls.clear()
            with self.assertRaises(ValueError): self.disk.cleanup_tests()
            self.assertFalse(any(c[:2] in (["image", "rm"], ["volume", "rm"]) for c in self.calls))

    def test_success_cleanup_removes_only_owned_volume(self):
        self.proof()
        with patch.object(os, "getppid", return_value=100): self.disk.register_project("campus24-test-100")
        self.disk.cleanup_tests()
        self.assertIn(["volume", "rm", "campus24-test-100_pgdata"], self.calls)
        self.assertTrue(self.disk.load()["testsCleaned"])

    def test_buildkit_gc_only_after_addressed_cleanup_and_measured_deficit(self):
        free = {"device": 1, "total": 40 * module.GIB, "available": 10 * module.GIB, "freeInodes": 10000, "totalInodes": 20000}
        self.disk.filesystem = lambda p: dict(free)
        self.disk.budget(8, "trivy")
        self.assertFalse(any(c[0] == "builder" for c in self.calls))
        free["available"] = module.GIB
        with self.assertRaises(ValueError): self.disk.budget(8, "trivy")
        self.assertFalse(any(c[0] == "builder" for c in self.calls))
        self.proof(); self.disk.cleanup_tests()
        data = self.disk.load()
        data["paths"] = [{"role": role, "removed": True} for role in module.PREFIXES if role != "trivy-work"]
        data["rehearsalCleaned"] = True
        self.disk.save(data)
        original = self.disk.docker
        def gc(args):
            raw = original(args)
            if args[:2] == ["builder", "prune"]: free["available"] = 9 * module.GIB
            return raw
        self.disk.docker = gc
        self.disk.budget(8, "trivy")
        self.assertIn(["builder", "prune", "--all", "--force"], self.calls)
        self.assertFalse(any(c[:2] == ["system", "prune"] for c in self.calls))

    def rehearsal_resources(self, initial=(), protected=False):
        self.proof()
        self.disk.cleanup_tests()
        browser = self.scratch("rehearsal-browsers")
        (browser / "synthetic-browser").write_bytes(b"test browser bytes")
        (self.root / ".next").mkdir()
        (self.root / ".next/build-output").write_bytes(b"test build output")
        self.disk.register_path("candidate-build-output", str(self.root / ".next"))
        data = self.disk.load()
        data["initialImageIDs"] = list(initial)
        self.disk.save(data)
        ids = [self.images["db"]["id"] if protected else "sha256:" + "a" * 64, "sha256:" + "b" * 64]
        fixtures = {ref: {"Id": key, "Size": 123456} for ref, key in zip(module.REHEARSAL_IMAGES, ids)}
        original = self.disk.docker
        def fixture_docker(args):
            if args[:2] == ["image", "inspect"] and args[2] in fixtures:
                self.calls.append(args)
                return json.dumps([fixtures[args[2]]]).encode()
            return original(args)
        self.disk.docker = fixture_docker
        self.disk.register_rehearsal_images()
        self.calls.clear()
        return browser, fixtures

    def app_fixture_proof(self):
        self.rehearsal_resources()
        directory=self.scratch("app-update-fixture")
        (directory/"runtime.tar.gz").write_bytes(b"test-only runtime archive")
        database={"image":self.images["db"]["id"],"container":"test-only","startedAt":"test-only","restartCount":0}
        result={"status":"PASS","ownerVpsContacted":False,"manualRollback":"PASS","databaseBefore":database,
                "cases":[{"case":name,"status":"PASS","database":database,"allTableHashesUnchanged":True} for name in ("success","automatic-rollback","incompatible")]}
        proof=self.disk.evidence/"app-update-rehearsal.json"
        proof.write_text(json.dumps(result))
        return directory,proof

    def test_only_owned_app_fixture_removed_after_both_proofs(self):
        directory,proof=self.app_fixture_proof()
        self.disk.cleanup_rehearsal()
        self.assertFalse(directory.exists())
        self.assertTrue(proof.exists())
        self.assertEqual(self.disk.load()["appUpdateProofHash"],hashlib.sha256(proof.read_bytes()).hexdigest())
        resources=json.loads((self.disk.metrics/"rehearsal-resources.json").read_text())
        self.assertGreater(resources["appUpdateAllocatedBytes"],0)

    def test_app_fixture_not_removed_without_complete_proof(self):
        directory,proof=self.app_fixture_proof()
        proof.write_text('{"status":"FAIL"}')
        with self.assertRaises((ValueError,KeyError)): self.disk.cleanup_rehearsal()
        self.assertTrue(directory.exists())
        self.assertFalse(any(c[:2]==["image","rm"] for c in self.calls))

    def test_app_fixture_identity_swap_refused(self):
        directory,_=self.app_fixture_proof()
        directory.rename(directory.with_name(directory.name+'-original'))
        directory.mkdir()
        with self.assertRaises(ValueError): self.disk.cleanup_rehearsal()
        self.assertTrue(directory.exists())

    def test_owned_browsers_and_exact_unused_rehearsal_images_removed_after_proof(self):
        browser, _ = self.rehearsal_resources()
        self.disk.cleanup_rehearsal()
        self.assertFalse(browser.exists())
        self.assertFalse((self.root / ".next").exists())
        self.assertEqual([c for c in self.calls if c[:2] == ["image", "rm"]],
                         [["image", "rm", ref] for ref in module.REHEARSAL_IMAGES])
        self.assertTrue(self.disk.load()["rehearsalCleaned"])
        self.assertTrue((self.disk.diag / "vps-upgrade.json").exists())
        receipt = json.loads((self.disk.metrics / "rehearsal-resources.json").read_text())
        self.assertGreater(receipt["browserAllocatedBytes"], 0)
        self.assertTrue(receipt["imageSizeIsLogicalNotReclaimed"])
        self.assertGreater(receipt["buildOutputAllocatedBytes"], 0)

    def test_preexisting_build_output_or_wrong_workspace_path_refused(self):
        path = self.root / ".next"
        path.mkdir()
        data = self.disk.load()
        data["buildOutputInitiallyAbsent"] = False
        self.disk.save(data)
        with self.assertRaises(ValueError): self.disk.register_path("candidate-build-output", str(path))
        self.assertTrue(path.exists())
        with self.assertRaises(ValueError): self.disk.register_path("candidate-build-output", str(self.root))
        with self.assertRaises(ValueError): self.disk.register_path("candidate-build-output", "/tmp/.next")

    def test_owned_build_output_inode_swap_refused(self):
        path = self.root / ".next"
        path.mkdir()
        self.disk.register_path("candidate-build-output", str(path))
        path.rename(self.root / ".next-old")
        path.mkdir()
        with self.assertRaises(ValueError): self.disk.remove_paths({"candidate-build-output"})
        self.assertTrue(path.exists())

    def test_preexisting_and_protected_rehearsal_images_are_retained(self):
        browser, _ = self.rehearsal_resources(initial=["sha256:" + "b" * 64], protected=True)
        self.disk.cleanup_rehearsal()
        self.assertFalse(browser.exists())
        self.assertFalse(any(c[:2] == ["image", "rm"] for c in self.calls))

    def test_changed_or_in_use_rehearsal_image_blocks_whole_cleanup(self):
        browser, fixtures = self.rehearsal_resources()
        ref = module.REHEARSAL_IMAGES[0]
        before = fixtures[ref]["Id"]
        fixtures[ref]["Id"] = "sha256:" + "9" * 64
        with self.assertRaises(ValueError): self.disk.cleanup_rehearsal()
        self.assertTrue(browser.exists())
        self.assertFalse(any(c[:2] == ["image", "rm"] for c in self.calls))
        fixtures[ref]["Id"] = before
        original = self.disk.docker
        self.disk.docker = lambda args: b"active-container" if args[:2] == ["ps", "-aq"] else original(args)
        with self.assertRaises(ValueError): self.disk.cleanup_rehearsal()
        self.assertTrue(browser.exists())
        self.assertFalse(any(c[:2] == ["image", "rm"] for c in self.calls))

    def test_rehearsal_cleanup_requires_completed_tests_and_unchanged_proof(self):
        browser, _ = self.rehearsal_resources()
        data = self.disk.load()
        data["testsCleaned"] = False
        self.disk.save(data)
        with self.assertRaises(ValueError): self.disk.cleanup_rehearsal()
        self.assertTrue(browser.exists())
        data["testsCleaned"] = True
        self.disk.save(data)
        (self.disk.evidence / "vps-upgrade.json").write_text("changed proof")
        with self.assertRaises(ValueError): self.disk.cleanup_rehearsal()
        self.assertTrue(browser.exists())

    def test_disk_pressure_reservation_is_owned_and_not_removed_with_build_scratch(self):
        fs = self.disk.filesystem(self.root)
        self.disk.filesystem = lambda p: {**fs, "available": 13 * module.GIB}
        with patch.object(os, "posix_fallocate") as allocate:
            self.disk.reserve_disk_test(12)
        self.assertEqual(allocate.call_args.args[1:], (0, module.GIB))
        receipt = json.loads((self.disk.metrics / "disk-regression.json").read_text())
        self.assertEqual(receipt["reservedBytes"], module.GIB)
        path = Path(self.disk.load()["paths"][-1]["path"])
        self.addCleanup(lambda: __import__('shutil').rmtree(path, ignore_errors=True))
        self.disk.remove_paths(module.BUILD_ROLES)
        self.assertTrue((path / "reserved").exists())
        with self.assertRaises(ValueError): self.disk.reserve_disk_test(8)

    def test_disk_pressure_does_not_allocate_when_start_already_lower(self):
        fs = self.disk.filesystem(self.root)
        self.disk.filesystem = lambda p: {**fs, "available": 11 * module.GIB}
        with patch.object(os, "posix_fallocate") as allocate:
            self.disk.reserve_disk_test(12)
        allocate.assert_not_called()
        self.assertEqual(json.loads((self.disk.metrics / "disk-regression.json").read_text())["reservedBytes"], 0)
        path = Path(self.disk.load()["paths"][-1]["path"])
        self.addCleanup(lambda: __import__('shutil').rmtree(path, ignore_errors=True))

    def test_cache_gc_cannot_precede_rehearsal_cleanup(self):
        fs = self.disk.filesystem(self.root)
        self.disk.filesystem = lambda p: {**fs, "available": module.GIB}
        self.proof(); self.disk.cleanup_tests()
        data = self.disk.load()
        data["paths"] = [{"role": role, "removed": True} for role in module.BUILD_ROLES]
        self.disk.save(data)
        with self.assertRaises(ValueError): self.disk.budget(8, "trivy")
        self.assertFalse(any(c[0] == "builder" for c in self.calls))

    def test_trivy_cache_cleanup_requires_full_seal_and_unchanged_reports(self):
        path = self.scratch("trivy-work")
        with self.assertRaises(ValueError): self.disk.cleanup_trivy()
        self.assertTrue(path.exists())

    def test_successful_scan_seal_allows_only_unchanged_owned_cache_removal(self):
        self.proof()
        path = self.scratch("trivy-work")
        reports = self.root / "reports"
        reports.mkdir()
        for role, image in self.images.items():
            (reports / ("campus24-" + role + ".json")).write_text(json.dumps({"Metadata": {"ImageID": image["id"]}, "Results": []}))
        (path / "cache/db").mkdir(parents=True)
        (path / "cache/db/trivy.db").write_bytes(b"synthetic-test-db")
        (reports / "scanner-metadata.json").write_text(json.dumps({"scanner": {"Version": "0.76.2", "VulnerabilityDB": {"Version": 2}}, "databaseFileSHA256": hashlib.sha256(b"synthetic-test-db").hexdigest()}))
        for name in ["npm-all.json", "npm-production.json"]:
            (reports / name).write_text(json.dumps({"metadata": {"vulnerabilities": {"total": 0}}}))
        proof = (self.disk.evidence / "vps-upgrade.json").read_bytes()
        (reports / "vps-upgrade.json").write_bytes(proof)
        with patch.object(module, "SECURITY_DIR", reports):
            self.disk.seal_scan()
            (reports / "vps-upgrade.json").write_text("changed")
            with self.assertRaises(ValueError): self.disk.cleanup_trivy()
            self.assertTrue(path.exists())
            (reports / "vps-upgrade.json").write_bytes(proof)
            self.disk.cleanup_trivy()
            self.assertFalse(path.exists())
            self.assertTrue((reports / "campus24-runtime.json").exists())

    def test_space_budget_fails_closed_without_deleting_candidate_images(self):
        self.disk.filesystem = lambda p: {"device": 1, "total": 10 * module.GIB, "available": module.GIB, "freeInodes": 100, "totalInodes": 200}
        with self.assertRaises(ValueError): self.disk.budget(6, "package")
        self.assertFalse(any(c[:2] in (["image", "rm"], ["builder", "prune"]) for c in self.calls))


if __name__ == "__main__": unittest.main()
