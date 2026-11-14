import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { Icon } from "./ui-icon";

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <main className="public-shell">
      <section className="public-story" aria-label="О Кампусе">
        <Link className="wordmark" href="/">
          <span className="brand-building">
            <Icon name="building" />
          </span>
          <span>
            Кампус<small>ЦИФРОВОЙ ДЕКАНАТ</small>
          </span>
        </Link>
        <div className="public-story-copy">
          <p className="eyebrow">Учёба. Люди. Возможности.</p>
          <h2>
            Ваш университет.
            <br />
            <em>Ваш ритм.</em>
          </h2>
          <p>
            Расписание, учебные результаты и связь с деканатом — в одном
            пространстве.
          </p>
          <Image
            src="/design/campus-garden.svg"
            alt=""
            width={440}
            height={210}
            priority
          />
        </div>
      </section>
      <section className="public-content">
        {children}
      </section>
    </main>
  );
}
