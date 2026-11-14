# Текущий security scan

Источник: exact main `df58c104`, [VPS run43593863298](https://github.com/bam-low/mgimo/actions/runs/43593863298), artifact `vps-security-report` (id14113677469). Trivy0.76.2, свежая база mirror.gcr.io/aquasec/trivy-db:2 скачана14.11.2026 12:21UTC; сами scans12:21:15–40UTC. Точный publishedAt/digest базы в artifact не сохранён: это ограничение воспроизводимости. Image IDs и timestamps: [summary.json](security/summary.json). Неподписанные локальные image IDs не приравниваются к опубликованным registry digests.

| Образ | CRITICAL | HIGH | MEDIUM | LOW | UNKNOWN |
| --- | --- | --- | --- | --- | --- |
| runtime | 0 | 0 | 39 | 12 | 2 |
| tools | 0 | 6 | 68 | 45 | 5 |
| db | 0 | 0 | 1 | 0 | 0 |
| Всего package findings | 0 | 6 | 108 | 57 | 7 |

Все178 строк всех уровней без фильтрации: [CSV](security/image-findings.csv). Шесть HIGH — четыре различных CVE, не шесть независимых уязвимостей. У всех шести fixedVersion отсутствует, fixable HIGH0. Это не делает их безопасными.

## HIGH

| CVE | Пакет | Версия | Статус |
| --- | --- | --- | --- |
| [CVE-2026-54369](https://avd.aquasec.com/nvd/cve-2026-54369) | libacl1 | 2.3.2-2+b1 | affected; fix отсутствует |
| [CVE-2026-16742](https://avd.aquasec.com/nvd/cve-2026-16742) | libsystemd0 | 257.13-1~deb13u1 | affected; fix отсутствует |
| [CVE-2025-69720](https://avd.aquasec.com/nvd/cve-2025-69720) | libtinfo6 | 6.5+20250216-2 | affected; fix отсутствует |
| [CVE-2025-69720](https://avd.aquasec.com/nvd/cve-2025-69720) | ncurses-base | 6.5+20250216-2 | affected; fix отсутствует |
| [CVE-2025-69720](https://avd.aquasec.com/nvd/cve-2025-69720) | ncurses-bin | 6.5+20250216-2 | affected; fix отсутствует |
| [CVE-2026-9538](https://avd.aquasec.com/nvd/cve-2026-9538) | perl-base | 5.40.1-6+deb13u1 | fix_deferred; fix отсутствует |

CVE-2026-54369: symlink traversal/privilege escalation libacl; CVE-2026-16742: systemd-homed record/signature; CVE-2025-69720: ncurses buffer overflow; CVE-2026-9538: Perl ArchiveTar DoS. Это классификация scanner/advisory, а не доказанная достижимость в конфигурации проекта.

Tools ограничен UID1000, read_only, cap_drop ALL, no-new-privileges, private network, memory/pids limits. При этом содержит migration privileges; ограничения не доказывают недостижимость CVE. Эксплуатационные PoC не запускались. Host OS/kernel/nginx реального VPS не сканировались, потому что сервер не создавался.

## Исправляемые MEDIUM

| Образ | CVE | Пакет | Сейчас → fixed |
| --- | --- | --- | --- |
| campus24-db | [CVE-2026-4738](https://avd.aquasec.com/nvd/cve-2026-4738) | zlib | 1.3.2-r1 → 1.4-r0 |
| campus24-tools | [CVE-2026-118773](https://avd.aquasec.com/nvd/cve-2026-118773) | glob | 13.0.6 → 14.0.2 |
| campus24-tools | [CVE-2026-118764](https://avd.aquasec.com/nvd/cve-2026-118764) | minimatch | 10.2.6 → 11.0.1 |

Major updates glob/minimatch требуют проверки совместимости. Семь UNKNOWN включают glibc и dpkg: неизвестная severity не равна отсутствию риска. Список всех строк доступен в CSV.

## npm

Свежий npm audit: production0; полный граф15 MODERATE package nodes, HIGH/CRITICAL0. Два корневых advisory: glob GHSA-3g3m-2fjr-6pw4 и minimatch GHSA-g3hv-75wg-m249; транзитивные ESLint/TypeScript/Vercel цепочки учитываются в15, это не15 независимых CVE. [Полный JSON](security/npm-all.json), [production JSON](security/npm-production.json). Отсутствие npm production findings не отменяет OS/tools findings.

**Security gate D / Production NO-GO.** Для отдельного согласования: обновление доступных исправлений, повторный scan, документированный triage HIGH/UNKNOWN с применимостью и остаточным риском; при отсутствии устранимого пути — решение владельца/архитектора, а не автоматическое исключение. Ignore-правила, снижение порогов и установка пакетов ради сокрытия результата не применялись.
