import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

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
          <svg viewBox="0 0 260 170" width="260" height="170">
            <path className="twig" d="M230 8Q130 30 46 150" />
            <path className="leaf leaf-0" transform="translate(204.3 15.4) rotate(202.5) scale(1)" d="M0 0C9-8 26-9 38 0 26 9 9 8 0 0Z" />
            <path className="leaf leaf-1" transform="translate(186.8 22.4) rotate(113.7) scale(0.96)" d="M0 0C9-8 26-9 38 0 26 9 9 8 0 0Z" />
            <path className="leaf leaf-2" transform="translate(165.7 33.2) rotate(192.2) scale(0.94)" d="M0 0C9-8 26-9 38 0 26 9 9 8 0 0Z" />
            <path className="leaf leaf-0" transform="translate(147.0 45.0) rotate(103.4) scale(0.9)" d="M0 0C9-8 26-9 38 0 26 9 9 8 0 0Z" />
            <path className="leaf leaf-1" transform="translate(126.7 60.3) rotate(182.6) scale(0.84)" d="M0 0C9-8 26-9 38 0 26 9 9 8 0 0Z" />
            <path className="leaf leaf-2" transform="translate(108.6 76.3) rotate(94.7) scale(0.78)" d="M0 0C9-8 26-9 38 0 26 9 9 8 0 0Z" />
            <path className="leaf leaf-0" transform="translate(90.8 94.2) rotate(175.0) scale(0.7)" d="M0 0C9-8 26-9 38 0 26 9 9 8 0 0Z" />
            <path className="leaf leaf-1" transform="translate(73.3 114.1) rotate(87.7) scale(0.62)" d="M0 0C9-8 26-9 38 0 26 9 9 8 0 0Z" />
            <circle className="berry" cx="42.0" cy="152.0" r="4.5" />
          </svg>
        </div>
      )}
      <section className="public-story" aria-label="О Кампусе">
        <Link className="wordmark" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
          <img className="brand-logo" src="/brand/campus-logo.svg" alt="Кампус" width={145} height={48} />
          <span className="brand-sub">Цифровой деканат</span>
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
