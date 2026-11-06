import Link from "next/link";
export function AppNav({
  role,
  active,
  canStudy = true,
}: {
  role: "STUDENT" | "STAFF";
  active: string;
  canStudy?: boolean;
}) {
  const links =
    role === "STAFF"
      ? [
          ["/staff/structure", "Учебная структура"],
          ["/staff/schedule", "Расписание"],
          ["/staff", "Прикрепления"],
        ]
      : [
          ["/today", "Главная"],
          ["/schedule", "Расписание"],
          ["/cabinet", "Профиль"],
        ];
  return (
    <>
      <header className="campus-masthead">
        <Link
          href={
            role === "STAFF"
              ? "/staff/structure"
              : canStudy
                ? "/today"
                : "/cabinet"
          }
          className="wordmark"
        >
          Кампус<span>Пространство учёбы</span>
        </Link>
        <span className="edition">
          {role === "STAFF" ? "Деканат / демо" : "Личный кампус / демо"}
        </span>
      </header>
      <nav className="campus-nav" aria-label="Разделы платформы">
        {links
          .filter(
            ([href]) => role === "STAFF" || canStudy || href === "/cabinet",
          )
          .map(([href, label]) => (
            <Link
              key={href}
              href={href}
              prefetch={false}
              aria-current={active === href ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
      </nav>
      <p className="concept-note">
        Концепт, не официальный сервис. Только вымышленные данные.
      </p>
    </>
  );
}
