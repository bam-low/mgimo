import { BuilderShell, builderPage } from "../builder-shell";
import { ScheduleImportForm } from "../../../schedule-import-form";
import { ScheduleMethods } from "../../../schedule-methods";
import { SemesterQuickSetup } from "../../../semester-ui";
export const dynamic = "force-dynamic";
export default async function Page() {
  const catalog = await builderPage();
  const groups = catalog.faculties
    .filter((f) => f.active)
    .flatMap((f) => f.programs.filter((p) => p.active))
    .flatMap((p) =>
      p.groups.filter((g) => g.active).map((g) => `${g.name} (${p.name})`),
    );
  const subjects = catalog.subjects.filter((s) => s.active);
  const teachers = catalog.teachers.filter((t) => t.active);
  const rooms = catalog.rooms.filter((r) => r.active);
  return (
    <BuilderShell unified title="Расписание из таблицы">
      <SemesterQuickSetup empty={!catalog.semesters.length} />
      <ScheduleMethods active="import" />
      <ScheduleImportForm
        semesters={catalog.semesters.map((s) => ({
          id: s.id,
          name: s.calendar.name,
        }))}
      />
      <details className="editor-panel import-reference">
        <summary>Справочник названий для таблицы</summary>
        <p className="field-hint">
          Пишите названия так же, как здесь: регистр и лишние пробелы не важны.
          Несколько групп одного направления через запятую — общая лекция.
        </p>
        <dl>
          <dt>Группы</dt>
          <dd>
            {groups.join(" · ") || "Пока нет — создайте в учебной структуре."}
          </dd>
          <dt>Дисциплины и преподаватели</dt>
          <dd>
            {subjects
              .map((s) => {
                const who = teachers
                  .filter((t) => t.subjectIds.includes(s.id))
                  .map((t) => t.name);
                return `${s.name}${who.length ? ` — ${who.join(", ")}` : " — преподаватель не закреплён"}`;
              })
              .join(" · ") || "Пока нет."}
          </dd>
          <dt>Аудитории (корпус и номер)</dt>
          <dd>
            {rooms.map((r) => `${r.building} ${r.number}`).join(" · ") ||
              "Пока нет."}
          </dd>
          <dt>Повторение</dt>
          <dd>
            каждую неделю · числитель · знаменатель · однократно (с датой
            ДД.ММ.ГГГГ)
          </dd>
          <dt>День недели</dt>
          <dd>Пн · Вт · Ср · Чт · Пт · Сб · Вс</dd>
        </dl>
      </details>
    </BuilderShell>
  );
}
