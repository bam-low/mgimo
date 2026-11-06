# Приёмка первого закрытого запуска

Исполнять по [runbook](FIRST_DEPLOY_RUNBOOK.md), основание [Issue #22](https://github.com/bam-low/mgimo/issues/22). Это **незаполненный облачный протокол**, не свидетельство уже выполненного deploy. Локальные результаты Codex/CI находятся в PR и AI_LOG и не переносятся автоматически в строки ниже.

Статусы: **PASS** — лично воспроизведено на указанном deployment; **FAIL** — наблюдается нарушение; **NOT VERIFIED** — не выполнено/не доказано. Любой FAIL/NOT VERIFIED обязательного pre-deploy gate блокирует Deploy. Если UI не позволяет pre-protection, записать блокер и остановиться, не создавать пробный публичный URL.

- Проверяющий (псевдоним): TBD.
- Дата/время МСК: TBD.
- Утверждённый Git commit: TBD.
- Deployment ID (не token): TBD.
- Scope/plan/region, managed Node patch: TBD.
- Отдельные разрешения Free ресурсов / первого защищённого Deploy / доступа тестировщикам: TBD, TBD, TBD.
- Версия источников тарифов и дата повторной проверки: TBD.

Не записывать URL с credentials, пароли, auth/bypass tokens, cookie values, реальные ФИО/email/IP, raw env/API/build/Invocation logs, DB dump, credential screen/HAR/trace. Для ошибки — короткий обезличенный код/статус и шаг. Просто screenshot настроек, где открыты secret fields, не подходит.

## До любых deploy и Git link

| ID | Требование / ожидаемый результат | Статус | Фактическое наблюдение, время МСК / безопасное evidence |
| --- | --- | --- | --- |
| COST-1 | Применимость Hobby/fair use к конкурсу/возможному призу выяснена; нет неизвестной финансовой выгоды/paid contributor | NOT VERIFIED | TBD; deploy заблокирован до ясности |
| COST-2 | Vercel Hobby + Neon Free $0; нет trial/card/upgrade/add-on/платного расхода | NOT VERIFIED | TBD |
| LOCAL-1 | Review/ручной merge PR, отдельное разрешение Free подготовки; checkout/Node/npm/psql соответствуют runbook | NOT VERIFIED | TBD |
| LOCAL-2 | Приватная папка вне Git/cloud sync; owner.env exclusive/0600 либо проверенный NTFS ACL | NOT VERIFIED | TBD; значения не прикладывать |
| CLOUD-DB-1 | Новая synthetic-only Neon PostgreSQL17 Frankfurt; direct verified TLS, migrations up to date | NOT VERIFIED | TBD |
| CLOUD-DB-2 | Двойной seed PASS, 2 APPROVED STUDENT/разные группы + STAFF, три разных private passwords | NOT VERIFIED | TBD |
| CLOUD-DB-3 | SQL-created campus_runtime, не Neon UI/API admin role; LOGIN/NOINHERIT/нет ownership/memberships/super/DDL/TEMP | NOT VERIFIED | TBD |
| CLOUD-DB-4 | Grant дважды, check реальной limited pooled connection PASS; актуальная feature SQL policy структуры/расписания без DELETE, audit append-only, миграции недоступны | NOT VERIFIED | TBD |
| PRE-1 | Пустой Vercel проект создан **без** gitRepository/deploy; All scope был в запросе создания | NOT VERIFIED | TBD |
| PRE-2 | Vercel Authentication ON / **All Deployments**, Hobby без оплаты; Standard/Preview не используются | NOT VERIFIED | TBD |
| PRE-3 | UI access только владельцу; нет Shareable Links/Exceptions/automation bypass/внешних Trusted Sources/same-repo CI bypass; встроенный self-access не объявлен выключенным | NOT VERIFIED | TBD |
| PRE-4 | Other / Node24 / fra1 / build+install из vercel.json / Build Output API; не Next preset | NOT VERIFIED | TBD |
| PRE-5 | Verified exact production origin известен из Domains **до deploy**, не угадан | NOT VERIFIED | TBD |
| PRE-6 | runtime.env ровно пять ключей, limited pooled URL/TLS; admin/direct/DEMO/token/NEXT_PUBLIC в app env нет | NOT VERIFIED | TBD |
| PRE-7 | launch-vercel check PASS: Hobby/all/config/origin/no bypass/zero deployments/unlinked; отдельный UI review выполнен | NOT VERIFIED | TBD |
| PRE-8 | Все предыдущие обязательные строки PASS; владелец отдельно разрешил первый защищённый Deploy **до Git link** | NOT VERIFIED | TBD; без этого STOP |

## После разрешённого первого deploy, всё ещё под All protection

| ID | Требование / ожидаемый результат | Статус | Фактическое наблюдение, время МСК / безопасное evidence |
| --- | --- | --- | --- |
| DEPLOY-1 | Git link только private личный bam-low/mgimo, согласованный SHA, git.deploymentEnabled=false; check-linked PASS | NOT VERIFIED | TBD |
| DEPLOY-2 | Реальные provider Functions Node24/fra1, Other/Output API3, gate PASS в build; совпадение с проверенными локальными graphs/NFT/files/versions | NOT VERIFIED | TBD; полный output/log не прикладывать |
| ACCESS-1 | Анонимный браузер/устройство не видит **приложение** на production/preview/generated/branch/custom aliases и всех путях runbook | NOT VERIFIED | TBD; app 401/403 сам по себе не PASS |
| ACCESS-2 | Только разрешённый Vercel owner получает приложение; запрос чужого account не одобряется автоматически | NOT VERIFIED | TBD |
| AUTH-1 | Synthetic registration → private credentials → normal login → STUDENT/PENDING; чужие identity/STAFF/direct signup не допускаются | NOT VERIFIED | TBD |
| UX-1 | 360px/desktop, reveal → hidden → visible сохраняет реквизиты только в памяти/маскирует; явное завершение/pagehide/refresh очищают | NOT VERIFIED | TBD; credential screen не снимать |
| AUTH-2 | STAFF reject → retry → approve, две попытки/аудит сохранены; только собственная группа | NOT VERIFIED | TBD |
| AUTH-3 | Два seed студента разных групп: own200/foreign403; STUDENT не выполняет STAFF actions | NOT VERIFIED | TBD |
| AUTH-4 | Logout/отзыв тестовой Session/disabled тестовый User закрывают следующий запрос; cookie flags/no-store/CSP корректны | NOT VERIFIED | TBD; не записывать cookie |
| INGRESS-1 | Подмена forwarding headers из одной сети не меняет source quota; другой реальный источник не заблокирован | NOT VERIFIED | TBD; IP не записывать |
| INGRESS-2 | Реальный missing/invalid source fail-closed; нет внешнего proxy/bypass к backend; AUTH_TRUSTED_IP_HEADER точный | NOT VERIFIED | TBD |
| ABUSE-1 | Free DDoS/WAF rule настроены/стоимость проверена; app DB limits и cleanup не ослаблены; формы доступны | NOT VERIFIED | TBD; ценовой диалог без secret fields |
| DB-1 | В реальных Functions используется campus_runtime, pooled verified TLS; нет admin credentials; полный auth workflow с этой ролью | NOT VERIFIED | TBD |
| DB-2 | >5min без DB activity → подтверждённый Neon sleep → resume/cold Function/session/история работают | NOT VERIFIED | TBD; фактическая задержка |
| DB-3 | Малый разрешённый concurrency, connection pool/квоты Free; нет keepalive и отключения сна | NOT VERIFIED | TBD |
| CRON-1 | Реальное ежедневное исполнение проходит All + Bearer secret, чистит только expired bounded counters; без secret отказ | NOT VERIFIED | TBD; до суток ожидания, без token в logs |
| RU-1 | Физическая российская мобильная сеть оператора 1 без VPN: DNS/TLS/static/access/auth/logout/UX | NOT VERIFIED | TBD; город/оператор/браузер, без IP |
| RU-2 | Другая российская мобильная сеть оператора 2 без VPN: те же проверки | NOT VERIFIED | TBD |
| RU-3 | Фиксированная сеть РФ без VPN: те же проверки; режим owner-only доступа сохраняется | NOT VERIFIED | TBD |
| RESERVE-1 | Бесплатный Render/standalone резерв оценён; до любого запуска доказаны pre-protection/ingress/тариф; URL не создавался без разрешения | NOT VERIFIED | TBD; PROPOSED, не готовый резерв |
| BACKUP-1 | Private encrypted synthetic backup; dump/hashes/session tokens не опубликованы | NOT VERIFIED | TBD |
| BACKUP-2 | Разрешённое восстановление в новую пустую DB прошло, история/roles/auth проверены, нет reset/down | NOT VERIFIED | TBD; pg_restore --list недостаточно |
| ROLLBACK-1 | Проверен способ закрыть все URL/остановить cron/отозвать sessions и вернуть совместимый deployment без отката DB | NOT VERIFIED | TBD; не инсценировать публичный инцидент |

## Итог и точки возврата

- Перед первым Deploy вернуть ассистенту COST/LOCAL/CLOUD-DB/PRE строки, commit и только обезличенные ошибки. Это точка после действия 10 runbook; дальше нужно отдельное явное разрешение владельца.
- После закрытой приёмки вернуть заполненный протокол, перечень FAIL/NOT VERIFIED и согласованные действия. Сохранять All Deployments; проверка из РФ не означает разрешение снять protection.
- Для публики/жюри нужен отдельный access decision после закрытия gates A36/A38, тарифов и безопасности. Расписание, оценки/сессия, обычные заявки, уведомления и учебный staff CRUD остаются следующими Issues, текущий вертикальный путь не объявляется полным конкурсным MVP.
- Перед 08.11.2026 19:00 МСК, после каждого deploy и ежедневно до 28.11.2026 включительно повторять актуальные доступностные/тарифные/security строки. Конечный дедлайн подачи неизвестен.

Итог: **NOT VERIFIED / НЕ ОТКРЫВАТЬ**. Эта строка меняется владельцем только после настоящей приёмки, с датой и основанием. Сейчас ни один cloud PASS не утверждён.
