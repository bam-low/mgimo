#!/usr/bin/env python3
"""Job-owned CI scratch lifecycle. Never a production/developer Docker cleanup tool."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import time
import tempfile
from datetime import datetime

SECURITY_DIR = Path("/tmp/vps-security")
GIB = 1024 ** 3
ROLES = {"runtime": "runtime", "tools": "tools", "db": "database"}
PREFIXES = {"candidate-context": "campus-vps-context-", "candidate-runtime": "campus-runtime-",
            "baseline-archive": "campus-vps-baseline-", "baseline-context": "campus-vps-context-",
            "baseline-runtime": "campus-runtime-", "trivy-work": "campus-trivy-work-"}
REPORTS = ("campus24-runtime.json", "campus24-tools.json", "campus24-db.json", "scanner-metadata.json",
           "npm-all.json", "npm-production.json", "vps-upgrade.json")


def require(ok, message):
    if not ok:
        raise ValueError(message)


class Disk:
    def __init__(self, workspace=None, environment=None):
        self.env = dict(os.environ if environment is None else environment)
        self.root = Path(workspace or Path.cwd()).resolve()
        self.evidence = self.root / ".runtime-evidence"
        self.registry = self.evidence / "vps-ci-owned.json"
        self.diag = self.evidence / "vps-pre-scan-evidence"
        self.metrics = self.evidence / "vps-disk-telemetry"

    def guard(self):
        require(self.env.get("CAMPUS_CI_DISK_CLEANUP") == "1" and self.env.get("GITHUB_ACTIONS") == "true"
                and self.env.get("RUNNER_ENVIRONMENT") == "github-hosted"
                and self.env.get("GITHUB_REPOSITORY") == "bam-low/mgimo"
                and Path(self.env.get("GITHUB_WORKSPACE", "/")).resolve() == self.root,
                "Only the explicit isolated GitHub-hosted job may clean resources")
        require(self.env.get("GITHUB_RUN_ID", "").isdigit() and self.env.get("GITHUB_RUN_ATTEMPT", "").isdigit(), "Job identity required")

    def identity(self):
        return [self.env.get(k) for k in ("GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "GITHUB_JOB")]

    def load(self):
        self.guard()
        require(not self.registry.is_symlink(), "Registry symlink rejected")
        data = json.loads(self.registry.read_text())
        require(data["job"] == self.identity() and data["workspace"] == str(self.root), "Foreign registry")
        return data

    def save(self, data):
        with tempfile.NamedTemporaryFile("w", dir=self.evidence, prefix=".disk-registry-", delete=False) as out:
            out.write(json.dumps(data, indent=2) + "\n")
            temporary = out.name
        os.replace(temporary, self.registry)

    def docker(self, args):
        env = {k: v for k, v in self.env.items() if k not in
               ("DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "BUILDX_BUILDER", "BUILDKIT_HOST")}
        return subprocess.check_output(["docker", "--host=unix:///var/run/docker.sock", *args], env=env, stderr=subprocess.PIPE)

    def init(self):
        self.guard()
        self.evidence.mkdir(exist_ok=True)
        require(not self.registry.exists(), "New job registry required")
        self.diag.mkdir(mode=0o700)
        self.metrics.mkdir(mode=0o700)
        data = {"job": self.identity(), "workspace": str(self.root), "started": time.time(), "paths": [],
                "projects": [], "candidate": {}}
        data["filesystemPaths"] = {"workspace": str(self.root), "tmp": "/tmp", "runnerTemp": self.env.get("RUNNER_TEMP", "/tmp")}
        data["filesystemPaths"]["dockerRoot"] = self.docker(["info", "--format", "{{.DockerRootDir}}"] ).decode().strip()
        self.save(data)
        (self.diag / "status.json").write_text(json.dumps({"upgradeProofAvailable": False, "scan": "NOT_STARTED"}) + "\n")
        self.snapshot("initial")

    def temp_roots(self):
        return {p.resolve() for p in (Path("/tmp"), Path(tempfile.gettempdir()), Path(self.env.get("RUNNER_TEMP", "/tmp")))
                if p.is_absolute() and p != self.root and not p.is_relative_to(self.root)}

    def register_path(self, role, raw):
        data = self.load()
        require(role in PREFIXES, "Unknown scratch role")
        path = Path(raw)
        require(path.is_absolute() and not path.is_symlink() and path.resolve() == path
                and path.parent in self.temp_roots() and path.name.startswith(PREFIXES[role])
                and path.is_dir() and not self.root.is_relative_to(path), "Unsafe scratch path")
        info = path.stat()
        require(info.st_uid == os.getuid() and info.st_ctime >= data["started"], "Scratch not created by this job")
        require(not any(x["path"] == str(path) or x["role"] == role for x in data["paths"]), "Duplicate scratch registration")
        data["paths"].append({"role": role, "path": str(path), "dev": info.st_dev, "ino": info.st_ino})
        self.save(data)

    def remove_paths(self, roles):
        data = self.load()
        require(roles and set(roles).issubset(PREFIXES), "Unknown cleanup role")
        if "trivy-work" in roles:
            self.verify_scan_seal(data)
        for item in data["paths"]:
            if item["role"] not in roles or item.get("removed"):
                continue
            path = Path(item["path"])
            require(not path.is_symlink() and path.resolve() == path and path.parent in self.temp_roots()
                    and path.name.startswith(PREFIXES[item["role"]]) and not self.root.is_relative_to(path), "Scratch boundary changed")
            info = path.stat()
            require((info.st_dev, info.st_ino) == (item["dev"], item["ino"]), "Scratch identity changed")
            shutil.rmtree(path)  # stdlib fd-based traversal does not follow nested symlinks.
            item["removed"] = True
            self.save(data)

    def images(self):
        out = {}
        for key, role in ROLES.items():
            image = json.loads(self.docker(["image", "inspect", "campus24-" + key]))[0]
            require(image["Config"]["Labels"]["io.campus.role"] == role and image["Architecture"] == "amd64"
                    and image["Os"] == "linux", "Wrong candidate image role/platform")
            out[key] = {"id": image["Id"], "role": role, "architecture": image["Architecture"], "os": image["Os"], "size": image["Size"]}
        return out

    def freeze(self):
        data = self.load()
        require(not data["candidate"], "Candidate inventory already frozen")
        data["candidate"] = self.images()
        self.save(data)
        (self.diag / "candidate-images.json").write_text(json.dumps({"sourceCommit": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=self.root, text=True).strip(), "images": data["candidate"]}, indent=2) + "\n")

    def verify_images(self):
        data = self.load()
        current = self.images()
        require(len(data["candidate"]) == 3 and current == data["candidate"], "Candidate image inventory changed")
        with (self.metrics / "image-verifications.jsonl").open("a") as out:
            out.write(json.dumps({"time": time.time(), "images": current, "unchanged": True}) + "\n")

    def capture(self):
        self.verify_images()
        data = self.load()
        proof = self.evidence / "vps-upgrade.json"
        upgrade = json.loads(proof.read_text())
        expected = {"runtimeImage": data["candidate"]["runtime"]["id"], "toolsImage": data["candidate"]["tools"]["id"],
                    "databaseImage": data["candidate"]["db"]["id"]}
        require(upgrade["status"] == "PASS" and upgrade["candidateImages"] == expected, "Upgrade proof mismatch")
        for name in ("vps-upgrade.json", "vps-baseline.json"):
            shutil.copyfile(self.evidence / name, self.diag / name)
        data["proofHash"] = hashlib.sha256(proof.read_bytes()).hexdigest()
        self.save(data)
        (self.diag / "status.json").write_text(json.dumps({"upgradeProofAvailable": True, "scan": "NOT_STARTED",
            "upgradeSHA256": data["proofHash"], "fullUpload": "FULL UPLOAD NOT VERIFIED"}, indent=2) + "\n")

    def register_project(self, project):
        data = self.load()
        require(project == "campus24-test-" + str(os.getppid()) and project not in data["projects"], "Unexpected project owner")
        data["projects"].append(project)
        self.save(data)

    def cleanup_tests(self):
        self.verify_images()
        data = self.load()
        require(data.get("proofHash") == hashlib.sha256((self.evidence / "vps-upgrade.json").read_bytes()).hexdigest(), "Preserved proof required")
        protected = {x["id"] for x in data["candidate"].values()}
        baseline = json.loads((self.evidence / "vps-baseline.json").read_text())
        image_names, volumes = [], []
        for key in ROLES:
            name = "campus54-baseline-" + key
            image = json.loads(self.docker(["image", "inspect", name]))[0]
            require(image["Id"] == baseline[key], "Historical image identity changed")
            if image["Id"] not in protected:
                image_names.append(name)
        for project in data["projects"]:
            require(re.fullmatch(r"campus24-test-[0-9]+", project), "Invalid project record")
            require(not self.docker(["ps", "-aq", "--filter", "label=com.docker.compose.project=" + project]).strip(), "Test containers still present")
            name = project + "_pgdata"
            volume = json.loads(self.docker(["volume", "inspect", name]))[0]
            require(volume["Name"] == name and (volume.get("Labels") or {}).get("com.docker.compose.project") == project
                    and volume.get("Labels", {}).get("com.docker.compose.volume") == "pgdata", "Foreign volume")
            require(volume.get("Driver") == "local" and datetime.fromisoformat(volume["CreatedAt"].replace("Z", "+00:00")).timestamp() >= data["started"], "Volume predates this job")
            require(not self.docker(["ps", "-aq", "--filter", "volume=" + name]).strip(), "Volume in use")
            volumes.append(name)
        # Plan validation completes before the first destructive call. Never force removal.
        for name in image_names:
            self.docker(["image", "rm", name])
        for name in volumes:
            self.docker(["volume", "rm", name])
        self.verify_images()
        data["testsCleaned"] = True
        self.save(data)

    @staticmethod
    def filesystem(path):
        info = os.statvfs(path)
        return {"device": os.stat(path).st_dev, "total": info.f_blocks * info.f_frsize,
                "available": info.f_bavail * info.f_frsize, "used": (info.f_blocks - info.f_bfree) * info.f_frsize, "freeInodes": info.f_favail, "totalInodes": info.f_files}

    def filesystems(self):
        paths = self.load().get("filesystemPaths", {"workspace": str(self.root), "tmp": "/tmp"})
        available, errors = {}, {}
        for role, path in paths.items():
            try:
                available[role] = self.filesystem(path)
            except OSError as error:
                errors[role] = type(error).__name__
        return available, errors

    def sample(self):
        while not (self.evidence / "vps-disk-stop").exists():
            phase = (self.evidence / "vps-disk-phase").read_text().strip()
            fs, errors = self.filesystems()
            row = {"time": time.time(), "phase": phase, "filesystems": fs, "unavailablePaths": errors}
            with (self.metrics / "samples.jsonl").open("a") as out:
                out.write(json.dumps(row) + "\n")
            for _ in range(50):
                if (self.evidence / "vps-disk-stop").exists():
                    break
                time.sleep(0.1)
        (self.metrics / "sampler-complete").touch()

    def snapshot(self, phase):
        require(re.fullmatch(r"[a-z0-9-]+", phase), "Invalid phase")
        self.metrics.mkdir(exist_ok=True)
        (self.evidence / "vps-disk-phase").write_text(phase)
        fs, errors = self.filesystems()
        row = {"time": time.time(), "phase": phase, "filesystems": fs, "unavailablePaths": errors}
        if self.registry.exists():
            data = self.load()
            row["scratchBytes"] = {}
            for item in data["paths"]:
                if not item.get("removed"):
                    size = subprocess.check_output(["du", "-s", "-B1", item["path"]], stderr=subprocess.PIPE).split()[0]
                    row["scratchBytes"][item["role"]] = int(size)
        release = Path("/tmp/campus-vps-release")
        if release.is_dir():
            row["releaseFileBytes"] = {p.name: p.stat().st_size for p in release.iterdir() if p.is_file()}
        with (self.metrics / "snapshots.jsonl").open("a") as out:
            out.write(json.dumps(row) + "\n")
        print(json.dumps(row))

    def budget(self, gib, phase):
        self.verify_images()
        self.snapshot(phase + "-before")
        available = min(self.filesystem(self.root)["available"], self.filesystem("/tmp")["available"])
        if available < gib * GIB and phase == "trivy":
            self.guard()
            # This hosted VM belongs to this one job. Cache only, never images/system/volumes prune.
            require(self.load().get("testsCleaned"), "Measured deficit must follow addressed success cleanup")
            removed = {x["role"] for x in self.load()["paths"] if x.get("removed")}
            require((set(PREFIXES) - {"trivy-work"}).issubset(removed), "Build scratch cleanup must precede cache GC")
            self.docker(["builder", "prune", "--all", "--force"])
            self.verify_images()
            self.snapshot("trivy-after-conditional-buildkit-gc")
        for path in (self.root, Path("/tmp")):
            fs = self.filesystem(path)
            require(fs["available"] >= gib * GIB and (not fs["totalInodes"] or fs["freeInodes"] > 0), "BLOCKED_DISK: phase budget not met")
        self.snapshot(phase + "-budget-pass")

    def database_hash(self, data):
        roots = [Path(x["path"]) for x in data["paths"] if x["role"] == "trivy-work" and not x.get("removed")]
        require(len(roots) == 1, "Owned Trivy work directory required")
        with (roots[0] / "cache/db/trivy.db").open("rb") as handle:
            return hashlib.file_digest(handle, "sha256").hexdigest()

    def seal_scan(self):
        self.verify_images()
        data = self.load()
        directory = SECURITY_DIR
        hashes = {}
        for name in REPORTS:
            raw = (directory / name).read_bytes()
            hashes[name] = hashlib.sha256(raw).hexdigest()
            report = json.loads(raw)
            require("error" not in report, "Invalid scan/audit report")
            if name.startswith("campus24-"):
                role = name.removeprefix("campus24-").removesuffix(".json")
                require(report["Metadata"]["ImageID"] == data["candidate"][role]["id"], "Scan image mismatch")
                for result in report.get("Results", []):
                    for finding in result.get("Vulnerabilities", []):
                        require(finding["Severity"] != "CRITICAL" and not (finding["Severity"] == "HIGH" and finding.get("FixedVersion")), "Scan gate failed")
        require(hashes["vps-upgrade.json"] == data.get("proofHash"), "Upgrade proof changed after capture")
        require(json.loads((directory / "npm-production.json").read_text())["metadata"]["vulnerabilities"]["total"] == 0, "Production npm audit failed")
        scanner = json.loads((directory / "scanner-metadata.json").read_text())
        require(scanner["scanner"].get("Version") == "0.76.2" and scanner["scanner"].get("VulnerabilityDB")
                and scanner["databaseFileSHA256"] == self.database_hash(data), "DB metadata/hash missing or changed")
        data["scanHashes"] = hashes
        self.save(data)
        (self.metrics / "scan-complete.json").write_text(json.dumps({"scan": "COMPLETE", "hashes": hashes}, indent=2) + "\n")

    def verify_scan_seal(self, data):
        require(set(data.get("scanHashes", {})) == set(REPORTS), "Full successful scan required")
        for name, expected in data["scanHashes"].items():
            require(hashlib.sha256((SECURITY_DIR / name).read_bytes()).hexdigest() == expected, "Evidence changed")

    def cleanup_trivy(self):
        self.verify_images()
        self.remove_paths({"trivy-work"})
        self.verify_images()

    def finish(self):
        (self.evidence / "vps-disk-stop").touch()
        for _ in range(70):
            if (self.metrics / "sampler-complete").exists():
                break
            time.sleep(0.1)
        self.snapshot("finished")
        rows = []
        for name in ("samples.jsonl", "snapshots.jsonl"):
            path = self.metrics / name
            if path.exists():
                rows.extend(json.loads(line) for line in path.read_text().splitlines() if line)
        summary = {}
        for row in rows:
            for role, fs in row["filesystems"].items():
                key = str(fs["device"])
                cell = summary.setdefault(key, {"roles": [], "total": fs["total"], "minimumAvailable": fs["available"],
                    "minimumFreeInodes": fs["freeInodes"], "observedPeakUsed": 0})
                if role not in cell["roles"]:
                    cell["roles"].append(role)
                cell["minimumAvailable"] = min(cell["minimumAvailable"], fs["available"])
                cell["minimumFreeInodes"] = min(cell["minimumFreeInodes"], fs["freeInodes"])
                cell["observedPeakUsed"] = max(cell["observedPeakUsed"], fs.get("used", fs["total"] - fs["available"]))
        (self.metrics / "summary.json").write_text(json.dumps({"filesystems": summary, "samplingSeconds": 5,
            "scanComplete": bool(self.load().get("scanHashes")), "samplerComplete": (self.metrics / "sampler-complete").exists(),
            "limitation": "Observed sampled peak, not continuous maximum; FULL UPLOAD NOT VERIFIED"}, indent=2) + "\n")
        require((self.metrics / "sampler-complete").exists() and (self.metrics / "samples.jsonl").stat().st_size > 0,
                "Incomplete disk sampler; inspect diagnostic snapshots")


if __name__ == "__main__":
    try:
        parser = argparse.ArgumentParser()
        parser.add_argument("command")
        parser.add_argument("args", nargs="*")
        cli = parser.parse_args()
        disk = Disk()
        command, args = cli.command, cli.args
        if command == "init": disk.init()
        elif command == "snapshot": disk.snapshot(args[0])
        elif command == "sample": disk.sample()
        elif command == "register-path": disk.register_path(*args)
        elif command == "freeze": disk.freeze()
        elif command == "verify-images": disk.verify_images()
        elif command == "capture": disk.capture()
        elif command == "register-project": disk.register_project(args[0])
        elif command == "cleanup-build":
            require(set(args).issubset(set(PREFIXES) - {"trivy-work"}), "Not a build scratch role")
            disk.verify_images(); disk.remove_paths(set(args)); disk.verify_images()
        elif command == "cleanup-tests": disk.cleanup_tests()
        elif command == "budget": disk.budget(int(args[0]), args[1])
        elif command == "seal-scan": disk.seal_scan()
        elif command == "cleanup-trivy": disk.cleanup_trivy()
        elif command == "finish": disk.finish()
        else: raise ValueError("Unknown command")
    except Exception as error:
        # No subprocess stderr/env/secret content forwarded to the public log.
        print("STOP VPS CI disk lifecycle: " + (str(error) if isinstance(error, ValueError) else type(error).__name__), file=sys.stderr)
        sys.exit(1)
