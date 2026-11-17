"""Synthetic package bytes for unit/Windows tests, not release evidence."""
import hashlib
import importlib.util
import io
import json
import tarfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("package_format", ROOT / "ops/app-update/package.py")
f = importlib.util.module_from_spec(spec); spec.loader.exec_module(f)


def fixture(root):
    config = json.dumps({"architecture": "amd64", "os": "linux", "config": {"User": "1000:1000", "Labels": {"io.campus.role": "runtime"}}}).encode()
    image = "sha256:" + hashlib.sha256(config).hexdigest()
    with tarfile.open(root / "runtime.tar.gz", "w:gz") as archive:
        for name, content in [(image[7:]+".json", config), ("manifest.json", json.dumps([{"Config": image[7:]+".json", "Layers": [], "RepoTags": []}]).encode())]:
            item = tarfile.TarInfo(name); item.size = len(content); archive.addfile(item, io.BytesIO(content))
    target = {"format": f.FORMAT, "baselineSource": "a"*40, "targetId": "b"*64, "databaseImage": "sha256:"+"c"*64, "toolsImage": "sha256:"+"d"*64, "contract": {"environmentAccess": {}, "configuration": {"compose.yaml": "e"*64}, "migrations": [{"name": "20261101000000_initial", "sha256": "f"*64}]}}
    security = {"runtime": {"Metadata": {"ImageID": image, "OS": {"Family": "debian"}}, "Results": []}, "scanner": {"scanner": {"Version": "0.76.2", "VulnerabilityDB": {"Version": 2}}, "databaseFileSHA256": "a"*64}, "npmProduction": {"metadata": {"vulnerabilities": {"total": 0}}}}
    f.write(root / "runtime-security.json", security)
    m = {"format": f.FORMAT, "sourceCommit": "1"*40, "runtimeImage": image, "architecture": "linux/amd64", "target": target, "securitySHA256": f.sha(root / "runtime-security.json"), "runId": "123"}
    f.write(root / "app-release.json", m)
    sums(root)
    return m


def sums(root):
    (root / "SHA256SUMS").write_text(''.join(f.sha(root / n)+"  "+n+"\n" for n in sorted(f.FILES)))
