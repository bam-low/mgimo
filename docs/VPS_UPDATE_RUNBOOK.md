# Закрытый VPS: обновление и восстановление

Контракт RC `v1.0.0-rc.1`, [Issue #54](https://github.com/bam-low/mgimo/issues/54). Это инструкция **для будущего отдельно разрешённого действия владельца**, не команда Codex подключиться к серверу. Production NO-GO. Первая установка — [VPS_DEPLOY_RUNBOOK](VPS_DEPLOY_RUNBOOK.md); полные gates — [checklist](VPS_LAUNCH_CHECKLIST.md).

## Поддерживаемая совместимость

Для этого RC репетируется A=`287912fe19df75404b81dd36ea1df5bb62187c71` → B=reviewed RC. Восемь SQL-миграций сохраняются побайтно; PostgreSQL остаётся17, UID70. Изменяется библиотека zlib в database image, а не major PostgreSQL. Совместимый откат проверяет **старое приложение A на database B**, не downgrade PostgreSQL/схемы. Исторические tools A используются исключительно как тестовая fixture и не поставляются для установки.

Это не обещание совместимости любой будущей миграции. Следующее обновление обязано определить A как реально установленный подписанный релиз, добавить его репетицию и review до окна. Если живой стенд отличается от проверенного A — STOP, сначала инвентаризация и отдельное доказательство.

## До технического окна

1. Получить отдельное разрешение обновления. Зафиксировать текущие releaseVersion/source SHA/image IDs, PG version, фактический Compose project/volume, UID/GID, migration ledger, работающие timers и состояние сервиса. Сохранить предыдущие env references и конфигурацию root-only в **новые** файлы, не перезаписывая исходники.
2. Проверить три CI B, полные scanner reports и security review. Взять проверенный архив B и подпись; signer закреплён независимо. Верификатор берётся из доверенного reviewed checkout, а не исполняется из неподтверждённого архива:

```sh
bash /PATH/TO/TRUSTED/ops/vps/verify-delivery.sh /etc/campus/allowed_signers /PATH/TO/RELEASE_B
```

Проверяются SSHSIG, пять фиксированных checksums, строгий manifest, безопасный состав config.tar и хеши/образные IDs встроенных evidence. Скрипт ничего не загружает/не запускает. Успех не заменяет ручное разрешение. Неверная версия/подпись/evidence/image IDs — STOP. Не применять `latest`, чужую архитектуру или сторонний signing key из ZIP.

3. Убедиться, что хватает диска на A+B+encrypted backup+временный restore, память не занята backup/tools одновременно. Проверить offsite доступ и age key, резервный SSH/console, ответственного оператора и окно простоя. Не удалять A или его backup ради места.

## Stop-writes и проверенная предмиграционная копия

4. Сохранить закрытый Nginx gate. BasicAuth **не запрещает авторизованным пользователям менять данные**. Остановить timers пишущих операций/backup на время окна и дождаться активных jobs; проверить отсутствие другого мигратора. Остановить app; DB/volume не удалять. Зафиксировать исходное состояние timers, чтобы восстановить именно его после приёмки. Одноразовый cleanup тоже пишет в БД.
5. Запустить штатный encrypted backup через campus-backup.service после остановки writers; проверить успешное завершение и новый файл, скопировать offsite, проверить ciphertext hash/age integrity. Не распечатывать credentials или дамп. Сохранить ledger и сверочные counts/hashes истории/версий/уведомлений. RPO окна — момент этой копии; production RPO≤24ч пока только целевой ориентир daily backup.
6. До рискованной миграции выполнить fresh restore копии в отдельную БД/volume и прикладной smoke. Использовать **отдельные** Compose project, secrets directory, volume и loopback port, не подставлять production project. `scripts/test-vps.mjs` — только disposable CI/local fixture, **не инструмент запуска на живой БД**. Подробности восстановления ниже. Не продолжать с непроверенным backup/утерянным age key.

## Установка B поверх существующей БД

7. После verify создать новый release directory и только туда распаковать проверенный config.tar; загрузить три image archives. Составить отдельный root:root/0600 candidate env references: IDs строго из release.json, прежний private secrets directory, тот же фактический Compose project/volume. Проверить preflight из каталога B. Пока writers/timers остановлены, не менять `/opt/campus/current` и глобальный release.env частично.
8. Поднять database B на **том же** сохранённом volume и UID70, дождаться healthy и проверенного TLS/SCRAM. Для обычного app update не менять major17. Никакого `down -v`, auto-chown старого UID999, `initdb`, повторного `init-secrets.sh` или reset.
9. Одним оператором выполнить из B tools `migrate`, `grant`, `check` с явным `--owner-approved`, используя раздельные стандартные migration/runtime-db mounts. **Не выполнять bootstrap и seed при штатном обновлении.** Tools не получает auth/cron/bootstrap secrets; runtime — owner credentials. Не использовать db push/reset/force или автоматический migrate resolve. При ошибке миграции app не стартовать; сначала согласовать recovery.
10. Сравнить SQL ledger и данные. Для данного RC schema не меняется; любые неожиданные миграции/исчезнувшая история/изменившиеся bytes — STOP. Запустить B с прежними совместимыми секретами и закрытым gate, дождаться healthy. Если поменялся origin/секреты/роль/внешний proxy — требуется отдельное review, а не перезапуск вслепую.
11. Проверить анонимный401, правильный gate/TLS, отсутствие внешних3000/5432, две настоящие роли: login/session/logout, чужие объекты/STAFF API закрыты студенту, своя группа/расписание/оценки/заявки доступны, реальный файл скачивается с нужным SHA, уведомления/прочтение и аудит работают. Не выполнять массовые E2E/limit attacks на launch DB и не очищать RateBucket. Все учебные данные остаются вымышленными.
12. Принять сверку, затем согласованно переключить per-release env references и current; timers не должны видеть смешанные версии. Возобновить только прежде включённые timers/writes, проверить backup freshness/monitoring. Записать version/SHA/IDs/время/длительность и безопасные результаты. Сохранить A и предмиграционную копию минимум на период приёмки; ориентиры7дней локальных/30дней offsite копий, минимум два проверенных релиза. Срок сам по себе не основание удалить единственную пригодную копию.

## Совместимый app rollback

- Остановить writers/app. Не понижать DB/schema/OS автоматически.
- Использовать проверенную совместимость A с текущей schema B и независимые проверенные артефакты реально установленного A. Репетиция RC возвращает runtime A, сохраняя tools/database B; произвольную смешанную тройку применять нельзя.
- Подготовить отдельный rollback env references, проверить immutable IDs/роль/preflight, запустить A и повторить protected smoke. Не менять SQL и не возвращать уязвимые инструменты ради старого app.
- Проверить старую историю и новые разрешённые записи, затем согласованно переключить current/config/timers. При отсутствии доказанной совместимости переходить к отдельному recovery, не пробовать автоматический downgrade.

## Fresh restore / несовместимая схема

1. Writers остаются остановлены; сохранить исходный volume и encrypted backup. Создать новую пустую БД/volume с совместимым PostgreSQL17 image, UID70, TLS/SCRAM и отдельными roles/secrets. Выполнить bootstrap **только новой цели**. Не выполнять migrate/seed перед restore готовой схемы.
2. Расшифровывать age-потоком на доверенном компьютере/закрытой цели, передавать pg_restore через stdin с `--exit-on-error --no-owner --no-acl --role=campus_migrator`. Пароль из private secret/password-file, не CLI/URL/чат. Не использовать `--clean` против источника; имя и project цели проверить до команды. Не создавать plaintext dump без необходимости.
3. Выполнить grant/check на восстановленной копии. Сравнить migration ledger, все прикладные таблицы, документы **всех версий** и SHA/byteSize, суммарные байты квот, ApplicationEvent/Grade/audit/schedule/enrollment history, Notification/readAt/ownership/dedup, аккаунты/прикрепления. Counts недостаточно: сверять строки/хеши и реальные file bytes; runtime DDL/audit mutation/IDOR по-прежнему запрещены.
4. Запустить восстановленное приложение в отдельном закрытом окружении с соответствующими auth secrets, проверить настоящие сессии/роли и защищённое скачивание. Скачивание штатно добавляет DOCUMENT_DOWNLOAD_AUTHORIZED: доказать сохранность всех прежних audit rows и ровно ожидаемых новых событий, а не удалять аудит ради совпадения counts. Восстановленные bearer sessions требуют защиты наравне с исходными; копия не должна стать публичной.
5. Только после отдельного review переключать источник/целевую конфигурацию. Сохранить неудачную БД для расследования. Если B уже принимала записи после backup, восстановление старого снимка **может потерять новые данные**. Нужны согласованный reconcile/явное решение по данным; zero-loss и zero-downtime не обещаются.
6. Измерить фактический RTO; после приёмки возобновить нужные jobs, создать свежую encrypted offsite copy, проверить alerting. Чистку приватных тестовых копий согласовать отдельно; не выполнять destructive reset исходного VPS.

## Что подтверждает CI, а что требует настоящего сервера

RC CI отдельно выполняет18 E2E candidate B и fresh restore; затем18 E2E исторического A на собственной БД, stop-writes backup, переход A→B, совместимый app rollback, full-row hash сверку и restored-app protected smoke. Настоящие UI-сессии переиспользуются из приватной test fixture, не подменяются. RateBucket не сбрасывается. Эти проверки не подтверждают SSH/firewall/Let's Encrypt/RF/offsite transfer/ресурсы реального хоста. Ориентир RTO определяется измерением репетиции, не гарантируется для неизвестного тарифа.
