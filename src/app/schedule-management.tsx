import Link from "next/link";
import { Icon } from "./ui-icon";

const links = [
  ["/staff/schedule/assignments", "Дисциплины и группы"],
  ["/staff/schedule/semesters", "Учебные семестры"],
  ["/staff/schedule/builder", "Конструктор расписания"],
  ["/staff/schedule/resources", "Преподаватели и аудитории"],
  ["/staff/structure", "Управлять группами"],
] as const;

/** Native disclosure on mobile; the desktop row keeps its existing layout. */
export function ScheduleManagement() {
  const items = () =>
    links.map(([href, label]) => (
      <Link href={href} key={href}>
        {label}
      </Link>
    ));
  return (
    <div className="schedule-management">
      <details className="management-mobile">
        <summary>
          Управление расписанием <Icon name="chevron" />
        </summary>
        <nav className="semester-links" aria-label="Управление расписанием">
          {items()}
        </nav>
      </details>
      <nav
        className="semester-links management-desktop"
        aria-label="Управление расписанием"
      >
        {items()}
      </nav>
    </div>
  );
}
