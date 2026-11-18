# Уточнение PR #65: связь с успеваемостью

Новый раздел Issue #62 от 18.11.2026. Доработка той же ветки от `adcffdf00e346dc7fbf652c1a5df28e9ff353295`; точный новый HEAD и три CI — в описании Draft PR #65. Это результаты локальных тестов; они не являются результатами main или VPS.

| Проверка | Результат | Журнал |
| --- | --- | --- |
| Unit | 22/22 PASS | [unit](unit.txt) |
| PostgreSQL integration | 83/83 PASS, свежая отдельная БД | [integration](integration.txt) |
| Production standalone build/artifact | PASS, 2123 файлов | [runtime](runtime.txt) |
| Полный standalone E2E/load | 21/21 PASS, 853 наблюдавшихся разрешения модулей | [e2e](standalone-e2e.txt) |
| Functions build/artifact | PASS, 4 настоящие Node24 functions | [runtime](functions-runtime.txt) |
| Полный Functions E2E, cold-start/restart/logout | 22/22 PASS, 501 наблюдавшееся разрешение модулей | [e2e](functions-e2e.txt) |
| ESLint / TypeScript | PASS | [lint](lint.txt), [typecheck](typecheck.txt) |
| npm audit --omit=dev | BLOCKED, 7 HIGH / 0 CRITICAL, исходный GHSA-fc5q-39xc-vjpf | [Полный JSON](npm-audit.json) |

[15 реальных кадров 360/1280 и матрица сквозного сценария](../../../screenshots/issue-62/grade-link/README.md). В production E2E подтверждены общий Subject, обязательный контекст группы, изоляция списка, сброс формы, 409 для чужого студента и после перевода, собственная история и явное исправление. В PostgreSQL дополнительно проверены отсутствие оценки/аудита при отказе и чужой курсор группы. Прежние права, тесты шкалы/CSRF/конкуренции/rollback аудита сохранены. Положительные фикстуры обновлены под новый обязательный groupId, а не отключены.

Исторические результаты базовой реализации каталога и fresh restore на adcffdf находятся в [предыдущем отчёте](../README.md). Здесь не заявляется новая VPS/Trivy/backup репетиция. Дамп/секреты/сессии не включены. Полный Functions-прогон и cold-start/restart/logout завершены успешно; удалённые CI указываются отдельно в описании PR по точному HEAD и не объявляются зелёными по локальным результатам. Production NO-GO сохраняется.
