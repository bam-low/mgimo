import Link from "next/link";
import { headers } from "next/headers";
import { actor, staff } from "@/server/security";
import { protectedPage } from "@/server/page";
import { staffStructure } from "@/server/structure";
import { readSchedule } from "@/server/schedule";
import { dayKey, addDays } from "@/lib/schedule-time";
import { AppNav } from "../../app-nav";
import { LessonEditor } from "../../lesson-form";
import { Logout, RefreshContext } from "../../forms";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ groupId?: string; day?: string }>;
}) {
  const a = await protectedPage(async () => {
    const a = await actor(await headers());
    staff(a);
    return a;
  });
  const query = await searchParams;
  const tree = await protectedPage(() =>
    staffStructure(a.membership.universityId),
  );
  const groups = tree.flatMap((f) =>
    f.programs.flatMap((p) =>
      p.groups.map((g) => ({
        ...g,
        name: `${f.name} / ${p.name} / ${g.name}`,
        available: f.active && p.active && g.active,
      })),
    ),
  );
  const groupId = query.groupId ?? groups[0]?.id;
  const data = groupId
    ? await protectedPage(() =>
        readSchedule(a, { groupId, day: query.day, view: "week" }),
      )
    : null;
  return (
    <main className="campus-shell">
      <AppNav role="STAFF" active="/staff/schedule" />
      <div className="account-line">
        <span>Рабочее пространство сотрудника</span>
        <div className="logout-control">
          <Logout />
        </div>
      </div>
      <RefreshContext />
      <header className="editorial-heading">
        <p className="eyebrow">Деканат / 02</p>
        <h1>Групповое расписание</h1>
        <p>
          Одна группа, одна неделя. Изменения сразу доступны на новых запросах
          студентов.
        </p>
      </header>
      {!data ? (
        <p className="notice">
          Сначала <Link href="/staff/structure">создайте учебную группу</Link>.
        </p>
      ) : (
        <>
          <form action="/staff/schedule" className="schedule-controls">
            <label>
              Учебная группа
              <select
                aria-label="Учебная группа"
                name="groupId"
                defaultValue={groupId}
              >
                {groups.map((g) => (
                  <option value={g.id} key={g.id}>
                    {g.name}
                    {!g.available ? " (неактивна)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Неделя, содержащая дату
              <input
                type="date"
                name="day"
                defaultValue={query.day ?? data.today}
              />
            </label>
            <button>Показать</button>
          </form>
          <nav className="week-nav" aria-label="Недели расписания">
            <Link
              href={{
                pathname: "/staff/schedule",
                query: { groupId, day: addDays(data.from, -7) },
              }}
            >
              ← Предыдущая неделя
            </Link>
            <span>
              {data.from} — {addDays(data.from, 6)}
            </span>
            <Link
              href={{
                pathname: "/staff/schedule",
                query: { groupId, day: addDays(data.from, 7) },
              }}
            >
              Следующая неделя →
            </Link>
          </nav>
          {!groups.find((g) => g.id === groupId)?.available && (
            <p className="notice">
              Структура неактивна: создавать и восстанавливать занятия нельзя.
              Историю можно просмотреть, отменить или убрать.
            </p>
          )}
          <LessonEditor
            key={groupId + data.from}
            lessons={data.lessons}
            groupId={groupId!}
            timezone={data.timezone}
            day={query.day ?? dayKey(new Date(), data.timezone)}
          />
        </>
      )}
    </main>
  );
}
