# Первый закрытый запуск на VPS — инструкция владельцу

**Подготовка, не разрешение deploy.** [Issue #24](https://github.com/bam-low/mgimo/issues/24), решение и угрозы — [VPS architecture](VPS_ARCHITECTURE.md). Не выполняйте команды с `YOUR_…` до замены на свои значения. Не присылайте пароли, адреса, SSH/age keys или env в чат, Issue, Git и screenshots. Все данные приложения только вымышленные. Обычная регистрация не создаёт STAFF.

Vercel Hobby + Neon Free сохранены отдельным путём в [предыдущем runbook](FIRST_DEPLOY_RUNBOOK.md). Нельзя смешивать их URL/TLS/роли с этим стендом. Ничего в CI не покупает сервер и не выполняет deploy.

## A. Ревью → ручной merge → отдельное разрешение покупки

Сначала владелец проверяет Draft PR, отчёты всех CI и [checklist](VPS_LAUNCH_CHECKLIST.md), замечания исправляются, затем владелец вручную утверждает и объединяет PR. **Только после этого и отдельного решения купить VPS начинается часть B.** До A можно изучать документы и задать поддержке вопросы, но нельзя вводить платёжные данные/создавать ресурсы. Успех CI не означает GO для запуска: security/provider gates остаются.

## B. Проверить тариф, цену, доступ и заказать только после разрешения

1. На сайте Fatmetal откройте «VPS/VDS → Тарифы → Россия → Старт». На 05.11.2026 официальный [pricing](https://fatmetal.ru/pricing/vps) показывает **500 ₽/месяц**, 2 vCPU, 4 GiB RAM, 50 GiB NVMe, IPv4+IPv6, KVM. Маркетинговый «от 257» не цена этого тарифа. Годовая скидка не входит в расчёт; выбирайте месяц без допуслуг. Скрин итоговой цены сохраняйте приватно, не с персональными данными в PR.
2. До оплаты уточните в checkout/поддержке: 500 ₽ окончательно? НДС, IPv4, установка, DDoS, трафик, cancellation/возврат, автопродление и минимальный платёж? Публичный IPv4 **статический выделенный**, входящие 22/80/443 разрешены, не CGNAT? Есть root SSH key injection и web/rescue console? Debian 13 amd64 доступен? Если нет — Ubuntu 24.04 LTS amd64; не неизвестный образ. Обещанные backup/restore провайдера не доказывают включённые автоматические копии.
3. Домен: свой существующий FQDN = 0 ₽ дополнительных только если он уже оплачен/под контролем. Бесплатный provider FQDN **не подтверждён**: уточните управление A/AAAA, право получения TLS и срок. Новый домен имеет отдельную цену покупки/продления, здесь не утверждён. **Нет контролируемого домена — STOP перед HTTPS/deploy.** Не обещаем автоматически доверенный сертификат raw IPv4. Альтернатива до решения — локальный стенд; SSH-туннель только отдельная закрытая проверка, не конкурсный публичный URL.
4. Offsite: уже имеющийся компьютер/диск владельца + SSH-получение encrypted копий = 0 ₽ новых сервисов, но нужны ежедневный доступ, место и собственная политика 30 дней. VPS-only backup недостаточен. Provider S3/диски/автобэкапы не включать без отдельной цены/разрешения.
5. После зафиксированного бюджета и явного B-разрешения: создать аккаунт с MFA, выбрать месячный Старт/OS, добавить **публичный** SSH key, оплатить без addons. Записать приватно invoice, статический адрес, console/rescue и даты продления. Codex этого не делает. Если свойства не совпали — STOP, не компенсировать публичными портами/ослаблением TLS.

## C. Harden пустой VPS, приложение ещё не запускать

Работает владелец в terminal; примеры `YOUR_VPS_IP`, `YOUR_DOMAIN` не реальные адреса. Сверьте SSH host fingerprint через независимую console провайдера; не отключайте StrictHostKeyChecking.

```sh
ssh-keygen -t ed25519 -a 64 -f ~/.ssh/campus_admin
ssh -i ~/.ssh/campus_admin root@YOUR_VPS_IP
cat /etc/os-release
uname -m
timedatectl status
```

Ожидаются Debian 13 или Ubuntu 24.04 и x86_64, правильные дата/NTP. **Оставьте эту root-сессию открытой.** Проверьте root authorized_keys: копирование ниже допустимо только если там исключительно выбранный публичный ключ владельца; чужие/provider keys не переносите в admin. Создайте admin, не добавляйте его в docker group (Docker socket эквивалент root):

```sh
apt-get update
apt-get install sudo
adduser campus-admin
install -d -m 700 -o campus-admin -g campus-admin /home/campus-admin/.ssh
install -m 600 -o campus-admin -g campus-admin /root/.ssh/authorized_keys /home/campus-admin/.ssh/authorized_keys
usermod -aG sudo campus-admin
```

Пароль admin нужен для sudo, вводите интерактивно. Во **втором** terminal `ssh -i ~/.ssh/campus_admin campus-admin@YOUR_VPS_IP`, затем `sudo -v`. Не закрывайте первую сессию до проверки второй и provider console. Только теперь `/etc/ssh/sshd_config.d/00-campus.conf` через `sudoedit`:

```text
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
```

Проверьте `sudo sshd -t`, `sudo sshd -T` (эффективные параметры), затем `sudo systemctl reload ssh`; откройте **третью** key-only сессию и `sudo -v`. При ошибке верните конфиг из первой сессии/console. Не меняйте SSH port ради этой инструкции. Не блокируйте исходную сессию до доказательства входа.

Установите Docker из **официального apt repository**, по [Debian](https://docs.docker.com/engine/install/debian/) или [Ubuntu](https://docs.docker.com/engine/install/ubuntu/). Проверяйте подпись repository/keyring; не запускайте convenience `curl | sh`. Host PostgreSQL не нужен: PG17 pinned в Docker, версия из distro не предполагается.

Скопируйте reviewed `ops/vps` с доверенного checkout **на компьютере** (проверьте SHA в GitHub), пока без image load/start:

```sh
ssh -i ~/.ssh/campus_admin campus-admin@YOUR_VPS_IP 'mkdir -p ~/campus-prep/ops'
scp -i ~/.ssh/campus_admin -r ops/vps campus-admin@YOUR_VPS_IP:~/campus-prep/ops/
```

На VPS `cd ~/campus-prep`. После настройки signed repositories:

```sh
sudo install -d -m 700 /etc/campus
sudo apt-get update
python3 ops/vps/lock-packages.py > /tmp/campus-packages.lock
cat /tmp/campus-packages.lock
```

Ожидается по одной строке `package=ТОЧНАЯ_ВЕРСИЯ`, без `(none)`. **Это обязательная фиксация версий именно вашего OS/repository**, не плавающая `apt install latest`. Запишите lock приватно вместе с датой и OS; сверяйте release notes/security. Python helper ничего не устанавливает. Проверенный локальный Docker 29.9.2/Compose 2.40.3; минимум Docker 28/Compose v2 с поддержкой `--wait`/profiles, иначе STOP. Ubuntu 24.04 — документированный fallback, реальный host не проверен.

```sh
sudo xargs -r apt-get install --no-install-recommends -- < /tmp/campus-packages.lock
sudo install -m 600 /tmp/campus-packages.lock /etc/campus/packages.lock
sudo docker version
sudo docker compose version
```

Для bootstrap `sudo` выше его точную установленную версию тоже зафиксируйте; apt lock содержит sudo. Не держите security packages на вечном hold. Следующие patch/reboot создают новый lock и требуют smoke.

Firewall и защита SSH, пока app отсутствует:

```sh
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw limit 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd
sudo dpkg-reconfigure -plow unattended-upgrades
sudo systemctl enable --now systemd-timesyncd
```

Проверьте `IPV6=yes` в `/etc/default/ufw`; если IPv6 не проверен, не создавайте AAAA. Сначала 22 открыт с rate limit, затем можно ограничить известным адресом владельца только после дополнительного рабочего входа/console (мобильный динамический IP легко блокирует владельца). Fail2ban sshd jail должен быть **реально enabled**: при отсутствии создайте jail.local `[sshd] enabled=true, backend=systemd`, restart, проверьте status, не заявляйте успех по одному service active. SSH private keys остаются на компьютере.

`sudo ss -lntup`: до TLS только нужные SSH/Nginx, нет 3000/5432 на внешних интерфейсах. Docker bypass UFW — не публикуйте дополнительные ports. В journald.conf.d задайте `SystemMaxUse=200M`, `RuntimeMaxUse=50M`, примените restart journald; проверьте `/etc/logrotate.d/nginx`, `sudo logrotate --debug /etc/logrotate.conf`. Настройте ежедневную проверку диска/копий с отдельного компьютера; локальная тревога не поможет при падении VPS.

## D0. Доверенная доставка и проверка ДО разрешения deploy

На компьютере владельца в GitHub откройте **конкретный reviewed commit** → Actions → Node CI, Documentation checks, VPS CI. Все должны быть success на этом SHA. В VPS CI сначала скачайте small `vps-release-manifest` и `vps-security-report`. После ручного review/merge и проверки доступного Actions storage/minutes (без включения платного budget), в Actions → VPS CI → Run workflow выберите проверенный ref, включите `store_release_artifact` только после review/security/budget attestation. Дождитесь полного success на том же SHA и скачайте `campus-vps-unsigned-SHA`; default PR/push не сохраняет большие image archives. Codex dispatch не выполняет. Если workflow ещё не в main или quota не подтверждена — STOP. Артефакты хранятся 7 дней; при истечении повторите CI на том же reviewed SHA, не берите случайный tar из чата. Не создавайте Git auto-deploy.

Распакуйте GitHub ZIP в отдельную локальную папку. Сверьте `release.json.sourceCommit` с reviewed SHA, image architecture linux/amd64, полный Trivy report. **Неразобранная HIGH/CRITICAL — NO-GO**: текущий HIGH zlib в runtime и7unfixed HIGH в tools ([полный review](VPS_SECURITY_REVIEW.md)) не получил автоматического исключения, требуется security review/обновление. Доверие начинается с GitHub account/MFA, reviewed source и CI, не с самоподписанного checksum.

Отдельный release signing key создаётся **на компьютере**, не VPS/CI:

```sh
ssh-keygen -t ed25519 -a 64 -f ~/.ssh/campus_release
ssh-keygen -Y sign -f ~/.ssh/campus_release -n campus-vps-release SHA256SUMS
```

`SHA256SUMS.sig` подписывает пять фиксированных файлов. Публичный `campus_release.pub` заранее через доверенный канал добавьте в `/etc/campus/allowed_signers` одной строкой `campus-release-owner ssh-ed25519 PUBLIC_KEY`, root:root/0644; сравните fingerprint с компьютером. Не принимайте signer из того же неподтверждённого ZIP. Перенесите release+signature на VPS через key-only SCP; **ключ не переносить**.

На VPS: `bash ops/vps/verify-delivery.sh /etc/campus/allowed_signers /PATH/TO/RELEASE`. Ожидается valid owner signature и 5 OK. Скрипт не загружает образы/не запускает контейнеры. Несовпадение — удалить неподтверждённую доставку, расследовать, STOP. Сравнение private GHCR и artifact delivery — [архитектура](VPS_ARCHITECTURE.md).

## D1. DNS, TLS и закрытый proxy ДО первого app

DNS A указывает на подтверждённый IPv4; AAAA только после внешней проверки IPv6/firewall. Удалите старые AAAA/aliases, проверьте `dig A YOUR_DOMAIN`, `dig AAAA YOUR_DOMAIN` с разных сетей. Нет прав DNS/доверенного FQDN — STOP. Не подменяйте `/etc/hosts` на компьютере жюри.

Для первого сертификата **app ещё не запущен**, Nginx не содержит upstream. В `/etc/nginx/sites-enabled/` уберите default symlink; через `sudoedit /etc/nginx/conf.d/campus-bootstrap.conf` задайте http-level конфиг:

```nginx
server { listen 80 default_server; listen [::]:80 default_server; server_name _; return 444; }
server {
 listen 80; listen [::]:80; server_name YOUR_DOMAIN;
 location ^~ /.well-known/acme-challenge/ { root /var/lib/letsencrypt; try_files $uri =404; }
 location / { return 444; }
}
```

Замените только YOUR_DOMAIN. `sudo install -d -m 755 /var/lib/letsencrypt`, `sudo nginx -t`, `sudo systemctl reload nginx`. Пока нет приложения, ACME единственный публичный file path. Из внешней сети `/login` не отдаёт app. Выпуск:

```sh
sudo certbot certonly --webroot -w /var/lib/letsencrypt -d YOUR_DOMAIN
sudo certbot renew --dry-run
sudo systemctl list-timers certbot.timer
```

Укажите свой контакт интерактивно, не коммитьте. Нужны открытые 80/443 и правильный A/AAAA. Ошибка DNS/renewal — STOP; не использовать `-k`, self-signed для пользователей или отключение TLS. В `/etc/letsencrypt/renewal-hooks/deploy/campus-nginx` установите root-owned executable с `#!/bin/sh` и `nginx -t && systemctl reload nginx`; повторите dry-run с `--run-deploy-hooks`. HSTS пока отсутствует.

Секреты создаёт владелец **на hardened host**, не чат. DB image использует UID/GID70; не переиспользовать старые UID999 secrets/volumes и архив `7cdc499`. Речь о новом пустом запуске, не автоматической конвертации БД. Приватная DB CA действительна 3 года, server cert 1 год — календарное напоминание за 30 дней обязательно.

```sh
sudo bash ops/vps/init-secrets.sh --owner-approved-init /etc/campus/secrets https://YOUR_DOMAIN
sudo chown root:www-data /etc/campus
sudo chmod 750 /etc/campus
sudo install -o root -g www-data -m 640 /etc/campus/secrets/htpasswd /etc/campus/htpasswd
python3 ops/vps/render_nginx.py --domain YOUR_DOMAIN --output /tmp/campus-closed.conf
sudo nginx -t
```

Генератор требует **новую** папку: при повторе STOP, не перегенерировать пароли действующей БД. Админ/миграции/seed/session/cron/gate независимы. Файл gateway-password выдаёт внешний gate password, migration.env — три seed пароля; просмотрите их только в приватной сессии владельца, храните в password manager, не screenshots/terminal recording. Не применяйте `cat` к ним в CI/общем terminal.

Удалите bootstrap.conf и install `/tmp/campus-closed.conf` как root:root/0644 в `/etc/nginx/conf.d/campus.conf`, `sudo nginx -t` → только затем reload. При ошибке вернуть безопасный bootstrap (без app), не default proxy. Проверка из интернета **до app start**: без gate `/`, `/login`, `/register`, `/api/structure`, `/api/auth/get-session`, `/_next/static/test`, `/api/internal/rate-cleanup` — 401; неверный gate пароль — 401; raw IP/неизвестный Host не возвращает app. `curl --user owner https://YOUR_DOMAIN/login -I` интерактивно спрашивает пароль: правильный gate пока может дать 502 (app нет). Не передавайте пароль в command line/URL. Ожидается доверенная цепочка TLS без `-k`; неверный CA должен отвергаться.

**STOP D:** передайте ревьюеру обезличенные результаты checklist, source SHA/CI, package lock, сеть, gate/TLS, triage scanner и план backup/rollback. Не передавайте env. Нужны pre-deploy review **и отдельное явное разрешение первого защищённого deploy**. До него запрещены команды следующего раздела.

## D2. Только после отдельного разрешения: первый защищённый deploy

На VPS не clone repo с токенами и не build. Проверенный config.tar содержит `ops/vps`. От имени root через `sudo -i`:

```sh
install -d -m 700 /opt/campus/releases/YOUR_REVIEWED_SHA
cd /opt/campus/releases/YOUR_REVIEWED_SHA
tar --no-same-owner --no-same-permissions -xf /PATH/TO/VERIFIED/config.tar
chmod 644 ops/vps/pg_hba.conf
docker load -i /PATH/TO/VERIFIED/runtime.tar.gz
docker load -i /PATH/TO/VERIFIED/tools.tar.gz
docker load -i /PATH/TO/VERIFIED/database.tar.gz
```

Создайте `/etc/campus/release.env` root:root/0600: только `CAMPUS_APP_IMAGE=sha256:…` , `CAMPUS_TOOLS_IMAGE=sha256:…` и `CAMPUS_DB_IMAGE=sha256:…` **из проверенного release.json**, `CAMPUS_SECRETS_DIR=/etc/campus/secrets`, `CAMPUS_APP_PORT=3000`. Это config references, не DB credentials. Symlink `/opt/campus/current` указывает на этот release. Never `latest`; не меняйте image роли. Выполните host preflight без установки Node: `python3 ops/vps/preflight.py /etc/campus/release.env` из нового release directory. Ожидается PASS; helper только читает config/image metadata и ничего не запускает. Docker socket в tools/app не монтировать. При ошибке STOP.

```sh
cd /opt/campus/current
docker compose --profile ops --env-file /etc/campus/release.env -f ops/vps/compose.yaml config --quiet
docker compose --env-file /etc/campus/release.env -f ops/vps/compose.yaml up -d --wait db
```

Ожидается healthy. Функция ниже требует root и действует только в текущем approved project:

```sh
owner_db() {
 docker compose --profile ops --env-file /etc/campus/release.env -f ops/vps/compose.yaml run --rm --no-deps tools node ops/vps/admin.mjs "$1" --owner-approved
}
owner_db bootstrap
owner_db migrate
owner_db seed
owner_db seed
owner_db grant
owner_db check
```

Каждый шаг должен завершиться `PASS`. Ошибка — **не стартовать app**, не ослаблять TLS/SCRAM/grants. `seed` дважды не сбрасывает пароли/права, не создавайте реальные профили. Tools default start без action запрещён. Административные переменные не копировать в runtime.env.

```sh
docker compose --env-file /etc/campus/release.env -f ops/vps/compose.yaml up -d --wait app
docker compose --env-file /etc/campus/release.env -f ops/vps/compose.yaml ps
ss -lntup
```

Публичны только SSH/HTTP/HTTPS; приложение **127.0.0.1:3000**, нет host DB5432, IPv6 app ports отсутствуют. Anonymous с интернета всё ещё 401. HSTS не добавлять до E. Если gate пропал — немедленно stop app (не БД/volume), вернуть закрытый Nginx, расследовать.

## E. Реальная закрытая приёмка, backup и операции

По [checklist](VPS_LAUNCH_CHECKLIST.md) пройти HTTPS/login/registration/PENDING/staff approve/reject/retry/revoke/transfer/group isolation/logout/mobile360, реальный IP spoof test, negative runtime grants/wrong DB password, restart/persistence и лимиты. Только вымышленные seed учётки. Сессия staff не должна давать права student после logout/отзыва. Не запускать destructive integration suite на этой DB: тесты используют свои `_test` DB, cloud smoke — ручной.

На **компьютере** создайте age identity: `age-keygen -o campus-backup.key`, сохраните offline/password manager и резервную защищённую копию. На VPS переносится **только public recipient** (`age-keygen -y campus-backup.key`), файл `/etc/campus/backup-recipients.txt` root:root/0644. Потеря private identity делает backup невосстановимым; не храните единственный ключ на VPS.

```sh
sudo groupadd --system campus-backup
sudo bash /opt/campus/current/ops/vps/backup.sh
sudo install -m 644 /opt/campus/current/ops/vps/campus-*.service /etc/systemd/system/
sudo install -m 644 /opt/campus/current/ops/vps/campus-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start campus-cleanup.service campus-monitor.service
sudo systemctl enable --now campus-backup.timer campus-cleanup.timer campus-monitor.timer
sudo systemctl list-timers 'campus-*'
```

`groupadd` один раз; существующую группу сверить, не пересоздавать. Backup pipeline `pipefail`, age до записи, private partial/atomic rename, два encrypted экземпляра на VPS, retention 7 дней; daily 02:10 UTC (05:10 МСК), cleanup03:17 UTC (06:17 МСК), monitor каждые5мин. Задайте `campus-backup` группе **отдельного key-only offsite account без sudo/docker** readonly доступ к `/srv/campus-backup-export` (750/root:group, файлы640); его home/authorized_keys также 700/600. Установите только его публичный key (отдельный от admin) и добавьте SSH Match-блок ниже, чтобы этот аккаунт не получил shell/туннель к loopback app. Не давайте этому аккаунту доступ к `/etc/campus/secrets` и private decrypt identity. С компьютера ежедневно получайте encrypted файлы через SFTP (обычный shell/SCP legacy для offsite account запрещены) и проверяйте дату/размер/checksum, храните ≥30 дней, попробуйте расшифровку. Не утверждайте offsite завершённым по success локального timer.


Для account `campus-backup-fetch` создайте пользователя с primary group `campus-backup`, shell `/usr/sbin/nologin` и отдельным public key. В `/etc/ssh/sshd_config.d/10-campus-backup.conf`:

```text
Match User campus-backup-fetch
    ChrootDirectory /srv/campus-backup-export
    ForceCommand internal-sftp -R -d /
    DisableForwarding yes
    PermitTTY no
    PermitTunnel no
Match all
```

Chroot и все его родители root-owned и без group/world write; внутри только encrypted exports. `sudo sshd -t`, затем reload из сохранённой admin-сессии. Проверьте: SFTP `ls/get` разрешены, put/delete/shell/`ssh -L` запрещены. На компьютере `sftp -i ~/.ssh/YOUR_BACKUP_FETCH_KEY campus-backup-fetch@YOUR_VPS_IP`, затем `get campus-DATE.dump.age`; имя возьмите из `ls`. SSH key restriction обязателен: обычный shell account мог бы обратиться к loopback app в обход proxy gate. Offsite private decrypt key остаётся только на компьютере.

Restore rehearsal: скачать encrypted backup на компьютер, **поднять отдельный локальный Compose project с другим loopback app port**, своими volume/secretdir и тем же PG17 digest; приложение исходного VPS не затрагивать. `age -d -i campus-backup.key BACKUP.dump.age` направить через stdin в `pg_restore --exit-on-error --no-owner --no-acl --role=campus_migrator` в **новую пустую** DB после bootstrap; не выполнять migrate до restore готовой schema. `pg_restore` должен использовать private admin password-file, не пароль в аргументах. Пример этой операции с stdin, TLS и сравнением — исполнимый `scripts/test-vps.mjs` (он работает только с собственным synthetic test project). На восстановленной копии выполнить runtime grant/check, сравнить User/Session/AuditLog/GroupMembership/EnrollmentRequest counts и audit immutable trigger, затем отдельный login/permissions smoke. Не использовать `--clean`, `down -v` или чужой project. Зафиксировать время RPO/RTO; удалить временный plaintext если он создавался (надёжное стирание SSD не обещается).

Monitor: `journalctl -u campus-backup -u campus-cleanup -u campus-monitor`, `/var/lib/campus/ATTENTION`, disk/inodes80%, MemAvailable512MiB, app/db healthy, backup freshness. Не удалять ATTENTION до исправления/проверки. OnFailure оставляет **локальный** marker, не отправляет сообщения; owner PC должен минимум ежедневно проверять доступность TLS/401, свежесть offsite и ошибки timers. Пропуск/падение VPS — внеплановый звонок/уведомление средствами владельца, пока не настроено — NO-GO. Проверяйте `free -h`, `df -h`, `docker stats --no-stream` под нагрузкой, OOM/restart и остаток ≥20% диска; лимиты не доказательство скорости на тарифе.

Россия без VPN: два независимых оператора (домашний + мобильный), лучше два региона; IPv4 и при наличии AAAA IPv6, DNS/TLS/401, затем с gate полный login/approve/logout/360. Записать только оператор/регион/время/результат без IP/секретов. Проверить холодный старт/reboot, не только warm HTML. Недоступность — STOP F; резерв без нового платного сервиса — локальная демонстрация/запись на вымышленных данных и существующий [Vercel/Neon plan](DEPLOYMENT.md) только после его собственных gates, не немедленный публичный deploy.

Security updates: еженедельно и перед конкурсом сверять advisories/полный scanner, обновлять подписанные OS packages по новому reviewed exact lock; reboot в закрытом окне, затем E smoke. Набор app/tools/database обновлять только через новую подпись и immutable IDs. До миграции offsite snapshot/restore и review backward compatibility. Откат app image на прежний ID — только при совместимой schema. DB image/OS/major downgrade не выполнять автоматически; нужны отдельное review и fresh-volume restore rehearsal. Иначе остановить app, restore в новый volume, проверить и отдельно переключить; не пытаться автоматический downgrade/drop.

Инцидент: `docker compose … stop app`, оставить DB/volume, закрытый proxy, сохранить private logs, отозвать сессии доверенным серверным действием/owner SQL после review, сменить скомпрометированные DB/session/cron/gate/SSH credentials и применить их согласованно. Не rerun init-secrets поверх действующей БД: он намеренно отказывает. Не сбрасывать seed для восстановления прав. Provider rescue — для lockout; provider «restore» не заменяет собственную проверенную backup.

## F. Отдельное разрешение публичного/жюри доступа

До явного решения F gate **остаётся** на всех путях. Раздача gate пароля жюри тоже отдельное решение доступа, пароль приложения и gate различаются. Изменение Nginx для публичного режима — отдельный reviewed diff с повторным spoof/auth/static/API/RF/abuse тестом; renderer не имеет `--public`. HSTS вводится только после реального renewal/TLS/alias review; preload не включать автоматически. Никакой скрипт не снимает gate и не делает reload/deploy автоматически.

## Теперь твоя очередь — 15 шагов

1. Ревью PR, всех трёх CI и security findings; ручное утверждение/merge (A).
2. Подтвердить 500 ₽/месяц и все доплаты/продление, IP/OS/SSH/rescue/domain/offsite.
3. Отдельно разрешить покупку, создать только согласованный VPS (B).
4. Проверить console/fingerprint, root key, создать sudo admin.
5. Проверить вторую/третью сессию, только затем key-only/no-root и firewall (C).
6. Signed apt repositories, точный package lock/install, Docker≥28/Composev2, fail2ban/updates/NTP/log limits.
7. Скачать artifact строго reviewed SHA и успешных CI, разобрать scanner; unresolved findings = STOP.
8. Подписать release отдельным workstation key, установить pinned signer доверенно, verify delivery на VPS.
9. Настроить DNS/TLS/renewal без app; при отсутствии контролируемого домена STOP.
10. Сгенерировать private files, закрытый Nginx; доказать anonymous401 до app на всех путях/IP/aliases.
11. Запросить pre-deploy review и отдельно разрешить первый защищённый deploy (D).
12. Только затем load immutable images, DB bootstrap/migrate/seed×2/grant/check, app start, private ports proof.
13. Backup encryption/offsite/restore rehearsal, timers/alerts/patch/rollback; фиксировать факты (E).
14. Закрытые permissions/UX/360/РФ IPv4/IPv6 smoke и ресурсные замеры, устранить все NO-GO.
15. Остановиться и отдельно запросить F для жюри/публичного доступа. Не снимать gate самостоятельно.

**Момент старта владельца:** сейчас — только ревью A. Покупка/аккаунт с ресурсами — после ручного merge A и отдельного B; первый app deployment — исключительно после D review+явного разрешения. Локальные тесты и этот runbook этих разрешений не заменяют.
