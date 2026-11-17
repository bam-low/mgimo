# Проверки Issue #62

Исходная main: `d5db68445922e94ef85e5228eb19044c631e92ce`. Итоговый SHA и ссылки на три удалённых CI — в Draft PR. Это локальные результаты с вымышленными данными, а не результаты CI main или доказательство готовности VPS.

| Проверка | Результат | Доказательство |
| --- | --- | --- |
| Unit | 22/22 PASS | [Журнал](unit.txt) |
| PostgreSQL integration | 81/81 PASS, свежая отдельная БД | [Журнал](postgresql-integration.txt) |
| Schema diff | Нет расхождений | [Журнал](schema-diff.txt) |
| ESLint | PASS | [Журнал](lint.txt) |
| TypeScript | PASS | [Журнал](typecheck.txt) |
| Production standalone build | PASS | Проверен также фактический изолированный артефакт |
| Standalone artifact/load checks | 2121 файлов, 852 наблюдавшихся CJS/ESM разрешения, PASS | [Статическая проверка](standalone-runtime.txt), [E2E/load](standalone-e2e.txt) |
| Полный standalone Chromium E2E | 20/20 PASS | [Журнал](standalone-e2e.txt) |
| Functions artifact-checker tests | 11/11 PASS | [Журнал](functions-artifact-checker.txt) |
| Functions build/artifact | PASS, четыре настоящие Node24 functions | [Проверка](functions-runtime.txt) |
| Полный Functions E2E, cold start/restart/logout | 21/21 PASS, 501 наблюдавшееся разрешение модулей | [Журнал](functions-e2e.txt) |
| Fresh restore в отдельную БД | Все таблицы/байты/версии совпали по SHA-256; точная runtime policy PASS | [Журнал](fresh-restore.txt) |
| Launch/local-demo helpers | 9/9 PASS в изолированном контейнере, текущие исходники read-only | [Журнал](launch-helpers.txt) |
| npm audit --omit=dev | **BLOCKED: 7 HIGH, 0 CRITICAL**, тот же GHSA-fc5q-39xc-vjpf / #64 | [Полный JSON](npm-audit.json) |

Сценарий #62 отдельно прошёл 2/2 на dev runtime, затем вошёл в полный production standalone suite. Проверены все четыре viewport для ключевых экранов; [23 настоящих PNG и матрица](../../screenshots/issue-62/README.md). После полного standalone прогона при визуальном просмотре убрана дублирующая desktop-подпись «Вне семестра» и добавлена её мобильная версия; эти последние представительные изменения проверяются также в Functions E2E. Полный Functions suite 21/21 прошёл после этих изменений, включая source limits, CSRF/изоляцию/отзыв сессии; cold-start/restart и загрузка модулей также прошли. Галерея после изменения обновлена из этого production Functions прогона. Удалённые CI фиксируются отдельно по точному HEAD, не предполагаются по локальным тестам.

Ранние неудачные/остановленные попытки не заменяют финальные результаты: повторный integration на прежних fixtures дал конфликт, первый общий E2E ошибочно перекрывался с integration и был остановлен; финальные прогоны разделены. Системный managed `/tmp/.git` мешал приватному helper-тесту: неизменённый тест прошёл в контейнере с отдельным tmpfs. Первый Functions build не смог создать npm-кэш в недоступном `/home/agent/.npm/_cacache`; повтор со своим writable cache сохранил lockfile/integrity и прошёл. Первый Functions security E2E отказал с 503 при отсутствующем тестовом CRON_SECRET: guard не ослаблен, полный повтор с приватной переменной на свежей БД дал 21/21 PASS. Security gates не отключались.

Не проверены: независимая приёмка новым человеком без инструкций, физические телефоны/клавиатуры/screenreader и действующий VPS. Полная новая Docker/VPS/Trivy репетиция не заявляется успешной по локальным Node/Functions тестам. Deployment запрещён; Production NO-GO и блокер #64 сохранены.
