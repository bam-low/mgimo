import Link from "next/link";
import { Icon } from "./ui-icon";

/** Два способа составить расписание: конструктор (как раньше) или таблица. */
export function ScheduleMethods({ active }: { active: "builder" | "import" }) {
  return (
    <nav
      className="schedule-methods"
      aria-label="Способ составления расписания"
    >
      <Link
        href="/staff/schedule#builder-filters"
        aria-current={active === "builder" ? "page" : undefined}
      >
        <Icon name="calendar" />
        <span>
          <strong>Вручную</strong>
          <small>Конструктор: занятие за занятием</small>
        </span>
      </Link>
      <Link
        href="/staff/schedule/import"
        aria-current={active === "import" ? "page" : undefined}
      >
        <Icon name="document" />
        <span>
          <strong>Из таблицы</strong>
          <small>Шаблон → заполнить → загрузить</small>
        </span>
      </Link>
    </nav>
  );
}
