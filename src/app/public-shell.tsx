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
          <span />
          <span />
          <span />
          <span />
          <span />
          <svg viewBox="0 0 230 170" width="230" height="170">
            <path className="sprig" d="M232,18Q196,30 168,62" />
            <path className="sprig" d="M214,-2Q204,34 214,74" />
            <path className="sprig" d="M232,58Q206,70 194,106" />
            <path className="sprig" d="M188,-2Q170,16 146,26" />
            <path className="sprig" d="M232,96Q220,118 222,144" />
            <path className="sprig" d="M232,40Q214,44 200,40" />
            <path className="leaf-0" transform="translate(222.1 21.8) rotate(117.0) scale(1.1)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-1" transform="translate(216.4 24.3) rotate(202.3) scale(1.1)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-2" transform="translate(210.9 27.1) rotate(95.7) scale(1.1)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-0" transform="translate(205.4 30.2) rotate(189.1) scale(1.0)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-1" transform="translate(200.1 33.6) rotate(98.5) scale(1.0)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-2" transform="translate(194.8 37.3) rotate(200.0) scale(0.9)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-0" transform="translate(189.7 41.2) rotate(101.5) scale(0.9)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-1" transform="translate(184.7 45.3) rotate(187.1) scale(0.9)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-2" transform="translate(179.8 49.8) rotate(80.7) scale(0.8)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-0" transform="translate(175.0 54.5) rotate(174.4) scale(0.8)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-1" transform="translate(170.3 59.5) rotate(84.2) scale(0.7)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-1" transform="translate(211.6 8.2) rotate(53.1) scale(1.0)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-2" transform="translate(210.3 15.7) rotate(153.9) scale(1.0)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-0" transform="translate(209.5 23.3) rotate(54.7) scale(0.9)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-1" transform="translate(209.1 31.0) rotate(139.6) scale(0.9)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-2" transform="translate(209.1 38.8) rotate(32.5) scale(0.9)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-0" transform="translate(209.5 46.7) rotate(125.5) scale(0.8)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-1" transform="translate(210.3 54.6) rotate(34.6) scale(0.8)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-2" transform="translate(211.6 62.7) rotate(135.7) scale(0.7)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-0" transform="translate(213.2 70.8) rotate(37.0) scale(0.7)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-2" transform="translate(225.0 61.8) rotate(91.4) scale(1.0)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-0" transform="translate(220.2 65.2) rotate(181.8) scale(0.9)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-1" transform="translate(215.7 69.1) rotate(88.2) scale(0.9)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-2" transform="translate(211.5 73.5) rotate(187.0) scale(0.9)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-0" transform="translate(207.6 78.5) rotate(86.0) scale(0.8)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-1" transform="translate(204.0 83.9) rotate(169.4) scale(0.8)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-2" transform="translate(200.7 89.8) rotate(61.1) scale(0.7)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-0" transform="translate(197.7 96.2) rotate(153.2) scale(0.7)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-1" transform="translate(195.0 103.2) rotate(61.7) scale(0.6)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-0" transform="translate(182.8 2.9) rotate(98.1) scale(0.9)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-1" transform="translate(177.6 7.3) rotate(189.2) scale(0.8)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-2" transform="translate(172.1 11.5) rotate(88.3) scale(0.8)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-0" transform="translate(166.4 15.4) rotate(187.4) scale(0.7)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-1" transform="translate(160.5 18.9) rotate(102.5) scale(0.7)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-2" transform="translate(154.3 22.2) rotate(209.5) scale(0.6)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-0" transform="translate(147.9 25.2) rotate(116.5) scale(0.6)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-1" transform="translate(228.9 102.2) rotate(66.0) scale(0.8)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-2" transform="translate(226.0 109.7) rotate(164.4) scale(0.8)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-0" transform="translate(223.8 117.5) rotate(62.9) scale(0.7)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-1" transform="translate(222.4 125.4) rotate(145.3) scale(0.7)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-2" transform="translate(221.8 133.6) rotate(35.9) scale(0.6)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-0" transform="translate(221.9 141.9) rotate(126.8) scale(0.6)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-2" transform="translate(227.0 41.0) rotate(114.6) scale(0.8)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-0" transform="translate(220.1 41.8) rotate(215.7) scale(0.7)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-1" transform="translate(213.4 42.0) rotate(-226.5) scale(0.7)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-2" transform="translate(207.1 41.5) rotate(-116.2) scale(0.6)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <path className="leaf-0" transform="translate(201.1 40.3) rotate(-205.4) scale(0.5)" d="M0 0C5-5 14-6 21 0 14 6 5 5 0 0Z" />
            <circle className="bud" cx="168.0" cy="62.0" r="2.9" />
            <circle className="bud" cx="214.0" cy="74.0" r="2.6" />
            <circle className="bud" cx="194.0" cy="106.0" r="2.5" />
            <circle className="bud" cx="146.0" cy="26.0" r="2.3" />
            <circle className="bud" cx="222.0" cy="144.0" r="2.2" />
            <circle className="bud" cx="200.0" cy="40.0" r="2.0" />
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
