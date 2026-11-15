# VPS CI: дисковый бюджет и адресная очистка

[Issue #56](https://github.com/bam-low/mgimo/issues/56), после main `537c528e1372580cde83c478d7474e65d5210693`. Функциональный код и восемь миграций не меняются. Production NO-GO. Подпись/публикация/deploy/покупка не выполняются. **FULL UPLOAD NOT VERIFIED**: в этом этапе большой архив не загружается в Actions.

## Причина исправления

[Push43741277372](https://github.com/bam-low/mgimo/actions/runs/43741277372) и [dispatch43741418424](https://github.com/bam-low/mgimo/actions/runs/43741418424) завершились ENOSPC при записи распакованной Trivy DB. Оба набора18E2E и upgrade/rollback/fresh restore прошли, но scan и package не завершились. Исторический зелёный PR#55 не заменяет эти main checks. Сжатая загрузка134MiB не равна примерно1.65GiB сопоставимой распакованной DB.

Старые runs не имели df/du telemetry. Разница runner image `20261111.127.1`→`20261111.370.1` подтверждена журналами, но изменение свободных байтов не измерено. Нельзя выдавать предполагаемый пик за установленный факт или объявлять сбой случайным.

## Фазы и наблюдаемость

`vps-ci-disk.py` пишет snapshots bytes/inodes и targeted scratch du; sampler каждые5секунд фиксирует workspace/tmp/runner temp/Docker root при доступности. Общие devices в summary объединяются, unavailable probes отмечаются явно. Observed peak used берётся из total/free blocks, available — из non-root f_bavail. Это дискретный наблюдённый пик, не гарантированный непрерывный максимум.

Измеряются dependencies, candidate build/context cleanup, baseline build/archive cleanup, оба rehearsal, addressed test cleanup, budget/условный GC, Trivy download/unpack/scan/cache cleanup, package/gzip/checksums и финальное состояние. Snapshots содержат размеры итоговых файлов; raw env, Docker Config.Env/команды, cookies, database dumps и private fixtures не публикуются.

Предварительные phase floors: **8GiB available перед Trivy**, **6GiB перед упаковкой**, плюс положительное число свободных inodes там, где FS предоставляет inode accounting. Недостаток после разрешённой очистки — BLOCKED_DISK, не подавление ошибки. Изменение этих порогов требует обоснования фактическими measurements, не ослабления security gates.

## Реестр владения и последовательность

Destructive команды доступны только при explicit CAMPUS_CI_DISK_CLEANUP=1, GITHUB_ACTIONS=true, RUNNER_ENVIRONMENT=github-hosted, правильных repository/workspace/run/attempt/job. На компьютере разработчика режим по умолчанию выключен. **Не имитировать эти переменные локально ради очистки.** Это защита от случайного воздействия вне job, не sandbox против вредоносного кода с Docker root-доступом.

Private atomic registry `.runtime-evidence/vps-ci-owned.json` содержит точные newly-created paths/dev/inode и проекты. Запрещены root workspace, чужие/stale paths, root symlinks/escape, неизвестные namespace и ресурсы другого job. Дочерние symlinks не обходятся при rmtree. Нет поиска ресурсов wildcard задним числом.

1. После candidate build замораживаются3image IDs/roles/platform/size. Удаляются только зарегистрированные candidate context и isolated runtime copy. Root checkout/node_modules остаются для тестов.
2. После сборки исторических images удаляются только их зарегистрированные archive/context/isolated copy. Исходники baseline остаются в Git, фактические images — до конца тестов.
3. Candidate18E2E+fresh restore и baseline18E2E+upgrade/rollback/restored-app проходят как прежде. Проекты регистрируются с PID вызывающего Node-процесса, без изменения локальной default retention.
4. До scan копируются exact `vps-upgrade.json`, `vps-baseline.json`, frozen candidate inventory/source SHA и status. **vps-pre-scan-evidence** загружается отдельным небольшим artifact, доступным даже при следующем отказе Trivy. NOT_STARTED в нём — состояние на момент capture, не успешный scan.
5. Только с сохранённым PASS proof проверяется полный cleanup plan. Historical aliases удаляются без force и только если их IDs не входят в protected candidate set. PG volumes — только зарегистрированные exact names с корректными Compose labels, local driver, созданные после job init, без подключённых контейнеров. Чужие/active volumes не удаляются. Маленькие private fixture directories с secrets не собираются в artifact и остаются до утилизации runner; их права не ослабляются ради удаления.
6. Во всех точках candidate images повторно inspect-проверяются, результаты записываются. Они остаются доступны для scan/save с теми же IDs. Никаких image/system/volume prune или удаления /var/lib/docker.
7. Если после адресной очистки available ниже8GiB, разрешён GC **только неиспользуемого BuildKit cache** изолированного hosted VM. Для него обязательны PASS proof, завершённая test cleanup и удаление всех пяти зарегистрированных build scratch roles. Локальный unix Docker socket фиксирован, удалённые Docker/BuildKit env overrides не используются. До/после снова проверяются candidate IDs и df; logical cache size не выдаётся за реально освобождённые байты.

## Trivy и упаковка

Trivy distribution, cache и OCI/analysis temporary files размещаются в одном newly-created job-owned Trivy work dir. Сохраняются полный JSON всех трёх образов, прежние CRITICAL/fixable HIGH selectors, полный и production npm audit. До удаления cache записываются scanner Version/DB metadata и потоковый SHA256 фактической DB; successful seal проверяет наличие семи evidence, source image match, gates и DB hash. Любая ошибка блокирует последующие package steps.

После полного успеха hashes всех reports повторно проверяются, только затем удаляется зарегистрированный Trivy work dir. `/tmp/vps-security` и proof защищены; reports не удаляются. Порог6GiB проверяется заново. Упаковка остаётся streaming docker save|gzip с прежними image IDs, config/manifest validators; проверяются все5checksums и gzip integrity трёх archives. Дополнительный полный ZIP на диске не создаётся.

`vps-disk-telemetry` сохраняет snapshots/samples/summary/image invariant checks и scan-complete receipts с if:always. Pre-scan artifact сохраняется отдельно и не перезаписывается финальным. Release manifest/security artifacts остаются прежними. Большой upload default=false и не запускается в этом этапе; фактическая доставка/download integrity остаются отдельным owner-approved шагом после проверки квоты. Полная успешная ephemeral упаковка сама по себе не означает успешную загрузку или SIGNED RC READY.

## Проверки и результаты

Негативные unit проверяют symlink/подмену inode/чужой job/workspace, отключённый local/self-hosted режим, shared baseline/candidate IDs, active/foreign/old volumes, conditional cache GC только после измерения и addressed cleanup, неизменность reports перед Trivy cache removal и fail-closed budget. Это tests с mock Docker и собственными temp dirs, не очистка реальной dev-среды.

Фактические peak/free/headroom и результаты полного fresh CI публикуются в Draft PR и artifacts **точного HEAD**, после завершения. Предварительные размеры из Issue не выдаются за измерения нового runner. Во всех итогах явно сохраняется `FULL UPLOAD NOT VERIFIED`, пока owner не разрешил и не проверил отдельную большую доставку.
