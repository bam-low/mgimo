# Проверка ветки в Codespaces

Цель — повторить задание **Node CI** (`.github/workflows/node-ci.yml`) для ветки `ux/audit-fixes-2026-11-20`, пока hosted Actions недоступны из-за лимита. Это только проверка: сборка VPS-релиза и выкладка сюда не входят.

Всё ниже выполняется в терминале Codespace (Bash, Linux). Данные только вымышленные, пароли генерируются на месте и никуда не публикуются.

## 0. Перед стартом

- В GitHub → Settings → Billing проверьте остаток бесплатной квоты Codespaces.
- Достаточно машины 4 core / 16 GB. Займёт примерно 30–45 минут, включая установку Chromium.
- После проверки остановите или удалите Codespace, чтобы не тратить квоту.

## 1. Создать Codespace на ветке

GitHub → репозиторий `bam-low/mgimo` → **Code** → вкладка **Codespaces** → `…` → **New with options** → Branch: `ux/audit-fixes-2026-11-20` → **Create codespace**.

Проверка, что вы на нужном коммите и без локальных изменений:

```bash
git fetch origin
git switch ux/audit-fixes-2026-11-20
git status --short --branch
git rev-parse HEAD
```

Запишите полный SHA из последней строки — он пойдёт в отчёт PR.

## 2. Node из `.nvmrc`

```bash
source ~/.nvm/nvm.sh
nvm install "$(cat .nvmrc)"
nvm use "$(cat .nvmrc)"
node --version
npm --version
```

Ожидается `v24.22.1` и npm 11.x.

## 3. Отдельный PostgreSQL 17 для тестов

Тот же образ и параметры, что в CI. Порт только на loopback.

```bash
docker run -d --name campus-ci-db \
  -e POSTGRES_DB=campus_test \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=isolated-ci-only \
  -e POSTGRES_HOST_AUTH_METHOD=scram-sha-256 \
  -e POSTGRES_INITDB_ARGS='--auth-host=scram-sha-256' \
  -p 127.0.0.1:5432:5432 \
  postgres:17-bookworm@sha256:839fbb5a4942a7758dd93e18b42ea5649807491a0545b5eeeb8f0b8bb11857a5
until docker exec campus-ci-db pg_isready -U postgres; do sleep 2; done
```

Дождитесь строки `accepting connections`.

## 4. Окружение как в CI

Выполняйте в том же терминале, что и шаги ниже: переменные живут только в этой сессии.

```bash
export NEXT_TELEMETRY_DISABLED=1
export DATABASE_URL=postgresql://postgres:isolated-ci-only@localhost:5432/campus_test
export BETTER_AUTH_URL=http://localhost:3000
export ALLOW_DEMO_SEED=yes
for k in BETTER_AUTH_SECRET DEMO_STAFF_PASSWORD DEMO_STUDENT1_PASSWORD DEMO_STUDENT2_PASSWORD CRON_SECRET; do
  export "$k=$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))')"
done
```

Значения не печатайте и не копируйте в PR.

## 5. Проверки

Порядок как в `node-ci.yml`. Удобнее запускать блоками и после каждого смотреть, что нет ошибки.

```bash
set -e
npm ci --ignore-scripts
npm run security:prepare
npm run test:picomatch
npm audit --omit=dev
npm run db:generate
npm run db:migrate
npx --no-install prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
npm run db:seed && npm run db:seed
```

```bash
set -e
npm run lint
npm run typecheck
npm test -- --run
npm run test:vercel-checker
npm run test:launch-tools
npm run test:integration
```

```bash
set -e
npm run build
npm run check:runtime
npx --no-install playwright install --with-deps chromium
npm run test:e2e
```

```bash
set -e
npm run build:vercel
npm run check:vercel-runtime
npm run test:vercel-e2e
```

Если терминал закрылся, перед продолжением повторите шаги 2 и 4.

## 6. Что важно для этой ветки

Изменения затронули конструктор расписания, оценки и заявки. Особое внимание к E2E:

- `tests/e2e/teaching-assignments.spec.ts` — текст пересечения теперь `08.09.2026 (вт)`, «Вне учебных дней» — текст вместо кнопки;
- `tests/e2e/semester-builder.spec.ts` — ожидается «Пересечение» вместо «Конфликт»;
- `tests/e2e/staff-workspace.spec.ts` — заголовок дня `01.09.2037 (вт) · Числитель`;
- `tests/e2e/applications.spec.ts` — у студента фильтры сначала раскрываются.

Если упал только один спек, его можно перезапустить отдельно, например:

```bash
npx --no-install playwright test tests/e2e/teaching-assignments.spec.ts
```

Отчёт Playwright с трассами — в `playwright-report/`, открыть: `npx --no-install playwright show-report`.

## 7. Записать результат в PR

Комментарий в Draft PR (без паролей и cookie):

```text
Проверка в Codespaces, SHA <полный SHA из шага 1>, Node <версия>, PostgreSQL 17.
lint/typecheck: PASS | unit: N passed | integration: N passed
standalone E2E: N passed | Functions E2E: N passed
Падения/повторы: <нет или какие спеки и почему>
```

При падении приложите название теста и первую ошибку из вывода. Красные hosted-проверки в PR при этом остаются красными из-за биллинга — это отдельная причина, в комментарии её стоит назвать.

## 8. Уборка

```bash
docker rm -f campus-ci-db
```

Затем GitHub → Codespaces → остановить или удалить этот Codespace.
