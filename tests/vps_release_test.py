"""Malformed signed metadata must fail too; fixtures are not real scan evidence."""
import copy
import importlib.util
import io
import json
from pathlib import Path
import sys
import subprocess
import tarfile
import tempfile
import unittest
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("release", Path(__file__).parents[1] / "ops/vps/release_manifest.py")
rc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rc)


def fixture():
    ids = {key: "sha256:" + str(i) * 64 for i, key in enumerate(rc.IMAGES, 1)}
    values = {}
    for name, key in zip(rc.REPORTS[:3], rc.IMAGES):
        values[name] = {"Metadata": {"ImageID": ids[key], "OS": {"Family": "debian"}}, "Results": []}
    values["scanner-metadata.json"] = {"scanner": {"Version": "0.76.2", "VulnerabilityDB": {"Version": 2}}, "databaseFileSHA256": "a" * 64}
    for name in ("npm-all.json", "npm-production.json"):
        values[name] = {"metadata": {"vulnerabilities": {"total": 0}}}
    values["vps-upgrade.json"] = {"status": "PASS", "baselineSource": rc.BASELINE, "candidateImages": ids, "schema": rc.ADDITIVE_POLICY, "approvedAdditiveMigrations": rc.CONTRACT["additive"], "addedTables": rc.CONTRACT["addedTables"], "addedColumns": rc.CONTRACT["addedColumns"]}
    values["vps-upgrade.json"]["rollbackGuard"] = {"status":"PASS", "source":"f29c61109a761f2a20a0ecaf02ca6b7bf74f43c3", "runtimeImage":"sha256:"+"4"*64,
        "beforeCancellation":"OLD_RUNTIME_HEALTHY_DATA_UNCHANGED", "afterCancellation":"BLOCKED_BEFORE_SWITCH", "recovery":"COMPATIBLE_RUNTIME_SAME_DATABASE_ALL_ROWS_UNCHANGED"}
    evidence = {name: json.dumps(value).encode() for name, value in values.items()}
    migrations = [{"name": p.parent.name, "sha256": rc.digest(p.read_bytes())} for p in sorted((Path(__file__).parents[1] / "prisma/migrations").glob("*/migration.sql"))]
    m = {"releaseVersion": rc.VERSION, "manifestSchemaVersion": 1, "sourceCommit": rc.BASELINE,
         "ciChecksUrl": "https://github.com/bam-low/mgimo/commit/" + rc.BASELINE + "/checks",
         "architecture": "linux/amd64", **ids, "nodeVersion": "24.22.1", "postgresMajor": 17,
         "migrations": migrations, "compatibility": {"upgradeFrom": rc.BASELINE, "appRollbackTo": rc.BASELINE,
         "schemaPolicy": rc.migration_policy(migrations)}, "evidence": {k: rc.digest(v) for k, v in evidence.items()},
         "state": "UNSIGNED_OWNER_REVIEW_REQUIRED"}
    return m, evidence


def write_fixture(directory):
    root = Path(directory)
    m, evidence = fixture()
    (root / "release.json").write_text(json.dumps(m))
    with tarfile.open(root / "config.tar", "w") as archive:
        for name in ("compose.yaml", "preflight.py", "verify-delivery.sh", "release_manifest.py", "migration-contract.json"):
            archive.add(Path(__file__).parents[1] / "ops/vps" / name, arcname="ops/vps/" + name)
        for name, content in evidence.items():
            info = tarfile.TarInfo("evidence/" + name)
            info.size = len(content)
            archive.addfile(info, io.BytesIO(content))


class MetadataTests(unittest.TestCase):
    def test_baseline_contract_is_pinned_to_historical_git_source(self):
        files = subprocess.check_output(["git", "ls-tree", "-r", "--name-only", rc.BASELINE, "prisma/migrations"], text=True).splitlines()
        expected = [{"name": Path(name).parent.name,
                     "sha256": rc.digest(subprocess.check_output(["git", "show", rc.BASELINE + ":" + name]))}
                    for name in files if name.endswith("/migration.sql")]
        self.assertEqual(rc.CONTRACT["baseline"], expected)
        for row in expected:
            self.assertEqual(rc.digest((Path(__file__).parents[1] / "prisma/migrations" / row["name"] / "migration.sql").read_bytes()), row["sha256"])

    def test_legacy_inventory_remains_valid(self):
        m, evidence = fixture()
        m["migrations"] = copy.deepcopy(rc.CONTRACT["baseline"])
        m["compatibility"]["schemaPolicy"] = rc.BASELINE_POLICY
        upgrade = json.loads(evidence["vps-upgrade.json"])
        upgrade["schema"] = rc.BASELINE_POLICY
        evidence["vps-upgrade.json"] = json.dumps(upgrade).encode()
        m["evidence"]["vps-upgrade.json"] = rc.digest(evidence["vps-upgrade.json"])
        rc.validate(m, evidence)

    def test_unapproved_checksum_extra_migration_and_false_policy_fail(self):
        for change in ["checksum", "extra", "policy"]:
            m, evidence = fixture()
            if change == "checksum":
                m["migrations"][-1]["sha256"] = "0" * 64
            elif change == "extra":
                m["migrations"].append({"name": "20261119000000_unapproved", "sha256": "a" * 64})
            else:
                m["compatibility"]["schemaPolicy"] = rc.BASELINE_POLICY
            with self.assertRaises(ValueError):
                rc.validate(m, evidence)

    def test_missing_or_incomplete_guarded_rollback_proof_is_rejected(self):
        for guard in ({}, {"status":"PASS", "afterCancellation":"BLOCKED_BEFORE_SWITCH"}):
            m, evidence = fixture()
            upgrade = json.loads(evidence["vps-upgrade.json"])
            upgrade["rollbackGuard"] = guard
            evidence["vps-upgrade.json"] = json.dumps(upgrade).encode()
            m["evidence"]["vps-upgrade.json"] = rc.digest(evidence["vps-upgrade.json"])
            with self.assertRaisesRegex(ValueError, "Guarded f29"):
                rc.validate(m, evidence)

    def test_changed_embedded_contract_is_rejected(self):
        with tempfile.TemporaryDirectory() as path:
            write_fixture(path)
            target = Path(path) / "config.tar"
            with tarfile.open(target) as archive:
                files = [(info, archive.extractfile(info).read()) for info in archive.getmembers()]
            with tarfile.open(target, "w") as archive:
                for info, data in files:
                    if info.name == "ops/vps/migration-contract.json":
                        data = b"{}"
                        info.size = len(data)
                    archive.addfile(info, io.BytesIO(data))
            with self.assertRaises(ValueError):
                rc.verify(path)

    def test_complete_unsigned_fixture(self):
        with tempfile.TemporaryDirectory() as path:
            write_fixture(path)
            self.assertEqual(rc.verify(path)["state"], "UNSIGNED_OWNER_REVIEW_REQUIRED")

    def test_reject_changed_version_platform_approval_and_fields(self):
        for key, value in [("releaseVersion", "v1.0.0"), ("manifestSchemaVersion", True),
                           ("architecture", "linux/arm64"), ("postgresMajor", 18),
                           ("state", "PRODUCTION_GO"), ("ciChecksUrl", "https://attacker.invalid"),
                           ("sourceCommit", "main"), ("unexpected", True)]:
            with self.subTest(key=key):
                m, evidence = fixture()
                m[key] = value
                with self.assertRaises((ValueError, TypeError)):
                    rc.validate(m, evidence)

    def test_reject_incomplete_or_duplicate_migrations(self):
        for transform in [lambda x: x[:-1], lambda x: [x[0]] * 8]:
            m, evidence = fixture()
            m["migrations"] = transform(m["migrations"])
            with self.assertRaises(ValueError):
                rc.validate(m, evidence)

    def test_reject_evidence_checksum_and_image_substitution(self):
        m, evidence = fixture()
        evidence["campus24-tools.json"] += b" "
        with self.assertRaises(ValueError):
            rc.validate(m, evidence)
        m, evidence = fixture()
        m["toolsImage"] = "sha256:" + "9" * 64
        with self.assertRaises(ValueError):
            rc.validate(m, evidence)

    def test_critical_and_fixable_high_block_even_with_correct_hash(self):
        for severity, fixed in [("CRITICAL", ""), ("HIGH", "2.0")]:
            m, evidence = fixture()
            name = "campus24-tools.json"
            report = json.loads(evidence[name])
            report["Results"] = [{"Vulnerabilities": [{"Severity": severity, "FixedVersion": fixed}]}]
            evidence[name] = json.dumps(report).encode()
            m["evidence"][name] = rc.digest(evidence[name])
            with self.assertRaises(ValueError):
                rc.validate(m, evidence)

    def test_unsigned_unfixed_high_is_preserved_for_owner_review(self):
        m, evidence = fixture()
        name = "campus24-tools.json"
        report = json.loads(evidence[name])
        report["Results"] = [{"Vulnerabilities": [{"Severity": "HIGH", "FixedVersion": ""}]}]
        evidence[name] = json.dumps(report).encode()
        m["evidence"][name] = rc.digest(evidence[name])
        rc.validate(m, evidence)
        self.assertEqual(m["state"], "UNSIGNED_OWNER_REVIEW_REQUIRED")
        self.assertEqual(json.loads(evidence[name])["Results"][0]["Vulnerabilities"][0]["Severity"], "HIGH")

    def test_reject_duplicate_json_keys(self):
        with self.assertRaises(ValueError):
            rc.loads('{"releaseVersion":"first","releaseVersion":"second"}')

    def test_reject_upgrade_proof_for_different_images(self):
        m, evidence = fixture()
        value = json.loads(evidence["vps-upgrade.json"])
        value["candidateImages"]["toolsImage"] = "sha256:" + "9" * 64
        evidence["vps-upgrade.json"] = json.dumps(value).encode()
        m["evidence"]["vps-upgrade.json"] = rc.digest(evidence["vps-upgrade.json"])
        with self.assertRaises(ValueError):
            rc.validate(m, evidence)

    def test_reject_archive_traversal(self):
        with tempfile.TemporaryDirectory() as path:
            write_fixture(path)
            with tarfile.open(Path(path) / "config.tar", "a") as archive:
                archive.addfile(tarfile.TarInfo("../outside"))
            with self.assertRaises(ValueError):
                rc.verify(path)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--fixture":
        write_fixture(sys.argv[2])
    else:
        unittest.main()
