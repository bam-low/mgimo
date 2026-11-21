// Owner-only preparation; never imported by the application or deployment build.
export const runtimeRole = "campus_runtime";
export const tablePolicy = {
  University: ["SELECT"],
  Faculty: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  Program: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  StudentGroup: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  Subject: ["SELECT", "INSERT", "UPDATE"],
  Application: ["SELECT", "INSERT", "UPDATE"],
  ApplicationDocument: ["SELECT", "INSERT"],
  ApplicationEvent: ["SELECT", "INSERT"],
  Notification: ["SELECT", "INSERT"],
  ScheduleCancellation: ["SELECT", "INSERT"],
  GradeDismissal: ["SELECT", "INSERT", "DELETE"],
  Announcement: ["SELECT", "INSERT", "DELETE"],
  AnnouncementRead: ["SELECT", "INSERT"],
  PortfolioItem: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  ScheduleChange: ["SELECT", "INSERT"],
  Exam: ["SELECT", "INSERT", "UPDATE"],
  ExamGroup: ["SELECT", "INSERT"],
  Deadline: ["SELECT", "INSERT", "UPDATE"],
  DeadlineDone: ["SELECT", "INSERT", "DELETE"],
  Grade: ["SELECT", "INSERT", "UPDATE"],
  Semester: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  Teacher: ["SELECT", "INSERT", "UPDATE"],
  Room: ["SELECT", "INSERT", "UPDATE"],
  TeacherSubject: ["SELECT", "INSERT", "UPDATE"],
  TeachingAssignment: ["SELECT", "INSERT", "UPDATE"],
  TeachingAssignmentGroup: ["SELECT", "INSERT", "UPDATE"],
  ScheduleTemplate: ["SELECT", "INSERT", "UPDATE"],
  TemplateGroup: ["SELECT", "INSERT", "UPDATE"],
  ScheduleGroup: ["SELECT", "INSERT", "UPDATE"],
  ScheduleEntry: ["SELECT", "INSERT", "UPDATE"],
  User: ["SELECT", "INSERT", "UPDATE"],
  Account: ["SELECT", "INSERT", "UPDATE"],
  Session: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  Verification: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  UniversityMembership: ["SELECT", "INSERT", "UPDATE"],
  StudentProfile: ["SELECT", "INSERT", "UPDATE"],
  EnrollmentRequest: ["SELECT", "INSERT", "UPDATE"],
  GroupMembership: ["SELECT", "INSERT", "UPDATE"],
  RateBucket: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  RateLimit: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  AuditLog: ["SELECT", "INSERT"],
  _prisma_migrations: [],
};
function requireSafe(value) {
  if (!value)
    throw Error("STOP: unexpected database privilege or schema state");
}
const ident = (s) => '"' + s.replaceAll('"', '""') + '"';
async function noCustomColumnGrants(client) {
  const result = await client.query(
    `SELECT c.relname,a.attname,g.privilege_type,g.is_grantable,(g.grantee=0) AS public FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(a.attacl) g WHERE n.nspname='public' AND (g.grantee=0 OR g.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1))`,
    [runtimeRole],
  );
  requireSafe(
    result.rows.every(
      (r) =>
        r.relname === "Notification" &&
        r.attname === "readAt" &&
        r.privilege_type === "UPDATE" &&
        !r.is_grantable &&
        !r.public,
    ),
  );
}
async function schema(client) {
  const { rows } = await client.query(
    `SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')`,
  );
  requireSafe(
    rows.length === Object.keys(tablePolicy).length &&
      rows.every(
        (r) => r.relkind === "r" && Object.hasOwn(tablePolicy, r.relname),
      ),
  );
  const funcs = await client.query(
    `SELECT p.proname,p.prosecdef,p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'`,
  );
  const expected = {
    prevent_audit_mutation:
      "BEGIN RAISE EXCEPTION 'Audit history is immutable'; END;",
    guard_notification_read: `BEGIN
 IF (to_jsonb(NEW) - 'readAt') IS DISTINCT FROM (to_jsonb(OLD) - 'readAt') OR OLD."readAt" IS NOT NULL OR NEW."readAt" IS NULL THEN
  RAISE EXCEPTION 'Notification history is immutable';
 END IF;
 RETURN NEW;
END;`,
  };
  requireSafe(
    funcs.rows.length === 2 &&
      funcs.rows.every(
        (r) =>
          !r.prosecdef &&
          Object.hasOwn(expected, r.proname) &&
          r.prosrc.trim() === expected[r.proname],
      ),
  );
  const notificationTriggers = await client.query(
    `SELECT tgname,tgtype,tgenabled,tgqual,tgattr::text, tgfoid::regprocedure::text AS fn FROM pg_trigger WHERE tgrelid='public."Notification"'::regclass AND NOT tgisinternal ORDER BY tgname`,
  );
  requireSafe(
    notificationTriggers.rows.length === 2 &&
      notificationTriggers.rows.every(
        (r) =>
          r.tgenabled === "O" &&
          r.tgqual === null &&
          r.tgattr === "" &&
          ((r.tgname === "notification_read_once" &&
            r.tgtype === 19 &&
            r.fn === "guard_notification_read()") ||
            (r.tgname === "immutable_notification_delete" &&
              r.tgtype === 11 &&
              r.fn === "prevent_audit_mutation()")),
      ),
  );
  for (const [table, trigger] of [
    ["AuditLog", "immutable_audit"],
    ["ApplicationDocument", "immutable_application_document"],
    ["ApplicationEvent", "immutable_application_event"],
    ["ScheduleCancellation", "immutable_cancellation"],
    ["ScheduleChange", "immutable_schedule_change"],
  ]) {
    const triggers = await client.query(
      `SELECT t.tgenabled,p.proname FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid=$1::regclass AND t.tgname=$2 AND NOT t.tgisinternal AND t.tgfoid='public.prevent_audit_mutation()'::regprocedure AND t.tgtype=27 AND t.tgqual IS NULL AND t.tgattr::text=''`,
      ["public." + ident(table), trigger],
    );
    requireSafe(
      triggers.rows.length === 1 &&
        triggers.rows[0].tgenabled === "O" &&
        triggers.rows[0].proname === "prevent_audit_mutation",
    );
  }
}
async function role(client) {
  const { rows } = await client.query(
    `SELECT oid,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconfig FROM pg_roles WHERE rolname=$1`,
    [runtimeRole],
  );
  const r = rows[0];
  requireSafe(
    rows.length === 1 &&
      r.rolcanlogin &&
      !r.rolsuper &&
      !r.rolinherit &&
      !r.rolcreaterole &&
      !r.rolcreatedb &&
      !r.rolreplication &&
      !r.rolbypassrls &&
      !r.rolconfig?.length,
  );
  const memberships = await client.query(
    `SELECT 1 FROM pg_auth_members WHERE member=$1`,
    [r.oid],
  );
  requireSafe(memberships.rowCount === 0);
  const owners = await client.query(
    `SELECT 1 FROM pg_class WHERE relowner=$1 UNION ALL SELECT 1 FROM pg_namespace WHERE nspowner=$1 UNION ALL SELECT 1 FROM pg_proc WHERE proowner=$1 UNION ALL SELECT 1 FROM pg_database WHERE datdba=$1`,
    [r.oid],
  );
  requireSafe(owners.rowCount === 0);
}
export async function checkRuntimePrivileges(client) {
  await schema(client);
  await role(client);
  await noCustomColumnGrants(client);
  const db = await client.query(
    `SELECT has_database_privilege($1,current_database(),'CONNECT') AS connect, has_database_privilege($1,current_database(),'CREATE') AS create, has_database_privilege($1,current_database(),'TEMPORARY') AS temp`,
    [runtimeRole],
  );
  requireSafe(db.rows[0].connect && !db.rows[0].create && !db.rows[0].temp);
  const schemas = await client.query(
    `SELECT nspname,has_schema_privilege($1,oid,'CREATE') AS create,has_schema_privilege($1,oid,'USAGE') AS usage FROM pg_namespace`,
    [runtimeRole],
  );
  requireSafe(
    schemas.rows.some((s) => s.nspname === "public" && s.usage) &&
      schemas.rows.every(
        (s) =>
          !s.create &&
          (s.nspname === "public" ||
            s.nspname.startsWith("pg_") ||
            s.nspname === "information_schema" ||
            !s.usage),
      ),
  );
  for (const [table, allowed] of Object.entries(tablePolicy)) {
    const name = "public." + ident(table);
    for (const privilege of [
      "SELECT",
      "INSERT",
      "UPDATE",
      "DELETE",
      "TRUNCATE",
      "REFERENCES",
      "TRIGGER",
      "MAINTAIN",
    ]) {
      const result = await client.query(
        `SELECT has_table_privilege($1,$2,$3) AS value`,
        [runtimeRole, name, privilege],
      );
      requireSafe(result.rows[0].value === allowed.includes(privilege));
      const grant = await client.query(
        `SELECT has_table_privilege($1,$2,$3) AS value`,
        [runtimeRole, name, privilege + " WITH GRANT OPTION"],
      );
      requireSafe(!grant.rows[0].value);
    }
    const columns = await client.query(
      `SELECT attname FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped`,
      [name],
    );
    for (const column of columns.rows)
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "REFERENCES"]) {
        const result = await client.query(
          `SELECT has_column_privilege($1,$2,$3,$4) AS value`,
          [runtimeRole, name, column.attname, privilege],
        );
        requireSafe(
          result.rows[0].value ===
            (allowed.includes(privilege) ||
              (table === "Notification" &&
                column.attname === "readAt" &&
                privilege === "UPDATE")),
        );
        const grant = await client.query(
          `SELECT has_column_privilege($1,$2,$3,$4) AS value`,
          [runtimeRole, name, column.attname, privilege + " WITH GRANT OPTION"],
        );
        requireSafe(!grant.rows[0].value);
      }
  }
  const notificationFunction = await client.query(
    `SELECT has_function_privilege($1,'public.guard_notification_read()','EXECUTE') AS execute`,
    [runtimeRole],
  );
  requireSafe(!notificationFunction.rows[0].execute);
  const functions = await client.query(
    `SELECT has_function_privilege($1,'public.prevent_audit_mutation()','EXECUTE') AS execute`,
    [runtimeRole],
  );
  requireSafe(!functions.rows[0].execute);
  const defaults = await client.query(
    `SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE r.rolname=$1 OR a.grantee=0`,
    [runtimeRole],
  );
  requireSafe(defaults.rowCount === 0);
}
export async function grantRuntimePrivileges(client) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query("SET LOCAL statement_timeout='10s'");
    await client.query("SELECT pg_advisory_xact_lock(222022)");
    await schema(client);
    await role(client);
    await noCustomColumnGrants(client);
    const owners = await client.query(
      `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user)`,
    );
    requireSafe(owners.rowCount === 0);
    const { rows } = await client.query("SELECT current_database() AS name");
    const database = ident(rows[0].name);
    // Dedicated synthetic DB only. PUBLIC can otherwise supply TEMP/CREATE or grants.
    await client.query(
      `REVOKE ALL ON DATABASE ${database} FROM PUBLIC, campus_runtime`,
    );
    await client.query(
      `GRANT CONNECT ON DATABASE ${database} TO campus_runtime`,
    );
    await client.query(
      "REVOKE ALL ON SCHEMA public FROM PUBLIC, campus_runtime",
    );
    await client.query("GRANT USAGE ON SCHEMA public TO campus_runtime");
    await client.query(
      "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, campus_runtime",
    );
    await client.query(
      "REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, campus_runtime",
    );
    await client.query(
      "REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, campus_runtime",
    );
    // Custom column ACLs were refused before REVOKE could conceal their origin.
    for (const [table, privileges] of Object.entries(tablePolicy))
      if (privileges.length)
        await client.query(
          `GRANT ${privileges.join(",")} ON public.${ident(table)} TO campus_runtime`,
        );
    await client.query(
      'GRANT UPDATE ("readAt") ON public."Notification" TO campus_runtime',
    );
    await checkRuntimePrivileges(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
