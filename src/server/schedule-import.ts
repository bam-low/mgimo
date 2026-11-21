import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { actor, staff, Denied } from "./security";
import { builderCatalog, changeBuilder } from "./semester-builder";
import type { Prisma } from "../generated/prisma/client";

type Actor = Awaited<ReturnType<typeof actor>>;

/** Колонки шаблона в порядке файла. */
export const IMPORT_COLUMNS = [
  "Группы",
  "Дисциплина",
  "День недели",
  "Начало",
  "Конец",
  "Повторение",
  "Дата (только для однократного занятия)",
  "Преподаватель",
  "Корпус",
  "Аудитория",
] as const;
const MAX_ROWS = 200;
const MAX_BYTES = 200_000;

const WEEKDAYS: Record<string, number> = {
  пн: 1,
  понедельник: 1,
  вт: 2,
  вторник: 2,
  ср: 3,
  среда: 3,
  чт: 4,
  четверг: 4,
  пт: 5,
  пятница: 5,
  сб: 6,
  суббота: 6,
  вс: 7,
  воскресенье: 7,
};
const RECURRENCE: Record<string, "EVERY" | "A" | "B" | "ONCE"> = {
  "каждую неделю": "EVERY",
  еженедельно: "EVERY",
  числитель: "A",
  знаменатель: "B",
  однократно: "ONCE",
  "один раз": "ONCE",
};
const RECURRENCE_LABEL = {
  EVERY: "каждую неделю",
  A: "числитель",
  B: "знаменатель",
  ONCE: "однократно",
};

/** Сравнение названий без учёта регистра, лишних пробелов и «ё». */
const key = (s: string) =>
  s
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е");

/** Разбор CSV: «;» или «,», кавычки с удвоением, BOM, CRLF. */
export function parseCsv(text: string) {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep =
    (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function time(v: string) {
  const m = v.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]),
    min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}
function day(v: string) {
  const m = v.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(iso + "T12:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso
    ? iso
    : null;
}

export const importInput = z
  .object({
    semesterId: z.string().min(1).max(100),
    csv: z.string().max(MAX_BYTES),
    confirm: z.boolean(),
  })
  .strict();

type RowReport = {
  line: number;
  status: "new" | "exists" | "error";
  message?: string;
  groups?: string;
  subject?: string;
  when?: string;
  lessons?: number;
};

class Rollback extends Error {}

/**
 * Импорт расписания из CSV. Предпросмотр выполняет ту же публикацию, что и
 * конструктор, внутри транзакции и откатывает её: проверки, конфликты (с
 * текущим расписанием и между строками файла) и подсчёт занятий — настоящие.
 * Публикация — та же операция с фиксацией, только если ошибок нет («всё или ничего»).
 */
export async function importSchedule(a: Actor, input: unknown) {
  staff(a);
  const { semesterId, csv, confirm } = importInput.parse(input);
  const universityId = a.membership.universityId;
  const table = parseCsv(csv);
  if (!table.length)
    return fail("Файл пустой. Скачайте шаблон и заполните его.");
  const header = table[0].map(key);
  // «Дата» без пояснения — заголовок старых версий шаблона.
  const index = IMPORT_COLUMNS.map((c) =>
    c.startsWith("Дата")
      ? header.findIndex((h) => h === key(c) || h === "дата")
      : header.indexOf(key(c)),
  );
  const missing = IMPORT_COLUMNS.filter((_, i) => index[i] < 0);
  if (missing.length)
    return fail(
      `В первой строке нет колонок: ${missing.join(", ")}. Используйте шаблон без изменения заголовков.`,
    );
  const body = table.slice(1);
  if (!body.length)
    return fail("В файле только заголовки. Добавьте строки с занятиями.");
  if (body.length > MAX_ROWS)
    return fail(`Не более ${MAX_ROWS} строк за одну загрузку.`);

  const catalog = await builderCatalog(universityId);
  const semester = catalog.semesters.find((s) => s.id === semesterId);
  if (!semester) throw new Denied(404);
  const groups = catalog.faculties.flatMap((f) =>
    f.programs.flatMap((p) =>
      p.groups.map((g) => ({
        ...g,
        programId: p.id,
        usable: g.active && p.active && f.active,
      })),
    ),
  );
  const byName = <T extends { active?: boolean }>(
    list: T[],
    name: (t: T) => string,
  ) => {
    const map = new Map<string, T[]>();
    for (const t of list)
      map.set(key(name(t)), [...(map.get(key(name(t))) ?? []), t]);
    return map;
  };
  const groupMap = byName(groups, (g) => g.name),
    subjectMap = byName(catalog.subjects, (s) => s.name),
    teacherMap = byName(catalog.teachers, (t) => t.name),
    roomMap = byName(catalog.rooms, (r) => `${r.building} ${r.number}`);

  const rows: RowReport[] = [];
  const commands: {
    report: RowReport;
    rule: Record<string, unknown>;
    programId: string;
  }[] = [];
  body.forEach((cells, n) => {
    const line = n + 2;
    const get = (i: number) => (cells[index[i]] ?? "").trim();
    const errors: string[] = [];
    const groupNames = get(0)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const found = groupNames.map((g) => {
      const list = (groupMap.get(key(g)) ?? []).filter((x) => x.usable);
      if (!list.length) errors.push(`группа «${g}» не найдена или неактивна`);
      else if (list.length > 1)
        errors.push(`группа «${g}» есть в нескольких направлениях`);
      return list[0];
    });
    if (!groupNames.length) errors.push("не указана группа");
    const programIds = new Set(found.filter(Boolean).map((g) => g!.programId));
    if (programIds.size > 1)
      errors.push("общая лекция допускает группы одного направления");
    const subjectName = get(1);
    const subject = (subjectMap.get(key(subjectName)) ?? []).find(
      (s) => s.active,
    );
    if (!subjectName) errors.push("не указана дисциплина");
    else if (!subject) errors.push(`дисциплина «${subjectName}» не найдена`);
    const weekday = WEEKDAYS[key(get(2)).replace(/\.$/, "")];
    const start = time(get(3)),
      end = time(get(4));
    if (!start || !end) errors.push("время в формате ЧЧ:ММ, например 09:00");
    else if (start >= end) errors.push("окончание должно быть позже начала");
    const recurrence = RECURRENCE[key(get(5))];
    if (!recurrence)
      errors.push(
        "повторение: каждую неделю, числитель, знаменатель или однократно",
      );
    const once = recurrence === "ONCE" ? day(get(6)) : null;
    if (recurrence === "ONCE" && !once)
      errors.push("для однократного занятия дата в формате ДД.ММ.ГГГГ");
    if (recurrence && recurrence !== "ONCE" && !weekday)
      errors.push("день недели: Пн, Вт, Ср, Чт, Пт, Сб или Вс");
    const teacherName = get(7);
    const teacher = (teacherMap.get(key(teacherName)) ?? []).find(
      (t) => t.active,
    );
    if (!teacherName) errors.push("не указан преподаватель");
    else if (!teacher) errors.push(`преподаватель «${teacherName}» не найден`);
    else if (subject && !teacher.subjectIds.includes(subject.id))
      errors.push(`преподаватель «${teacherName}» не ведёт «${subjectName}»`);
    const roomName = `${get(8)} ${get(9)}`;
    const room = (roomMap.get(key(roomName)) ?? []).find((r) => r.active);
    if (!get(9)) errors.push("не указана аудитория");
    else if (!room) errors.push(`аудитория «${roomName.trim()}» не найдена`);
    const report: RowReport = {
      line,
      status: "error",
      groups: groupNames.join(", "),
      subject: subjectName,
      when: [
        recurrence === "ONCE" ? get(6) : get(2),
        start && end ? `${start}–${end}` : "",
        recurrence ? RECURRENCE_LABEL[recurrence] : "",
      ]
        .filter(Boolean)
        .join(" · "),
    };
    rows.push(report);
    if (errors.length) {
      report.message = errors.join("; ");
      return;
    }
    const onceDay = once ?? semester.calendar.start;
    commands.push({
      report,
      programId: [...programIds][0],
      rule: {
        subjectId: subject!.id,
        teacherId: teacher!.id,
        roomId: room!.id,
        groupIds: found.map((g) => g!.id),
        recurrence: recurrence!,
        // Для однократного день недели берётся из даты.
        weekday: once
          ? ((new Date(once + "T12:00:00Z").getUTCDay() + 6) % 7) + 1
          : weekday!,
        once: onceDay,
        startTime: start!,
        endTime: end!,
      },
    });
  });

  const run = async (tx: Prisma.TransactionClient) => {
    for (const c of commands) {
      const r = c.rule as {
        subjectId: string;
        teacherId: string;
        roomId: string;
        groupIds: string[];
        recurrence: string;
        weekday: number;
        once: string;
        startTime: string;
        endTime: string;
      };
      const twin = await tx.scheduleTemplate.findFirst({
        where: {
          universityId,
          semesterId,
          programId: c.programId,
          subjectId: r.subjectId,
          teacherId: r.teacherId,
          roomId: r.roomId,
          recurrence: r.recurrence,
          weekday: r.weekday,
          startTime: r.startTime,
          endTime: r.endTime,
          ...(r.recurrence === "ONCE" ? { once: r.once } : {}),
        },
        include: { groups: { where: { active: true } } },
      });
      if (
        twin &&
        JSON.stringify(twin.groups.map((g) => g.groupId).sort()) ===
          JSON.stringify([...r.groupIds].sort())
      ) {
        c.report.status = "exists";
        c.report.message =
          "Такое занятие уже есть в семестре — строка будет пропущена.";
        continue;
      }
      await tx.$executeRawUnsafe("SAVEPOINT import_row");
      try {
        const command = {
          action: "TEMPLATE_CREATE",
          operationId: randomUUID(),
          semesterId,
          programId: c.programId,
          rule: c.rule,
        };
        const preview = (await changeBuilder(
          a.user.id,
          universityId,
          { command, preview: true },
          tx,
        )) as {
          token: string;
          dates: { status: string }[];
        };
        await changeBuilder(
          a.user.id,
          universityId,
          { command, preview: false, confirmed: true, token: preview.token },
          tx,
        );
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT import_row");
        c.report.status = "new";
        c.report.lessons = preview.dates.filter(
          (d) => d.status === "SCHEDULED",
        ).length;
      } catch (e) {
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT import_row");
        c.report.message =
          e instanceof Denied || e instanceof z.ZodError
            ? e instanceof Denied
              ? e.message
              : (e.issues[0]?.message ?? "Строка не прошла проверку.")
            : "Строку не удалось проверить.";
      }
    }
    const summary = report(rows);
    if (!confirm || summary.errors) throw new Rollback();
    return summary;
  };
  try {
    const summary = await db.$transaction(run, {
      timeout: 120000,
      maxWait: 10000,
    });
    return { ...summary, published: true };
  } catch (e) {
    if (e instanceof Rollback) {
      const summary = report(rows);
      return {
        ...summary,
        published: false,
        ...(confirm && summary.errors
          ? {
              error:
                "Публикация отменена: в файле есть ошибки. Исправьте строки и загрузите файл снова.",
            }
          : {}),
      };
    }
    throw e;
  }
}

function report(rows: RowReport[]) {
  return {
    rows,
    created: rows.filter((r) => r.status === "new").length,
    lessons: rows.reduce(
      (n, r) => n + (r.status === "new" ? (r.lessons ?? 0) : 0),
      0,
    ),
    existing: rows.filter((r) => r.status === "exists").length,
    errors: rows.filter((r) => r.status === "error").length,
  };
}
function fail(error: string) {
  return {
    rows: [],
    created: 0,
    lessons: 0,
    existing: 0,
    errors: 1,
    published: false,
    error,
  };
}

/** Шаблон CSV для Excel: «;», BOM, примеры из справочников вуза. */
export async function importTemplate(a: Actor) {
  staff(a);
  const catalog = await builderCatalog(a.membership.universityId);
  const group = catalog.faculties
    .flatMap((f) => (f.active ? f.programs.filter((p) => p.active) : []))
    .flatMap((p) => p.groups.filter((g) => g.active))[0];
  const teacher = catalog.teachers.find((t) => t.active && t.subjectIds.length);
  const subject = catalog.subjects.find(
    (s) => s.active && teacher?.subjectIds.includes(s.id),
  );
  const room = catalog.rooms.find((r) => r.active);
  const cell = (v: string) =>
    /[;"\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
  const lines = [
    IMPORT_COLUMNS.join(";"),
    [
      group?.name ?? "Группа",
      subject?.name ?? "Дисциплина",
      "Пн",
      "09:00",
      "10:30",
      "каждую неделю",
      "",
      teacher?.name ?? "Преподаватель",
      room?.building ?? "Корпус",
      room?.number ?? "101",
    ],
    [
      group?.name ?? "Группа",
      subject?.name ?? "Дисциплина",
      "Ср",
      "10:40",
      "12:10",
      "числитель",
      "",
      teacher?.name ?? "Преподаватель",
      room?.building ?? "Корпус",
      room?.number ?? "101",
    ],
  ].map((l) => (Array.isArray(l) ? l.map(cell).join(";") : l));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
