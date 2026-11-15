# RC v1.0.0-rc.1: security review к ручной приёмке

15.11.2026, [Issue #54](https://github.com/bam-low/mgimo/issues/54). Это отчёт технической работы, **не принятие остаточного риска и не Production GO**. Итоговые отчёты exact HEAD находятся в VPS CI `vps-security-report`, их hashes/образные IDs встроены в release.json/config.tar. [Локальный снимок](security/rc54/local-summary.json) явно помечен development, не переименовывается в результат main/окончательного CI. Разные builds того же SHA могут иметь разные image IDs.

## Шесть прежних HIGH

Исходный report main287912fe: tools6HIGH/4CVE. Все шесть относятся к пакетам Trixie tools input, а не приложению или новой функции.

| CVE | Прежний пакет/версия | Устранение |
| --- | --- | --- |
| CVE-2026-54369 | libacl1 2.3.2-2+b1 | Пакет и libacl отсутствуют в vendor distroless tools |
| CVE-2026-16742 | libsystemd0 257.13-1~deb13u1 | Пакет/libsystemd и systemd-homed отсутствуют |
| CVE-2025-69720 | libtinfo6 6.5+20250216-2 | Пакет/libtinfo отсутствуют |
| CVE-2025-69720 | ncurses-base 6.5+20250216-2 | Ncurses/terminfo payload не поставляется |
| CVE-2025-69720 | ncurses-bin 6.5+20250216-2 | Ncurses utilities не поставляются |
| CVE-2026-9538 | perl-base 5.40.1-6+deb13u1 | Perl interpreter/пакет не поставляются |

Нет заявления «private network делает CVE неэксплуатируемой». Компоненты реально исключены сменой на **официальный digest-pinned distroless cc Debian13**, с неизменённым vendor package inventory. Node24.22.1 копируется из того же official pinned input, что runtime; shared libraries не заимствуются и package metadata не редактируется. Старый подход purge essential-пакетов через apt больше не используется для RC tools.

Vendor base содержит tracked glibc/OpenSSL/zlib/zstd/C++ runtime. `tools-check.mjs` на этапе Docker build проверяет UID1000, отсутствие shell/npm/apt/dpkg/Perl и прежних package records, наличие vendor inventory нужных библиотек, Prisma7.10.1 и запуск **настоящего native schema-engine**, не заглушки. Полный migrate/seed/TLS/SCRAM/grant/check/fresh restore проверяется отдельно; native --version сам по себе не выдаётся за доказательство миграций.

## Остальные изменения и сохранённые находки

- Database сохраняет PostgreSQL17/UID70. zlib1.4-r0 установлен штатным `apk add --no-network` с vendor signature verification и pinned SHA256 `7b05bc778b8b25cd880835b40114182bd4d1581717504d0129c810c0a14291cb`. Устранён CVE-2026-4738 MEDIUM; no allow-untrusted/PG major upgrade.
- Локальный полный scan: runtime0CRITICAL/0HIGH/39MEDIUM/12LOW/2UNKNOWN; tools0CRITICAL/0HIGH/41MEDIUM/12LOW/2UNKNOWN; database0findings. Это108 package findings суммарно; не нулевой риск. Все строки всех уровней: [CSV](security/rc54/local-findings.csv). Нулевой scan database не доказывает отсутствие неизвестных уязвимостей.
- Два исправляемых tools MEDIUM остаются в build/dev графе: glob13.0.6→14.0.2 и minimatch10.2.6→11.0.1. Родительские Vercel/ESLint зависимости требуют прежние major ranges. Force override не применяется: отдельная совместимая vendor-chain актуализация требует regression/review. Эти находки не скрыты и не объявлены безопасными только потому, что dev.
- Четыре UNKNOWN (по2 в runtime/tools) относятся к glibc; их severity неизвестна, не равна LOW. Точные CVE/версии — полный CSV/Trivy JSON.
- Последний полный npm audit базового lockfile15.11:12MODERATE package nodes, production0; это не15 из исторического аудита. VPS CI повторяет **оба** audit и сохраняет полный JSON, не полагается на старые цифры. Корневые advisory glob/minimatch; количество nodes не число независимых CVE.

## Gates и доказательства

Без изменений: полный Trivy scan всех трёх **поставляемых** образов; любой CRITICAL и fixable HIGH блокируют CI. Исходный `--ignore-unfixed` используется только вторым selector для автоматического fixable-HIGH gate, не для полного JSON report и не как waiver. Остаточный unfixed HIGH требует отдельного ручного review и сохраняет NO-GO; если безопасное решение не доказано — BLOCKED. Ignore/VEX/suppress/allowlist не добавлялись.

Security evidence привязан к конкретным image IDs; scanner0.76.2, Version/UpdatedAt/DownloadedAt DB и SHA256 фактического trivy.db сохраняются. Это digest содержимого DB, не выдуманный OCI digest. Подписываемые впоследствии пять checksums включают release.json и config.tar с evidence; архив пока unsigned, signer/большой export только у владельца после review/квоты.

Исторические baseline images287912fe строятся отдельно, используются только как fixtures обновления и не входят в поставляемую тройку/архив. Нельзя использовать старые scanner числа этих fixtures вместо report candidate.

**Перед ручной приёмкой:** сверить exact HEAD Node/Docs/VPS, candidate и upgrade evidence, scanner source/time/IDs, остаточные MEDIUM/UNKNOWN, app rollback и restored-app rights. Нет успешных проверок — BLOCKED; нет подписи/сохранённого большого артефакта — не SIGNED RC READY. Host/kernel/nginx/SSH/DNS/TLS renewal/RF/offsite/resources реального VPS остаются NOT VERIFIED и Production NO-GO независимо от0HIGH в локальном scan.
