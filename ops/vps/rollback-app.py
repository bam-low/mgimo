#!/usr/bin/env python3
"""Owner-only, guarded application rollback. Never downgrades the database."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
CONTRACT = json.loads((ROOT / 'migration-contract.json').read_text())
SUPPORTED = {
    '287912fe19df75404b81dd36ea1df5bb62187c71': 8,
    'f29c61109a761f2a20a0ecaf02ca6b7bf74f43c3': 9,
}
KINDS = {'ENROLLMENT_APPROVED', 'ENROLLMENT_REJECTED', 'APPLICATION_TAKEN',
         'APPLICATION_COMPLETED', 'APPLICATION_REJECTED', 'CERTIFICATE_READY', 'CERTIFICATE_UPDATED'}
ID = r'sha256:[a-f0-9]{64}'


def require(value, message):
    if not value:
        raise ValueError(message)


def trusted_directory(path):
    path = Path(path)
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022,
            'Нужен root-owned каталог без прав записи группы/остальных.')
    return path


def trusted(path):
    path = Path(path)
    require(path.is_absolute() and '..' not in path.parts, 'Нужен абсолютный доверенный путь.')
    for parent in path.parents:
        trusted_directory(parent)
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022,
            'Нужен проверенный root-owned файл без прав записи группы/остальных.')
    return path


def references(path):
    rows = trusted(path).read_text().splitlines()
    require(len(rows) == 5 and all(re.fullmatch(r'CAMPUS_[A-Z_]+=[^\s\x00]+', r) for r in rows), 'Неверный файл ссылок выпуска.')
    out = dict(r.split('=', 1) for r in rows)
    require(set(out) == {'CAMPUS_APP_IMAGE', 'CAMPUS_DB_IMAGE', 'CAMPUS_TOOLS_IMAGE', 'CAMPUS_SECRETS_DIR', 'CAMPUS_APP_PORT'}, 'Неверный состав ссылок.')
    require(all(re.fullmatch(ID, out[k]) for k in ('CAMPUS_APP_IMAGE', 'CAMPUS_DB_IMAGE', 'CAMPUS_TOOLS_IMAGE')), 'Нужны точные image IDs.')
    require(re.fullmatch(r'/[A-Za-z0-9/_.-]+', out['CAMPUS_SECRETS_DIR']) and re.fullmatch(r'\d{4,5}', out['CAMPUS_APP_PORT']) and 1024 <= int(out['CAMPUS_APP_PORT']) <= 65535, 'Неверный путь или порт.')
    return out


def validate_data(manifest, ledger, kinds):
    source = manifest.get('sourceCommit')
    require(source in SUPPORTED, 'Совместимость этого старого runtime не проверена. Откат запрещён.')
    expected = CONTRACT['baseline'] + CONTRACT['additive']
    require(ledger == expected, 'Текущий журнал миграций не совпадает с проверенным контрактом. Откат запрещён.')
    require(manifest.get('migrations') == expected[:SUPPORTED[source]], 'Миграции старого выпуска не совпадают с проверенным префиксом.')
    require(isinstance(kinds, list) and all(isinstance(k, str) and k in KINDS for k in kinds),
            'Старый runtime не поддерживает сохранённые уведомления (включая SCHEDULE_CANCELLED). Откат запрещён; сохраните БД и используйте совместимый текущий runtime.')


class Rollback:
    def __init__(self, current, target, manifest, compose, project):
        self.current = Path(current).resolve()
        self.target = Path(target).resolve()
        self.manifest = json.loads(trusted(manifest).read_text())
        self.compose = trusted(compose).resolve()
        require(self.compose.read_bytes() == (ROOT / 'compose.yaml').read_bytes(), 'Compose отличается от проверенной конфигурации.')
        require(re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,63}', project), 'Неверный Compose project.')
        self.project = project
        self.a, self.b = references(current), references(target)
        require({k: v for k, v in self.a.items() if k != 'CAMPUS_APP_IMAGE'} == {k: v for k, v in self.b.items() if k != 'CAMPUS_APP_IMAGE'},
                'Откат не должен менять PostgreSQL, tools, порт или secrets.')
        require(self.manifest.get('sourceCommit') in SUPPORTED and self.manifest.get('runtimeImage') == self.b['CAMPUS_APP_IMAGE'], 'Неверный проверенный манифест старого runtime.')
        self.env = {k: v for k, v in os.environ.items() if not k.startswith(('DOCKER_', 'CAMPUS_', 'COMPOSE_'))}
        self.env['PATH'] = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
        raw = (Path(self.a['CAMPUS_SECRETS_DIR']) / 'runtime.env').read_text()
        urls = [r.split('=', 1)[1] for r in raw.splitlines() if r.startswith('DATABASE_URL=')]
        require(len(urls) == 1, 'Не определена БД работающего приложения.')
        url = urlparse(urls[0])
        require(url.hostname == 'db' and url.username == 'campus_runtime' and re.fullmatch(r'/campus(?:_[a-z0-9_]+)?', url.path), 'Нужна приватная БД текущего приложения.')
        self.database_name = url.path[1:]

    def run(self, args, data=None):
        r = subprocess.run(args, input=data, env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180)
        require(r.returncode == 0, 'Проверка/команда не выполнена. Переключение запрещено; подробности соединения скрыты.')
        return r.stdout

    def docker(self, *args, data=None):
        return self.run(['docker', '--host=unix:///var/run/docker.sock', *args], data)

    def dc(self, target, *args, data=None):
        return self.docker('compose', '--project-name', self.project, '--profile', 'ops', '--env-file', str(self.target if target else self.current), '-f', str(self.compose), *args, data=data)

    def inspect(self, target, service):
        ids = self.dc(target, 'ps', '-a', '-q', service).decode().splitlines()
        require(len(ids) == 1, 'Не найден единственный контейнер текущего сервиса.')
        return json.loads(self.docker('inspect', ids[0]))[0]

    def database(self):
        d = self.inspect(False, 'db')
        require(d['State']['Running'] and d['State']['Health']['Status'] == 'healthy' and d['Image'] == self.a['CAMPUS_DB_IMAGE']
                and d['Config']['Labels']['com.docker.compose.project'] == self.project and d['Config']['User'] == '70:70'
                and not d['HostConfig'].get('PortBindings') and not d['HostConfig']['Privileged'], 'БД изменилась или не соответствует проверенной приватной конфигурации.')
        return {k: d[k] for k in ('Id', 'Image', 'RestartCount')} | {'startedAt': d['State']['StartedAt']}

    def guard(self):
        sql = '''BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='5s';
SELECT coalesce(json_agg(json_build_object('name',migration_name,'sha256',checksum) ORDER BY migration_name),'[]'::json)::text FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL OR applied_steps_count<>1;
SELECT coalesce(json_agg(kind ORDER BY kind),'[]'::json)::text FROM (SELECT DISTINCT kind FROM "Notification") t;
COMMIT;
'''
        rows = self.dc(False, 'exec', '-T', 'db', 'sh', '-c', 'export PGPASSWORD="$(cat /run/secrets/pg-admin-pw)"; exec psql -XqAt -v ON_ERROR_STOP=1 -U campus_admin -d "$1"', 'sh', self.database_name, data=sql.encode()).decode().splitlines()
        require(len(rows) == 3 and rows[1] == '0', 'Не удалось подтвердить завершённые миграции и типы уведомлений.')
        validate_data(self.manifest, json.loads(rows[0]), json.loads(rows[2]))

    def switch(self):
        database = self.database()
        current = self.inspect(False, 'app')
        require(current['Image'] == self.a['CAMPUS_APP_IMAGE'] and current['State']['Running'] and current['State']['Health']['Status'] == 'healthy', 'Работающее приложение отличается от текущего выпуска.')
        # Read-only first pass: an already incompatible DB leaves the current app running.
        self.guard()
        self.run(['python3', str(ROOT / 'preflight.py'), str(self.target)])
        self.dc(False, 'stop', 'app')
        try:
            # App is the write fence. Timers/other writers must already be stopped by the owner.
            self.guard()
            require(self.database() == database, 'БД изменилась перед переключением.')
            self.dc(True, 'up', '-d', '--no-deps', '--wait', '--wait-timeout', '120', 'app')
            app = self.inspect(True, 'app')
            require(app['Image'] == self.b['CAMPUS_APP_IMAGE'] and app['State']['Health']['Status'] == 'healthy', 'Старый runtime не прошёл smoke.')
            require(self.database() == database, 'PostgreSQL изменился при откате.')
        except Exception:
            self.dc(False, 'up', '-d', '--no-deps', '--wait', '--wait-timeout', '120', 'app')
            raise
        print('PASS: проверенный старый runtime healthy; PostgreSQL и записи сохранены. Нужен защищённый прикладной smoke перед возобновлением записей.')


def main():
    p = argparse.ArgumentParser(description='Проверенный откат только приложения, без изменения БД.')
    for key in ('current-env', 'target-env', 'target-manifest', 'compose', 'project'):
        p.add_argument('--' + key, required=True)
    p.add_argument('--owner-approved', action='store_true')
    args = p.parse_args()
    try:
        require(os.geteuid() == 0 and args.owner_approved, 'Нужен root и отдельное разрешение владельца.')
        directory = trusted(args.current_env).parent
        fd = os.open(directory / '.campus-rollback.lock', os.O_CREAT | os.O_NOFOLLOW | os.O_RDWR, 0o600)
        with os.fdopen(fd, 'r+') as lock:
            info = os.fstat(lock.fileno())
            require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o077, 'Небезопасный файл блокировки.')
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            Rollback(args.current_env, args.target_env, args.target_manifest, args.compose, args.project).switch()
        return 0
    except Exception as e:
        print('STOP: ' + (str(e) if isinstance(e, ValueError) else 'Откат не подтверждён. Используйте текущий совместимый runtime и сохранённую БД.'), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
