# Передача VPS RC v1.0.0-rc.1 владельцу

[Issue #54](https://github.com/bam-low/mgimo/issues/54), [дисковый блокер #56](VPS_CI_DISK.md). Это подготовка на компьютере владельца, **не deploy**. Production NO-GO. Покупка сервера — после передачи проверенного подписанного комплекта и отдельного решения владельца. Ключ остаётся у владельца; не передавать его в Codex/GitHub/CI/VPS.

## Состояние и последовательность

1. Один новый Draft PR исправляет дисковый бюджет после main7dc9c6b. Точный HEAD, три CI и измеренные размеры фиксируются в PR по результату, а не заранее.
2. Владелец вручную merge. Проверить Node, Documentation и VPS именно **нового merge SHA main**. При красном VPS сохранить telemetry/proof и расследовать; зелёный PR не заменяет main.
3. После трёх зелёных main проверить квоту и получить отдельное подтверждение владельца на полный export. **Сейчас FULL UPLOAD NOT VERIFIED.** До этого dispatch с большим upload не выполнять.
4. Отдельно разрешённый export заново строит образы/сканирует/репетирует/упаковывает. Проверять IDs и отчёты **этого export run**, а не предыдущего build: одинаковый source SHA не гарантирует одинаковые Docker IDs или актуальность прежнего scan.
5. Скачать, проверить, подписать локально и сохранить две долговечные копии. Только затем оценить статус «можно покупать VPS». Это не Production GO и не подтверждение реального TLS/host/РФ.

## Проверка квоты без включения платного бюджета

Владелец репозитория открывает GitHub Settings → Billing and licensing → Usage / Budgets and alerts: [billing](https://github.com/settings/billing/summary), а также repository Settings → Actions → General и список artifacts. Названия разделов зависят от плана. Уточнить владельца billing, план, доступный Actions storage и minutes, существующие artifacts/caches, retention и spending limit. Не публиковать платёжные данные. Codex не меняет тариф/лимит и не удаляет чужие artifacts.

Из exact-main `vps-disk-telemetry` взять сумму `releaseFileBytes` в `package-complete`: это измеренный payload, не оценка по logical image sizes. Прежний PR57 дал530268091B /505,70MiB — **исторический ориентир**, размер нового build нужно измерить заново. Уже этот размер больше500MiB; тариф с500MB/500MiB свободного storage нельзя считать подходящим. Нужны запас на ZIP/новый run/существующие small artifacts и доступные minutes полного повторного CI. Если текущий расчёт/учёт GitHub ещё обновляется, quota не подтверждена. Бесплатный storage общий с другими repos владельца; отсутствие платёжного предупреждения не доказывает свободную квоту.

Сохранить приватную запись: дата, план, доступный storage/minutes, размер последней упаковки, выбранный запас и retention7дней, решение владельца. При недостатке — STOP, согласовать альтернативу или освобождение **явно выбранных** старых artifacts владельцем, без автоматического включения оплаты. Полный export запускается только после отдельного «разрешаю».

## Точный workflow_dispatch — только после подтверждения

Команды ниже для Linux/WSL2 с Bash, GitHub CLI, Python3.11+, OpenSSH с `ssh-keygen -Y`, GNU coreutils/gzip. macOS без GNU realpath/sha256sum и native Windows этими командами не проверены; использовать WSL2 либо отдельно адаптировать и проверить. Здесь команды **не выполняются автоматически**.

Вместо `REVIEWED_MERGE_SHA` подставить фактический40-символьный SHA **зелёного main после ручного merge**. На компьютере владельца:

```sh
REVIEWED_SHA=REVIEWED_MERGE_SHA
test "$(gh api repos/bam-low/mgimo/git/ref/heads/main --jq .object.sha)" = "$REVIEWED_SHA"
gh run list --repo bam-low/mgimo --commit "$REVIEWED_SHA" \
  --json databaseId,workflowName,headSha,event,status,conclusion,url
```

В списке вручную проверить все три terminal SUCCESS для main; `test`/команды выполнять последовательно и остановиться при любой ошибке. После подтверждения квоты и разрешения:

```sh
gh workflow run vps-ci.yml --repo bam-low/mgimo --ref main \
  -f store_release_artifact=true
gh run list --repo bam-low/mgimo --workflow vps-ci.yml --branch main \
  --event workflow_dispatch --limit 5 \
  --json databaseId,headSha,createdAt,status,conclusion,url
```

Выбрать **новый** dispatch по времени запуска, не старый PR run. `--ref main` — имя ветки, а не фиктивный SHA-ref; если main продвинулась между проверкой и dispatch, run не считается export утверждённого SHA. Не создавать tag/Release ради dispatch. Записать ID выбранного запуска:

```sh
EXPORT_RUN_ID=ACTUAL_NEW_RUN_ID
gh run view "$EXPORT_RUN_ID" --repo bam-low/mgimo \
  --json headSha,event,status,conclusion,url
```

Дождаться terminal SUCCESS и вручную сравнить `headSha` с `$REVIEWED_SHA`, event=`workflow_dispatch`. При несовпадении/неуспехе не подписывать и не брать файлы другого run. Проверить success шага большого upload; имя artifact:
`campus-vps-v1.0.0-rc.1-unsigned-SHA-linux-amd64`. Наличие только small manifest **не означает** успешный полный export.

## Скачать и проверить файлы этого запуска

Использовать новый пустой каталог вне Git, не общий Downloads с прежними RC:

```sh
DELIVERY="$HOME/campus-deliveries/$REVIEWED_SHA-$EXPORT_RUN_ID"
mkdir -p "$HOME/campus-deliveries"
mkdir -m 700 "$DELIVERY"
gh run download "$EXPORT_RUN_ID" --repo bam-low/mgimo \
  --name "campus-vps-v1.0.0-rc.1-unsigned-$REVIEWED_SHA-linux-amd64" \
  --dir "$DELIVERY/release"
gh run download "$EXPORT_RUN_ID" --repo bam-low/mgimo \
  --name vps-security-report --dir "$DELIVERY/security"
gh run download "$EXPORT_RUN_ID" --repo bam-low/mgimo \
  --name vps-pre-scan-evidence --dir "$DELIVERY/pre-scan"
gh run download "$EXPORT_RUN_ID" --repo bam-low/mgimo \
  --name vps-disk-telemetry --dir "$DELIVERY/telemetry"
```

Если каталог уже существует, выбрать новый, не объединять файлы. Получить доверенный checkout утверждённого SHA отдельно от downloaded payload; путь ниже подставляет владелец. Из checkout, без запуска кода из непроверенного `config.tar`:

```sh
TRUSTED_CHECKOUT=/PATH/TO/REVIEWED/CHECKOUT
test "$(git -C "$TRUSTED_CHECKOUT" rev-parse HEAD)" = "$REVIEWED_SHA"
(cd "$DELIVERY/release" && sha256sum --check --strict SHA256SUMS)
gzip -t "$DELIVERY/release/runtime.tar.gz" \
  "$DELIVERY/release/tools.tar.gz" "$DELIVERY/release/database.tar.gz"
python3 "$TRUSTED_CHECKOUT/ops/vps/release_manifest.py" verify "$DELIVERY/release"
```

Далее read-only сверка exact source, pre-scan inventory, всех семи reports с manifest и config image IDs внутри Docker archives, без image load/extract:

```sh
python3 - "$DELIVERY" "$REVIEWED_SHA" <<'PY'
import hashlib, json, sys, tarfile
from pathlib import Path
root, source = Path(sys.argv[1]), sys.argv[2]
manifest = json.loads((root/'release/release.json').read_text())
if manifest['sourceCommit'] != source:
    raise SystemExit('STOP: неверный source SHA')
pre = json.loads((root/'pre-scan/candidate-images.json').read_text())
if pre['sourceCommit'] != source:
    raise SystemExit('STOP: неверный source pre-scan')
for name, expected in manifest['evidence'].items():
    if hashlib.sha256((root/'security'/name).read_bytes()).hexdigest() != expected:
        raise SystemExit('STOP: отчёт не относится к этому build')
if (root/'security/vps-upgrade.json').read_bytes() != (root/'pre-scan/vps-upgrade.json').read_bytes():
    raise SystemExit('STOP: изменилось доказательство репетиции')
for role, archive, key in [('runtime','runtime','runtimeImage'),
                          ('tools','tools','toolsImage'), ('db','database','databaseImage')]:
    expected = manifest[key]
    if pre['images'][role]['id'] != expected:
        raise SystemExit('STOP: ID pre-scan не совпал')
    with tarfile.open(root/f'release/{archive}.tar.gz', 'r:gz') as handle:
        entries = json.load(handle.extractfile('manifest.json'))
        if len(entries) != 1:
            raise SystemExit('STOP: неоднозначный Docker archive')
        member = handle.getmember(entries[0]['Config'])
        if not member.isfile() or member.size > 8*1024*1024:
            raise SystemExit('STOP: некорректный image config')
        actual = 'sha256:' + hashlib.sha256(handle.extractfile(member).read()).hexdigest()
        if actual != expected:
            raise SystemExit('STOP: Docker archive содержит другой image ID')
    print(role, expected)
print('Проверены source, reports, proof и три image ID внутри архивов')
PY
```

Вручную изучить полный свежий security scan этого run, DB metadata/hash, остаточные findings и обе репетиции. Gate failure/неразобранная HIGH — STOP; старые отчёты не подставлять. Контрольная сумма доказывает неизменность, а не доверие к неизвестному источнику.

## Подпись владельца и независимая проверка

Отдельный release key создаёт владелец **только на своём доверенном компьютере**, с passphrase. Если утверждённый ключ уже существует, использовать его, не перезаписывать. Ни private key, ни passphrase не присылать:

```sh
ssh-keygen -t ed25519 -a 64 -f "$HOME/.ssh/campus_release" -C campus-release-owner
ssh-keygen -lf "$HOME/.ssh/campus_release.pub"
(cd "$DELIVERY/release" && ssh-keygen -Y sign \
  -f "$HOME/.ssh/campus_release" -n campus-vps-release SHA256SUMS)
```

Отдельно закрепить public key/fingerprint через доверенный канал. Allowed signers создавать из уже доверенного публичного ключа, не из downloaded artifact:

```sh
umask 077
printf 'campus-release-owner %s\n' "$(cat "$HOME/.ssh/campus_release.pub")" \
  > "$DELIVERY/allowed_signers"
bash "$TRUSTED_CHECKOUT/ops/vps/verify-delivery.sh" \
  "$DELIVERY/allowed_signers" "$DELIVERY/release"
```

Ожидаются owner signature PASS, пять OK и metadata/evidence PASS. Проверить второй раз на независимой копии с отдельно закреплённым fingerprint. `release.json.state` остаётся `UNSIGNED_OWNER_REVIEW_REQUIRED`: после подписи **не редактировать** manifest или checksums; факт проверенной подписи задаётся внешним `.sig` и записью владельца. Изменение любых bytes после подписи требует повторной проверки и новой подписи.

## Долговечное сохранение и критерий передачи

Сохранить вне Actions: все шесть файлов `release/`, `SHA256SUMS.sig`, полные reports, pre-scan/telemetry, source SHA/run URL/image IDs, публичный fingerprint/независимый signer, дату и результаты проверки. Две проверенные копии — например компьютер и отдельный диск. Ключ и его резерв хранить отдельно от комплекта; backup ключа не помещать в delivery. Повторить `verify-delivery.sh` на второй копии. GitHub artifact retention7дней не заменяет архив; при истечении нужен новый проверенный export, не случайные локальные tar.

До фактического выполнения владельцем этих шагов: **FULL UPLOAD NOT VERIFIED / подпись и долговечное хранение не подтверждены / пока рано**. После доставки записать exact-main SHA, export run, actual size, SHA256SUMS, image IDs и успешную owner signature verification. Только тогда «можно покупать VPS», оставив Production NO-GO до реальных host/TLS/защиты/backup/РФ проверок.

[Первая установка](VPS_DEPLOY_RUNBOOK.md) · [Обновление и восстановление](VPS_UPDATE_RUNBOOK.md) · [Чеклист](VPS_LAUNCH_CHECKLIST.md) · [Отдельные конкурсные пробелы](CONTEST_READINESS_GAPS.md).
