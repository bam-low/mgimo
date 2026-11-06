# Foundation Completion — доказательный аудит #27

Дата: 06.11.2026. Baseline: main `fb40fc0` (PR #26 merged владельцем). Scope и приоритеты: [Issue #27](https://github.com/bam-low/mgimo/issues/27), [Tracker #25](https://github.com/bam-low/mgimo/issues/25). Сначала прочитаны инструкции/утверждённые документы и фактические schema, handlers, tests, SQL policies и CI. Работающие auth, synthetic-only registration, security/launch helpers и архитектурные пути не переписывались. Незначительные улучшения не задерживают функции.

## Inventory и закрытые пробелы

| Требование | Исходное состояние main | Доказательство | Исправление / не требуется | Проверка |
| --- | --- | --- | --- | --- |
| Database sessions, logout, User.active, роли | Реализовано; прав из cookie недостаточно | server/auth.ts, security.ts, tests/access.test.ts | Сохранено, STAFF повторно проверяется в транзакции действий | Integration: disabled actor, foreign university, stale session/group, logout |
| Synthetic-only identity, запрет STAFF signup | Signed ticket, strict server identity, atomic auth/domain signup | demo-identity.ts, enrollment.ts, demo-registration.test.ts | Не требуется; реальные поля/роли не принимаются | Replay, role injection, CSRF, source/account quotas; credential UX E2E |
| Статусы PENDING/REJECTED/APPROVED | Собственный минимальный кабинет разрешён до одобрения; учебный доступ запрещён | security.ts, access.test.ts | Сохранено; не запрещаем сам login ожидающему студенту | Pending/rejected/revoked/foreign group negatives |
| STAFF transfer/revoke/retry permission A31/A32 | Только модель/authorizer и тестовые ORM-переходы, штатного сценария нет | В baseline отсутствует api/staff/membership | Добавлены строгий POST, форма, locks, audit, expectedEnrollmentId/409, explicit permission | foundation.test.ts: HTTP race, stale form, same group, role/scope, revoked retry; foundation.spec.ts полный browser path |
| История и атомарность | Partial uniqueness и immutable audit уже есть | SQL migrations, launch-db-policy.mjs | Сохранены; общий scoped row lock для решений/повторов/переводов/отзыва | Rollback при отказе audit INSERT; duplicate GS/PENDING rejected; история исходного APPROVED неизменна |
| Least-privilege PostgreSQL | 15 моделей + _prisma_migrations, раздельные runtime/migration roles | launch-db-policy.mjs, launch-db.test.ts | Новых grants/таблиц/функций нет; limited-role probe расширен новыми HTTP-операциями | Реальный SCRAM PG17, неверный пароль отвергается, DDL/audit mutation запрещены |
| Ограниченные выборки и DTO | Actor загружает всю историю; очередь/история без предела | Baseline security.ts, cabinet/page.tsx, staff/page.tsx | Actor take 1, scoped lists 25+1, стабильный cursor, минимальные DTO и пять query indexes | >25 записей, отсутствие дублей, cursor чужого membership 404; staff/student guard |
| Ошибки/наблюдаемость | Любой unexpected error превращался в 400; outage страницы в redirect login | Baseline failure(), catch блоки страниц | Safe 400/409/500/503, generic boundary/loading, allowlisted code logs; logout network error видим пользователю | Unit: secret-like URL/SQL/stack не логируются; outage не маскируется под истёкшую сессию |
| Даты | Нет общего контракта форматирования | Cabinet/queue dates | universityDate с явным IANA timezone вуза, без зависимости от host TZ | Unit: полночь в разных зонах и invalid zone; actual server rendering |
| UI foundation | Действующие формы/семантика/focus/responsive | globals.css, forms.tsx, DESIGN | Переиспользованы, добавлены STAFF controls/status/errors и страницы списков; без redesign | Реальный 360px, reduced motion, 200% text scale, буквальный script в комментарии не исполняется |
| Standalone / Functions / VPS | Реализованные независимые isolation gates | scripts/check-runtime.mjs, check-vercel-runtime.mjs, test-vps.mjs | Сохранены; новая функциональная E2E включена во все пути | Production builds, files/graphs/secrets/runtime imports, cold start; закрытая локальная VPS rehearsal |
| План/дедлайн/следующий этап | Разрозненные старые статусы этапа 2 | PRD/README/Architecture до #27 | Согласованы с Tracker #25; feature handoff, без учебных моделей/заглушек | Documentation checks, diff check, owner review |

## Проверяемые команды и результаты

Локально используются только вымышленные fixtures в отдельных БД официального PostgreSQL17 с SCRAM. Старый trust-сервис не является доказательством парольной защиты; отрицательные проверки wrong password выполняются настоящим подключением. Лимиты не сбрасывались для прохождения E2E: повторные прогоны используют новые отдельные synthetic test databases.

- `npm run db:generate`, `npm run db:migrate`, двойной `npm run db:seed`: PASS; третья additive миграция содержит только пять CREATE INDEX.
- `npx --no-install prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`: PASS, no difference. Custom partial indexes/trigger дополнительно проверяются integration tests.
- `npm run lint`, `npm run typecheck`, `npm test -- --run`: PASS, 6 unit tests.
- `npm run test:integration`: PASS, 37 tests, включая limited SQL role и новые lifecycle negatives.
- `npm run test:vercel-checker`, `npm run test:launch-tools`, `node --test tests/vps-config.test.mjs tests/vps-tools.test.mjs`: PASS: 11 checker, 7 launch tools, 15 VPS config/tools tests.
- `npm run build`, `npm run check:runtime`, `npm run test:e2e`: PASS, 9 browser tests и 564 наблюдаемых CJS/ESM resolutions, без запрещённых импортов/fallback.
- `npm run build:vercel`, `npm run check:vercel-runtime`, `npm run test:vercel-e2e`: PASS, 10 browser tests, cold start/restart/logout; 442 наблюдаемых resolutions в 4 изолированных Functions. Покрытие динамических импортов ограничено исполненными путями и дополнено статическими gates.
- VPS: `node scripts/prepare-vps-context.mjs`, три `docker build --network=none`, `node scripts/test-vps.mjs`; PASS: verified TLS/SCRAM, wrong password/non-TLS denial, migrations/seed×2/grants, закрытие всех путей до app, spoofed ingress headers, 9 HTTPS E2E, encrypted backup и restore в отдельную свежую БД. Это локальная репетиция, не проверка реального сервера; актуальный remote scan — в Draft PR.
- `npm audit --omit=dev`: 0. Полный `npm audit`: 13 moderate в dev, exit 1; high/critical нет. Зависимости/lockfile не изменены, audit fix не запускался.
- `python3 scripts/check_docs.py`, `git diff --check` и GitHub Actions Node/Docs/VPS на точном SHA: окончательные результаты/ссылки фиксируются в Draft PR после выполнения. Локальные результаты не выдаются за remote CI.

## Границы и Deferred

Расписание, оценки, обычные заявки/справки, уведомления и staff CRUD структуры не реализованы. Их схема/сценарии — следующие согласованные функциональные Issues; транзакционная notification при подтверждении добавляется вместе с настоящим модулем уведомлений. Никаких фиктивных Notification/Schedule/Grade таблиц сейчас.

Deferred: финальные токены/логотип и pixel-perfect polish, мелкая оптимизация запросов, универсальная UI-библиотека, stress нескольких STAFF, мультивузность/SSO/полный отзыв UniversityMembership, email recovery. Поддерживаемый pg8 предупреждает об overlapping queries внутри Prisma transaction; переход на pg9 не входит в этот scope. Это не подтверждённые blockers текущих функций.

**Production NO-GO сохраняется:** baseline remote PR #26 содержит 2 app / 8 tools unfixed HIGH; актуальный scan final SHA — в Actions. Никаких ignore-исключений. Gate D и реальные VPS SSH/systemd/firewall/LE/ёмкость/РФ/offsite restore, Vercel ingress/Neon TLS/pooling/resume и тарифные условия не подтверждены облаком. Покупок, deploy, registry dispatch, main push и merge не было.

## GO FOR FEATURE DEVELOPMENT

Подтверждённые блокеры текущего фундамента закрыты; реальные guards, DB transitions/constraints, ограниченная роль, сборки/isolation и browser scenarios проверены. После зелёного CI и ручного ревью/merge владельцем — следующая согласованная пользовательская вертикаль по Tracker #25, без ещё одной инфраструктурной Issue. Это **GO FOR FEATURE DEVELOPMENT**, не готовый MVP и **не GO для production/VPS**.
