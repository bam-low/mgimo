# Первый закрытый запуск: делай по порядку

Основание: [Issue #22](https://github.com/bam-low/mgimo/issues/22), merged PR #19/#21, A36/A38/A39/A40. Дата исследования официальных источников: **05.11.2026, МСК**. Это подготовленный **PROPOSED операционный порядок для ревью**, не уже выполненный deploy. Облако, аккаунты, секреты владельца и реальные российские сети здесь **NOT VERIFIED**. [Лист приёмки](LAUNCH_CHECKLIST.md) заполняется фактическими результатами, не переносом локальных PASS в облачные строки.

**Сейчас можно только проверить этот PR.** Владелец начинает фазы 0–2 после ручного утверждения и merge PR и отдельного решения разрешить создание только Free ресурсов. Первый Deploy — ещё одно отдельное явное решение **после GO фазы 5**, до подключения Git. Codex не выполняет эти действия. Ревью/merge не означает разрешение открыть сайт жюри или публике.

Нужно примерно 2–4 часа с перерывами; ответ поддержки, российская приёмка и сутки ожидания cron в эту оценку не входят. Любой FAIL/неизвестная настройка в STOP-gate останавливает соответствующее действие. Не исправлять несовпадение отключением защиты/проверки TLS, upgrade, `db push` или reset.

## 0. Тариф и разрешения — 15–30 минут плюс ответ поддержки

- [ ] Прочитать [Hobby](https://vercel.com/docs/plans/hobby), [fair use](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage), [Neon Free](https://neon.com/docs/introduction/plans). Сохранить дату/несекретное подтверждение в checklist. Не включать Pro/trial, marketplace billing, карту, автоматический upgrade, add-ons.
- [ ] В Hobby допускается только personal non-commercial use. Финансовая выгода **любого** участника разработки может считаться commercial. Возможный денежный приз не объявлен разрешённым исключением. До deploy получить решение по применимости условий; при неопределённости отправить владельцем вопрос в [Vercel Support](https://vercel.com/help). Агент ничего не отправлял.

Готовый текст вопроса: «Я один готовлю личный учебный конкурсный прототип без продаж, рекламы и платных пользователей. Конкурс может предусматривать денежный приз. Код подготовлен с ИИ; [владелец указывает, есть ли оплаченные участники]. Допускаются ли закрытая приёмка и последующая конкурсная демонстрация на Hobby без нарушения commercial-use/fair-use? Подтвердите также бесплатность Vercel Authentication с All Deployments для моего Hobby scope». Не добавлять токены, пароли или connection strings.

**STOP:** нет ясности по fair use, предлагается trial/платёж, тариф в UI не Free/Hobby. Не предлагать скрытый Pro upgrade. Без переписывания приложения возможны: продолжить локальную приёмку standalone; отдельно утвердить бесплатный Render Docker + Neon после проверки его условий/закрытия ingress; отложить облако. Render не считается автоматически настроенным безопасным резервом.

**GO:** владелец записал применимые условия и отдельно разрешил Free аккаунты/проекты. Это ещё не разрешение Deploy.

## 1. Подготовить локальные инструменты и приватную папку — 20–40 минут

Docker владельцу **не нужен**: миграции и seed выполняются локальным Node против новой Neon DB. `psql` нужен для создания ограниченной роли/пароля и SQL-проверок, `pg_dump`/`pg_restore` — для backup. Сервер PostgreSQL на компьютере не запускать.

1. Получить checkout после merge этого PR: `git switch main`, `git pull --ff-only`, `git status --short` (пусто), записать `git rev-parse HEAD` в checklist. Не работать из старой скачанной копии. При чужих локальных изменениях STOP, не применять reset.
2. Установить Node **24.22.1** из [официальных дистрибутивов](https://nodejs.org/dist/v24.22.1/) либо через уже доверенный менеджер версий; `node --version` → v24.22.1, `npm --version` → 11.9.0. На Vercel позже будет управляемый 24.x, patch проверяется отдельно. При другой major не продолжать.
3. Установить клиент PostgreSQL 17. macOS: `brew install postgresql@17`, затем `export PATH="$(brew --prefix postgresql@17)/bin:$PATH"` (не запускать brew services). Ubuntu: официальный [PGDG порядок](https://www.postgresql.org/download/linux/ubuntu/): `sudo apt install postgresql-common`, `sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh`, затем `sudo apt install postgresql-client-17`. Windows: [официальная загрузка](https://www.postgresql.org/download/windows/), PostgreSQL 17 installer → Command Line Tools; не нужны локальный server/service, pgAdmin или Stack Builder. В текущем PowerShell: `$env:Path="C:\Program Files\PostgreSQL\17\bin;$env:Path"`. Проверить `psql --version`, `pg_dump --version`, `pg_restore --version` → 17.x. Эти системные действия выполняет владелец, не Codex.
4. В корне checkout: `npm ci --ignore-scripts`, `npm run db:generate`. Зависимости уже закреплены; не выполнять npm update/install в проект и не ставить Vercel CLI в его dependencies.

Приватная папка — **вне checkout и вне iCloud/OneDrive/общих папок**. Терминал не записывать в видео/transcript; отключить shell tracing, не выполнять `cat`/`Get-Content` для secret files, `env`/`printenv`, не выводить raw API responses. Файлы открывать только локальным редактором с отключёнными AI/cloud sync. Не отправлять их в чат, GitHub или CI.

macOS/Linux (переменная `campusPrivate`, не HOME):

```sh
umask 077
campusPrivate="$HOME/.campus-first-launch"
mkdir -p "$campusPrivate"
chmod 700 "$campusPrivate"
node scripts/launch-config.mjs init --output "$campusPrivate/owner.env"
node scripts/launch-config.mjs ca --output "$campusPrivate/neon-root.pem"
```

Windows PowerShell:

```powershell
$campusPrivate = Join-Path $env:LOCALAPPDATA 'CampusFirstLaunch'
New-Item -ItemType Directory -Force -Path $campusPrivate | Out-Null
$campusIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls $campusPrivate /inheritance:r /grant:r "${campusIdentity}:(OI)(CI)F"
# Проверить ACL локально: доступ только владельцу; при неизвестных grants STOP.
$env:CAMPUS_PRIVATE_WINDOWS_ACL_CONFIRMED = 'yes'
node scripts/launch-config.mjs init --output "$campusPrivate\owner.env"
node scripts/launch-config.mjs ca --output "$campusPrivate\neon-root.pem"
```

Ожидаются два PASS без значений секретов. CA helper экспортирует публичный ISRG Root X1 из доверенного хранилища закреплённого Node с проверкой SHA-256 fingerprint; ничего не скачивает/не устанавливает в системный trust store. Это CA, указанный Neon TLS guide; при изменении цепочки сертификатов STOP и повторная проверка, не переход на require. Helper создаёт файл исключительно (`wx`), не перезаписывает, на POSIX требует private parent и mode 0600; Windows требует отдельно проверенный ACL, mode 0600 сам по себе NTFS не защищает. Тесты выполнялись на Linux, Windows/macOS команды ещё требуют проверки владельцем. Шесть независимых значений по 32 случайных байта: auth/cron, три seed-пароля и пароль будущей DB role. Не запускать init повторно для ротации существующих учётных записей.

**GO:** приватная папка/owner.env готовы; ни одного облачного секрета в checkout, ни одного аккаунта с оплатой. Дальнейшие команды приведены в общей для shell/PowerShell форме. На Windows путь `$campusPrivate/owner.env` также понимается Node; абсолютные пути не подставляют значения секретов в argv.

## 2. Создать только новую Neon Free DB и применить миграции — 20–30 минут

- [ ] Открыть [Neon Console](https://console.neon.tech/) → выбрать/создать аккаунт → **New project**. План **Free $0**, без карты/trial/интеграции Vercel Marketplace. PostgreSQL **17**, AWS Frankfurt `eu-central-1`, если доступен; другой регион рядом с fra1 сначала оценить, не выбрать незаметно другой continent. Название, например `campus-closed-demo`, DB `neondb`, root branch. Только новая synthetic-only DB; не подключать настоящую вузовскую БД/Neon Auth/Data API.
- [ ] На project Overview → **Connect** выбрать root branch/DB/admin owner role. Выключить Connection pooling и скопировать **direct** URL в локальный private editor, поле `DIRECT_DATABASE_URL` в owner.env. Заменить только `sslmode` на **verify-full**, остальные TLS-настройки не ослаблять. В `DATABASE_URL` временно тот же direct admin URL — seed читает именно его. Не вставлять URL в терминал/чат; не делать скриншот Connect modal.
- [ ] В owner.env нет `NODE_TLS_REJECT_UNAUTHORIZED=0`, `sslmode=require`/no-verify, стороннего proxy или постоянных keepalive. Клиент Node использует доверенный CA и hostname verification. Если сертификат не проверяется — STOP, исправить trust store по [Neon TLS](https://neon.com/docs/connect/connect-securely), не отключать проверку.

Команды из корня checkout, одинаковы для macOS/Linux и PowerShell:

```sh
node --env-file="$campusPrivate/owner.env" node_modules/prisma/build/index.js migrate status
node --env-file="$campusPrivate/owner.env" node_modules/prisma/build/index.js migrate deploy
node --env-file="$campusPrivate/owner.env" node_modules/prisma/build/index.js migrate status
node --env-file="$campusPrivate/owner.env" prisma/seed.mjs
node --env-file="$campusPrivate/owner.env" prisma/seed.mjs
```

Первый status на новой DB ожидаемо сообщает неприменённые миграции (может вернуть ненулевой код); это не ошибка подключения. При TLS/auth error STOP до migrate. После deploy ожидаются обе текущие migrations, статус up to date; seed дважды PASS без passwords. Если schema не пустая/есть неотслеженные изменения, не продолжать: новая отдельная DB либо план совместимости/backup после ревью. Build и runtime миграции не запускают.

Seed: `staff@example.test` и два APPROVED студента `student1@example.test`/`student2@example.test` в разных группах. Пароли — три разных DEMO_* из owner.env; не общедоступный список паролей. Повтор не сбрасывает hashes и не возвращает отозванные права. Legacy общий DEMO_STUDENT_PASSWORD/неизвестные fixtures → STOP, не чинить reset или повторным seed с новыми паролями. Учебных оценок/расписания ещё нет.

**GO:** migrations up to date, оба seed успешны, Free/17/Frankfurt подтверждены. Admin URL остаётся только локально.

## 3. Создать SQL-роль и проверить least privilege — 15–30 минут

**Не создавать campus_runtime через Neon Console/API:** такие роли получают `neon_superuser`. Использовать SQL по [Neon roles](https://neon.com/docs/manage/roles). База отдельная: helper отзывает PUBLIC grants только этой DB/public schema; для общей/неизвестной DB он не предназначен.

Из Connect modal скопировать **не URL**, а поля direct Host/Database/Admin role в переменные; это не пароли. Не угадывать реальный hostname. Значения PLACEHOLDER заменить локально своими не секретными полями.

macOS/Linux:

```sh
export PGHOST='DIRECT_HOST_FROM_NEON'
export PGDATABASE='neondb'
export PGUSER='OWNER_ROLE_FROM_NEON'
export PGPORT=5432 PGSSLMODE=verify-full
export PGSSLROOTCERT="$campusPrivate/neon-root.pem"
psql -X -W
```

PowerShell:

```powershell
$env:PGHOST = 'DIRECT_HOST_FROM_NEON'
$env:PGDATABASE = 'neondb'
$env:PGUSER = 'OWNER_ROLE_FROM_NEON'
$env:PGPORT = '5432'
$env:PGSSLMODE = 'verify-full'
$env:PGSSLROOTCERT = "$campusPrivate/neon-root.pem"
psql -X -W
```

`-W` просит admin password интерактивно без echo; взять из private Connect/owner.env, не в argv/PGPASSWORD/history. `-X` исключает неизвестный psqlrc. Если psql не проверяет сертификат/hostname с экспортированным CA — STOP; проверить версию libpq/CA/реальный endpoint по Neon TLS guide, не переходить на require. Внутри psql:

```sql
\set ON_ERROR_STOP on
SELECT current_user, current_database();
SELECT rolname FROM pg_roles WHERE rolname='campus_runtime';
```

Должна быть **0 rows**. Если роль уже есть, не менять её пароль/атрибуты: STOP и проверить происхождение/права отдельно. Для новой роли:

```sql
CREATE ROLE campus_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
\password campus_runtime
\q
```

В двух интерактивных prompts вставить `CAMPUS_RUNTIME_PASSWORD` из private owner.env; psql не показывает ввод и передаёт пароль штатным способом. Не помещать пароль в SQL Editor/ALTER ROLE literal. Создание роли — однократно; helper ниже идемпотентен, пароль не меняет.

```sh
node --env-file="$campusPrivate/owner.env" scripts/launch-db.mjs grant --apply --dedicated-synthetic-db
node --env-file="$campusPrivate/owner.env" scripts/launch-db.mjs grant --apply --dedicated-synthetic-db
```

Ожидаются два PASS. Grants транзакционны, ограничены ожидаемой схемой и ролью без membership/ownership/super privileges, не дают прав на будущие таблицы. Проверяется функция/trigger immutable audit. Матрица: SELECT структуры; SELECT/INSERT/UPDATE User/Account и domain tables; DELETE только Session/Verification/RateBucket/RateLimit; AuditLog только SELECT/INSERT; migrations недоступны; DDL/TEMP/TRUNCATE/GRANT OPTION запрещены. Нет автоматической починки неизвестных column grants/владельцев/ролей. Не менять helper ради прохождения на неожиданной схеме.

Connect → включить pooling, скопировать **только pooled hostname** в `CAMPUS_POOLED_HOST` owner.env. Он должен относиться к тому же direct endpoint с `-pooler`, не к другой ветке. Пароль и username из Connect admin URL не копировать в runtime. Origin будет добавлен на фазе 4; runtime.env создаётся после этого.

**GO:** роль создана SQL, grant/check идемпотентны; plaintext DB role password хранится только в приватной папке, admin URL не попадёт в Vercel.

## 4. Создать пустой защищённый Vercel проект — 15–30 минут

**Не пользоваться New Project → Import → Deploy для первого запуска.** `git.deploymentEnabled=false` не доказывает безопасность initial import. По [CLI docs](https://vercel.com/docs/cli/deploy#prod) первый deployment нового проекта production даже без `--prod`; Preview не является защитной мерой.

Официальные [Deployment Protection](https://vercel.com/docs/deployment-protection#all-deployments) и [pricing](https://vercel.com/docs/deployment-protection/usage-and-pricing) сейчас разрешают **Vercel Authentication + All Deployments бесплатно на всех планах**, включая Hobby. **Standard/Legacy/Preview недостаточно**: production domains могут быть открыты. Password Protection не доступен Hobby и не нужен. Это документированная возможность, не подтверждённая в аккаунте владельца конфигурация.

1. [Vercel Dashboard](https://vercel.com/dashboard) → Hobby scope личного владельца. [Account Tokens](https://vercel.com/account/tokens) → короткоживущий токен с минимальным доступным scope к этой Hobby team. Не применять Pro trial. Team Settings → General → Team ID (`team_...`). В private owner.env заполнить VERCEL_TOKEN, VERCEL_TEAM_ID, CAMPUS_VERCEL_PROJECT_NAME (новое уникальное имя). Не добавлять токен в env приложения.
2. **Только после отдельного разрешения Free проекта**:

```sh
node --env-file="$campusPrivate/owner.env" scripts/launch-vercel.mjs create --apply --owner-approved-free-project
```

Helper сначала проверяет Hobby/no trial, затем официальный `POST /v11/projects` с **ssoProtection.deploymentType=all в самом запросе создания**, Other/build/install/fra1. **Нет gitRepository/env upload/deploy request**. Затем helper отдельным PATCH существующего пустого проекта задаёт Node24 и явно выключает same-repository Vercel CI bypass/внешние Trusted Sources; ошибка readback останавливает дальнейшие шаги. Если ответ не подтверждает All — STOP: пустой проект может существовать, но deploy/link не выполнялись; не повторять create вслепую. Открыть dashboard и исправлять только защиту пустого проекта после проверки. Токен/ответы не печатаются.

3. В dashboard выбрать именно новый проект → **Deployments**: пусто. **Settings → Deployment Protection**: Vercel Authentication ON, **All Deployments**, Save. Убрать Shareable Links/Protection Bypass for Automation, Deployment Protection Exceptions и **внешние** Trusted Sources; same-repository Vercel CI должен быть явно OFF (helper задаёт false). Встроенный self-access проекта к собственным deployments документирован платформой и может сохраняться: он не является разрешением анонимным посетителям; фактический отказ всё равно проверяется на фазе 6. Не включать CORS/OPTIONS bypass. Оставить только владельца, не выдавать доступ запросившим его пользователям. Если UI требует оплату/не позволяет All/убрать bypass — **STOP, не Deploy**. Settings → Build and Deployment: Framework **Other**, Node **24.x**, root `.`; install `npm ci --include=dev --ignore-scripts`; build `npm run build:vercel && npm run check:vercel-runtime`; output directory default (Build Output API), не `.next`/standalone как static; Functions region Frankfurt/fra1. Не добавлять failover regions.
4. Project Settings → General → Project ID (`prj_...`) записать в VERCEL_PROJECT_ID owner.env. Project **Settings → Domains** должен показать назначенный production hostname, ещё **без deployment**. Скопировать его точный HTTPS origin в BETTER_AUTH_URL owner.env (без path/trailing slash). Не угадывать `<name>.vercel.app`, случайный generated URL или NEXT_PUBLIC_VERCEL_URL. API readback ниже требует verified domain этого проекта. Если до deploy origin/verified domain недоступен — **STOP**, не делать пробную публикацию для выяснения URL; вернуть только этот несекретный статус на ревью.

**Почему нет окна публичного доступа:** без gitRepository/Deploy нет приложения; All настроен атомарно при создании и проверяется снова до какой-либо загрузки исходников/создания deployment. Изменить защиту после первого deploy недопустимо. Источники подтверждают контракт API; реальную доступность UI/API в конкретной Hobby team без аккаунта подтвердить невозможно.

**Безопасные варианты при блокере:** оставить пустой проект без deploy и запросить у поддержки точный pre-protected workflow; локальный standalone только на loopback; отдельно утверждённый резерв с закрытым ingress до первой публикации. Не открывать «на минуту», не полагаться на секретность URL, robots/noindex, выключенную регистрацию или application login как внешний access gate. Не выбирать платную защиту автоматически.

## 5. Runtime env и последний gate до первого Deploy — 10–20 минут

Из корня checkout:

```sh
node --env-file="$campusPrivate/owner.env" scripts/launch-config.mjs runtime --output "$campusPrivate/runtime.env"
node --env-file="$campusPrivate/runtime.env" scripts/launch-db.mjs check
node --env-file="$campusPrivate/owner.env" scripts/launch-vercel.mjs check
```

Ожидается три PASS. runtime.env содержит **ровно пять** настроек: DATABASE_URL (campus_runtime, pooled, verify-full), BETTER_AUTH_SECRET, CRON_SECRET, точный HTTPS BETTER_AUTH_URL, AUTH_TRUSTED_IP_HEADER=x-vercel-forwarded-for. В нём нет admin/direct URL, DEMO_*, ALLOW_DEMO_SEED, API token, NEXT_PUBLIC_*. Check БД выполняется аутентифицированной limited ролью, проверяет реальный TLS и эффективные table/column/database/schema/role права, без пробных записей. Не ставить CAMPUS_LAUNCH_LOCAL_TEST в owner/runtime files: это только loopback *_test исключение для локальных тестов, на Neon helper его отвергает.

В Project Settings → Environment Variables добавить вручную **только эти пять** значений, для Production (первый deploy production). Не выбирать «все из файла owner.env», не ставить env values в vercel.json/config.env, build args или командную строку. Secrets отметить sensitive/encrypted, если UI даёт такой выбор. Preview не подключать к demo DB; позже это отдельное решение. Builder использует только собственные canaries, runtime получает настоящие env при invocation. Токен Vercel отозвать после завершения работы с API или сократить срок.

Перед GO проверить [LAUNCH_CHECKLIST](LAUNCH_CHECKLIST.md), строки COST/PRE/CLOUD-DB. Read-only API check требует: Hobby/no trial, All, Node24/Other/fra1, правильные build/install, verified exact origin, zero deployments и отсутствие Git link/настроенного bypass. Он **не проверяет** все способы выдачи доступа/поведение ingress: дополнительно проверить UI access list, внешние Trusted Sources, Exceptions, отсутствие share links/automation tokens. Встроенные self-access/platform-internal вызовы не выдаются за отключённые. Не показывать raw response: он может содержать секреты bypass.

**GO первого Deploy:** все перечисленные pre-deploy gates PASS, владелец записал commit SHA, ожидаемые настройки и отдельное явное разрешение **первого защищённого deployment**. **До этого момента Git не подключать.** Нет хотя бы одного PASS → STOP. Не считать просто `$0`/локальный CI достаточным.

## 6. Первый защищённый deployment — 10–20 минут, только владелец

После GO/отдельного разрешения Project **Settings → Git → Connect Git Repository** → GitHub личного bam-low → дать GitHub App доступ **только к private bam-low/mgimo**, выбрать этот repo. Не создавать новый проект через Import, не переносить в organization. Подключение Git может само вызвать build/deploy, поэтому разрешение должно предшествовать **этому** действию. All уже защищает все будущие production/preview/alias URL; env и build готовы. Если начинается неожиданная операция до разрешения — Cancel/STOP, а не ожидание успешного публичного build.

`vercel.json` хранит `git.deploymentEnabled=false`: будущие push/PR не должны автоматически публиковать версии. Если после link deployment не возник: **Deployments → Create Deployment → targeted commit SHA** (утверждённый merge commit main) → production → Create Deployment. Это [официальный ручной Git-reference workflow](https://vercel.com/docs/git#creating-a-deployment-from-a-git-reference). Если кнопки/конфигурация отличаются, STOP и запросить несекретную помощь, не менять framework/защиту. У Hobby Git author должен соответствовать владельцу scope; если автор merge commit не распознан — STOP, проверить GitHub Login Connections и принадлежность, не обходить сменой тарифа.

Сразу после link/deploy:

```sh
node --env-file="$campusPrivate/owner.env" scripts/launch-vercel.mjs check-linked
```

Это read-only check сохранности конфигурации с link строго bam-low/mgimo. Он не заменяет проверку deployed artifact и не объявляет приложение принятым. Проверить Build Logs: обе команды выполнены, `check:vercel-runtime` PASS, текущий builder @vercel/next 28.0.1; фактические Functions Node24/fra1, Build Output API v3. Сверить с manifest/webpack/NFT доказательствами локального CI; managed patch Node, provider packaging и окончательное поведение — отдельные cloud gates. Не копировать полный build log или output, где возможны секреты. `Other` не переключать на Next.js preset.

**Сначала проверить отказ анонимному клиенту**, прежде чем входить в приложение: приватный браузер без Vercel login, без share/bypass/cookies/extension, и второе устройство/сеть. Проверить production domain, generated deployment URL и все aliases из Dashboard. Для `/`, `/login`, `/register`, `/cabinet`, `/staff`, `/api/structure`, `/api/register`, `/api/auth/get-session`, `/api/group`, `/api/internal/rate-cleanup` должны быть Vercel authentication/login/denied, **не** HTML приложения/JSON/ticket/student data. Обычные app 401/403 не доказывают Vercel protection. Проверить также direct generated URL, а не только custom alias. Любой публичный app response → FAIL, немедленно закрыть/отменить deployment по фазе 8; не продолжать функциональную приёмку.

**GO:** только владелец с Vercel access может открыть приложение. Не выдавать Shareable Link, не делать protection bypass token «для тестов». Жюри/публика ещё не допускаются.

## 7. Закрытая приёмка — 45–90 минут плюс Neon idle/cron

Функциональные тесты выполнять только на точном BETTER_AUTH_URL из verified Domains, не на случайном generated alias: origin checks намеренно отклоняют другие origins, не добавлять wildcard ради теста. Анонимный отказ проверяется на всех aliases отдельно. Все тесты только на собственном разрешённом URL, вымышленных аккаунтах, с минимальным числом запросов. Записывать статусы в checklist, **не** токены, пароль, email/name настоящего человека, персональный IP, Set-Cookie, credential panel или HAR/trace/network dump. Ответы provider logs не пересылать целиком.

### Auth / данные / UX

- [ ] Войти владельцем через Vercel, затем private STAFF credentials. В отдельном браузерном профиле с тем же разрешённым Vercel owner access проверить двух seed студентов: APPROVED, разные группы; у каждого свой group API 200, чужой id 403. STAFF не передавать всем посетителям.
- [ ] На 360px/ПК synthetic registration принимает лишь структуру; выданный пароль скрыт. Переключить вкладку/приложение → вернуться → маска, тот же пароль доступен для приватного сохранения. Переход ко входу/pagehide/refresh очищают; browser storage/URL пусты от пароля. Не снимать credential panel.
- [ ] Новый STUDENT PENDING → group API 403. STAFF reject с вымышленной причиной → retry → approve; старая история и аудит остаются, доступ только к своей группе. Без роли STAFF решение запрещено, origin/CSRF/прямой signup bypass запрещены. Logout → следующий защищённый запрос 401. Проверить Secure/HttpOnly/SameSite=Lax и no-store/CSP, не копируя значения cookies.
- [ ] Отзыв session/disabled User проверять только на новом тестовом персонаже, не seed/STAFF: в защищённом admin psql выбрать ровно его synthetic UUID, отозвать соответствующий Session либо User.active; следующий запрос старого браузера запрещён. Не выполнять массовые UPDATE/DELETE; записать факт, не токен. Нового публичного UI для этих операций нет.

### Ingress и anti-abuse

- [ ] Настоящий Vercel ingress должен перезаписывать `x-vercel-forwarded-for` одиночным IP. [Официальный контракт](https://vercel.com/docs/headers/request-headers) не заменяет наблюдение. Из owner-authenticated browser DevTools (не сохранять HAR) на своём `/api/auth/sign-in/email` сделать 10 неверных login одного нового synthetic персонажа, затем ожидается 429 на 11-м; менять forged x-forwarded-for/x-vercel-forwarded-for из диапазонов документации 192.0.2.0/24. Секретный пароль туда не вводить: намеренно неверная вымышленная строка. Если CORS/браузер/защита блокирует нужные headers и тест ничего не доказывает — NOT VERIFIED, не PASS.
- [ ] В тот же момент из **другой физической сети** владелец с разрешённым Vercel access должен войти этим персонажем с правильным приватным паролем. Forged headers не должны обходить source bucket; другой реальный источник не блокируется. Отсутствующий/некорректный доверенный source → fail-closed, не fallback. Общий NAT делит quota, IPv6 rotation/ботнет не побеждаются DB limits. Не добавлять внешний proxy/CDN перед Vercel без отдельного ревью.

Воспроизводимый низкоинтенсивный тест: создать нового synthetic персонажа, сохранить его credentials приватно, **ещё не входить им**; подождать не менее минуты без auth-запросов из первой сети (новое source window), открыть Console только на собственном owner-protected origin. Ввести лишь выданный технический логин в prompt, не пароль. Не записывать Console/Network в видео/HAR. Код печатает только номера и статусы:

```js
const campusProbeEmail = prompt('Только выданный демонстрационный логин @example.test, НЕ пароль');
if (!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@example\.test$/.test(campusProbeEmail ?? '')) throw Error('Нужен демонстрационный логин');
const campusStatuses = [];
for (let i = 0; i < 11; i++) {
  const r = await fetch('/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `192.0.2.${i + 1}`,
      'x-vercel-forwarded-for': `198.51.100.${i + 1}`,
    },
    body: JSON.stringify({ email: campusProbeEmail, password: 'Deliberately-wrong-synthetic-only' }),
  });
  campusStatuses.push({ attempt: i + 1, status: r.status });
}
console.table(campusStatuses);
```

С чистыми окнами ожидаются десять 401, затем 429 несмотря на меняющиеся forged IP. Вторая независимая сеть в этот момент должна выполнить обычный успешный UI login тем же персонажем с приватным **правильным** паролем. Ранний WAF/challenge/503/смешанное окно → NOT VERIFIED, не повторять бесконтрольно; выяснить причину или дождаться нового окна, не чистить buckets/не ослаблять лимиты. Если тест даёт 11×401, spoofing может менять source — FAIL до открытия. Сам тест не раскрывает настоящие IP и не просит паролей в DevTools.
- [ ] Project → Firewall: проверить включённую бесплатную DDoS protection, Hobby 3 custom rules и максимум 1 rate-limit rule. Пример начального отдельного правила (для ревью): POST и path один из `/api/register`, `/api/auth/sign-in/email`, ключ source IP, 60/min; действие block/challenge по доступному Free UI. Это внешняя грубая защита поверх более строгих DB лимитов, **PROPOSED** tuning. В pricing dialog подтвердить $0/included allowance (сейчас 1 млн allowed requests); если требуется upgrade/card/платный расход — STOP. Проверить формы/nonce/cron и доступ из РФ после rule; не ставить глобальный site-wide счётчик. Не гарантировать защиту от всех распределённых атак.

### Neon / TLS / pool / resume / cron

- [ ] Runtime DATABASE_URL — pooled host/campus_runtime/verify-full, DIRECT/admin/DEMO_* в env Vercel отсутствуют. Повторить локальный `launch-db check` с runtime.env. Vercel runtime после env change требует нового deployment: старый не меняется сам. Настоящий provider session подтвердить по Neon roles/connections и успешному полному smoke, не только по UI env label. PostgreSQL pool max2/process, idle10s/timeout15s; serverless fan-out умножает подключения. Проверить dashboard на малом согласованном concurrency, не нагрузить Free квоту.
- [ ] Закрыть SQL editor/psql, дашборд-polling приложения, health checks; **>5 минут** без DB activity, убедиться в Neon Suspended/idle. Затем запрос/вход/сессия должны возобновиться без потери DB sessions/истории. Записать фактическую задержку и повторить после cold start Function; TLS/hostname ошибки → FAIL. Не отключать сон/не делать keepalive. Free: 100 CU-hours/project/month, 1 GB Postgres/project, 5 GB egress/project/month; cap/suspend и отсутствие SLA реальны.
- [ ] Cron ежедневно `17 3 * * *` (03:17 UTC / 06:17 МСК, Hobby допускает задержку внутри окна). Реальную доставку через All Deployments и Bearer CRON_SECRET нужно проверить в **Cron/Invocation logs**: обычный анонимный запрос блокируется Vercel, owner-доступ без/с неверным Bearer получает app 401; штатный Cron должен пройти внешний gate и внутренний secret. Не выдавать bypass/отключать All ради cron. Если платформа блокирует invocation — STOP cron gate; временно согласовать ручной bounded cleanup `node --env-file="$campusPrivate/runtime.env" scripts/cleanup-rate-buckets.mjs` с limited ролью, не внешний scheduler. Сам ежедневный cron пока NOT VERIFIED до фактического исполнения.

### Россия, доступность и резерв

Владелец/доверенный тестировщик реально находится в РФ: мобильный интернет минимум двух операторов + фиксированная сеть, без VPN/proxy. Сначала анонимный отказ, затем owner-authorized Vercel access и app workflow. Если для допуска нужен отдельный человек, отдельно утвердить доступ Vercel account, не выключать protection. Из Codex, geolocation emulation или VPN такой PASS не ставить. Фиксировать дату/время МСК, город/оператора без личного IP, устройство/браузер, DNS/TLS/static/login/logout/360px/STAFF flow/resume; скриншоты только безопасных экранов без адресов с credentials. Безопасно вернуть в чат строку checklist со статусом, не network dump.

Перепроверять после каждого deploy, перед открытием подачи **08.11.2026 19:00 МСК** и ежедневно до **28.11.2026 включительно**. Финальный дедлайн подачи неизвестен. Бесплатность не гарантирует uptime.

Render Free Docker + проверенный standalone и та же Neon — **PROPOSED**, не созданный резерв: 750h/workspace/month, сон после 15min, cold start, возможный suspend из-за bandwidth/build/external DB traffic. Нужно отдельно доказать **до первого запуска** закрытый ingress, overwrite доверенного IP, допустимость тарифа и РФ. Не доверять произвольному X-Forwarded-For. Если проблема Neon, смена frontend-хоста не помогает. Если бесплатного безопасного внешнего пути нет — оставить локальную демонстрацию, не ослабить безопасность и не оплачивать обход.

**GO закрытой приёмки:** фактические строки checklist PASS либо ясно оформлен согласованный блокер без публичного открытия. Это не GO для жюри. Расписание, оценки/зачёты, обычные заявки, уведомления, staff CRUD учебных разделов ещё не реализованы; следующий Issue.

## 8. Backup, остановка, откат — 15–30 минут

Перед изменениями сохранить synthetic DB backup через direct owner role. Настроить PGHOST/PGUSER/PGDATABASE/TLS как в фазе 3 (пароль интерактивно). В private папке с 0700/ACL:

```sh
pg_dump -W --format=custom --no-owner --no-acl --file="$campusPrivate/campus-before-change.dump"
```

Dump содержит hashes и session tokens: это секретный файл, не Git/CI/чат/скриншот. Папку зашифровать средствами ОС/доверенным локальным encrypted storage, не хранить рядом публично доступный ключ. `pg_restore --list` проверяет читаемость, **не восстановление**. Реальное восстановление: только после отдельного разрешения в новую пустую Free branch/DB (проверить лимит 10 branches, без paid), PG* переключить именно на неё, затем `pg_restore -W --exit-on-error --no-owner --no-acl --dbname=RESTORE_DB_NAME "$campusPrivate/campus-before-change.dump"`. Без `--clean`, reset/down; сверить миграции, роли, immutable audit, количество истории, повторный grant/check и auth smoke. Пока такой restore не выполнен — backup restore NOT VERIFIED; Neon 6h history window не заменяет backup до конца конкурса.

При инциденте:

1. Сначала оставить/включить **All Deployments**, убрать share/bypass/access grants; при неподтверждённой защите Cancel текущего build и удалить небезопасный deployment в Dashboard → Deployments → его меню (подтвердить все aliases/generated URLs перестали отдавать приложение). Не ждать исправления приложения в публичном виде. Это удаляет deployment, не DB; сохранить private evidence безопасно. Если защиту нельзя подтвердить — не публиковать replacement.
2. Project → Cron Jobs: отключить задания/отменить активное исполнение. Проверить реальные controls в UI; если отключение недоступно — отозвать runtime DB доступ и прекратить deployment. Не «проверять» удалением rate/audit истории. При подтверждённом инциденте доверенный admin может `ALTER ROLE campus_runtime NOLOGIN;` и завершить именно его активные DB backends через pg_stat_activity/pg_terminate_backend. NOLOGIN один не закрывает уже открытые pooled соединения; не трогать чужие роли/базы.
3. При компрометации отдельно утвердить ротацию DB/auth/cron secrets и отзыв DB sessions. ENV update не меняет уже построенный deployment/его cron secret; старые deployment URLs также должны оставаться защищёнными. Не сбрасывать seed для ротации: он намеренно не меняет пароли. Аудит и бизнес-история неизменны.
4. После ручного ревью — последний проверенный deployment с совместимой схемой/env/origin, под All protection; повторить checks/smoke. Никаких destructive down/reset. Если прежней безопасной версии нет, оставаться остановленным. Записать фактический rollback/restore результат в checklist.

## Теперь твоя очередь: 15 действий после ревью

1. Вручную проверить и merge этот PR; отдельно разрешить Free подготовку. До этого — только ревью, не нажимать Deploy/Import.
2. Закрыть тарифный gate из фазы 0, при неопределённости отправить подготовленный вопрос [поддержке](https://vercel.com/help). Вернуть только «подтверждено/ожидается/нельзя» и дату.
3. Выполнить фазу 1: Node24/npm11/psql17, private папка, init; ожидается PASS без значений. При проблеме прислать версию/общую ошибку, не файл.
4. [Neon Console](https://console.neon.tech/) → новая Free PostgreSQL17 Frankfurt DB, без карты/trial. Зафиксировать Free/17/регион, не URL.
5. Локально заполнить direct owner URL, применить migrate status/deploy/status, seed дважды. Ожидается up to date/PASS; не пересылать Connect modal.
6. psql → создать новую SQL campus_runtime NOINHERIT, интерактивно задать приватный пароль; grant дважды. Ожидается PASS, не superuser/owner role.
7. [Vercel Dashboard](https://vercel.com/dashboard)/[Tokens](https://vercel.com/account/tokens) → Hobby scope и короткоживущий scoped token только локально. Выполнить create helper **без Git/deploy**; ожидаются пустой проект и All.
8. В Settings проверить All/owner-only/no bypass/Trusted Sources OFF, Other/Node24/fra1/build/install. Любой priced control/неизвестный UI → STOP и несекретный отчёт.
9. Из Domains скопировать реальный verified origin до deploy; из Neon Connect pooled host. Создать runtime.env и выполнить DB check/Vercel check. Три PASS, 0 deployments. Если domain до deploy отсутствует — STOP, не выяснять его публикацией.
10. В protected Project Environment Variables перенести только пять runtime keys; проверить отсутствие admin/DEMO/token. Прислать только checklist PRE/CLOUD-DB статусы и commit SHA — **точка возврата до первого Deploy**.
11. Отдельно явно разрешить первый защищённый Deploy. Лишь теперь Settings → Git → private bam-low/mgimo; возможный initial build уже разрешён и закрыт. При необходимости Create Deployment → утверждённый SHA. Не открывать новый Import-проект.
12. Check-linked + Build Output/Functions gates, затем анонимный отказ на всех URL/aliases из двух сетей. Любой app response → закрыть deployment, STOP. Сообщить PASS/FAIL без cookies/URL с credentials.
13. Под owner access выполнить auth/изолированные группы/STAFF/UX/ingress/WAF/Neon resume/cron из фазы 7. Заполнить реальные строки, не заменять cloud результат локальным PASS.
14. Выполнить РФ проверки без VPN и private backup/разрешённый restore; оценить резерв без публикации/платежей. Не проверенное оставить NOT VERIFIED.
15. Вернуть заполненные **обезличенные** строки checklist на ревью. Оставить All включённым. Доступ жюри/публики, снятие protection, новые ресурсы, учебные модули и оплачиваемые операции — отдельные решения.

Точный handoff: начало владельческих действий — после review/ручного merge и отдельного Free-разрешения; точка первого Deploy — **между действиями 10 и 11, только после отдельного разрешения и полного pre-deploy GO**. По одному лишь наличию этого runbook начинать deploy нельзя.


## Проверенные официальные источники

Проверены 05.11.2026; реальный account UI не проверялся. При изменении contract/тарифа STOP и повторное ревью, не догадка по старой инструкции.

| Источник | Использованный факт |
| --- | --- |
| [Deployment Protection](https://vercel.com/docs/deployment-protection), [pricing](https://vercel.com/docs/deployment-protection/usage-and-pricing), [Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication) | All бесплатно на всех планах; Standard исключает production domains; разница scopes и bypass |
| [Create project](https://vercel.com/docs/rest-api/projects/create-a-new-project), [update project](https://vercel.com/docs/rest-api/projects/update-an-existing-project) | POST v11 позволяет ssoProtection=all без gitRepository; PATCH v9 задаёт Node/trustedSources, не создаёт deployment |
| [Trusted Sources](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/trusted-sources) | Self-access отличается от настроенных внешних источников; same-repo CI default требует явного false |
| [CLI deploy](https://vercel.com/docs/cli/deploy#prod), [Git](https://vercel.com/docs/git) | Первый deploy production; ручной Create Deployment по Git ref; Hobby author/личный private repo |
| [Hobby](https://vercel.com/docs/plans/hobby), [fair use](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage) | $0 и noncommercial, финансовая выгода любого участника; конкурсное исключение не подтверждено |
| [Neon plans](https://neon.com/docs/introduction/plans), [regions](https://neon.com/docs/introduction/regions) | Free quota/sleep, PostgreSQL17 и выбор региона должны быть сверены в аккаунте |
| [Neon roles](https://neon.com/docs/manage/roles), [TLS](https://neon.com/docs/connect/connect-securely), [pooling](https://neon.com/docs/connect/connection-pooling) | SQL role вместо UI/API neon_superuser; verified TLS и отдельные pooled/direct |
| [WAF rate limits](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting), [cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs) | Hobby rule allowance; secret snapshot и фактическая cron приёмка обязательны |
| [Render Free](https://render.com/docs/free), [Docker](https://render.com/docs/docker) | Резерв требует отдельной бесплатной/закрытой приёмки, не готов заранее |
