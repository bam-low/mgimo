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
  type NavLink = {
    href: string;
    label: string;
    icon: IconName;
    /** Короткая подпись для нижнего меню телефона. */
    short?: string;
    /** На телефоне раздел открывается с главной, нижнее меню не перегружаем. */
    desktopOnly?: boolean;
  };
  const links: NavLink[] =
    role === "STAFF"
      ? [
          {
            href: "/staff/structure",
            label: "Учебная структура",
            short: "Структура",
            icon: "structure",
          },
          {
            href: "/staff/schedule",
            label: "Расписание",
            short: "Пары",
            icon: "calendar",
          },
          {
            href: "/staff/grades",
            label: "Успеваемость",
            short: "Оценки",
            icon: "book",
          },
          {
            href: "/staff",
            label: "Студенты",
            short: "Студенты",
            icon: "people",
          },
          { href: "/staff/applications", label: "Заявки", icon: "document" },
          {
            href: "/staff/announcements",
            label: "Объявления",
            short: "Новости",
            icon: "megaphone",
          },
        ]
      : [
          { href: "/today", label: "Главная", icon: "home" },
          {
            href: "/announcements",
            label: "Объявления",
            icon: "megaphone",
            desktopOnly: true,
          },
          {
            href: "/schedule",
            label: "Расписание",
            short: "Пары",
            icon: "calendar",
          },
          {
            href: "/grades",
            label: "Успеваемость",
            short: "Оценки",
            icon: "book",
          },
          { href: "/applications", label: "Заявки", icon: "document" },
          { href: "/cabinet", label: "Профиль", icon: "user" },
        ];
  return (
    <>
      <a className="skip-link" href="#workspace">
        К содержанию
      </a>
      <header className="campus-masthead" data-role={role}>
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
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
          <img
            className="brand-logo"
            src="/brand/campus-logo.svg"
            alt="Кампус"
            width={115}
            height={38}
          />
          <span className="brand-sub">Цифровой деканат</span>
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
              className={l.desktopOnly ? "nav-desktop-only" : undefined}
            >
              <Icon name={l.icon} />
              <span className={l.short ? "nav-grades-label" : undefined}>
                {l.short ? (
                  <>
                    <span className="nav-label-full">{l.label}</span>
                    <span className="nav-label-short" aria-hidden="true">
                      {l.short}
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
          <small>
            {role === "STAFF"
              ? "Кампус"
              : "Конкурсный концепт · Вымышленные данные"}
          </small>
        </span>
      </nav>
      <p className="concept-note">
        {role === "STUDENT"
          ? "Конкурсный концепт · Вымышленные данные"
          : "Вымышленные данные"}
      </p>
    </>
  );
}
