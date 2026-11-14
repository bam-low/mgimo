# Контракты для следующей пользовательской вертикали

Источник: [Tracker #25](https://github.com/bam-low/mgimo/issues/25), [Foundation Completion #27](https://github.com/bam-low/mgimo/issues/27), [audit](FOUNDATION_AUDIT.md). После ручного merge — законченные функции в отдельных согласованных Issues; не создавать ещё один этап фундамента. Внутренний срок 21.11.2026, ориентир готовности к развёртыванию 18.11.2026. MVP ещё не готов.

## Серверная граница доступа

1. `actor(headers)` из `src/server/security.ts`: настоящая Better Auth PostgreSQL session, User.active, один текущий membership и активный University. Не принимать userId/role/university scope из браузера. Не возвращать Actor/auth/Session или Prisma include целиком в DTO.
2. `staff(a)` для STAFF-операций; `studentAccess(a)` для учебных ресурсов. PENDING/REJECTED вправе войти и видеть свой минимальный кабинет, но не учебные данные. После отзыва группы APPROVED membership без активной группы не даёт учебного доступа.
3. Каждый query/update ограничивать текущим universityId и принадлежностью объекта. Для личных будущих оценок/заявок — membershipId, для группового расписания — действительная текущая группа. URL/groupId/исторический запрос не являются правом. После перевода старую группу запрещать на каждом новом запросе; cookie cache авторизации отключён.
4. `sameOrigin`, `readJSON` (ограничение body), строгая Zod schema, per-user/source `limited`; guards на сервере обязательны независимо от видимости UI. Ingress доверять только существующему verified source contract, не произвольному X-Forwarded-For. Сохранять CSP nonce, private/no-store и current cookie/session policy.

## Транзакции и жизненный цикл

`src/server/enrollment-guards.ts`: `validGroup` проверяет University→Faculty→Program→Group и активность; `lockMembership` параметризованно блокирует scoped строку; `requireStaff` повторно проверяет полномочия/активность актора в той же транзакции. Approval, retry и `changeMembership` используют один lock. Не переносить domain write/audit за границу транзакции.

`POST /api/staff/membership` принимает только строгие TRANSFER / REVOKE / ALLOW_RESUBMISSION. Причина обязательна (1–500), expectedEnrollmentId обязателен для transfer/revoke. Смена/повтор/та же группа безопасно отклоняются 409; это допустимый утверждённый контракт идемпотентности, не необходимость нового idempotency store. Перевод не создаёт EnrollmentRequest: новый GroupMembership.sourceId ссылается на AuditLog.id операции. После отзыва APPROVED и старое одобрение запроса сохраняются; resubmissionAllowed появляется только отдельным действием STAFF и потребляется новой подачей того же membership.

AuditLog immutable, partial unique indexes запрещают второй PENDING/активный GroupMembership. История не удаляется каскадом. Схема содержит 15 текущих моделей и служебную _prisma_migrations (16 таблиц); миграция #27 добавляет пять индексов, не функции/таблицы/роли. SQL policy `scripts/launch-db-policy.mjs` имеет точный whitelist: новая настоящая функциональная таблица должна одновременно получить осмысленные grants, ограниченные writes и отрицательные integration tests в своей Issue. Нельзя просто расширить whitelist ради зелёного CI.

Следующая staff CRUD структуры должна сохранять A40 synthetic-only roster и в одной транзакции согласовывать деактивацию групп с чтением/изменением прикреплений; текущие demo enum/seed IDs намеренно фиксированы. Не открывать ввод реальных identity fields. Notification при подтверждении — утверждённое требование полного MVP; запись в транзакции вводится с Notifications-модулем, не placeholder в фундаменте.

## API, списки, даты и UI

- Успех: минимальный DTO; существующие mutation handlers возвращают `{ok:true}`. Ошибки `failure` из `errors.ts`: безопасный `{error}`, 400 validation, 401/403 права, 404 scoped cursor, 409 конфликт, 500 unexpected, 503 известная DB outage. Denied не переносит внутренние данные; логируются только разрешённые code/category. Не логировать исходный message/cause/stack/SQL/headers/body/URL с секретами.
- `protectedPage` оборачивает защищённую загрузку: Denied redirect/notFound, outage → generic boundary, без исходной cause. Вызывать framework redirects вне callback; иначе их можно ошибочно принять за outage. `src/app/error.tsx` и `loading.tsx` дают безопасные retry/status состояния.
- `pagination.ts` + `server/lists.ts`: размер 25, запрос 26 для next, id cursor ≤100, стабильный порядок createdAt+id либо id. Валидировать ownership anchor; чужой cursor →404. Invalid syntax →первая страница. Не загружать полную историю в Actor; не возвращать лишние связанные auth поля.
- `universityDate(instant, university.timezone)`: явно заданная IANA-зона, invalid zone даёт ошибку, не host fallback. DB timestamps — абсолютные моменты. Повторы/DST/локальное время занятий и правила пересечений определяются в Issue расписания, не предполагаются этим formatter.
- Переиспользовать действующие формы/labels/fieldsets, busy/error/status, `MembershipForm`, semantic nav, pagination links, `.panel/.request` и действующий Academic Editorial. Проверять 360px, keyboard/focus, reduced motion, text scale и реальные server denies. Не менять палитру/изображения/логотип и не строить универсальный UI-kit без необходимости.
- После mutation `router.refresh`; logout подтверждается сервером и показывает ошибку сети. Авторизация пересчитывается на каждом новом HTTP-запросе; уже доставленный HTML не отзывается из памяти удалённого браузера, realtime push не обещан.

## Проверки и известные границы

Сохранять Node/Docs/VPS CI. Новые функциональные browser tests запускать во всех трёх путях: standalone, generated Functions и закрытая VPS rehearsal. Integration — настоящий PG17/SCRAM, isolated `_test` DB, реальные handlers/SQL, без reset counters или ослабления лимитов для прохождения. Seed повторно валидирует три разных private demo пароля и права, не восстанавливает их скрытно. Общий browser quota рассчитан на реальные synthetic attempts; не добавлять лишние регистрации вместо переиспользования test fixture.

Runtime — только проверенный standalone либо условно разрешённые проверенные Functions; без Prisma CLI/Studio/девяти Studio alpha/build tooling/секретов. CLI/alpha допускаются в изолированном migration/tools job по A36. Production npm audit0 не заменяет OS scan и runtime imports. Scripts/checkers не ослаблять и не исключать неудобные findings.

Production **NO-GO** остаётся: unfixed HIGH требуют gate D; реальные VPS host/ingress/РФ/backup и альтернативные Vercel/Neon свойства NOT VERIFIED. Функциональную работу это не блокирует. Не покупать, не публиковать, не создавать ресурсы, не dispatch registry workflows и не merge/auto-merge. Только владелец после ревью вручную merge и обновляет tracker #25; дальнейший scope — функциональная Issue.

## Актуализация после Feature 1 #29

Foundation #27 вручную merged в #28. Физическая схема теперь включает ScheduleEntry: 16 моделей + _prisma_migrations (17 таблиц); Faculty/Program active+version и StudentGroup version. Утверждённая текущей функциональной Issue SQL policy разрешает SELECT/INSERT/UPDATE структуры/занятий, без DELETE/DDL. Прежние числа/ограничения выше описывают baseline #27. Реализованные schedule/time/structure contracts и ASSUMPTION — [SCHEDULE](SCHEDULE.md); их следует переиспользовать в следующих вертикалях, не строить ещё один фундамент.

Регистрационный roster теперь динамический внутри одного demo-university: только активная цепочка, изменяемая доверенным STAFF. Synthetic identity и запрет STAFF signup не ослаблены. Следующие вертикали — успеваемость, заявки/справки, уведомления; production NO-GO не снят.

## Вертикаль успеваемости — Issue #39

Реализация в отдельной ветке: [модель, DTO, права, аудит и приёмка](GRADES.md). STUDENT read-only; STAFF управляет оценками/зачётами своего вуза. Subject/Grade добавляются без изменений прежних данных, SQL policy расширяется только SELECT/INSERT/UPDATE этих таблиц; составные FK удерживают university scope. Результаты принадлежат membership, перевод их не удаляет. Периоды/GPA/заявки/уведомления не вводятся. До ручного merge не считать принятой main. Production NO-GO сохраняется.

## Продолжение после принятия #39 — Issue #41

PR #40 вручную merged в main `b784fb09`, #39 закрыта. Новая feature-ветка от актуальной main реализует [семестры и конструктор](SEMESTERS.md), переиспользует Subject и ScheduleEntry. Все future-generation изменения сохраняют ручные слоты/отмены и прошлое; правила имеют периоды действия. Нельзя регенерировать активное ручное занятие за пределами нового календаря: подтверждённый владельцем безопасный отказ. Новые таблицы одновременно включены в точную SQL policy, negative grants и restore counts. Точные CI/скриншоты — в Draft PR после фактических проверок. Исторические разделы выше остаются baseline прежних Issues; production NO-GO не снят.

Локальная приёмка #41: 15 unit / 62 PostgreSQL integration / 14 standalone E2E / 15 Functions E2E и cold-start/restart / 14 HTTPS VPS E2E + encrypted fresh restore. [Галерея 360/390/1280](screenshots/issue-41/README.md). 0 CRITICAL/fixable HIGH, 6 unfixed HIGH tools сохраняют production NO-GO. Актуальные CI/SHA — [Draft PR #42](https://github.com/bam-low/mgimo/pull/42), ручное принятие ещё требуется. Следующий scope — заявки/вымышленные справки, затем утверждённый владельцем локальный визуальный/UX-аудит 6.5, затем уведомления; не начинать автоматически.

## Handoff этапа 6 / Issue #43

Контракт заявок/защищённых документов: [APPLICATIONS.md](APPLICATIONS.md). Утверждённые Q1–Q8 реализуются в отдельной feature-ветке от main после ручного merge #42; финальное свидетельство runtime/tests/скриншотов — в одном Draft PR. До завершения CI результаты не считать зелёными.

Локальный маршрут владельца к этапу 6.5: [LOCAL_DEMO.md](LOCAL_DEMO.md), реальные образцы вне public в [demo/documents](../demo/documents/README.md). Сохранить все версии/bytes/events/audit в backup, сравнить скачанный файл после restore. Сам UX-аудит владельцем и этап 7 здесь не выполнены. Production NO-GO и ручное принятие сохраняются.

## Визуальное ревью 6.5 / Issue #46

После ручного merge #44 main `f375bee1` содержит заявки и защищённые справки. По поручению владельца после галереи PR #45 выполнено приближение к трём Figma-экспортам и единое оформление остальных действующих экранов. [Новые снимки и сравнения](screenshots/issue-46/README.md), [границы](screenshots/issue-46/LIMITATIONS.md). «Выйти» перенесён в общий AppNav на линию бренда. Сводки главной используют прежние авторизованные read-функции. БД/API/auth/уведомления не расширялись. Последние локальные 19 unit/71 PostgreSQL integration/16 standalone E2E PASS; удалённые статусы — в Draft PR. Человеческий визуальный review, merge и production-приёмка ещё требуются; NO-GO сохраняется.
