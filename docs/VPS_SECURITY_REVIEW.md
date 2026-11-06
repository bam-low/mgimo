# VPS: результаты проверки образов и оставшийся NO-GO

06.11.2026 (МСК), Issue #24 / Draft PR #26. Это подготовка для ревью, **не разрешение первого deploy**. [Runbook](VPS_DEPLOY_RUNBOOK.md) и [checklist](VPS_LAUNCH_CHECKLIST.md) сохраняют gates A–F. Scan — Trivy **0.76.2**, официальный archive checksum закреплён в VPS CI; vulnerability DB изменяется. Числа ниже относятся к локальному scan этой итерации, актуальный remote report находится в Actions `vps-security-report`.

## Что исправлено по результатам расширенного scan

| Вариант | CRITICAL / HIGH | Решение |
| --- | --- | --- |
| Initial Node/bookworm app | 1 / 35 | Отвергнут для app; сохранён только build input, его слои не наследуются final runtime |
| Initial PostgreSQL17/bookworm | 4 / 74 | Не поставляется VPS-путём; существующий отдельный Node CI/local test baseline не изменён |
| Initial Node/bookworm tools | 1 / 41 | Заменён Debian13 tools; CLI/Studio/alpha по-прежнему только в одноразовом tools job |
| Official PostgreSQL17/trixie кандидат | 2 / 88 | Не выбран: смена Debian сама по себе не решает находки |
| Official PostgreSQL17/alpine кандидат | 1 / 25 | Все HIGH/CRITICAL относились к Go stdlib в `/usr/local/bin/gosu`; stock image не поставляется |
| **Final campus24-db** | **0 / 0** | Pinned official PG17 Alpine3.24.4, `gosu` физически удалён; UID/GID70, read-only rootfs, caps ALL dropped, no-new-privileges, только private network/TLS/SCRAM |
| **Final campus24-runtime** | **0 / 1** | Audited standalone + Node24.22.1 binary + pinned distroless Debian13, UID1000; без npm/shell/CLI/alpha |
| **Final campus24-tools** | **0 / 7** | Node24.22.1/Trixie, штатный tracked libssl3t64; apt/libapt, global npm/yarn и неиспользуемые login/mount utilities удалены через package manager с сохранением корректного учёта; все оставшиеся HIGH без upstream fixed version |

Final DB scan определяет Alpine3.24.4 и выполняет OS package scan, это не отсутствие распознавания ОС. Удаление `gosu` устраняет сам binary, а не metadata/строки CVE. Non-root official entrypoint не вызывает gosu; запуск, initdb, migrations, seed, sessions и restore проверены в свежем volume. Root override отвергает preflight; старые UID999 volumes запрещены runbook, автоматической chown/conversion нет. Host Debian13/Ubuntu24.04 и musl в DB-контейнере независимы: приложение и Prisma migration engine остаются glibc; между ними PG wire/TLS. Локально проверены UTF-8 synthetic seed, native migration engine с libssl3t64 и custom backup restore. Никакие существующие production volumes не конвертировались.

## Что НЕ утверждено

**NO-GO до security review D:** runtime HIGH `CVE-2026-76844` в zlib1g и 7 HIGH в OS пакетах tools. Это не автоматическое исключение для unfixed. Учитывайте реальную достижимость, условия эксплуатации, обновления vendor и lifecycle одноразового job; не записывайте «неэксплуатируемо» только из-за private network. Tools имеет миграционные полномочия и доступ к private env, поэтому отсутствие web-порта не делает его безопасным автоматически.

Группы HIGH в tools (число — package findings, один CVE может повторяться в нескольких пакетах):

| Пакеты | CVE для review |
| --- | --- |
| libacl1 | CVE-2026-54369 |
| libsystemd0 (нужен coreutils) | CVE-2026-16742 |
| libtinfo6, ncurses-base, ncurses-bin | CVE-2025-69720 |
| perl-base | CVE-2026-9538 |
| zlib1g | CVE-2026-76844 |

Полные package versions, vendor references, severity/fix fields — в JSON report. Runtime scan: 1 HIGH/36 MEDIUM/8 LOW; tools: 7 HIGH/60 MEDIUM/42 LOW; DB: 0 найденных vulnerabilities. Это не гарантия отсутствия неизвестных уязвимостей. Production npm audit0 и полный audit13moderate dev проверяют другой набор компонентов, не отменяют OS findings.

VPS CI сканирует **все три поставляемых образа**: сохраняет полные JSON, блокирует любую CRITICAL (даже unfixed) и исправимую HIGH. Unfixed HIGH остаются в report и блокируют ручной GO до review. Нет ignore-file/VEX/скрытого accepted-risk списка. Тестовые Nginx/OpenSSL fixture images не являются поставляемым host Nginx или production DB; host apt packages проверяются отдельно по exact lock и advisories.

## Доказательства и безопасная доставка

Проверены локально: real TLS/SCRAM PG17 + неверный пароль + non-TLS rejection; Prisma migrations/seed×2/grant/check; no DDL/TEMP/audit mutation; anonymous gate **до app**, wrong gate/CA/SNI; HTTP redirect/default hosts не наследуют combined access log, тестовый canary query не попадает в HTTP/TLS access logs; реальная перезапись spoofed IP на auth endpoint; cleanup auth; 8 HTTPS E2E с360px; age tamper rejection и fresh DB restore с counts/immutable trigger/повторным grant/check. Точные remote результаты последнего SHA — Checks PR #26. Предыдущие три CI на `7cdc499` прошли, но этот архив superseded: он не содержит нового database image и не разрешён для использования.

PR CI создаёт и проверяет package **только на ephemeral runner**, публикует небольшие report/manifest. Большой архив с тремя image tar, config и release.json загружается **лишь через owner workflow_dispatch** с подтверждением reviewed SHA/security и доступного Actions storage/minutes budget; default=false. Это предотвращает автоматическое накопление больших archives на бесплатной квоте. Такой ручной запуск после review/merge не deploy, но Codex его не выполняет. Если бюджет/квота не подтверждены — STOP, не включать платный budget автоматически.

Доставка требует пяти file checksums и owner SSHSIG с pinned signer; подпись не заменяет review отчёта. Не используйте старый четырёхфайловый archive или UID999 secrets. После A/B/C нужен отдельный D review **и отдельное разрешение** первого защищённого deploy; после real checks E отдельно F. Отсутствие новых CRITICAL не снимает оставшийся NO-GO.
