import Link from "next/link";

/** Режимы «Успеваемости» сотрудника: выставить, история, сессия. */
export function StaffGradeTabs({
  active,
}: {
  active: "new" | "history" | "session";
}) {
  const tab = (key: typeof active, href: string, label: string) => (
    <Link href={href} aria-current={active === key ? "page" : undefined}>
      {label}
    </Link>
  );
  return (
    <nav className="mode-tabs" aria-label="Режим успеваемости">
      {tab("new", "/staff/grades", "Выставить")}
      {tab("history", "/staff/grades?history=1", "История")}
      {tab("session", "/staff/session", "Сессия")}
    </nav>
  );
}
