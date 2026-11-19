// Read-only owner utility. No deletion command, inference of test data, or secret output.
import pg from "pg";
import process from "node:process";
import console from "node:console";
import { readFile } from "node:fs/promises";
const scope = {
  membership: ['"UniversityMembership" r', 'r."universityId"'],
  enrollment: ['"GroupMembership" r JOIN "UniversityMembership" m ON m.id=r."membershipId"', 'm."universityId"'],
  enrollmentRequest: ['"EnrollmentRequest" r JOIN "UniversityMembership" m ON m.id=r."membershipId"', 'm."universityId"'],
  application: ['"Application" r', 'r."universityId"'],
  document: ['"ApplicationDocument" r', 'r."universityId"'],
  grade: ['"Grade" r', 'r."universityId"'],
  notification: ['"Notification" r', 'r."universityId"'],
  cancellation: ['"ScheduleCancellation" r', 'r."universityId"'],
  faculty: ['"Faculty" r', 'r."universityId"'],
  program: ['"Program" r JOIN "Faculty" f ON f.id=r."facultyId"', 'f."universityId"'],
  group: ['"StudentGroup" r JOIN "Program" p ON p.id=r."programId" JOIN "Faculty" f ON f.id=p."facultyId"', 'f."universityId"'],
  semester: ['"Semester" r', 'r."universityId"'],
  subject: ['"Subject" r', 'r."universityId"'],
  teacher: ['"Teacher" r', 'r."universityId"'],
  room: ['"Room" r', 'r."universityId"'],
  assignment: ['"TeachingAssignment" r', 'r."universityId"'],
  lesson: ['"ScheduleEntry" r JOIN "StudentGroup" g ON g.id=r."groupId" JOIN "Program" p ON p.id=g."programId" JOIN "Faculty" f ON f.id=p."facultyId"', 'f."universityId"'],
};
const ident = s => '"' + s.replaceAll('"', '""') + '"';
let client;
try {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--university" || args[2] !== "--records" || !args[1]) throw Error();
  const file = await readFile(args[3]);
  if (file.length > 65536) throw Error();
  const records = JSON.parse(file);
  if (!Array.isArray(records) || !records.length || records.length > 100 || records.some(r => !r || !Object.hasOwn(scope, r.kind) || typeof r.id !== "string" || !r.id || r.id.length > 100 || Object.keys(r).some(k => !["kind", "id"].includes(k)))) throw Error();
  client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await client.query("SET LOCAL statement_timeout = '10s'");
  const report = [];
  for (const record of records) {
    const [from, university] = scope[record.kind];
    const row = (await client.query(`SELECT r.id FROM ${from} WHERE r.id=$1 AND ${university}=$2`, [record.id, args[1]])).rows[0];
    if (!row) throw Error();
    const table = /^"([A-Za-z]+)"/.exec(from)[1];
    const relations = (await client.query(`SELECT child.relname AS "table", a.attname AS "column" FROM pg_constraint fk JOIN pg_class child ON child.oid=fk.conrelid JOIN pg_namespace ns ON ns.oid=child.relnamespace JOIN LATERAL unnest(fk.conkey,fk.confkey) AS keys(child_key,parent_key) ON true JOIN pg_attribute a ON a.attrelid=child.oid AND a.attnum=keys.child_key JOIN pg_attribute parent ON parent.attrelid=fk.confrelid AND parent.attnum=keys.parent_key WHERE fk.contype='f' AND ns.nspname='public' AND fk.confrelid=$1::regclass AND parent.attname='id' ORDER BY child.relname,a.attname`, [ident(table)])).rows;
    const dependencies = [];
    for (const relation of relations) {
      const count = (await client.query(`SELECT count(*)::int AS n FROM ${ident(relation.table)} WHERE ${ident(relation.column)}=$1`, [record.id])).rows[0].n;
      if (count) dependencies.push({ table: relation.table, column: relation.column, count });
    }
    const auditCount = (await client.query('SELECT count(*)::int AS n FROM "AuditLog" WHERE "universityId"=$1 AND "targetId"=$2', [args[1], record.id])).rows[0].n;
    report.push({ ...record, dependencies, auditCount, physicalDeleteAllowed: ["faculty", "program", "group"].includes(record.kind) && !dependencies.length });
  }
  await client.query("ROLLBACK");
  console.log(JSON.stringify({ mode: "PREVIEW_ONLY", universityId: args[1], records: report, warning: "Ничего не удалено. Зависимости показаны непосредственно для каждой явной записи; каскадное удаление не предлагается. Очистка VPS — отдельное решение владельца после сверки полного списка и резервной копии." }, null, 2));
} catch {
  console.error("Предпросмотр остановлен. Нужны --university ID --records файл.json, явный список из 1–100 доступных записей и разрешённое соединение с БД. Подробности соединения не выводятся.");
  process.exitCode = 1;
} finally {
  await client?.end();
}
