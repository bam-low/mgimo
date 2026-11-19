import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { assertAdditiveHistory, assertAppliedMigrations } from "../scripts/vps-upgrade-rehearsal.mjs";
const contract = JSON.parse(await readFile("ops/vps/migration-contract.json", "utf8"));
test("Аддитивная миграция сохраняет всю прежнюю историю и не допускает посторонних таблиц", () => {
  const old = { Grade: { count: 2, sha256: "a".repeat(64) }, _prisma_migrations: { count: 8, sha256: "b".repeat(64) } };
  const empty = { count: 0, sha256: createHash("sha256").update("[]").digest("hex") };
  const valid = { ...old, TeachingAssignment: empty, TeachingAssignmentGroup: empty, ScheduleCancellation: empty };
  assertAdditiveHistory(valid, old);
  assert.throws(() => assertAdditiveHistory({ ...valid, Grade: { count: 2, sha256: "c".repeat(64) } }, old));
  assert.throws(() => assertAdditiveHistory({ ...valid, Unknown: empty }, old));
  assert.throws(() => assertAdditiveHistory({ ...old, TeachingAssignment: empty }, old));
});
test("Ledger требует ровно утверждённые checksum и успешное завершение миграций", () => {
  const rows = [...contract.baseline, ...contract.additive].map(row => ({ migration_name: row.name, checksum: row.sha256, finished_at: "2026-11-18T00:00:00Z", rolled_back_at: null, applied_steps_count: 1 }));
  assertAppliedMigrations(rows);
  assert.throws(() => assertAppliedMigrations(rows.slice(0, -1)));
  assert.throws(() => assertAppliedMigrations([...rows.slice(0, -1), { ...rows.at(-1), checksum: "0".repeat(64) }]));
  assert.throws(() => assertAppliedMigrations([...rows.slice(0, -1), { ...rows.at(-1), rolled_back_at: "2026-11-18" }]));
});
