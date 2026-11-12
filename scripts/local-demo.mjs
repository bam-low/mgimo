// Explicitly local, fictional demo setup. Never used by public runtime.
import { randomBytes } from "node:crypto";
import { URL } from "node:url";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import process from "node:process";
import console from "node:console";
const name = "campus-local-demo",
  database = "campus_local_demo";
const secret = () => randomBytes(32).toString("hex");
const keys = [
  "BETTER_AUTH_SECRET",
  "CRON_SECRET",
  "DEMO_STAFF_PASSWORD",
  "DEMO_STUDENT1_PASSWORD",
  "DEMO_STUDENT2_PASSWORD",
];
const command = process.argv[2];
if (command === "init") {
  try {
    await access(".env.local");
    throw Error(".env.local уже существует; перезапись запрещена");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  await mkdir(".local-demo", { recursive: true, mode: 0o700 });
  const password = secret();
  await writeFile(
    ".local-demo/postgres.env",
    `POSTGRES_USER=campus_demo\nPOSTGRES_DB=${database}\nPOSTGRES_PASSWORD=${password}\n`,
    { flag: "wx", mode: 0o600 },
  );
  await writeFile(
    ".env.local",
    `DATABASE_URL=postgresql://campus_demo:${password}@127.0.0.1:55433/${database}\nBETTER_AUTH_URL=http://localhost:3000\nALLOW_DEMO_SEED=yes\nNEXT_TELEMETRY_DISABLED=1\n` +
      keys.map((k) => `${k}=${secret()}\n`).join(""),
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    "Приватная локальная конфигурация создана. Реквизиты не выводились.",
  );
} else if (
  command === "reset" &&
  process.argv[3] === "--confirm" &&
  process.argv[4] === database &&
  process.argv[5] === "--app-stopped"
) {
  const inspected = spawnSync("docker", ["inspect", name], {
    encoding: "utf8",
  });
  if (inspected.status !== 0)
    throw Error("Отдельный контейнер локального демо не найден");
  const container = JSON.parse(inspected.stdout)[0];
  if (
    container.Name !== "/" + name ||
    container.Config.Labels?.["campus.local-demo"] !== database ||
    container.Config.Image !==
      "postgres:17-bookworm@sha256:839fbb5a4942a7758dd93e18b42ea5649807491a0545b5eeeb8f0b8bb11857a5"
  )
    throw Error("Контейнер не соответствует локальному демо; сброс запрещён");
  let env = await readFile(".env.local", "utf8");
  let databaseURL;
  try {
    databaseURL = new URL(
      env
        .split("\n")
        .find((line) => line.startsWith("DATABASE_URL="))
        ?.slice("DATABASE_URL=".length),
    );
  } catch {
    throw Error(
      "Приватная конфигурация не соответствует локальному демо; сброс запрещён",
    );
  }
  if (
    databaseURL.protocol !== "postgresql:" ||
    databaseURL.hostname !== "127.0.0.1" ||
    databaseURL.port !== "55433" ||
    databaseURL.pathname !== "/" + database ||
    databaseURL.username !== "campus_demo" ||
    databaseURL.search ||
    databaseURL.hash
  )
    throw Error(
      "Приватная конфигурация не соответствует локальному демо; сброс запрещён",
    );
  // Target cannot come from DATABASE_URL, an argument, or any remote endpoint.
  const result = spawnSync(
    "docker",
    [
      "exec",
      name,
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "campus_demo",
      "-d",
      "postgres",
      "-c",
      `DROP DATABASE IF EXISTS ${database} WITH (FORCE);`,
      "-c",
      `CREATE DATABASE ${database} OWNER campus_demo;`,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw Error("Не удалось сбросить локальное демо");
  for (const key of keys)
    env = env.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${secret()}`);
  await writeFile(".env.local", env, { mode: 0o600 });
  console.log(
    "Сброшена только campus_local_demo; демонстрационные реквизиты обновлены. Повторите миграции и seed.",
  );
} else
  throw Error(
    "Использование: node scripts/local-demo.mjs init | reset --confirm campus_local_demo --app-stopped (безвозвратно удаляет только эту локальную демо-БД)",
  );
