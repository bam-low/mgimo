import { ScheduleManagement } from "../../schedule-management";
import { ScheduleField } from "../../schedule-field";
import { GroupFilterField } from "../../group-filter-field";
import { displayDate } from "../../schedule-input-values";
import { Workspace } from "../../workspace";
import Link from "next/link";
import { headers } from "next/headers";
import { actor, staff } from "@/server/security";
import { protectedPage } from "@/server/page";
import { staffStructure } from "@/server/structure";
import { readSchedule } from "@/server/schedule";
import { dayKey, addDays } from "@/lib/schedule-time";
import { AppNav } from "../../app-nav";
import { LessonEditor } from "../../lesson-form";
import { RefreshContext } from "../../forms";
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
        groupName: g.name,
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
    <main className="campus-shell staff-schedule-page">
      <AppNav role="STAFF" active="/staff/schedule" />
      <Workspace>
        <div className="account-line">
          <span>Рабочее пространство сотрудника</span>
        </div>

        <RefreshContext />
        <header className="editorial-heading">
          <p className="eyebrow">Деканат / Расписание группы</p>
          <h1>Расписание занятий</h1>
          <p>Выберите группу и неделю. Изменения доступны студентам.</p>
        </header>
        <ScheduleManagement />
        {!data ? (
          <p className="notice">
            Сначала <Link href="/staff/structure">создайте учебную группу</Link>
            .
          </p>
        ) : (
          <>
            <form action="/staff/schedule" className="schedule-controls">
              <GroupFilterField
                groups={groups}
                selected={groupId!}
                key={groupId}
              />
              <ScheduleField
                broad
                label="Неделя, содержащая дату"
                name="day"
                defaultValue={query.day ?? data.today}
              />
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
                {displayDate(data.from)} — {displayDate(addDays(data.from, 6))}
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
              from={data.from}
              today={data.today}
              key={groupId + data.from}
              lessons={data.lessons}
              groupId={groupId!}
              timezone={data.timezone}
              day={query.day ?? dayKey(new Date(), data.timezone)}
            />
          </>
        )}
      </Workspace>
    </main>
  );
}
