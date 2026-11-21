import Link from "next/link";

/** «Оценки | Сессия» — два режима одного раздела «Успеваемость». */
export function StudyTabs({ active }: { active: "grades" | "session" }) {
  return (
    <nav className="mode-tabs" aria-label="Раздел успеваемости">
      <Link href="/grades" aria-current={active === "grades" ? "page" : undefined}>
        Оценки
      </Link>
      <Link
        href="/grades/session"
        aria-current={active === "session" ? "page" : undefined}
      >
        Сессия
      </Link>
    </nav>
  );
}
