#!/usr/bin/env python3
"""Strict RC metadata and embedded evidence. No image load, signing or deployment."""
import hashlib
import json
import re
import subprocess
import sys
import tarfile
from pathlib import Path

VERSION = "v1.0.0-rc.1"
BASELINE = "287912fe19df75404b81dd36ea1df5bb62187c71"
REPORTS = ("campus24-runtime.json", "campus24-tools.json", "campus24-db.json",
           "scanner-metadata.json", "npm-all.json", "npm-production.json", "vps-upgrade.json")
IMAGES = ("runtimeImage", "toolsImage", "databaseImage")
CONTRACT = json.loads((Path(__file__).parent / "migration-contract.json").read_text())
BASELINE_POLICY = "baseline-migrations-unchanged"
ADDITIVE_POLICY = "baseline-preserved-approved-additive"


def migration_policy(migrations):
    if migrations == CONTRACT["baseline"]:
        return BASELINE_POLICY
    if migrations == CONTRACT["baseline"] + CONTRACT["additive"]:
        return ADDITIVE_POLICY
    raise ValueError("Unapproved migration inventory or checksum")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def require(ok, message):
    if not ok:
        raise ValueError(message)


def loads(data):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, "Duplicate JSON key")
            result[key] = value
        return result
    return json.loads(data, object_pairs_hook=unique)


def validate(m, evidence):
    require(set(m) == {"releaseVersion", "manifestSchemaVersion", "sourceCommit",
                      "architecture", *IMAGES, "nodeVersion", "postgresMajor",
                      "migrations", "compatibility", "evidence", "state", "ciChecksUrl"}, "Unexpected metadata fields")
    require(m["releaseVersion"] == VERSION and type(m["manifestSchemaVersion"]) is int
            and m["manifestSchemaVersion"] == 1, "Unsupported release format")
    require(re.fullmatch(r"[0-9a-f]{40}", m["sourceCommit"]) is not None, "Invalid source SHA")
    require(m["ciChecksUrl"] == "https://github.com/bam-low/mgimo/commit/" + m["sourceCommit"] + "/checks", "Invalid exact-source CI URL")
    require(m["architecture"] == "linux/amd64" and m["nodeVersion"] == "24.22.1"
            and type(m["postgresMajor"]) is int and m["postgresMajor"] == 17, "Unsupported platform")
    ids = [m[key] for key in IMAGES]
    require(len(set(ids)) == 3 and all(re.fullmatch(r"sha256:[0-9a-f]{64}", value) for value in ids), "Invalid image IDs")
    require(m["state"] == "UNSIGNED_OWNER_REVIEW_REQUIRED", "Release is not signed or approved")
    require(m["compatibility"] == {"upgradeFrom": BASELINE, "appRollbackTo": BASELINE,
                                  "schemaPolicy": migration_policy(m["migrations"])}, "Unsupported compatibility claim")
    migrations = m["migrations"]
    require(isinstance(migrations, list) and len(migrations) in (len(CONTRACT["baseline"]), len(CONTRACT["baseline"]) + len(CONTRACT["additive"])), "Unexpected migration inventory")
    names = []
    for row in migrations:
        require(set(row) == {"name", "sha256"} and re.fullmatch(r"[0-9]{14}_[a-z_]+", row["name"])
                and re.fullmatch(r"[0-9a-f]{64}", row["sha256"]), "Invalid migration record")
        names.append(row["name"])
    require(names == sorted(set(names)), "Migration names must be ordered and unique")
    require(set(m["evidence"]) == set(REPORTS) == set(evidence), "Evidence missing or unexpected")
    for name in REPORTS:
        require(m["evidence"][name] == digest(evidence[name]), "Evidence checksum mismatch")
    for name, image in zip(REPORTS[:3], ids):
        report = loads(evidence[name])
        require(report["Metadata"]["ImageID"] == image, "Scan/image mismatch")
        require(report["Metadata"]["OS"]["Family"] in ("debian", "alpine"), "OS scan missing")
        for result in report.get("Results", []):
            for finding in result.get("Vulnerabilities", []):
                require(finding["Severity"] != "CRITICAL", "Critical vulnerability blocks packaging")
                require(not (finding["Severity"] == "HIGH" and finding.get("FixedVersion")), "Fixable HIGH blocks packaging")
    scanner = loads(evidence["scanner-metadata.json"])
    require(scanner["scanner"]["Version"] == "0.76.2" and scanner["scanner"].get("VulnerabilityDB")
            and re.fullmatch(r"[0-9a-f]{64}", scanner["databaseFileSHA256"]), "Scanner provenance missing")
    upgrade = loads(evidence["vps-upgrade.json"])
    require(upgrade["status"] == "PASS" and upgrade["baselineSource"] == BASELINE
            and upgrade["candidateImages"] == {key: m[key] for key in IMAGES}, "Upgrade evidence/image mismatch")
    require(upgrade.get("schema") == m["compatibility"]["schemaPolicy"], "Schema upgrade proof mismatch")
    if m["compatibility"]["schemaPolicy"] == ADDITIVE_POLICY:
        require(upgrade.get("approvedAdditiveMigrations") == CONTRACT["additive"]
                and upgrade.get("addedTables") == CONTRACT["addedTables"]
                and upgrade.get("addedColumns") == CONTRACT["addedColumns"], "Additive upgrade proof missing")
    if m["migrations"] == CONTRACT["baseline"] + CONTRACT["additive"]:
        guard = upgrade.get("rollbackGuard", {})
        require(guard.get("status") == "PASS" and guard.get("source") == "f29c61109a761f2a20a0ecaf02ca6b7bf74f43c3"
                and re.fullmatch(r"sha256:[a-f0-9]{64}", guard.get("runtimeImage", ""))
                and guard.get("beforeCancellation") == "OLD_RUNTIME_HEALTHY_DATA_UNCHANGED"
                and guard.get("afterCancellation") == "BLOCKED_BEFORE_SWITCH"
                and guard.get("recovery") == "COMPATIBLE_RUNTIME_SAME_DATABASE_ALL_ROWS_UNCHANGED", "Guarded f29 rollback proof missing")
    for name in ("npm-all.json", "npm-production.json"):
        audit = loads(evidence[name])
        require("error" not in audit and "metadata" in audit and "vulnerabilities" in audit["metadata"], "Invalid npm audit")
    require(loads(evidence["npm-production.json"])["metadata"]["vulnerabilities"]["total"] == 0, "Production audit failed")


def verify(directory):
    root = Path(directory)
    m = loads((root / "release.json").read_bytes())
    with tarfile.open(root / "config.tar") as archive:
        members = archive.getmembers()
        require(all(not x.name.startswith("/") and ".." not in Path(x.name).parts
                    and (x.isdir() or x.isfile()) for x in members), "Unsafe config archive")
        names = [x.name for x in members]
        require(len(set(names)) == len(names), "Duplicate archive member")
        require({"ops/vps/compose.yaml", "ops/vps/preflight.py", "ops/vps/verify-delivery.sh",
                 "ops/vps/release_manifest.py"}.issubset(names), "Required configuration missing")
        contract_name = "ops/vps/migration-contract.json"
        if m["compatibility"]["schemaPolicy"] == ADDITIVE_POLICY or contract_name in names:
            require(contract_name in names, "Migration contract missing")
            member = archive.getmember(contract_name)
            require(member.isfile() and member.size < 65536
                    and loads(archive.extractfile(member).read()) == CONTRACT, "Unapproved migration contract")
        evidence = {}
        for name in REPORTS:
            member = archive.getmember("evidence/" + name)
            require(member.isfile() and member.size < 32 * 1024 * 1024, "Invalid evidence member")
            evidence[name] = archive.extractfile(member).read()
        require({name for name in names if name.startswith("evidence/") and name != "evidence"}
                == {"evidence/" + name for name in REPORTS}, "Unexpected embedded evidence")
    validate(m, evidence)
    return m


def create(directory, reports):
    root, reports = Path(directory), Path(reports)
    source = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    subprocess.run(["git", "diff", "--quiet", "HEAD"], check=True)
    require(not subprocess.check_output(["git", "ls-files", "--others", "--exclude-standard", "ops/vps", "prisma/migrations"]),
            "Untracked release configuration")
    baseline_files = subprocess.check_output(["git", "ls-tree", "-r", "--name-only", BASELINE, "prisma/migrations"], text=True).splitlines()
    immutable_baseline = [{"name": Path(name).parent.name,
                           "sha256": digest(subprocess.check_output(["git", "show", BASELINE + ":" + name]))}
                          for name in baseline_files if name.endswith("/migration.sql")]
    require(CONTRACT["baseline"] == immutable_baseline, "Baseline contract changed")
    migrations = []
    for file in sorted(Path("prisma/migrations").glob("*/migration.sql")):
        migrations.append({"name": file.parent.name, "sha256": digest(file.read_bytes())})
    policy = migration_policy(migrations)
    evidence = {name: (reports / name).read_bytes() for name in REPORTS}
    image_ids = {}
    for key, role in zip(IMAGES, ("runtime", "tools", "db")):
        image = loads(subprocess.check_output(["docker", "image", "inspect", "campus24-" + role]))[0]
        require(image["Architecture"] == "amd64" and image["Os"] == "linux", "Wrong image architecture")
        image_ids[key] = image["Id"]
    m = {"releaseVersion": VERSION, "manifestSchemaVersion": 1, "sourceCommit": source,
         "ciChecksUrl": "https://github.com/bam-low/mgimo/commit/" + source + "/checks",
         "architecture": "linux/amd64", **image_ids, "nodeVersion": "24.22.1", "postgresMajor": 17,
         "migrations": migrations, "compatibility": {"upgradeFrom": BASELINE, "appRollbackTo": BASELINE,
         "schemaPolicy": policy},
         "evidence": {name: digest(data) for name, data in evidence.items()},
         "state": "UNSIGNED_OWNER_REVIEW_REQUIRED"}
    validate(m, evidence)
    with tarfile.open(root / "config.tar", "w") as archive:
        archive.add("ops/vps", arcname="ops/vps", filter=lambda item: None if "__pycache__" in item.name else item)
        for name in REPORTS:
            archive.add(reports / name, arcname="evidence/" + name)
    (root / "release.json").write_text(json.dumps(m, indent=2) + "\n")
    verify(root)


if __name__ == "__main__":
    try:
        if len(sys.argv) == 4 and sys.argv[1] == "create":
            create(sys.argv[2], sys.argv[3])
        elif len(sys.argv) == 3 and sys.argv[1] == "verify":
            verify(sys.argv[2])
        else:
            raise ValueError("Use create OUT REPORTS or verify RELEASE")
        print("PASS RC metadata/evidence; unsigned owner review required")
    except Exception:
        print("STOP invalid RC metadata/evidence; no deploy", file=sys.stderr)
        sys.exit(1)
