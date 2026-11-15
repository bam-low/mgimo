# RC v1.0.0-rc.1 — актуальная техническая подготовка

15.11.2026 / Issue #54. Текущий разбор шести HIGH, смена tools на vendor distroless без shell и обновление database zlib — [RC security review](VPS_RC_SECURITY.md). Актуальные evidence/image IDs берутся из полного VPS CI отчёта **того же build**, не из исторических таблиц ниже. Подпись и сохранение большого artifact требуют отдельного review владельца; Production NO-GO сохраняется.

# Исторические результаты проверки образов и оставшийся NO-GO

06.11.2026, Issue #24 / PR #26 merged владельцем; Issue #27 сохраняет результаты и gates. Это техническая подготовка, **не разрешение первого deploy**. [Runbook](VPS_DEPLOY_RUNBOOK.md) и [checklist](VPS_LAUNCH_CHECKLIST.md) сохраняют gates A–F. Scan — Trivy **0.76.2**, официальный archive checksum закреплён в VPS CI; vulnerability DB изменяется. Числа ниже относятся к локальному scan этой итерации, актуальный remote report находится в Actions `vps-security-report`.

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

**NO-GO до security review D:** финальный remote scan PR #26 — **2 unfixed HIGH в app и 8 в tools**, включая новый `CVE-2026-85091` в zlib1g. Предыдущие локальные числа 1/7 в таблице выше — исторический снимок, не текущий baseline и не разрешение deploy. Это не автоматическое исключение для unfixed. Учитывайте реальную достижимость, условия эксплуатации, обновления vendor и lifecycle одноразового job; не записывайте «неэксплуатируемо» только из-за private network. Tools имеет миграционные полномочия и доступ к migration env; superuser bootstrap.env добавляется лишь отдельной явной bootstrap-командой, default tools не имеет его или runtime.env с auth/cron ключами, поэтому отсутствие web-порта не делает его безопасным автоматически.

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

## Foundation Completion #27

Никаких suppress/ignore/VEX-исключений для прохождения CI не добавлено. Локальные rehearsal/negative tests проверяют исполнение конфигурации, а не отсутствие OS-уязвимостей или защищённость реального хоста. Актуальный scan текущего SHA хранится в Actions `vps-security-report`; unfixed HIGH требуют отдельного pre-deploy triage D. GO FOR FEATURE DEVELOPMENT не даёт production GO. Реальные host SSH/systemd/firewall/LE/ресурсы/RF/offsite restore остаются NOT VERIFIED.

## Обновление security inputs — 11.11.2026, Issue #39 / PR #40

После успешной закрытой репетиции на `007703f` Trivy остановил CI: ранее unfixed `CVE-2026-76844`/`CVE-2026-85091` в zlib1g получили исправление, а в Alpine выявлены исправимые HIGH krb5-libs/libxslt. Прежний зелёный скан 07.11 не является доказательством для новой vulnerability DB. Порог CRITICAL/fixable HIGH и полные отчёты сохраняются, suppress/ignore/VEX нет.

- Runtime distroless Debian13 обновлён до официального digest `cc66d222f0a7ec996b78a99fe76a969bc80b539a5016ad866c14d1949bc6d0ab`: проверенный status.d содержит zlib1g `1:1.3.dfsg+really1.3.1-1+deb13u1`.
- Tools сохраняет прежний Node24.22.1/Trixie input. Официальный Debian security deb zlib1g той же версии устанавливается через dpkg с корректным учётом файлов и metadata, SHA256 `8c27c342230503b73dfde629642c3b352e87b554e06d60cf58772f236a305ceb`. Hash независимо сверён через apt download и подписанный trixie-security index. Не копируются отдельные непроверенные shared libraries и не редактируются версии ради сканера.
- DB сохраняет PostgreSQL17.11/Alpine и UID70. Официальные APK: krb5-libs `1.22.3-r0` (SHA256 `fad5b46a953e6a37a1bb61a84538fa08ecb6a07816f439eb06f2735aebfcbfbf`), libxslt `1.1.43-r4` (`40e6cc7d09ce1e69421c2b37e1da4e9afef486843f21c3a79339cd6d93c1c617`). `apk add --no-network` проверяет vendor signatures штатными ключами исходного образа; allow-untrusted не используется.

prepare-vps-context загружает точные security inputs по HTTPS и проверяет закреплённые SHA256. Создаются отдельные runtime/tools/database contexts вне checkout; все финальные docker builds остаются `--network=none`. Подписи пакетов, TLS и checksum verification не ослаблены; исходники/lockfile npm, пароли, роли, схема БД и алгоритм расписания не изменяются этим maintenance. Итоговые сборки/rehearsal/скан и точный SHA фиксируются в PR. Production NO-GO и реальные host/TLS/РФ/WCAG gates остаются независимо от зелёного CI.
