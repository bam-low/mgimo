#!/usr/bin/env python3
"""Trusted application-only format. No SSH, image loading, signing or deployment."""
import argparse
import hashlib
import importlib.util
import json
import re
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
FORMAT = "campus-app-update/1"
FILES = {"runtime.tar.gz", "app-release.json", "runtime-security.json"}
ID = r"sha256:[0-9a-f]{64}"
SHA = r"[0-9a-f]{40}"
HEX = r"[0-9a-f]{64}"
NAMESPACE = "campus-app-update"
IDENTITY = "campus-release-owner"
MAX_FILE = 2 * 1024**3


def require(ok, reason):
    if not ok:
        raise ValueError(reason)


def loads(data):
    def unique(pairs):
        out = {}
        for k, v in pairs:
            require(k not in out, "Повтор ключа JSON")
            out[k] = v
        return out
    return json.loads(data, object_pairs_hook=unique)


def sha(path):
    with Path(path).open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def contract(source):
    require(re.fullmatch(SHA, source), "Нужен полный SHA исходного кода")
    names = subprocess.check_output(["git", "ls-tree", "-r", "--name-only", source], cwd=REPO, text=True).splitlines()
    fixed = {".nvmrc", "next.config.ts", "prisma/schema.prisma", "prisma/migrations/migration_lock.toml",
             "ops/vps/compose.yaml", "ops/vps/Dockerfile", "ops/vps/Dockerfile.db", "ops/vps/Dockerfile.tools",
             "ops/vps/pg_hba.conf", "ops/vps/init-secrets.sh", "ops/vps/cleanup-client.mjs",
             "scripts/prepare-runtime.mjs", "scripts/launch-db-policy.mjs", "src/proxy.ts"}
    selected = sorted(n for n in names if n in fixed or n.startswith(("src/server/", "src/app/api/", "prisma/migrations/")))
    require(fixed.issubset(selected), "Неполный контракт конфигурации")
    values = {n: hashlib.sha256(subprocess.check_output(["git", "show", source + ":" + n], cwd=REPO)).hexdigest() for n in selected}
    migrations = [{"name": n.split("/")[2], "sha256": values[n]} for n in selected if re.fullmatch(r"prisma/migrations/[0-9]{14}_[a-z_]+/migration.sql", n)]
    # New environment reads anywhere in src are configuration changes too, even
    # when introduced by a client component outside the protected server tree.
    access = {}
    for name in names:
        if name.startswith("src/") and name.endswith((".ts", ".tsx", ".mjs", ".js")):
            data = subprocess.check_output(["git", "show", source + ":" + name], cwd=REPO).decode("utf-8")
            expressions = sorted(set(re.findall(r"process\.env[^\s;,(){}]+", data)))
            if expressions:
                access[name] = expressions
    return {"configuration": values, "migrations": migrations, "environmentAccess": access}


def target_valid(t):
    require(set(t) == {"format", "targetId", "baselineSource", "databaseImage", "toolsImage", "contract"}, "Неверный состав цели")
    require(t["format"] == FORMAT and re.fullmatch(HEX, t["targetId"]) and re.fullmatch(SHA, t["baselineSource"]), "Неверная цель")
    require(all(re.fullmatch(ID, t[k]) for k in ("databaseImage", "toolsImage")), "Неверные ID установленных образов")
    c = t["contract"]
    require(set(c) == {"configuration", "migrations", "environmentAccess"} and isinstance(c["configuration"], dict) and c["configuration"], "Нет контракта")
    require(all(isinstance(k, str) and re.fullmatch(HEX, v) for k, v in c["configuration"].items()), "Неверный контракт")
    rows = c["migrations"]
    require(isinstance(rows, list) and rows and all(set(r) == {"name", "sha256"} and re.fullmatch(r"[0-9]{14}_[a-z_]+", r["name"]) and re.fullmatch(HEX, r["sha256"]) for r in rows), "Неверные миграции")
    require([r["name"] for r in rows] == sorted({r["name"] for r in rows}), "Повтор миграции")


def validate(m, security):
    require(set(m) == {"format", "sourceCommit", "runtimeImage", "architecture", "target", "securitySHA256", "runId"}, "Неверный манифест")
    require(m["format"] == FORMAT and re.fullmatch(SHA, m["sourceCommit"]) and re.fullmatch(ID, m["runtimeImage"]) and m["architecture"] == "linux/amd64", "Неверный выпуск")
    require(re.fullmatch(r"[1-9][0-9]{0,19}", m["runId"]), "Неверный номер Actions")
    target_valid(m["target"])
    require(set(security) == {"runtime", "scanner", "npmProduction"}, "Неверный отчёт безопасности")
    require(security["runtime"]["Metadata"]["ImageID"] == m["runtimeImage"], "Отчёт относится к другому образу")
    require(security["runtime"]["Metadata"]["OS"]["Family"] == "debian", "Нет OS scan")
    for result in security["runtime"].get("Results", []):
        for v in result.get("Vulnerabilities", []):
            require(v["Severity"] != "CRITICAL" and not (v["Severity"] == "HIGH" and v.get("FixedVersion")), "Блокирующая уязвимость")
    require(security["scanner"]["scanner"]["Version"] == "0.76.2" and security["scanner"]["scanner"].get("VulnerabilityDB") and re.fullmatch(HEX, security["scanner"]["databaseFileSHA256"]), "Нет метаданных сканирования")
    require(security["npmProduction"]["metadata"]["vulnerabilities"]["total"] == 0, "Production audit не пройден")


def verify(root, signed=False, signers=None):
    root = Path(root)
    allowed = FILES | {"SHA256SUMS"} | ({"SHA256SUMS.sig"} if signed else set())
    require({p.name for p in root.iterdir()} == allowed, "Лишние или отсутствующие файлы пакета")
    require(all(p.is_file() and not p.is_symlink() and p.stat().st_size <= MAX_FILE for p in root.iterdir()), "Небезопасный файл")
    if signed:
        with (root / "SHA256SUMS").open("rb") as data:
            subprocess.run(["ssh-keygen", "-Y", "verify", "-f", str(signers), "-I", IDENTITY, "-n", NAMESPACE, "-s", str(root / "SHA256SUMS.sig")], stdin=data, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True)
    rows = (root / "SHA256SUMS").read_text(encoding="ascii").splitlines()
    require(len(rows) == 3 and all(re.fullmatch(r"[0-9a-f]{64}  [a-z.-]+", r) for r in rows) and {r[66:] for r in rows} == FILES, "Неверные контрольные суммы")
    require(all(sha(root / r[66:]) == r[:64] for r in rows), "Контрольная сумма не совпадает")
    require((root / "app-release.json").stat().st_size < 1024**2 and (root / "runtime-security.json").stat().st_size < 32 * 1024**2, "Слишком большие метаданные")
    m = loads((root / "app-release.json").read_bytes())
    security = loads((root / "runtime-security.json").read_bytes())
    require(m["securitySHA256"] == sha(root / "runtime-security.json"), "Подмена отчёта")
    validate(m, security)
    # Inspect the archive before docker load. Never extract arbitrary paths.
    with tarfile.open(root / "runtime.tar.gz") as archive:
        names = set()
        total = 0
        manifest = None
        config = None
        expected = m["runtimeImage"][7:]
        for member in archive:
            require(member.isfile() or member.isdir(), "Ссылки в Docker archive запрещены")
            require(not member.name.startswith("/") and ".." not in Path(member.name).parts and member.name not in names, "Небезопасный Docker archive")
            names.add(member.name)
            total += member.size
            require(total <= 4 * 1024**3, "Слишком большой Docker archive")
            if member.name == "manifest.json":
                require(member.size < 1024**2, "Слишком большой manifest")
                manifest = loads(archive.extractfile(member).read())
            if member.name in (expected + ".json", "blobs/sha256/" + expected):
                require(member.size < 4 * 1024**2, "Слишком большой config")
                config = archive.extractfile(member).read()
        require(manifest is not None and len(manifest) == 1 and config is not None, "Нужен один runtime-образ")
        require(manifest[0]["Config"] in (expected + ".json", "blobs/sha256/" + expected) and hashlib.sha256(config).hexdigest() == expected, "ID внутри архива не совпадает")
        cfg = loads(config)
        require(cfg["architecture"] == "amd64" and cfg["os"] == "linux" and cfg["config"]["User"] == "1000:1000" and cfg["config"]["Labels"]["io.campus.role"] == "runtime", "Неверная роль runtime")
    return m


def create(full, target, out, run_id):
    spec = importlib.util.spec_from_file_location("full_release", REPO / "ops/vps/release_manifest.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    original = module.verify(full)
    t = loads(Path(target).read_bytes())
    target_valid(t)
    require(contract(original["sourceCommit"]) == t["contract"], "Изменились схема или конфигурация; используйте docs/VPS_UPDATE_RUNBOOK.md")
    out = Path(out)
    out.mkdir(mode=0o700)
    with tarfile.open(Path(full) / "config.tar") as archive:
        def report(name):
            return loads(archive.extractfile("evidence/" + name).read())
        security = {"runtime": report("campus24-runtime.json"), "scanner": report("scanner-metadata.json"), "npmProduction": report("npm-production.json")}
    shutil.copyfile(Path(full) / "runtime.tar.gz", out / "runtime.tar.gz")
    write(out / "runtime-security.json", security)
    m = {"format": FORMAT, "sourceCommit": original["sourceCommit"], "runtimeImage": original["runtimeImage"], "architecture": "linux/amd64", "target": t, "securitySHA256": sha(out / "runtime-security.json"), "runId": run_id}
    write(out / "app-release.json", m)
    (out / "SHA256SUMS").write_text("".join(sha(out / n) + "  " + n + "\n" for n in sorted(FILES)), encoding="ascii")
    verify(out)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="action", required=True)
    p = sub.add_parser("contract"); p.add_argument("source"); p.add_argument("output")
    p = sub.add_parser("create"); p.add_argument("full"); p.add_argument("target"); p.add_argument("output"); p.add_argument("run_id")
    p = sub.add_parser("verify"); p.add_argument("directory"); p.add_argument("--signers")
    args = parser.parse_args()
    try:
        if args.action == "contract":
            write(args.output, {"sourceCommit": args.source, "contract": contract(args.source)})
        elif args.action == "create":
            create(args.full, args.target, args.output, args.run_id)
        else:
            verify(args.directory, bool(args.signers), args.signers)
        print("Проверка пакета приложения пройдена; это не разрешение Production GO")
    except Exception as e:
        print("СТОП: " + str(e), file=sys.stderr)
        sys.exit(1)
