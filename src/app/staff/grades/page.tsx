import { headers } from "next/headers";
import Link from "next/link";
import { actor, staff } from "@/server/security";
import { protectedPage } from "@/server/page";
import { readGrades, gradeRoster, subjects } from "@/server/grades";
import { staffStructure } from "@/server/structure";
import { dayKey } from "@/lib/schedule-time";
import { AppNav } from "../../app-nav";
import { Workspace } from "../../workspace";
import { RefreshContext } from "../../forms";
import { GradeList } from "../../grade-list";
import { GradePeriod } from "../../grade-period";
import { GradeGroupScope } from "../../grade-group-scope";
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
    history?: string;
    subjectId?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const q = await searchParams;
  const a = await protectedPage(async () => {
    const a = await actor(await headers());
    staff(a);
    return a;
  });
  const history = q.history === "1";
  const roster = await protectedPage(() =>
    gradeRoster(a, {
      groupId: q.groupId || undefined,
      cursor: q.studentsCursor,
      history,
    }),
  );
  const tree = await protectedPage(() =>
    staffStructure(a.membership.universityId),
  );
  const subjectList = await protectedPage(() => subjects(a));
  const selected = roster.rows.find((s) => s.id === q.student);
  const data = selected
    ? await protectedPage(() =>
        readGrades(a, {
          membershipId: selected.id,
          cursor: q.cursor,
          auditCursor: q.auditCursor,
          from: q.from,
          to: q.to,
          subjectId: q.subjectId,
        }),
      )
    : null;
  const today = dayKey(new Date(), a.membership.university.timezone);
  return (
    <main className="campus-shell">
      <AppNav role="STAFF" active="/staff/grades" />
      <Workspace>
        <div className="account-line">
          <span>Рабочее пространство сотрудника</span>
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
        <nav className="grades-pages" aria-label="Режим успеваемости">
          <Link href="/staff/grades">Выставить новый результат</Link>
          <Link href="/staff/grades?history=1">История всех студентов</Link>
        </nav>
        <p className="notice">
          {history
            ? "История сохраняется после перевода и отзыва прикрепления. Для нового результата вернитесь к выбору группы."
            : "1. Выберите группу → 2. Студента → 3. Дисциплину и результат."}
        </p>
        <GradeGroupScope
          key={`${q.groupId ?? ""}:${history}`}
          groupId={q.groupId ?? ""}
          history={history}
          groups={tree.flatMap((f) =>
            f.programs.flatMap((p) =>
              p.groups.map((g) => ({
                id: g.id,
                name: g.name,
                context: `${f.name} / ${p.name}`,
                active: f.active && p.active && g.active,
              })),
            ),
          )}
        >
          <form method="get" className="request" aria-label="Выбор студента">
            <input type="hidden" name="groupId" value={q.groupId ?? ""} />
            {history && <input type="hidden" name="history" value="1" />}
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
                disabled={!roster.rows.length || (!history && !q.groupId)}
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
            <button className="secondary" disabled={!roster.rows.length}>
              Открыть результаты
            </button>
            {!history && !q.groupId ? (
              <p>
                Сначала выберите учебную группу. Затем появятся студенты с
                действующим прикреплением.
              </p>
            ) : (
              !roster.rows.length && (
                <p>
                  {history
                    ? "Для выбранного фильтра студентов нет. Исторические результаты доступны в общем списке истории."
                    : "В группе нет подтверждённых студентов с действующим прикреплением. Проверьте прикрепления или выберите другую группу."}
                </p>
              )
            )}
          </form>
          <nav className="grades-pages" aria-label="Страницы студентов">
            <Link
              href={{
                pathname: "/staff/grades",
                query: {
                  groupId: q.groupId,
                  history: history ? "1" : undefined,
                },
              }}
            >
              К началу списка
            </Link>
            {roster.next && (
              <Link
                href={{
                  pathname: "/staff/grades",
                  query: {
                    groupId: q.groupId,
                    studentsCursor: roster.next,
                    history: history ? "1" : undefined,
                  },
                }}
              >
                Следующие студенты
              </Link>
            )}
          </nav>
          <details>
            <summary>Справочник дисциплин</summary>
            <p>
              Это тот же справочник, что в «Дисциплины и группы» расписания.
              Повторно создавать дисциплину не нужно; результат можно выставить
              и без опубликованных занятий.
            </p>
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
              <GradePeriod query={q} />
              <h2>
                {selected.name} · {selected.group}
              </h2>
              {selected.eligible && !history && q.groupId ? (
                <GradeForm
                  key={`${selected.id}:${q.groupId}`}
                  membershipId={selected.id}
                  groupId={q.groupId}
                  subjects={subjectList}
                  today={today}
                />
              ) : (
                <p className="notice">
                  {selected.eligible
                    ? "Открыта история. Чтобы выставить новый результат, сначала выберите учебную группу в основном режиме."
                    : "Нет действующего учебного доступа. Новые результаты и исправления недоступны; история сохранена."}
                </p>
              )}
              <GradeList
                data={data}
                query={q}
                groupId={selected.eligible && !history ? q.groupId : undefined}
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
                {data.subjectId && data.next && (
                  <Link
                    href={{
                      pathname: "/staff/grades",
                      query: {
                        ...q,
                        cursor: data.next,
                        auditCursor: undefined,
                      },
                    }}
                  >
                    Следующие результаты
                  </Link>
                )}
              </nav>
            </>
          )}
        </GradeGroupScope>
      </Workspace>
    </main>
  );
}
