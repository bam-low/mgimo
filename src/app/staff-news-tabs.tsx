import Link from "next/link";

/** «Объявления | Дедлайны» — два режима раздела сотрудника. */
export function StaffNewsTabs({
  active,
}: {
  active: "announcements" | "deadlines";
}) {
  return (
    <nav className="mode-tabs" aria-label="Раздел сообщений">
      <Link
        href="/staff/announcements"
        aria-current={active === "announcements" ? "page" : undefined}
      >
        Объявления
      </Link>
      <Link
        href="/staff/deadlines"
        aria-current={active === "deadlines" ? "page" : undefined}
      >
        Дедлайны
      </Link>
    </nav>
  );
}
