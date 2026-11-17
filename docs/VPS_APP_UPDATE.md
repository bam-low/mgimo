# Обновление только приложения с Windows

Первая версия по пункту 1 [Tracker #25](https://github.com/bam-low/mgimo/issues/25).
Владелец отдельно разрешил app-only экспорт: установленный PostgreSQL и tools
**не включаются в пакет, не заменяются и не перезапускаются**. Это не первая
установка, не мигратор и не Production GO. Действующий VPS в тестах не используется.
Полный путь при несовместимости: [VPS_UPDATE_RUNBOOK](VPS_UPDATE_RUNBOOK.md).

## Граница совместимости

Подпись SSHSIG существующим ключом владельца, identity `campus-release-owner`,
namespace **`campus-app-update`** покрывает SHA256SUMS трёх файлов:

- `runtime.tar.gz` — один runtime linux/amd64, UID1000, роль runtime;
- `app-release.json` — полный SHA, run ID, новый runtime ID, **ожидаемый фактический
  ID установленного PostgreSQL**, tools ID как ссылка, targetId, контракт схемы и конфигурации;
- `runtime-security.json` — полный runtime Trivy, scanner/DB provenance, production npm audit.

`SHA256SUMS.sig` хранится рядом. `config.tar`, database/tools images и скрипты
установки в пакет не входят. Сервер исполняет только заранее установленный,
просмотренный helper. Полученный пакет сначала копируется в root-private snapshot,
затем проверяются подпись, точный состав, SHA-256, metadata и Docker archive.

Два экспорта одного main `d5db6844` дали разные DB IDs: `b4b2f04d…` в run43962004120
и `c3707648…` в run43957559969. Это **не эквивалентные разрешённые IDs**. App-only
target получается с работающей БД; ID образа заново собранной CI-БД его не заменяет.
Обычный VPS CI продолжает собирать/сканировать три образа и выполнять полные
репетиции; app-only доставка берёт только проверенный runtime. Это не утверждение,
что установленная старая БД просканирована новым отчётом runtime.

Перед остановкой приложения проверяются:

1. Target пакета полностью совпадает с закреплённой целью сервера.
2. Фактический ID работающего PostgreSQL совпадает с подписанным ID.
3. Журнал `_prisma_migrations` совпадает по **именам и SQL checksums**; лишние,
   дублированные, незавершённые и rolled-back записи блокируют путь.
4. Не изменились release.env references (кроме app ID), Compose, pg_hba и приватные
   runtime/DB env и CA. Их hashes остаются только в root-private state.
5. Исходный контракт кандидата совпадает с базой: Prisma schema, все миграции,
   Node/config/Dockerfiles, серверный код/API/security и используемые env expressions.
   Это намеренно консервативная v1 для UI. Изменение backend или конфигурации — полный путь.

Прямой DDL-дрейф при неизменном migration ledger не является полноценной проверкой
Prisma drift; штатный runtime не имеет DDL-прав. Не использовать этот путь после
ручных изменений БД или внеплановых административных изменений. Устаревшая базовая
БД/tools требует отдельного security review и полного обновления, а не игнорирования CVE.

## Один раз: подготовка после ручного принятия PR

Это **будущие ручные действия владельца**, не выполненная настройка рабочего VPS.
Понадобятся PowerShell7.4+, Git/GitHub CLI с `gh auth login`, Python3.11+ и OpenSSH
на Windows; на Debian — Python3.11+, Docker Compose v2, OpenSSH, age, systemd.
Новый signing key не создавать: использовать существующий ключ релиза. Он остаётся
на Windows. Закрепить прежний fingerprint публичного ключа и SSH host key через
доверенный канал; не применять `StrictHostKeyChecking=no`/автоматический ssh-keyscan trust.

1. Скачать **reviewed checkout** на Windows. Из него получить контракт реально
   установленного выпуска (сейчас `d5db68445922e94ef85e5228eb19044c631e92ce`):

   ```powershell
   python ops/app-update/package.py contract d5db68445922e94ef85e5228eb19044c631e92ce "$env:LOCALAPPDATA/Campus/source-contract.json"
   ```

   Сначала создать локальный каталог `Campus`. Передать только этот JSON и reviewed
   `server.py`/`package.py` на VPS. Не передавать закрытые signing/age keys.

2. Установить helpers в `/usr/local/lib/campus-app-update`, root:root, каталог0755,
   `server.py`0755, `package.py`0644. Конфигурацию по
   [server.example.json](../ops/app-update/server.example.json) сохранить как
   `/etc/campus/app-update.json` root:root0600, source contract — как
   `/etc/campus/app-update-source-contract.json` root:root0600.
   Создать `/var/lib/campus-app-update` root:root0700. **Никаких symlink или
   group/world-writable родителей у доверенных путей**. `compose` должен указывать
   прямо на неизменяемый каталог установленного выпуска, не через `current`.
   `project` взять из labels работающего контейнера, не угадывать по имени каталога.
   Baseline manifest — уже проверенный подписанный установленный выпуск; его SHA
   должен совпадать с source contract, три image IDs — с установленными.

3. Inbox создать в домашнем каталоге SSH-оператора, mode0700. Настроить age recipients и проверить действующий
   encrypted backup service, `/var/backups/campus` и экспорт
   `/srv/campus-backup-export`; оператор должен входить в `campus-backup` и иметь
   возможность скачать ciphertext. Инструкции: [первая установка](VPS_DEPLOY_RUNBOOK.md).
   На первом обновлении штатный timer ещё не был настроен — история PR#61 **не
   подтверждает его наличие сейчас**. Перед включением упрощённого пути проверить
   age recipients, backup service и отдельно проверить расшифровку/fresh restore локальной копии.
   Закрытый age key на VPS не нужен. Не пропускать backup ради упрощения.

4. `allowed_signers` root:root0644 содержит закреплённый ключ владельца. Если задано
   ограничение `namespaces=`, добавить `campus-app-update` после ручной проверки;
   прежнее `campus-vps-release` для полных выпусков сохранить. Helper конфигурация
   и все родители должны принадлежать root без group/world write. Sudo остаётся
   штатным административным доступом с запросом пароля; выдача нового NOPASSWD
   или членства в docker group не требуется.

5. На сервере один раз выполнить:

   ```sh
   sudo /usr/local/lib/campus-app-update/server.py target
   ```

   Команда **только инвентаризирует** и закрепляет состояние; не перезапускает
   контейнеры. Сохранить выведенный JSON как локальный `target.json` без BOM, UTF-8.
   Это несекретная цель для последующих экспортов. Не редактировать её вручную.
   Повторная команда сверяет закреплённую цель с работающей системой.

6. Скопировать [windows.example.json](../ops/app-update/windows.example.json) в
   `%LOCALAPPDATA%\Campus\update.json`; указать реальные **локальные пути**, сервер,
   пользователя, порт, pinned fingerprint, inbox/backup export и target.json.
   Локальный `allowed_signers` закрепить независимо от пакета. Ограничить ACL
   ключей текущим владельцем; не помещать настройки/ключи/backup в репозиторий или
   синхронизируемую публичную папку. Секреты в JSON не записываются.

`/opt/campus/current` остаётся ссылкой на **базовую конфигурацию полного выпуска**.
App-only не подменяет её метаданные смешанной тройкой образов. Фактическая версия
приложения отражена в `/var/lib/campus-app-update/state.json` и `last-result.json`,
безопасный журнал фаз — `operations.jsonl` в том же root-private каталоге,
а `/etc/campus/release.env` содержит фактический новый runtime ID. Штатные backup,
monitor и cleanup используют эти ссылки, PostgreSQL/tools остаются базовыми.

## Дальше: экспорт и одна команда

После ручного merge UI-изменений дождаться успешных Node, Documentation и VPS CI
на **точном main SHA**, проверить свежие отчёты и квоту Actions. Экспорт по-прежнему
запускается владельцем отдельно. Из reviewed checkout:

```powershell
gh workflow run vps-ci.yml --repo bam-low/mgimo --ref main -f store_app_update_artifact=true -f "app_update_target=$(Get-Content -LiteralPath "$env:LOCALAPPDATA/Campus/target.json" -Raw)"
```

`store_release_artifact` оставить false: большой полный комплект не нужен.
После успешного run взять его номер и выполнить **одну команду**:

```powershell
./ops/app-update/Update-Campus.ps1 123456789
```

Скрипт проверит repository/workflow/main/event, успешную последнюю попытку экспорта,
Node+Docs push checks того же SHA, точный app-only artifact **этой попытки**, source
SHA/run ID/target и checksums; подпишет existing local key и проверит подпись локально;
передаст пакет по SSH с pinned host key и вызовет заранее установленный helper.
Пароли ключа/sudo могут запрашиваться интерактивно; они не сохраняются в скрипте.
Артефакт хранится в Actions7дней; после скачивания подписанный пакет, квитанция и
зашифрованная копия остаются в выбранном локальном `CacheDir`. Сохранить их долговечно
и проверять age decryption/restore отдельно; совпавший ciphertext SHA не доказывает
наличие рабочего recovery key. Этот код не публикует GitHub Release и не покупает VPS.

Сервер берёт exclusive lock, проверяет target, загружает **только app image**, сохраняет
journal, приостанавливает ранее активные timers, отказывает при уже выполняющейся
служебной операции, останавливает app, создаёт новую encrypted копию потоком pg_dump → age именно этого Compose project и повторяет
совместимость. Затем атомарно меняет только app ID и запускает
`compose up --no-deps --wait app`. Smoke требует Docker healthy, HTTP200 на
`/api/structure` и401 на защищённом `/api/group` без сессии. Новый app ID применяется
также к следующему запуску cleanup; уже работающих служебных writers перед окном нет.

DB container ID, image ID, StartedAt и RestartCount сверяются до/после. Ни `up db`,
ни migrate/grant/seed/bootstrap, ни pull, ни `down`/volume removal здесь нет.
Короткое окно недоступности app допустимо; zero-downtime не обещается.

## Отказ, откат и прерывание

- Несовместимость: STOP с причиной и ссылкой на полный runbook **до остановки app**.
  Нет параметра force/skip. Менять target.json или state для обхода запрещено.
- Ошибка backup/старта/smoke: восстановление прежнего runtime ID без отката БД,
  повторный smoke, восстановление исходно активных timers. Результат `ROLLED_BACK`,
  exit2; клиент не выдаёт это за успешное обновление.
- Повтор того же успешно установленного пакета идемпотентен; проверки доступа и
  совместимости всё равно выполняются, offsite backup можно докачать повторно.
- Сбой SSH после переключения **не означает**, что переключение не состоялось.
  Проверить `last-result.json`, фактический app image и `pending.json`; не удалять
  journal и не выполнять полный restore автоматически.
- После SIGKILL/питания автоматический обработчик не гарантирован. При сохранённом
  `pending.json` новые apply блокируются. Оператор выполняет:

  ```sh
  sudo /usr/local/lib/campus-app-update/server.py recover
  ```

  При изменении БД во время операции recovery блокируется для ручного разбора.
  Для ручного **совместимого** отката завершённого обновления:

  ```sh
  sudo /usr/local/lib/campus-app-update/server.py rollback
  ```

  Старые image IDs/пакеты автоматически не удаляются; хранить минимум два релиза.
  Если сам откат/smoke неуспешен, journal остаётся; нужен ручной recovery, не
  автоматическое восстановление старой БД с возможной потерей новых данных.

Не запускать параллельно ручной полный update, мигратор, seed или административные
записи БД. Lock координирует только этот helper, не произвольные команды root.

## Проверки и предел доказательств

[Тест координатора](../tests/app_update_rehearsal.py) запускается внутри disposable
`test-vps` после настоящих E2E. Используются настоящий Campus runtime, PostgreSQL17,
TLS/SCRAM, SQL ledger, Docker Compose, реальный SSHSIG throwaway key, pg_dump и age.
Проверяются success, unhealthy app → rollback, подписанная несовместимая цель,
фактический DB ID, фактический ledger drift, локальный config drift, повторная
доставка и ручной rollback. Сверяются hashes **всех таблиц**, включая документы,
версии, историю, уведомления и права. В каждом случае DB ID/StartedAt/RestartCount
не должны измениться; при несовместимости не меняется и app container ID.

Тестовые good/bad images — только metadata/CMD-варианты текущего настоящего runtime;
они не являются подписанными production releases. Scan metadata в этой тестовой
доставке — явно синтетическая fixture; **реальный export** собирается только из
полного свежего проверенного CI-пакета и его настоящих отчётов. Systemd scheduling и ownership экспортного файла
в disposable окружении заменены адаптерами; root-mapped secrets проверяются по
настоящим hashes через network-none helper без изменения прав файлов; настоящий systemd/sudo/SSH ingress и
конфигурация рабочего VPS требуют отдельного разрешённого приёмочного окна.
Windows job проверяет PowerShell7, native аргументы/пути с пробелами, источник CI,
реальный OpenSSH signing/verify и отказ подмены; он не подключается к VPS.

Эта версия не автоматизирует полный update, изменение секретов/схемы, покупку,
DNS/TLS/firewall, миграции или восстановление БД. Production NO-GO сохраняется.
