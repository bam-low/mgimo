import { headers } from "next/headers";
import Link from "next/link";
import { actor, staff } from "@/server/security";
import { protectedPage } from "@/server/page";
import { readGrades, gradeRoster, subjects } from "@/server/grades";
import { staffStructure } from "@/server/structure";
import { dayKey } from "@/lib/schedule-time";
import { AppNav } from "../../app-nav";
import { Workspace } from "../../workspace";
import { Logout, RefreshContext } from "../../forms";
import { GradeList } from "../../grade-list";
import { GradeForm, SubjectForm } from "../../grade-forms";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    groupId?: string;
    student?: string;
    studentsCursor?: string;
    cursor?: string;
    auditCursor?: string;
  }>;
}) {
  const q = await searchParams;
  const a = await protectedPage(async () => {
    const a = await actor(await headers());
    staff(a);
    return a;
  });
  const roster = await protectedPage(() =>
    gradeRoster(a, {
      groupId: q.groupId || undefined,
      cursor: q.studentsCursor,
    }),
  );
  const tree = await protectedPage(() =>
    staffStructure(a.membership.universityId),
  );
  const subjectList = await protectedPage(() => subjects(a));
  const selected = roster.rows.find((s) => s.id === q.student);
  const data = selected
    ? await protectedPage(() =>
        readGrades(a, { membershipId: selected.id, cursor: q.cursor }),
      )
    : null;
  const today = dayKey(new Date(), a.membership.university.timezone);
  return (
    <main className="campus-shell">
      <AppNav role="STAFF" active="/staff/grades" />
      <Workspace>
        <div className="account-line">
          <span>Рабочее пространство сотрудника</span>
          <Logout />
        </div>
        <RefreshContext />
        <header className="editorial-heading">
          <p className="eyebrow">Деканат</p>
          <h1>Успеваемость</h1>
          <p>
            Только вымышленные данные. Дата по календарю вуза:{" "}
            {a.membership.university.timezone}.
          </p>
        </header>
        <form method="get" className="request" aria-label="Фильтр студентов">
          <label>
            Группа
            <select
              aria-label="Группа"
              name="groupId"
              defaultValue={q.groupId ?? ""}
            >
              <option value="">Все группы</option>
              {tree.flatMap((f) =>
                f.programs.flatMap((p) =>
                  p.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  )),
                ),
              )}
            </select>
          </label>
          <button>Показать студентов</button>
        </form>
        <form method="get" className="request" aria-label="Выбор студента">
          <input type="hidden" name="groupId" value={q.groupId ?? ""} />
          {q.studentsCursor && (
            <input
              type="hidden"
              name="studentsCursor"
              value={q.studentsCursor}
            />
          )}
          <label>
            Студент
            <select
              aria-label="Студент"
              name="student"
              required
              defaultValue={selected?.id ?? ""}
            >
              <option value="" disabled>
                Выберите студента
              </option>
              {roster.rows.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.group}
                  {!s.eligible ? " · только история" : ""}
                </option>
              ))}
            </select>
          </label>
          <button disabled={!roster.rows.length}>Открыть результаты</button>
          {!roster.rows.length && <p>В выбранной группе студентов нет.</p>}
        </form>
        <nav className="grades-pages" aria-label="Страницы студентов">
          <Link
            href={{ pathname: "/staff/grades", query: { groupId: q.groupId } }}
          >
            К началу списка
          </Link>
          {roster.next && (
            <Link
              href={{
                pathname: "/staff/grades",
                query: { groupId: q.groupId, studentsCursor: roster.next },
              }}
            >
              Следующие студенты
            </Link>
          )}
        </nav>
        <details>
          <summary>Справочник дисциплин</summary>
          <SubjectForm />
          {!subjectList.length && (
            <p>Дисциплин пока нет. Создайте первую дисциплину.</p>
          )}
          {subjectList.map((s) => (
            <SubjectForm key={s.id + "-" + s.version} subject={s} />
          ))}
        </details>
        {selected && data && (
          <>
            <h2>
              {selected.name} · {selected.group}
            </h2>
            {selected.eligible ? (
              <GradeForm
                key={selected.id}
                membershipId={selected.id}
                subjects={subjectList}
                today={today}
              />
            ) : (
              <p className="notice">
                Нет действующего учебного доступа. Новые результаты и
                исправления недоступны; история сохранена.
              </p>
            )}
            <GradeList
              data={data}
              membershipId={selected.id}
              subjectList={subjectList}
              today={today}
            />
            <nav className="grades-pages" aria-label="Страницы аудита">
              <Link
                href={{
                  pathname: "/staff/grades",
                  query: { ...q, auditCursor: undefined },
                }}
              >
                Начало аудита
              </Link>
              {data.nextAudit && (
                <Link
                  href={{
                    pathname: "/staff/grades",
                    query: { ...q, auditCursor: data.nextAudit },
                  }}
                >
                  Предыдущие события аудита
                </Link>
              )}
            </nav>
            <nav className="grades-pages" aria-label="Страницы результатов">
              <Link
                href={{
                  pathname: "/staff/grades",
                  query: { ...q, cursor: undefined, auditCursor: undefined },
                }}
              >
                К началу результатов
              </Link>
              {data.next && (
                <Link
                  href={{
                    pathname: "/staff/grades",
                    query: { ...q, cursor: data.next, auditCursor: undefined },
                  }}
                >
                  Следующие результаты
                </Link>
              )}
            </nav>
          </>
        )}
      </Workspace>
    </main>
  );
}
