import { NotificationBadge } from "./notification-badge";
import Link from "next/link";
import { Logout } from "./forms";
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
          { href: "/staff/grades", label: "Успеваемость", icon: "book" },
          { href: "/staff", label: "Прикрепления", icon: "people" },
          { href: "/staff/applications", label: "Заявки", icon: "document" },
        ]
      : [
          { href: "/today", label: "Главная", icon: "home" },
          { href: "/schedule", label: "Расписание", icon: "calendar" },
          { href: "/grades", label: "Успеваемость", icon: "book" },
          { href: "/applications", label: "Заявки", icon: "document" },
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
        <div className="masthead-actions">
          {role === "STUDENT" && <NotificationBadge />}
          <Logout />
        </div>
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
                  l.href.endsWith("/grades") ||
                  l.href.endsWith("/schedule") ||
                  ["/staff", "/staff/structure"].includes(l.href)
                    ? "nav-grades-label"
                    : undefined
                }
              >
                {l.href.endsWith("/grades") ||
                l.href.endsWith("/schedule") ||
                ["/staff", "/staff/structure"].includes(l.href) ? (
                  <>
                    <span className="nav-label-full">{l.label}</span>
                    <span className="nav-label-short" aria-hidden="true">
                      {l.href === "/staff"
                        ? "Студенты"
                        : l.href === "/staff/structure"
                          ? "Структура"
                          : l.href.endsWith("/schedule")
                            ? "Пары"
                            : "Оценки"}
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
          <small>Кампус</small>
        </span>
      </nav>
      <p className="concept-note">Вымышленные данные</p>
    </>
  );
}
