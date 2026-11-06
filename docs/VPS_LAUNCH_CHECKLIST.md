# VPS: журнал GO / NO-GO

Заполняет владелец приватно, в PR передаёт только обезличенные итоги. Runbook: [порядок действий](VPS_DEPLOY_RUNBOOK.md), [модель угроз](VPS_ARCHITECTURE.md). Пустая строка = **NOT VERIFIED**, не implicit PASS. Ни один CI не подтверждает оплату/доступность/защиту реального сервера. Секреты, IP, персональные данные и env сюда не записывать.

| Gate | Что зафиксировать | Условие STOP / состояние подготовки |
| --- | --- | --- |
| A review | Reviewed commit, Node/Docs/VPS CI, замечания, ручной merge владельца | Draft не разрешает покупку/SSH/deploy |
| B purchase | Явное разрешение, итоговая месячная цена/продление, static public IPv4, IPv6, входящие22/80/443, Debian13/Ubuntu24.04 amd64, root key, console/rescue, DNS/backup costs | Кабинет/договор не проверены; 500 ₽ только official advertised |
| C access | Console fingerprint, rootkey, отдельный sudo admin, второй/третий вход с sudo до no-root/key-only, rescue tested | SSH lockout/пароли/нет console — STOP |
| C host | Signed repositories, exact package lock, Docker≥28/Composev2, UFW IPv4/IPv6, fail2ban sshd jail, NTP, unattended updates, logrotate/journal caps, отсутствие docker group у обычных аккаунтов | Реальный host NOT VERIFIED |
| D provenance | Успешные CI на reviewed SHA, GitHub artifact, owner SSHSIG, pinned public signer вне artifact, 5 checksum OK, sourceCommit/architecture/image IDs | Неверная подпись/источник/изменённый tar — STOP |
| D security | Полный актуальный npm audit и Trivy report; triage всех HIGH/CRITICAL, patch/обоснованное review | Remote PR #26: app2HIGH и tools8HIGH unfixed остаются NO-GO до разбора ([review](VPS_SECURITY_REVIEW.md)); не автоматическое исключение |
| D DNS/TLS | Контроль FQDN, A/AAAA без старых aliases, доверенный TLS, wrong CA reject, ACME renewal+reload hook, нет HSTS до проверки | Нет контролируемого домена/renewal — STOP |
| D private-first | **App выключен**: анонимные root/login/register/API/auth/static/cleanup →401, wrong gate→401, raw IP/alternateHost→не app; IPv4/IPv6 снаружи | Ни секунды публичного app; 502 вместо anonymous401 не PASS |
| D permission | Pre-deploy review + отдельное явное разрешение первого защищённого deploy | Без обоих разрешений не load/start из D2 |
| E images/network | Host `python3 ops/vps/preflight.py /etc/campus/release.env` PASS; immutable runtime/tools roles; app UID1000 и DB UID70/readonly/caps/memory/PID, no shell/npm/CLI/alpha; PG no ports/private network; app127.0.0.1 only, external3000/5432 unreachable IPv4/IPv6 | Локальная репетиция не заменяет внешний port scan реального VPS |
| E database | PG17.11, verify-full TLS/db SAN/privateCA, wrong password28P01, nonTLS rejected, admin/migrator/runtime разделены, no runtime DDL/TEMP/role/owner, AuditLog mutation denied; migrate и seed×2; password replay не reset | Проверка trust не принимается; реальные роли NOT VERIFIED |
| E sessions | Student registration fictional-only →PENDING, STAFF approve, отказ/повтор, protected cabinets, logout и серверный отзыв старой session | Только synthetic, не запускать destructive tests на launch DB |
| E rights/audit | 2 student/1staff: чужая группа403, revoke сразу закрывает доступ, transfer меняет group и пишет immutable audit, повторный seed не восстанавливает права | Нельзя считать UI hiding доказательством server rights |
| E ingress | Подменённые XFF/X-Campus-Client-IP/Host не меняют источник/доверенный origin; requests без app login401; peer-derived quotas, два источника не блокируют друг друга, expired counters bounded cleanup | При CDN/новом proxy — новый review; NAT collision известна |
| E operations | App/PG healthy/restart/persistent volume, resource limits в docker inspect, нагрузка4GiB/noOOM, свободный disk≥20%, timers/cleanup Bearer only, anonymous cleanup401 | Local caps ≠ реальная ёмкость тарифа |
| E DR | Encrypted backup/retention7, ежедневная offsite copy/freshness, age key вне VPS + резерв; actual fresh restore/counts/trigger/grants/login; RPO/RTO measured; old image/schema rollback reviewed | VPS-only backup, потерянный key, неотработанный restore — STOP |
| E alerts | ATTENTION/OnFailure и проверка disk/inodes/memory/health; отдельный owner PC проверяет TLS/401/backupfail и замечает VPS offline; ответственный и время реакции | Локальный journal сам по себе не внешняя тревога |
| E UX/RF | 360px и desktop; реальные два оператора РФ без VPN, fixed/mobile, DNS/TLS/warm/cold/login/logout IPv4/IPv6, время/обезличенный результат | Локальный localhost/одна VPN сеть не доказательство РФ |
| F access | Отдельное разрешение жюри/публики, reviewed Nginx diff, повтор security/RF/abuse checks; HSTS после renewal review | По умолчанию gate остаётся, renderer не снимает его |

## Что можно проверить без VPS

VPS CI выполняет: изолированные multi-stage образы из standalone, file/graph/secret checks, config negative cases, HTTPS gate до app, wrong CA/gate password, actual TLS/SCRAM PG17 + wrong password + migrations + idempotent seed + role negatives, 8 браузерных тестов через proxy, внутренний cleanup и age backup/integrity/fresh DB restore. Отдельный Node CI сохраняет standalone/Functions, integration auth/revocation/transfer/group/audit; Documentation CI — ссылки/формат. Полный scanner report сохраняется отдельно от unsigned release artifact; последний **не содержит test fixtures/secrets** и доступен только owner workflow_dispatch с budget/security attestation. PR CI сохраняет только small manifest/report, большой archive не загружает.

Локальный self-signed test CA используется только тестом: Node HTTPS проверяет CA/hostname и отрицательный CA; Playwright `ignoreHTTPSErrors` только в local VPS test config. Реальный runbook требует публичный доверенный TLS без bypass. Все tests создают исключительно вымышленные данные. Local Docker probe не подтверждает настоящий Debian/Ubuntu host hardening, Let's Encrypt, публичную сеть, Fatmetal или готовность бесплатной альтернативы.

## Короткий handoff

Сейчас владелец начинает **ревью A**, затем вручную merge и отдельно B. Перед D2 нужен второй review и явное разрешение защищённого deploy. После E остановиться перед отдельным F. Покупка/SSH/публикация со стороны Codex в Issue #24 не выполняются.
