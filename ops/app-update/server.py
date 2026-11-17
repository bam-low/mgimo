#!/usr/bin/python3 -I
"""Root-owned coordinator, installed from a reviewed checkout; never from a bundle."""
import argparse
import fcntl
import hashlib
import grp
import json
import os
import re
import secrets
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

# The sibling is reviewed/installed together, not imported from the uploaded package.
import importlib.util
spec = importlib.util.spec_from_file_location("app_package", Path(__file__).with_name("package.py"))
fmt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fmt)

FULL = "Используйте полный сценарий: docs/VPS_UPDATE_RUNBOOK.md"
TIMERS = ["campus-backup.timer", "campus-cleanup.timer", "campus-monitor.timer"]


def require(ok, reason):
    fmt.require(ok, reason + ". " + FULL)


def atomic(path, value, raw=False):
    path = Path(path)
    fd, name = tempfile.mkstemp(prefix=".update-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as file:
            file.write(value if raw else (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode())
            file.flush(); os.fsync(file.fileno())
        os.replace(name, path)
        fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(fd)
        finally: os.close(fd)
    finally:
        if os.path.exists(name): os.unlink(name)


def trusted(path, directory=False):
    p = Path(path)
    for item in [p, *p.parents]:
        st = item.lstat()
        require(not stat.S_ISLNK(st.st_mode) and st.st_uid == os.geteuid() and not st.st_mode & 0o022, "Недоверенный путь конфигурации")
    require(p.is_dir() if directory else p.is_file(), "Нет доверенной конфигурации")


class Updater:
    WAIT_SECONDS = 120
    def __init__(self, cfg):
        self.c = cfg
        self.state_dir = Path(cfg["stateDir"])
        self.state_path = self.state_dir / "state.json"
        self.journal = self.state_dir / "pending.json"
        self.envfile = Path(cfg["envFile"])
        self.compose = Path(cfg["compose"])
        self.project = cfg["project"]
        require(self.compose.name == "compose.yaml", "Нужен стандартный Compose-файл базового выпуска")
        require(re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,62}", self.project), "Неверный Compose project")
        self.command_env = {k: v for k, v in os.environ.items() if k not in {"DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "COMPOSE_FILE", "COMPOSE_PROJECT_NAME", "COMPOSE_PROFILES"} and not k.startswith("CAMPUS_")}
        self.command_env["PATH"] = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

    def event(self, phase, **details):
        fd = os.open(self.state_dir / "operations.jsonl", os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "a", encoding="utf-8") as file:
            file.write(json.dumps({"time": int(time.time()), "phase": phase, **details}, ensure_ascii=False) + "\n")
            file.flush(); os.fsync(file.fileno())

    def run(self, args, data=None):
        result = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=self.command_env, timeout=900)
        require(result.returncode == 0, "Команда не выполнена: " + args[0])
        return result.stdout

    def docker(self, *args, data=None):
        return self.run(["docker", "--host=unix:///var/run/docker.sock", *args], data)

    def dc(self, *args, data=None):
        return self.docker("compose", "--project-name", self.project, "--profile", "ops", "--env-file", str(self.envfile), "-f", str(self.compose), *args, data=data)

    def env(self):
        # Explicit references only. Never source shell code or inherit CAMPUS_* overrides.
        rows = self.envfile.read_text().splitlines()
        require(len(rows) == 5 and all(re.fullmatch(r"CAMPUS_[A-Z_]+=[^\s\x00]+", r) for r in rows), "release.env должен содержать пять простых ссылок")
        result = dict(r.split("=", 1) for r in rows)
        require(set(result) == {"CAMPUS_APP_IMAGE", "CAMPUS_DB_IMAGE", "CAMPUS_TOOLS_IMAGE", "CAMPUS_SECRETS_DIR", "CAMPUS_APP_PORT"}, "Неверный release.env")
        require(all(re.fullmatch(fmt.ID, result[k]) for k in ("CAMPUS_APP_IMAGE", "CAMPUS_DB_IMAGE", "CAMPUS_TOOLS_IMAGE")), "Нужны точные image IDs")
        require(re.fullmatch(r"/[A-Za-z0-9/_.-]+", result["CAMPUS_SECRETS_DIR"]) and 1024 <= int(result["CAMPUS_APP_PORT"]) <= 65535, "Неверные пути или порт")
        return result

    def database(self):
        rows = self.dc("ps", "-q", "db").decode().splitlines()
        require(len(rows) == 1, "Не найдена единственная работающая БД")
        d = json.loads(self.docker("inspect", rows[0]))[0]
        require(d["State"]["Running"] and d["State"]["Health"]["Status"] == "healthy" and not d["HostConfig"].get("PortBindings"), "БД не healthy или опубликована наружу")
        require(d["Config"]["Labels"]["com.docker.compose.project"] == self.project and d["Config"]["User"] == "70:70" and not d["HostConfig"]["Privileged"], "Чужой или небезопасный Compose project")
        return {"container": d["Id"], "image": d["Image"], "startedAt": d["State"]["StartedAt"], "restartCount": d["RestartCount"]}

    def ledger(self):
        query = '''SELECT coalesce(json_agg(json_build_object('name',migration_name,'sha256',checksum) ORDER BY migration_name),'[]'::json)::text FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;
'''
        result = self.dc("exec", "-T", "db", "sh", "-c", 'export PGPASSWORD="$(cat /run/secrets/pg-admin-pw)"; exec psql -X -v ON_ERROR_STOP=1 -U campus_admin -d campus -At', data=query.encode()).decode().splitlines()
        require(len(result) == 2 and result[1] == "0", "Есть незавершённые или откаченные миграции")
        return fmt.loads(result[0])

    def file_digests(self, paths):
        return {str(p): fmt.sha(p) for p in paths}

    def fingerprint(self):
        env = self.env()
        env.pop("CAMPUS_APP_IMAGE")
        # Kept only in root-private state; no secret hashes in public target or logs.
        source = fmt.loads(Path(self.c["sourceContract"]).read_bytes())
        files = [self.compose.parent / n.removeprefix("ops/vps/") for n in source["contract"]["configuration"] if n.startswith("ops/vps/")]
        files += [Path(self.c["backupRecipients"])]
        files += [Path(env["CAMPUS_SECRETS_DIR"]) / n for n in ("runtime.env", "runtime-db.env", "migration.env", "db-ca.pem")]
        return hashlib.sha256(json.dumps({"env": env, "files": self.file_digests(files)}, sort_keys=True).encode()).hexdigest()

    def current_app(self):
        rows = self.dc("ps", "-q", "app").decode().splitlines()
        require(len(rows) == 1, "Приложение не запущено")
        app = json.loads(self.docker("inspect", rows[0]))[0]
        require(app["State"]["Running"] and app["Image"] == self.env()["CAMPUS_APP_IMAGE"], "Образ работающего приложения отличается от release.env")
        require(app["Config"]["User"] == "1000:1000" and app["HostConfig"]["ReadonlyRootfs"] and not app["HostConfig"]["Privileged"], "Небезопасный runtime")
        ports = app["HostConfig"].get("PortBindings", {}).get("3000/tcp", [])
        require(len(ports) == 1 and ports[0]["HostIp"] == "127.0.0.1" and ports[0]["HostPort"] == self.env()["CAMPUS_APP_PORT"], "Приложение должно слушать только ожидаемый loopback-порт")
        return app

    def initialize(self):
        require(not self.state_path.exists() and not self.journal.exists(), "Цель уже настроена")
        baseline = fmt.loads(Path(self.c["baselineManifest"]).read_bytes())
        source = fmt.loads(Path(self.c["sourceContract"]).read_bytes())
        require(source["sourceCommit"] == baseline["sourceCommit"], "Контракт относится к другому исходному выпуску")
        require(all(fmt.sha(self.compose.parent / name.removeprefix("ops/vps/")) == value for name, value in source["contract"]["configuration"].items() if name.startswith("ops/vps/")), "Установленная конфигурация не совпадает с исходным контрактом")
        env = self.env()
        db = self.database()
        require(db["image"] == env["CAMPUS_DB_IMAGE"] == baseline["databaseImage"] and env["CAMPUS_TOOLS_IMAGE"] == baseline["toolsImage"], "Установленные образы не совпадают с базовым выпуском")
        require(env["CAMPUS_APP_IMAGE"] == baseline["runtimeImage"], "Базовое приложение не совпадает")
        self.current_app()
        require(self.ledger() == baseline["migrations"] == source["contract"]["migrations"], "Журнал миграций не совпадает с базой")
        target = {"format": fmt.FORMAT, "targetId": secrets.token_hex(32), "baselineSource": source["sourceCommit"], "databaseImage": db["image"], "toolsImage": env["CAMPUS_TOOLS_IMAGE"], "contract": source["contract"]}
        fmt.target_valid(target)
        state = {"target": target, "fingerprint": self.fingerprint(), "sourceCommit": source["sourceCommit"], "runtimeImage": env["CAMPUS_APP_IMAGE"], "previous": None}
        atomic(self.state_path, state)
        return target

    def compatible(self, manifest, state):
        require(manifest["target"] == state["target"], "Пакет предназначен для другой цели, схемы или конфигурации")
        require(self.fingerprint() == state["fingerprint"], "Изменилась конфигурация или секреты работающего приложения")
        db = self.database()
        require(db["image"] == manifest["target"]["databaseImage"], "Фактический ID PostgreSQL отличается от подписанного")
        require(self.ledger() == manifest["target"]["contract"]["migrations"], "Изменился журнал применённых миграций")
        require(self.current_app()["Image"] == state["runtimeImage"], "Состояние приложения изменено вне сценария")
        return db

    def set_image(self, image):
        require(re.fullmatch(fmt.ID, image), "Неверный runtime ID")
        rows = self.envfile.read_text().splitlines()
        atomic(self.envfile, ("\n".join("CAMPUS_APP_IMAGE=" + image if r.startswith("CAMPUS_APP_IMAGE=") else r for r in rows) + "\n").encode(), True)

    def smoke(self, image):
        app = self.current_app()
        require(app["Image"] == image and app["State"]["Health"]["Status"] == "healthy", "Приложение не healthy")
        port = self.env()["CAMPUS_APP_PORT"]
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        for path, expected in (("/api/structure", 200), ("/api/group", 401)):
            try:
                with opener.open("http://127.0.0.1:" + port + path, timeout=10) as r:
                    code = r.status
            except urllib.error.HTTPError as error:
                code = error.code
            require(code == expected, "Smoke: неожиданный HTTP-статус")

    def timers(self):
        # Stopping a timer does not stop an already-running service. Refuse that case.
        active = []
        for timer in TIMERS:
            result = subprocess.run(["systemctl", "is-active", timer], stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=self.command_env)
            if result.stdout.strip() == b"active": active.append(timer)
            result = subprocess.run(["systemctl", "is-active", timer.replace(".timer", ".service")], stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=self.command_env)
            require(result.stdout.strip() in (b"inactive", b"failed", b"unknown"), "Служебная операция уже выполняется")
        return active

    def timer_action(self, action, timers):
        if timers: self.run(["systemctl", action, *timers])

    def publish_backup(self, source, destination):
        # Root-controlled export, readable only to the existing backup group.
        with destination.open("xb") as out, source.open("rb") as data:
            shutil.copyfileobj(data, out)
            out.flush(); os.fsync(out.fileno())
        os.chown(destination, 0, grp.getgrnam("campus-backup").gr_gid)
        os.chmod(destination, 0o640)

    AGE_PROGRAM = "age"

    def backup(self):
        # Use this exact project/container, never an unrelated service's default
        # Compose project. Only ciphertext reaches disk; no recovery key on VPS.
        directory = Path(self.c["backupDir"])
        name = "campus-" + time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + ".dump.age"
        final = directory / name
        require(not final.exists(), "Копия с этим временем уже существует; повторите позже")
        fd, temporary = tempfile.mkstemp(prefix=".app-update-", dir=directory)
        dump = encrypted = None
        try:
            command = ["docker", "--host=unix:///var/run/docker.sock", "compose", "--project-name", self.project, "--env-file", str(self.envfile), "-f", str(self.compose), "exec", "-T", "db", "sh", "-c", 'export PGPASSWORD="$(cat /run/secrets/pg-admin-pw)"; exec pg_dump -U campus_admin -d campus --format=custom --no-owner --no-acl']
            with os.fdopen(fd, "wb") as output:
                dump = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=self.command_env)
                encrypted = subprocess.Popen([self.AGE_PROGRAM, "-R", self.c["backupRecipients"]], stdin=dump.stdout, stdout=output, stderr=subprocess.DEVNULL, env=self.command_env)
                dump.stdout.close()
                require(encrypted.wait(timeout=900) == 0 and dump.wait(timeout=30) == 0, "Не удалось создать encrypted backup")
                output.flush(); os.fsync(output.fileno())
            require(Path(temporary).stat().st_size > 100, "Пустой backup")
            with Path(temporary).open("rb") as file:
                require(file.read(22) == b"age-encryption.org/v1\n", "Копия не является age ciphertext")
            os.link(temporary, final) # Exclusive publication, never overwrite an earlier backup.
            export = Path(self.c["exportDir"]) / name
            self.publish_backup(final, export)
            require(export.is_file() and not export.is_symlink() and fmt.sha(export) == fmt.sha(final), "Нет экспортной копии backup")
            return {"file": name, "sha256": fmt.sha(export), "bytes": export.stat().st_size}
        finally:
            for process in (encrypted, dump):
                if process is not None and process.poll() is None:
                    process.kill(); process.wait()
            if os.path.exists(temporary): os.unlink(temporary)

    def recover(self):
        require(self.journal.exists(), "Нет незавершённого обновления")
        j = fmt.loads(self.journal.read_bytes())
        require(self.database() == j["database"], "БД изменилась во время обновления; нужен ручной разбор")
        require(self.fingerprint() == j["previous"]["fingerprint"] and self.ledger() == j["previous"]["target"]["contract"]["migrations"], "Схема или конфигурация изменились; автоматический откат приложения небезопасен")
        self.event("rollback-start", runtimeImage=j["previous"]["runtimeImage"])
        self.set_image(j["previous"]["runtimeImage"])
        self.dc("up", "-d", "--no-deps", "--wait", "--wait-timeout", str(self.WAIT_SECONDS), "app")
        self.smoke(j["previous"]["runtimeImage"])
        require(self.database() == j["database"], "БД изменилась при откате")
        atomic(self.state_path, j["previous"])
        self.timer_action("start", j["timers"])
        self.journal.unlink()
        self.event("rollback-healthy", sourceCommit=j["previous"]["sourceCommit"])
        return {"status": "ROLLED_BACK", "sourceCommit": j["previous"]["sourceCommit"], "databaseUnchanged": True}

    def snapshot(self, incoming, destination):
        require(incoming.is_dir() and not incoming.is_symlink(), "Нет каталога входящего пакета")
        require({p.name for p in incoming.iterdir()} == fmt.FILES | {"SHA256SUMS", "SHA256SUMS.sig"}, "Неверный состав загрузки")
        # No trusted code/paths are taken from the uploaded payload. Private snapshot avoids TOCTOU.
        fd = os.open(incoming, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            for name in sorted(fmt.FILES | {"SHA256SUMS", "SHA256SUMS.sig"}):
                source = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
                with os.fdopen(source, "rb") as src:
                    st = os.fstat(src.fileno())
                    require(stat.S_ISREG(st.st_mode) and st.st_nlink == 1 and st.st_size <= fmt.MAX_FILE, "Небезопасный входящий файл")
                    with (destination / name).open("xb") as out:
                        count = 0
                        while chunk := src.read(1024**2):
                            count += len(chunk)
                            require(count <= st.st_size, "Файл изменился при копировании")
                            out.write(chunk)
                    require(count == st.st_size and os.fstat(src.fileno()).st_mtime_ns == st.st_mtime_ns, "Файл изменился при копировании")
        finally:
            os.close(fd)

    def apply(self, token):
        require(re.fullmatch(r"[0-9a-f]{32}", token), "Неверный идентификатор доставки")
        require(not self.journal.exists(), "Есть незавершённая операция; сначала recover")
        state = fmt.loads(self.state_path.read_bytes())
        with tempfile.TemporaryDirectory(prefix="verify-", dir=self.state_dir) as tmp:
            snapshot = Path(tmp)
            self.snapshot(Path(self.c["inbox"]) / token, snapshot)
            manifest = fmt.verify(snapshot, True, self.c["signers"])
            self.event("signature-verified", sourceCommit=manifest["sourceCommit"], runtimeImage=manifest["runtimeImage"])
            db = self.compatible(manifest, state)
            if manifest["sourceCommit"] == state["sourceCommit"] and manifest["runtimeImage"] == state["runtimeImage"]:
                self.smoke(state["runtimeImage"])
                return {"status": "ALREADY_INSTALLED", "sourceCommit": state["sourceCommit"], "databaseUnchanged": True, **({"backup": state["backup"]} if "backup" in state else {})}
            require(shutil.disk_usage(self.state_dir).free >= 3 * 1024**3 + (snapshot / "runtime.tar.gz").stat().st_size * 4, "Недостаточно места для приложения и backup")
            self.docker("image", "load", "--input", str(snapshot / "runtime.tar.gz"))
            image = json.loads(self.docker("image", "inspect", manifest["runtimeImage"]))[0]
            require(image["Id"] == manifest["runtimeImage"] and image["Config"]["User"] == "1000:1000" and image["Config"]["Labels"]["io.campus.role"] == "runtime", "Загружен другой образ")
            timers = self.timers()
            atomic(self.journal, {"previous": state, "database": db, "timers": timers})
            phase = "PAUSE_TIMERS"
            try:
                self.timer_action("stop", timers)
                # Close timer/service race after stopping scheduling.
                self.timers()
                self.event("stop-app")
                self.dc("stop", "app")
                phase = "BACKUP"
                backup = self.backup()
                self.event("encrypted-backup", **backup)
                phase = "RECHECK"
                # No writers from this app; re-check before the first switch.
                require(self.database() == db and self.ledger() == state["target"]["contract"]["migrations"] and self.fingerprint() == state["fingerprint"], "Цель изменилась после копирования")
                phase = "START_APP"
                self.event("switch-app", runtimeImage=manifest["runtimeImage"])
                self.set_image(manifest["runtimeImage"])
                self.dc("up", "-d", "--no-deps", "--wait", "--wait-timeout", str(self.WAIT_SECONDS), "app")
                phase = "SMOKE"
                self.smoke(manifest["runtimeImage"])
                require(self.database() == db, "PostgreSQL изменился при обновлении")
                updated = {**state, "sourceCommit": manifest["sourceCommit"], "runtimeImage": manifest["runtimeImage"], "previous": {k: v for k, v in state.items() if k != "previous"}, "backup": backup}
                release_dir = self.state_dir / (manifest["sourceCommit"] + "-" + token)
                shutil.copytree(snapshot, release_dir)
                atomic(self.state_path, updated)
                self.timer_action("start", timers)
                self.journal.unlink()
                self.event("update-healthy", sourceCommit=manifest["sourceCommit"])
                return {"status": "UPDATED", "sourceCommit": manifest["sourceCommit"], "runtimeImage": manifest["runtimeImage"], "databaseUnchanged": True, "backup": backup}
            except BaseException as error:
                self.event("update-failed-recovering", failurePhase=phase, errorCode=type(error).__name__)
                result = self.recover()
                result["updateFailed"] = True
                result["failurePhase"] = phase
                result["errorCode"] = type(error).__name__
                return result

    def rollback(self):
        require(not self.journal.exists(), "Сначала recover")
        state = fmt.loads(self.state_path.read_bytes())
        previous = state.get("previous")
        require(previous is not None, "Нет сохранённого приложения для отката")
        db = self.compatible({"target": state["target"]}, state)
        atomic(self.journal, {"previous": previous, "database": db, "timers": self.timers()})
        j = fmt.loads(self.journal.read_bytes())
        self.timer_action("stop", j["timers"])
        return self.recover()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("action", choices=["target", "apply", "recover", "rollback"])
    p.add_argument("token", nargs="?")
    p.add_argument("--config", default="/etc/campus/app-update.json")
    a = p.parse_args()
    require(os.geteuid() == 0, "Нужен root через sudo")
    trusted(Path(__file__).resolve()); trusted(Path(__file__).with_name("package.py"))
    trusted(a.config)
    c = fmt.loads(Path(a.config).read_bytes())
    require(set(c) == {"stateDir", "envFile", "compose", "project", "baselineManifest", "sourceContract", "inbox", "signers", "backupDir", "exportDir", "backupRecipients"}, "Неверный состав настроек")
    for key in ("envFile", "compose", "baselineManifest", "sourceContract", "signers", "backupRecipients"): trusted(c[key])
    for key in ("stateDir", "backupDir", "exportDir"): trusted(c[key], True)
    require(Path(c["exportDir"]).stat().st_gid == grp.getgrnam("campus-backup").gr_gid, "Нужна группа campus-backup для экспортного каталога")
    require(shutil.which("age") is not None, "Не установлен age для encrypted backup")
    with (Path(c["stateDir"]) / "update.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        updater = Updater(c)
        for name in ("state.json", "pending.json"):
            if (updater.state_dir / name).exists(): trusted(updater.state_dir / name)
        if a.action == "target":
            require(not updater.journal.exists(), "Сначала recover")
            result = fmt.loads(updater.state_path.read_bytes())["target"] if updater.state_path.exists() else updater.initialize()
            updater.compatible({"target": result}, fmt.loads(updater.state_path.read_bytes()))
        elif a.action == "apply": result = updater.apply(a.token or "")
        elif a.action == "recover": result = updater.recover()
        else: result = updater.rollback()
        receipt = {"action": a.action, "time": int(time.time()), **result}
        atomic(updater.state_dir / "last-result.json", receipt)
        encoded = json.dumps(result, ensure_ascii=False)
        print(encoded if a.action == "target" else "\nCAMPUS_APP_RESULT=" + encoded)
        return 2 if result.get("updateFailed") else 0


if __name__ == "__main__":
    def interrupted(*_): raise RuntimeError("Операция прервана")
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    os.umask(0o077)
    try: sys.exit(main())
    except Exception as error:
        # Never print subprocess stderr, env, command credentials or DB contents.
        print("СТОП: " + (str(error) if isinstance(error, (ValueError, RuntimeError)) else "Не удалось завершить операцию; проверьте pending.json и выполните recover") , file=sys.stderr)
        sys.exit(1)
