# Кампус — рабочее имя платформы

**«Кампус»** — утверждённое владельцем временное отображаемое имя платформы для университетов ([Issue #11](https://github.com/bam-low/mgimo/issues/11), 2026-11-04). Campus — справочная латинская передача, не утверждённые международный бренд, домен или товарный знак. Имя можно заменить позднее без изменения прав, университетской модели и доменной логики. Репозиторий остаётся `bam-low/mgimo`.

**Статус: Foundation Completion (Issue #27), подготовка к пользовательским модулям по Tracker #25.** Репозиторий развивается в конкурсный работающий MVP в рамках первоначальной концепции «Цифровой деканат будущего». В MVP один заранее созданный вымышленный вуз; «Кампус» — имя платформы, не этого вуза, название которого остаётся OPEN. Реализованы регистрация студента, вход, ожидание/отказ/повторная подача, очередь сотрудника и подтверждение. Учебные разделы пока не реализованы.

**Концепт, не официальный сервис.** Все демонстрационные данные должны быть исключительно вымышленными. Интерфейсы предназначены для студента и сотрудника деканата; встроенного GPT/ИИ-помощника в MVP нет.

## Документация

- [Правила Codex](AGENTS.md)
- [Продуктовые требования и приёмка](docs/PRD.md)
- [Architecture Handoff v2: решения и OPEN](docs/ARCHITECTURE.md)
- [Дизайн Academic Editorial и границы утверждения](docs/DESIGN.md)
- [Решения и открытые вопросы](docs/DECISIONS.md)
- [Журнал ИИ-разработки](docs/AI_LOG.md)
- [Отдельный VPS-путь: пошаговый runbook](docs/VPS_DEPLOY_RUNBOOK.md), [GO/NO-GO checklist](docs/VPS_LAUNCH_CHECKLIST.md), [threat model](docs/VPS_ARCHITECTURE.md) и [security review образов](docs/VPS_SECURITY_REVIEW.md) — подготовка Issue #24, без разрешения покупки/deploy. Vercel/Neon альтернатива сохранена.

Источник требований: [Issue #1](https://github.com/bam-low/mgimo/issues/1). По [Issue #7](https://github.com/bam-low/mgimo/issues/7) утверждены модульный монолит и набор технологий (Next.js App Router/React/TypeScript/Tailwind CSS/PostgreSQL/Prisma/Zod/Vitest/Playwright); версии технического каркаса зафиксированы ниже; для этапа 2 утверждён Better Auth 1.7.17 (A35). Конкурсная демонстрация допускает только вымышленные данные (приоритетное уточнение Issue #18); до подтверждения сотрудником и действующего прикрепления учебный доступ закрыт. Подробности — в [Architecture v2](docs/ARCHITECTURE.md). По [Issue #5](https://github.com/bam-low/mgimo/issues/5) выбран Academic Editorial и направление логотипа B; точные визуальные значения открыты, две исходные доски переданы, выбран B (второй выделенный) и концепция № 1; финальный SVG и точные source-макеты ещё не переданы, см. [дизайн-спецификацию](docs/DESIGN.md). Команды установки и запуска каркаса приведены ниже. Конкурсные материалы — отдельная часть работы.

Работа ведётся через Issue → Codex → проверки → PR → ручное утверждение владельцем. Автоматический merge запрещён.

## Локальный запуск этапа 2

Node **24.22.1 LTS**, npm **11.9.0**, PostgreSQL **17**. Один package-lock, `.npmrc` сохраняет ignore-scripts и strict engines. Данные demo/тестов исключительно вымышленные; публичную форму нельзя открывать до ручного ревью synthetic-only UX, см. deployment gates. Не подключайте тесты/seed к реальной или production БД.

1. Установите Node из `.nvmrc`, выполните `npm ci --ignore-scripts`.
2. Поднимите PostgreSQL 17 локально. Официальный проверенный образ: `postgres:17-bookworm@sha256:839fbb5a4942a7758dd93e18b42ea5649807491a0545b5eeeb8f0b8bb11857a5`. Например, экспортируйте локально созданный `POSTGRES_PASSWORD` (не коммитьте его) и запустите:

```sh
docker run --name campus-local-pg -d   -e POSTGRES_USER=campus -e POSTGRES_DB=campus_dev -e POSTGRES_PASSWORD   -p 127.0.0.1:5432:5432   postgres:17-bookworm@sha256:839fbb5a4942a7758dd93e18b42ea5649807491a0545b5eeeb8f0b8bb11857a5
```

3. Скопируйте `.env.example` в `.env.local`, задайте DATABASE_URL (пользователь/пароль/имя локальной БД), BETTER_AUTH_URL=http://localhost:3000 и случайный BETTER_AUTH_SECRET. Секрет сгенерируйте `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` и сохраните только локально. Next загружает `.env.local`, Prisma/seed требуют явного окружения. Node 24 позволяет передать файл без дополнительного dotenv:

```sh
node --env-file=.env.local node_modules/prisma/build/index.js generate
node --env-file=.env.local node_modules/prisma/build/index.js migrate deploy
```

4. Только для отдельной demo/dev БД укажите ALLOW_DEMO_SEED=yes и три разных сильных DEMO_STAFF_PASSWORD/DEMO_STUDENT1_PASSWORD/DEMO_STUDENT2_PASSWORD в `.env.local`, затем:

```sh
node --env-file=.env.local prisma/seed.mjs
npm run dev
```

Seed создаёт один вымышленный вуз-плейсхолдер, два факультета/направления/группы, staff@example.test и student1@example.test/student2@example.test. Пароли задаёте вы; они не записываются в клиент/логи/Git. Повтор seed не сбрасывает пароли/решения и не восстанавливает отозванные прикрепления. Плейсхолдер вуза не является окончательным названием. STAFF создаётся только этим доверенным шагом, публичной регистрации сотрудника нет.

### Проверки

```sh
npm run lint
npm run typecheck
npm test -- --run
```

Для integration/E2E создайте **отдельную пустую БД с суффиксом `_test`**, задайте её DATABASE_URL, тот же BETTER_AUTH_URL и локальный случайный secret; миграции/seed выполните на ней. Тесты откажутся работать без `_test`; они добавляют синтетические записи и не должны использоваться на пользовательских данных.

```sh
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:seed
npm run test:integration
npm run build
npm run check:runtime
npx --no-install playwright install chromium
npm run test:e2e
```

Команды предполагают экспортированные env (или запуск через Node `--env-file` аналогично примерам выше). На машине с готовым Chromium можно задать PLAYWRIGHT_EXECUTABLE_PATH; в CI Playwright устанавливает официальный закреплённый браузер. Unit: 2 теста, PostgreSQL integration: 31 сценарий (включая отдельный child probe реального auth workflow под limited ролью). E2E: 8 сценариев standalone и 9 Functions, включая реальную цепочку student→staff→student на 360/1280 px, второго студента, privacy/error/empty; отдельный cold-start DB session test. E2E стартует production standalone, не dev; проверьте отсутствие другого сервера на 3000. Подробные результаты и версии HEAD CI — в Draft PR, не в обещании этого текста.

### Production-артефакт и граница исключения Prisma

`npm run build` создаёт `.next/standalone` и копирует туда `.next/static`. При копировании сохраняйте относительные symlinks Next (например, `cp -a`; для Node fs.cp — verbatimSymlinks:true). Проверка делает изолированную копию вне checkout. Публичный runtime по A36 до закрытия условных gates Functions — **только этот каталог**, с собственными runtime-env, запуск `HOSTNAME=0.0.0.0 PORT=3000 node server.js` внутри него. Для локальной проверки `HOSTNAME=127.0.0.1 npm run start`. Не копировать .env* в production-артефакт; builder источники должны быть без env-файлов, runtime env задаётся отдельно. Standalone checker отказывает env files/известным secret canaries. Не копировать весь репозиторий/node_modules, не запускать npm install/ci, Prisma CLI/Studio, seed или миграции в публичном runtime. Миграции — отдельная доверенная build/admin-операция до запуска runtime; deploy/хостинг эта задача не выбирает.

`npm run check:runtime` проверяет файловый манифест, Next NFT traces и bundle-маркеры. E2E пишет наблюдённые Node CJS/ESM resolve-пути; явная команда после Playwright проверяет отсутствие Prisma/Studio/@visx и fallback во внешние source node_modules. Это дополнение к manifests/traces, а не полное покрытие всех возможных dynamic imports. Evidence в `.runtime-evidence/`, screenshots тестов в `test-results/`, не коммитятся. CI сохраняет только синтетические screenshots/manifest, без env/паролей/trace с вводом форм.

Prisma **7.10.1**, Better Auth **1.7.17** утверждены комментариями к [Issue #15](https://github.com/bam-low/mgimo/issues/15). Девять @visx alpha разрешены лишь как транзитивные зависимости Studio в build/migration-контуре; обычное `npm ci --omit=dev` оставляет их и **не является deploy-артефактом**. @prisma/engines-version commit-суффикс — технический идентификатор официального engine. Integrity/TLS не отключаются; изменение способа deploy требует повторного решения владельца. В Issue #18 разрешено условное исследование Functions, без отмены standalone и без разрешения публикации.

### Авторизация и ограничения

Better Auth: User/Account/Session/Verification, пароль только Account.password (штатный scrypt: N=16384, r=16, p=1, dkLen=64). PostgreSQL sessions, cookieCache выключен, secondary store/JWT-only отсутствуют. TTL 8 часов, refresh после 30 минут, freshAge 15 минут — явная техническая конфигурация MVP, не прежние library defaults. Каждый защищённый запрос заново проверяет сессию/User.active/университет/роль/статус/активное прикрепление и ownership. CSP с per-request nonce, CSRF/origin, HttpOnly/Secure в production/SameSite cookies, private/no-store ответы и актуализация кабинета при возврате на страницу.

Регистрация вымышленного студента auth+PENDING/profile/request/audit — одна транзакция, Better Auth использует transaction-bound Prisma adapter; вложенная транзакция отключена. Публичный auth signup endpoint закрыт, чтобы исключить обход обязательного прикрепления. Повтор того же подписанного ticket не создаёт второй аккаунт и не возвращает credentials. Адрес создаётся из серверного UUID; произвольный email не принимается.

Rate limiting после [ревью PR #16](https://github.com/bam-low/mgimo/pull/16#pullrequestreview-5776005065): общих блокирующих site-wide/email-only счётчиков нет. Регистрация: 40 POST/минуту и 5 валидных попыток создания/15 минут на источник, ticket issuance — 40 GET/минуту на источник; вход: 20/минуту на источник и 10/15 минут на ту же пару. Источник и email хранятся лишь в HMAC-SHA256 ключах с BETTER_AUTH_SECRET; смена секрета сбрасывает эти технические лимиты. Невалидные запросы также расходуют лимит источника. Logout/get-session не используют эти лимиты: исчерпание входа не мешает завершить сессию. Встроенный IP limiter Better Auth и IP tracking отключены, чтобы не доверять произвольному X-Forwarded-For; публичная защита находится в обёртках API, внутренние auth.api требуют доверенного вызывающего кода.

**Контракт источника перед публичной демонстрацией:** задайте AUTH_TRUSTED_IP_HEADER только для одного заголовка с одиночным IP, который выбранный ingress гарантированно перезаписывает, удаляя значение посетителя. Закройте прямой доступ к приложению в обход ingress. Списки IP/порты/пустые значения запрещены (503), автоматического доверия X-Forwarded-For/Forwarded/Host нет. Без настройки публичный BETTER_AUTH_URL закрывает регистрацию/вход с 503, а не объединяет всех в один bucket. Только для изолированного loopback BETTER_AUTH_URL (localhost/127.0.0.1/::1) допустим общий local-demo источник, не доверяющий входным IP-заголовкам. Этот режим нельзя публиковать через туннель или с loopback URL. IPv6-формы нормализуются, IPv4-mapped IPv6 соответствует IPv4. Несколько пользователей за одним NAT делят лимит источника; IPv6-ротация/ботнет обходят локальную защиту. **До публичного запуска обязательны выбранные и проверенные платформенные WAF/anti-abuse ограничения на ingress, включая распределённые попытки перебора.** Конкретная платформа/её настройки остаются OPEN в рамках отдельного deploy-этапа; здесь инфраструктура не создавалась, распределённая защита не объявляется реализованной.

RateBucket имеет expiresAt на конец окна (максимум 15 минут) и составной индекс expiresAt/key. Каждый ограничиваемый запрос, включая получающий 429, удаляет не более 100 истёкших buckets и 100 старых legacy RateLimit записей через indexed batches/FOR UPDATE SKIP LOCKED; действующие окна не удаляются и их counts не сбрасываются. При продолжающемся трафике backlog очищается, при простое новые записи не создаются. Новая миграция даёт прежним transient buckets ещё 15 минут, затем они удаляются тем же способом; legacy Better Auth RateLimit больше не пополняется. Для доверенной очистки при простое: `node --env-file=.env.local scripts/cleanup-rate-buckets.mjs` (либо `npm run db:cleanup-rates` с экспортированным DATABASE_URL). Команда ограничена 100 пакетами, не публикует идентификаторы и не удаляет auth/доменные данные; большой backlog можно обработать повторным запуском. Issue #18 добавляет защищённый ежедневный Vercel cron для простоя (<=10 bounded batches/вызов); без CRON_SECRET handler закрыт. Платный внешний scheduler не добавлен. Индекс и bounded cleanup ограничивают работу одной операции, но не являются квотой БД против неограниченного распределённого потока новых источников.

PENDING/REJECTED видят только собственный статус/минимальный профиль; учебный доступ закрыт. Повтор после REJECTED сохраняет историю. STAFF решает только запросы своего вуза; двойное решение не создаёт дубликатов. STAFF UI/API реализуют перевод, отзыв и явное разрешение повторной подачи. После отзыва членство остаётся APPROVED, учебного доступа нет; прежнее одобрение и история сохраняются. Повтор допускается только после STAFF-разрешения. Модель сохраняет историю; оценки/заявки на справки/расписание/уведомления не реализованы, поэтому их реальное сохранение/показ здесь не заявлены. Email recovery/verification, публичный деплой и финальный бренд — следующие задачи.

### Ручная проверка

1. Выберите демо-вуз/факультет/направление/группу. Сервер создаст вымышленного студента и покажет private credentials один раз; сохраните их без скриншотов, перейдите к входу. Войдите: «Ожидает подтверждения», `/api/group` возвращает 403.
2. Выйдите, войдите staff@example.test с вашим локальным demo-паролем. В очереди отклоните заявку с причиной. Студент видит отказ и может создать новую попытку; история первой остаётся.
3. STAFF подтверждает новую попытку. Студент видит подтверждённую группу; `/api/group` возвращает только её, запрос с чужим `?id=` — 403. Обычный студент не открывает `/staff` и не может вызвать staff decision.
4. Выйдите и повторите защищённый запрос — 401. Проверьте 360 px и desktop, клавиатурные поля/ошибки/кнопки. Демо-пароли не вводите в issue, скриншоты или публичные ответы.

## Демонстрационная регистрация — Issue #20

Публичная форма принимает только выбор из двух seed-цепочек и короткоживущий ticket. Имя «Демо Студент <синтетическое обозначение>», уникальный `student-<UUID>@example.test` и случайный 256-битный пароль создаются сервером. ФИО/email/password/role/userId в POST запрещены strict schema; не существует переключателя обратно на свободную регистрацию. Вход принимает только технические адреса `@example.test`; не вводите реальные данные или свой личный пароль.

Ticket — серверный UUID/время/HMAC, привязан к проверенному source и действителен 10 минут (30s допустимого clock skew). Это технический анти-replay nonce, **не сессия**. Повтор одного ticket, включая гонку, оставляет один User/Account/PENDING и не выдаёт пароль повторно; новая явно начатая попытка получает новую личность. User.email unique и общая регистрационная транзакция — последний барьер дублей. Source limits не позволяют одному посетителю заблокировать весь сайт; общий NAT делит квоту, distributed abuse остаётся внешним launch gate.

Credentials возвращаются только после commit с private/no-store, не в URL/cookie/log/storage. На клиенте они находятся лишь в памяти открытой страницы, пароль изначально скрыт. При обычном переключении вкладки/приложения уже выданные реквизиты сохраняются для приватного переноса в менеджер паролей; раскрытие пароля выключается. При возврате можно вновь раскрыть и сохранить пароль. Переход ко входу — явное завершение: сначала сохраните реквизиты приватно. При уходе со страницы/pagehide/обновлении они удаляются; выгрузка страницы браузером/ОС также теряет состояние в памяти. Незавершённая регистрация при hidden/pagehide отменяется отдельно, поздний ответ не может показать реквизиты; автоматического повтора нет. Сохраните собственные demo credentials приватно. При потере ответа уже созданный PENDING остаётся в истории; новый пароль/старые credentials публично восстановить нельзя, новая попытка расходует лимит. Гарантия не распространяется на произвольные HTTP-запросы, память/расширения браузера, provider logs или вручную сделанные пользователем копии.

| Seed персонаж | Технический логин | Прикрепление | Пароль только в private env владельца |
| --- | --- | --- | --- |
| Демо Сотрудник | staff@example.test | STAFF / APPROVED | DEMO_STAFF_PASSWORD |
| Демо Студент Один | student1@example.test | APPROVED / Демо-группа 1 | DEMO_STUDENT1_PASSWORD |
| Демо Студент Два | student2@example.test | APPROVED / Демо-группа 2 | DEMO_STUDENT2_PASSWORD |

Все три пароля должны различаться, иметь 12–128 символов и храниться отдельно от Git/CI artifacts. Seed при повторе проверяет hash/password и readiness, не сбрасывает пароль, не восстанавливает роль/статус/группу/отзыв и не печатает credentials. При несовпадении — ошибка, а не ложная готовность; используйте сохранённые исходные private credentials либо отдельно разрешённую чистую demo БД. Старый общий `DEMO_STUDENT_PASSWORD` больше не используется; legacy seed с общим паролем не мигрирует автоматически, никаких production reset/rotation здесь нет. Открытого списка passwords/credentials API нет. Жюри владелец передаёт свои три env-credentials только предусмотренным безопасным способом вне Git/CI/скриншотов. Не предоставляйте STAFF пароль всем публичным посетителям.

Скрипты runtime-тестов удаляют DEMO_* и ALLOW_DEMO_SEED из env дочернего сервера; production на Vercel/standalone также не должен получать их. Playwright traces выключены, чтобы не сохранять выданные/вводимые credentials при неудаче; скриншоты делаются только в кабинете после удаления credential panel. UI проверяется на 360/1280 px, включая ошибки/пустую структуру, переключение вкладки с повторным доступом к выданным реквизитам, явное завершение/pagehide/refresh и поздний ответ отменённой регистрации и чужой доступ вторым студентом.

Расписание/оценки/заявки/уведомления пока отсутствуют: отличающиеся учебные данные seed в этом этапе — факультет/направление/группа, не выдуманная готовность учебных модулей. Публикация по-прежнему требует оставшихся [deployment gates](docs/DEPLOYMENT.md), отдельного разрешения и ручного ревью.

## Подготовка deployment — Issue #18

**Выбран Vercel Hobby + Neon Free условно:** A36 не отменено. [Пошаговая инструкция, ограничения и ручные gates](docs/DEPLOYMENT.md) описывают аккаунты/роли/секреты, миграции, trusted ingress, доступ из РФ до 28 ноября, бесплатный резерв и rollback. Здесь приложение/БД не опубликованы. Реальные Vercel ingress, Neon resume/TLS, российские сети и допустимость конкретного конкурса на Hobby ещё требуют приёмки владельцем.

- `npm run build:vercel` — отдельная чистая сборка официальным @vercel/next 28.0.1 и @vercel/build-utils 15.2.1, без аккаунта/CLI/deploy/реальных секретов. Для Functions выбран webpack; `npm run build` сохраняет Turbopack/standalone.
- `npm run check:vercel-runtime` — fail-closed контроль конечных Functions, webpack/NFT graphs, package provenance, файлов/aliases и canaries. `npm run test:vercel-checker` — 11 негативных/положительных сценариев checker (включая standalone env/secret guards).
- `npm run test:vercel-e2e` — реальные handlers в изолированных процессах: 360/1280px, source abuse/CSRF/права, reject/retry/approve/audit, logout, cron, privacy/ошибки/пустую структуру и cold-start session. Требуются только вымышленные *_test DB и demo secrets, как для существующих тестов.
- vercel.json выбирает **Other / Build Output API**, запрещает Git auto-deploy и задаёт daily cleanup. Создание проекта/ручной Deploy/ввод секретов — отдельные действия владельца после ревью. Не переключать на Next preset без повторной проверки конечного output.
- Только вымышленные данные: прежнее разрешение публичного ввода настоящих данных отменено конкурсным уточнением. Серверные synthetic aliases/credentials реализованы в Issue #20; поля ФИО/email/пароля отсутствуют в регистрации и запрещены API. Другие launch gates сохраняются. Учебные разделы следующих Issues здесь не реализованы.

Runtime DB — pooled DATABASE_URL с TLS verify-full и ограниченной ролью, pg pool max=2/connection timeout 15s/idle 10s на процесс. DIRECT_DATABASE_URL применяется только доверенным миграциям, fallback сохраняет прежний локальный DATABASE_URL. Реальный Neon endpoint в этой задаче не создан и не проверен; режим квот/сна не гарантирует uptime. Production audit в подготовленном дереве — 0; full audit — 13 moderate, 0 high/critical (10 прежних dev + 3 в новом build-инструментарии), результаты CI — в Draft PR.

### Версии

| Пакет | Версия |
| --- | --- |
| `@prisma/adapter-pg` | 7.10.1 |
| `@prisma/client` | 7.10.1 |
| `better-auth` | 1.7.17 |
| `next` | 16.4.5 |
| `pg` | 8.23.1 |
| `react` | 19.2.9 |
| `react-dom` | 19.2.9 |
| `zod` | 4.6.7 |
| `@vercel/next` (build only) | 28.0.1 |
| `@vercel/build-utils` (build only) | 15.2.1 |
| `@vercel/nft` (check only) | 1.10.0 |
| `@eslint/js` | 10.0.1 |
| `@next/eslint-plugin-next` | 16.4.5 |
| `@playwright/test` | 1.58.2 |
| `@tailwindcss/postcss` | 4.3.4 |
| `@types/node` | 24.19.2 |
| `@types/pg` | 8.15.6 |
| `@types/react` | 19.3.0 |
| `@types/react-dom` | 19.3.0 |
| `eslint` | 10.14.0 |
| `prisma` | 7.10.1 |
| `tailwindcss` | 4.3.4 |
| `typescript` | 5.9.3 |
| `typescript-eslint` | 8.72.1 |
| `vitest` | 4.1.12 |

Базовый стек Next 16/React 19/Node 24 сохранён. Версии закреплены в единственном lockfile, install scripts отключены.

## Проверки документации

[Documentation CI](.github/workflows/docs-ci.yml) выполняется на каждом PR в `main` (включая Draft) и push в `main`. Проверка `Documentation checks` использует [скрипт](scripts/check_docs.py) со стандартной библиотекой Python 3.10+; установка пакетов не нужна. В Actions используется системный Python образа `ubuntu-24.04`, образ обслуживается GitHub и не закреплён побитово; единственный внешний Action закреплён полным SHA с указанием версии. Секреты не передаются, права — только `contents: read`, сохранение Git-учётных данных отключено; записи в репозиторий и деплоя нет.

Локально из корня репозитория:

```sh
python3 scripts/check_docs.py
git diff --check
```

Скрипт проверяет все отслеживаемые Git `.md`-файлы, включая обязательные AGENTS, README и пять проектных документов: UTF-8 без BOM, LF и один конечный перевод строки, отсутствие пустых документов, хвостовых пробелов, табуляций и конфликтных маркеров; пробел после ATX-заголовка, закрытие блоков кода; существование целей относительных inline/reference-ссылок и изображений (включая пути с пробелами в угловых скобках и URL-кодирование). Новые файлы нужно сначала добавить через `git add`. Проверка не обращается к внешним URL, не проверяет якоря и не заменяет полный CommonMark-линтер или содержательное ревью; сложный HTML не разбирается.

Отдельный [Node CI](.github/workflows/node-ci.yml) запускает `npm ci --ignore-scripts`, lint, typecheck, Vitest и production build на PR/push в main. Он не заменяет Documentation CI. Actions закреплены SHA, права только contents: read; секретов и деплоя нет. Issue #15 добавляет PostgreSQL integration/E2E и отдельный service container в Node CI; Documentation CI сохранён.

### Ручные настройки GitHub для владельца

1. В Settings → Actions → General разрешить GitHub Actions и использование закреплённого `actions/checkout`; при ограничениях организации согласовать запуск с её администратором. Если Actions запрещены, сначала устранить запрет, затем повторить запуск из вкладки Actions.
2. Проверить Workflow permissions: read-only. CI не требует секретов или разрешения Actions создавать/одобрять PR. Для приватного репозитория проверить доступность минут/биллинга GitHub-hosted runner.
3. Дождаться первого успешного `Documentation checks` на реальном PR. Затем, **если план поддерживает защиту приватной main**, в Settings → Branches → Branch protection rules (или Rules → Rulesets) включить PR перед изменением main и выбрать реально появившуюся проверку как required. До первого успеха не вводить вымышленное имя required check.
4. Не требовать approval другого участника: сейчас владелец один. Ручное решение о merge остаётся за владельцем; auto-merge не включать. Защита приватной ветки может быть недоступна на GitHub Free: в этом случае соблюдать PR-процесс вручную, не считать техническую блокировку настроенной.

Эти настройки не меняются данным PR автоматически. Состояние CI смотрите во вкладке Checks соответствующего PR; отсутствие запуска или недоступность защиты ветки не означает успешную проверку.

### Известные ограничения проверок зависимостей

`npm audit` на этапе Issue #13 сообщил 10 moderate-находок (0 high/critical) в dev-цепочке ESLint/TypeScript ESLint: minimatch/globparts amplification DoS. Они не скрываются; принудительный downgrade/несовместимые major-overrides не применены. `npm audit --omit=dev` на этапе Issue #13 сообщил 0 находок; актуальные audit этапа 2 приведены в PR. Это не проверка безопасности будущей auth/БД. Состояние advisories может меняться; перед расширением приложения повторить аудит и обновить совместимые инструменты. Проверенные результаты тестов и двух CI с точным HEAD публикуются в описании PR.

## Первый закрытый запуск — Issue #22

После merged PR #21 подготовлен [пошаговый runbook](docs/FIRST_DEPLOY_RUNBOOK.md) и [облачный checklist](docs/LAUNCH_CHECKLIST.md). Начать владельческую подготовку можно только после ревью/ручного merge этого PR и отдельного Free-разрешения; первый Deploy — после pre-deploy GO и ещё одного явного разрешения, до Git link. В Codex ресурсы/deploy/настоящие секреты не используются. Docker владельцу не нужен; Node24 и psql17 работают с новой synthetic Neon DB.

Важное уточнение: Vercel Authentication + **All Deployments** теперь документированы как бесплатные на Hobby; Standard/Preview не закрывают production domains. Первый deploy нового проекта может быть production даже без --prod. Runbook использует пустой проект с атомарным All в create request, без Git/deploy, затем API readback/UI review до первого build. Нет безопасной настройки до deploy — STOP без публикации; применимость Hobby к конкурсу с возможным призом отдельно NOT VERIFIED. A36/A38 не отменены.

Подготовленные инструменты (не приложение/не публичные API):

- `scripts/launch-config.mjs init|runtime|ca --output ABSOLUTE_PRIVATE_PATH` — exclusive private файлы вне Git; отдельный runtime файл с пятью ключами, без admin/DEMO/API token; CA mode экспортирует существующий доверенный публичный ISRG Root X1 для psql verify-full. Нужные private env и команды для ОС — только runbook.
- `scripts/launch-db.mjs grant --apply --dedicated-synthetic-db` / `check` — транзакционные grants на выделенной DB и read-only audit реальной limited роли/TLS; без password reset/автопочинки схемы. Локальное исключение допускает только loopback *_test.
- `scripts/launch-vercel.mjs create --apply --owner-approved-free-project` — **только владелец после разрешения**, создаёт пустой All-protected Hobby проект. `check` / `check-linked` — read-only конфигурация/verified origin/no bypass; никаких deployment/Git-link/env-upload calls.
- `npm run test:launch-tools` — локальные helper fixtures, mock Vercel API, без сети/аккаунтов. Полный Node CI сохраняет standalone/Functions gates и добавляет эти проверки. PostgreSQL integration проверяет реальную аутентифицированную limited роль, отрицательные привилегии, idempotence и сохранность аудита.

Остальные cloud gates — реальный ingress, Neon TLS/pooling/resume, фактические Functions, cron, РФ без VPN, backup restore и тариф. Непройденное остаётся NOT VERIFIED. Жюри/публика не получают доступ автоматически; расписание, оценки, обычные заявки, уведомления и учебный staff CRUD ещё не реализованы.

## Foundation Completion — Issue #27

[Аудит с доказательствами и вердиктом](docs/FOUNDATION_AUDIT.md), [контракты для следующих модулей](docs/FEATURE_HANDOFF.md). Подтверждённые пробелы: отсутствовавшие штатные операции A31/A32, неограниченные списки истории/очереди, обработка отказов БД как пользовательских ошибок. Добавлены транзакционные STAFF-операции и отрицательные тесты, постраничные scoped DTO, безопасные error/loading boundaries, университетское отображение дат и пять additive query indexes. Стек и зависимости сохранены; учебных модулей нет.

`POST /api/staff/membership`: строгие TRANSFER / REVOKE / ALLOW_RESUBMISSION, только текущий APPROVED STAFF своего вуза, same-origin, per-user rate limit, причина, ожидаемое активное прикрепление для transfer/revoke. Повтор/устаревшая форма безопасно отклоняется 409. Lock, проверка прав, изменение и неизменяемый аудит — одна транзакция. Новые запросы после перевода/отзыва сразу проверяют актуальную группу; отправленные ранее данные браузер не может «забыть» задним числом.

Дополнительная проверка после `npm run db:migrate`:

```sh
npx --no-install prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Она проверяет соответствие schema/БД; частичные уникальности и audit trigger отдельно проверяются integration/launch tests. Списки ограничены 25+1 с проверкой принадлежности cursor; private данные не возвращают raw auth/Actor. Даты выводятся в IANA timezone вуза; правила будущего расписания не предрешены.

План владельца: готовность к размещению 18.11.2026, внутренний срок проекта 21.11.2026. После ручного merge #27 — функциональные вертикали согласно [Tracker #25](https://github.com/bam-low/mgimo/issues/25). Production security NO-GO и реальные gates A–F остаются; приложение не опубликовано.
