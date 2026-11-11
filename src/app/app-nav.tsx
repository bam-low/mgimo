import Link from "next/link";
import { Icon, type IconName } from "./ui-icon";
export function AppNav({
  role,
  active,
  canStudy = true,
}: {
  role: "STUDENT" | "STAFF";
  active: string;
  canStudy?: boolean;
}) {
  const links: { href: string; label: string; icon: IconName }[] =
    role === "STAFF"
      ? [
          {
            href: "/staff/structure",
            label: "Учебная структура",
            icon: "structure",
          },
          { href: "/staff/schedule", label: "Расписание", icon: "calendar" },
          { href: "/staff/grades", label: "Успеваемость", icon: "structure" },
          { href: "/staff", label: "Прикрепления", icon: "people" },
        ]
      : [
          { href: "/today", label: "Главная", icon: "home" },
          { href: "/schedule", label: "Расписание", icon: "calendar" },
          { href: "/grades", label: "Успеваемость", icon: "structure" },
          { href: "/cabinet", label: "Профиль", icon: "user" },
        ];
  return (
    <>
      <a className="skip-link" href="#workspace">
        К содержанию
      </a>
      <header className="campus-masthead">
        <Link
          className="wordmark"
          href={
            role === "STAFF"
              ? "/staff/structure"
              : canStudy
                ? "/today"
                : "/cabinet"
          }
        >
          <span className="brand-building">
            <Icon name="building" />
          </span>
          <span>
            Кампус<small>ЦИФРОВОЙ ДЕКАНАТ</small>
          </span>
        </Link>
        <span className="edition">
          {role === "STAFF" ? "ДЕКАНАТ" : "СТУДЕНТ"}
        </span>
      </header>
      <nav className="campus-nav" aria-label="Разделы платформы">
        {links
          .filter((l) => role === "STAFF" || canStudy || l.href === "/cabinet")
          .map((l) => (
            <Link
              href={l.href}
              key={l.href}
              prefetch={false}
              aria-label={l.label}
              aria-current={active === l.href ? "page" : undefined}
            >
              <Icon name={l.icon} />
              <span
                className={
                  l.href.endsWith("/grades") ? "nav-grades-label" : undefined
                }
              >
                {l.href.endsWith("/grades") ? (
                  <>
                    <span className="nav-label-full">{l.label}</span>
                    <span className="nav-label-short" aria-hidden="true">
                      Оценки
                    </span>
                  </>
                ) : (
                  l.label
                )}
              </span>
            </Link>
          ))}
        <span className="nav-context">
          {role === "STAFF" ? "Рабочее пространство" : "Ваш учебный день"}
          <small>Демонстрационный кампус</small>
        </span>
      </nav>
      <p className="concept-note">
        Концепт, не официальный сервис · Только вымышленные данные
      </p>
    </>
  );
}
