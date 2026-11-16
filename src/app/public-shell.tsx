import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { Icon } from "./ui-icon";

export function PublicShell({
  children,
  landing = false,
}: {
  children: ReactNode;
  landing?: boolean;
}) {
  const Heading = landing ? "h1" : "h2";
  return (
    <main className={`public-shell ${landing ? "public-landing" : ""}`}>
      {landing && (
        <div className="landing-watercolor" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      )}
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
          <Heading>
            Ваш университет.
            <br />
            <em>Ваш ритм.</em>
          </Heading>
          <p>
            Расписание, учебные результаты и связь с деканатом — в одном
            пространстве.
          </p>
          <Image
            src="/design/campus-watercolor.png"
            alt=""
            width={768}
            height={512}
            priority
            unoptimized={landing}
          />
        </div>
      </section>
      <section className="public-content">{children}</section>
    </main>
  );
}
