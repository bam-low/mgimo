# Кампус — рабочее имя платформы

**«Кампус»** — утверждённое владельцем временное отображаемое имя платформы для университетов ([Issue #11](https://github.com/bam-low/mgimo/issues/11), 2026-11-04). Campus — справочная латинская передача, не утверждённые международный бренд, домен или товарный знак. Имя можно заменить позднее без изменения прав, университетской модели и доменной логики. Репозиторий остаётся `bam-low/mgimo`.

**Статус: этап 2 — регистрация, прикрепление и защищённые кабинеты (Issue #15).** Репозиторий описывает конкурсный работающий MVP в рамках первоначальной концепции «Цифровой деканат будущего». В MVP один заранее созданный вымышленный вуз; «Кампус» — имя платформы, не этого вуза, название которого остаётся OPEN. Реализованы регистрация студента, вход, ожидание/отказ/повторная подача, очередь сотрудника и подтверждение. Учебные разделы пока не реализованы.

**Концепт, не официальный сервис.** Все демонстрационные данные должны быть исключительно вымышленными. Интерфейсы предназначены для студента и сотрудника деканата; встроенного GPT/ИИ-помощника в MVP нет.

## Документация

- [Правила Codex](AGENTS.md)
- [Продуктовые требования и приёмка](docs/PRD.md)
- [Architecture Handoff v2: решения и OPEN](docs/ARCHITECTURE.md)
- [Дизайн Academic Editorial и границы утверждения](docs/DESIGN.md)
- [Решения и открытые вопросы](docs/DECISIONS.md)
- [Журнал ИИ-разработки](docs/AI_LOG.md)

Источник требований: [Issue #1](https://github.com/bam-low/mgimo/issues/1). По [Issue #7](https://github.com/bam-low/mgimo/issues/7) утверждены модульный монолит и набор технологий (Next.js App Router/React/TypeScript/Tailwind CSS/PostgreSQL/Prisma/Zod/Vitest/Playwright); версии технического каркаса зафиксированы ниже; для этапа 2 утверждён Better Auth 1.7.17 (A35). Публичная регистрация допускает собственные данные пользователя; до подтверждения сотрудником и действующего прикрепления учебный доступ закрыт. Подробности — в [Architecture v2](docs/ARCHITECTURE.md). По [Issue #5](https://github.com/bam-low/mgimo/issues/5) выбран Academic Editorial и направление логотипа B; точные визуальные значения открыты, две исходные доски переданы, выбран B (второй выделенный) и концепция № 1; финальный SVG и точные source-макеты ещё не переданы, см. [дизайн-спецификацию](docs/DESIGN.md). Команды установки и запуска каркаса приведены ниже. Конкурсные материалы — отдельная часть работы.

Работа ведётся через Issue → Codex → проверки → PR → ручное утверждение владельцем. Автоматический merge запрещён.

## Локальный запуск этапа 2

Node **24.22.1 LTS**, npm **11.9.0**, PostgreSQL **17**. Один package-lock, `.npmrc` сохраняет ignore-scripts и strict engines. Данные demo/тестов исключительно вымышленные; для публичного ввода собственных данных действуют серверные проверки. Не подключайте тесты/seed к реальной или production БД.

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

4. Только для отдельной demo/dev БД укажите ALLOW_DEMO_SEED=yes и два разных сильных DEMO_STAFF_PASSWORD/DEMO_STUDENT_PASSWORD в `.env.local`, затем:

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

Команды предполагают экспортированные env (или запуск через Node `--env-file` аналогично примерам выше). На машине с готовым Chromium можно задать PLAYWRIGHT_EXECUTABLE_PATH; в CI Playwright устанавливает официальный закреплённый браузер. Unit: 2 теста, PostgreSQL integration: 10 сценариев, E2E: реальная цепочка student→staff→student на 360 и 1280 px. E2E стартует production standalone, не dev; проверьте отсутствие другого сервера на 3000. Подробные результаты и версии HEAD CI — в Draft PR, не в обещании этого текста.

### Production-артефакт и граница исключения Prisma

`npm run build` создаёт `.next/standalone` и копирует туда `.next/static`. При копировании сохраняйте относительные symlinks Next (например, `cp -a`; для Node fs.cp — verbatimSymlinks:true). Проверка делает изолированную копию вне checkout. Публичный runtime — **только этот каталог**, с собственными runtime-env, запуск `HOSTNAME=0.0.0.0 PORT=3000 node server.js` внутри него. Для локальной проверки `HOSTNAME=127.0.0.1 npm run start`. Не копировать весь репозиторий/node_modules, не запускать npm install/ci, Prisma CLI/Studio, seed или миграции в публичном runtime. Миграции — отдельная доверенная build/admin-операция до запуска runtime; deploy/хостинг эта задача не выбирает.

`npm run check:runtime` проверяет файловый манифест, Next NFT traces и bundle-маркеры. E2E пишет наблюдённые Node CJS/ESM resolve-пути; явная команда после Playwright проверяет отсутствие Prisma/Studio/@visx и fallback во внешние source node_modules. Это дополнение к manifests/traces, а не полное покрытие всех возможных dynamic imports. Evidence в `.runtime-evidence/`, screenshots тестов в `test-results/`, не коммитятся. CI сохраняет только синтетические screenshots/manifest, без env/паролей/trace с вводом форм.

Prisma **7.10.1**, Better Auth **1.7.17** утверждены комментариями к [Issue #15](https://github.com/bam-low/mgimo/issues/15). Девять @visx alpha разрешены лишь как транзитивные зависимости Studio в build/migration-контуре; обычное `npm ci --omit=dev` оставляет их и **не является deploy-артефактом**. @prisma/engines-version commit-суффикс — технический идентификатор официального engine. Integrity/TLS не отключаются; изменение способа deploy требует повторного решения владельца.

### Авторизация и ограничения

Better Auth: User/Account/Session/Verification, пароль только Account.password (штатный scrypt: N=16384, r=16, p=1, dkLen=64). PostgreSQL sessions, cookieCache выключен, secondary store/JWT-only отсутствуют. TTL 8 часов, refresh после 30 минут, freshAge 15 минут — явная техническая конфигурация MVP, не прежние library defaults. Каждый защищённый запрос заново проверяет сессию/User.active/университет/роль/статус/активное прикрепление и ownership. CSP с per-request nonce, CSRF/origin, HttpOnly/Secure в production/SameSite cookies, private/no-store ответы и актуализация кабинета при возврате на страницу.

Регистрация auth+PENDING/profile/request/audit — одна транзакция, Better Auth использует transaction-bound Prisma adapter; вложенная транзакция отключена. Публичный auth signup endpoint закрыт, чтобы исключить обход обязательного прикрепления. Дубли регистрации дают нейтральный ответ и сопоставимую hashing-работу; это не абсолютная гарантия против всех timing side channels.

Rate limiting: PostgreSQL-счётчики, глобальные пределы и hash(email) ключи; регистрация 5/15 минут на email и 40/минуту глобально; вход 10/15 минут на email и 120/минуту глобально, дополнительно Better Auth 20 входов/минуту на IP. Прямые auth.api вызовы не считаются защищёнными встроенным limiter: публичные маршруты ограничиваются отдельно. Это защита demo-монолита, не внешний WAF; существует риск блокировки чужого email и общего лимита злоумышленником. Старые RateBucket окна требуют периодической очистки доверенной административной операцией (автоматический scheduler не внедрён).

PENDING/REJECTED видят только собственный статус/минимальный профиль; учебный доступ закрыт. Повтор после REJECTED сохраняет историю. STAFF решает только запросы своего вуза; двойное решение не создаёт дубликатов. Отзыв/перевод сохранены в модели и authorizer; полноценного staff UI/API для них **нет**. После отзыва членство APPROVED не даёт доступа, повтор разрешается только отдельным действием STAFF (следующий этап). Модель сохраняет историю; оценки/заявки на справки/расписание/уведомления не реализованы, поэтому их реальное сохранение/показ здесь не заявлены. Email recovery/verification, публичный деплой и финальный бренд — следующие задачи.

### Ручная проверка

1. Зарегистрируйте вымышленного студента, последовательно выбрав вуз/факультет/направление/группу. Войдите: «Ожидает подтверждения», `/api/group` возвращает 403.
2. Выйдите, войдите staff@example.test с вашим локальным demo-паролем. В очереди отклоните заявку с причиной. Студент видит отказ и может создать новую попытку; история первой остаётся.
3. STAFF подтверждает новую попытку. Студент видит подтверждённую группу; `/api/group` возвращает только её, запрос с чужим `?id=` — 403. Обычный студент не открывает `/staff` и не может вызвать staff decision.
4. Выйдите и повторите защищённый запрос — 401. Проверьте 360 px и desktop, клавиатурные поля/ошибки/кнопки. Демо-пароли не вводите в issue, скриншоты или публичные ответы.

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
