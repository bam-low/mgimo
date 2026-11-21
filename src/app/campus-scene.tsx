// Рисунок для приветствия на главной студента — изначальный набросок из прототипа
// владельца. Здание перерисовано под вуз: часовая башня вместо купола, крылья
// с мансардой и окнами. Время суток меняет только мягкий фон, светило и окна.
export type DayPhase = "morning" | "day" | "evening" | "night";

export const PHASES: { id: DayPhase; label: string; greeting: string }[] = [
  { id: "morning", label: "Утро", greeting: "Доброе утро" },
  { id: "day", label: "День", greeting: "Добрый день" },
  { id: "evening", label: "Вечер", greeting: "Добрый вечер" },
  { id: "night", label: "Ночь", greeting: "Доброй ночи" },
];

/** Время суток по часу университета: утро 5–11, день 11–17, вечер 17–22, ночь 22–5. */
export function phaseAt(instant: number, timeZone: string): DayPhase {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone,
    }).format(new Date(instant)),
  );
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "day";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

const LOOK: Record<
  DayPhase,
  { wash: string; light: string; lightOpacity: number; window: string }
> = {
  morning: {
    wash: "#F7D9CC",
    light: "#F9D2B4",
    lightOpacity: 0.75,
    window: "#F3E2E3",
  },
  day: {
    wash: "#E4ECF1",
    light: "#F6E3C8",
    lightOpacity: 0.7,
    window: "#F3E2E3",
  },
  evening: {
    wash: "#F1C3AE",
    light: "#F2A983",
    lightOpacity: 0.6,
    window: "#F6D08A",
  },
  night: {
    wash: "#C9C6DA",
    light: "#F4EEDC",
    lightOpacity: 0.95,
    window: "#F7D37E",
  },
};

export function CampusScene({ phase }: { phase: DayPhase }) {
  const look = LOOK[phase];
  const lit = phase === "evening" || phase === "night";
  const label = PHASES.find((p) => p.id === phase)?.label.toLowerCase();
  const windowRows = [100, 124];
  const wingX = [88, 102, 116, 258, 272, 286];
  return (
    <svg
      className="campus-scene"
      viewBox="0 0 380 170"
      fill="none"
      stroke="#7A3A4B"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={`Рисунок: здание университета, ${label}`}
      data-phase={phase}
    >
      <defs>
        <radialGradient id="cs-wash" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={look.wash} stopOpacity="0.85" />
          <stop offset="0.55" stopColor={look.wash} stopOpacity="0.45" />
          <stop offset="1" stopColor={look.wash} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse
        cx="190"
        cy="92"
        rx="176"
        ry="76"
        fill="url(#cs-wash)"
        stroke="none"
      />
      {phase === "night" ? (
        <g stroke="none">
          <circle
            cx="300"
            cy="34"
            r="10"
            fill={look.light}
            opacity={look.lightOpacity}
          />
          <circle cx="305" cy="30" r="9" fill={look.wash} />
        </g>
      ) : (
        <circle
          cx={phase === "morning" ? 96 : phase === "evening" ? 286 : 190}
          cy={phase === "day" ? 52 : 66}
          r={phase === "day" ? 40 : 30}
          fill={look.light}
          stroke="none"
          opacity={look.lightOpacity}
        />
      )}
      <ellipse
        cx="190"
        cy="152"
        rx="170"
        ry="9"
        fill="#EBC9CF"
        stroke="none"
        opacity=".55"
      />
      <g opacity=".8">
        {/* Часовая башня */}
        <path d="M176 24L190 13l14 11z" fill="#EAD2D4" />
        <rect x="178" y="24" width="24" height="22" fill="#F0DADD" />
        <circle cx="190" cy="34" r="6" fill="#F8EEEC" />
        <path d="M190 34v-3.6M190 34l2.6 1.4" />
        {/* Портик */}
        <path d="M130 76L190 44l60 32z" fill="#F0DADD" />
        <path d="M142 72L190 49l48 23" opacity=".5" />
        <rect x="128" y="76" width="124" height="6" fill="#E9CDD2" />
        <path d="M150 79h80" opacity=".45" strokeDasharray="3 3" />
        {/* Крылья с мансардой */}
        <path d="M80 88l6-7h42v7z" fill="#E9CDD2" />
        <path d="M300 88l-6-7h-42v7z" fill="#E9CDD2" />
        <rect x="82" y="88" width="46" height="60" fill="#F3E2E3" />
        <rect x="252" y="88" width="46" height="60" fill="#F3E2E3" />
        <rect
          x="136"
          y="82"
          width="108"
          height="66"
          fill="#F8EEEC"
          stroke="none"
        />
        <path d="M140 84v64M156 84v64M172 84v64M208 84v64M224 84v64M240 84v64" />
        <path
          d="M178 148v-26a12 12 0 0 1 24 0v26z"
          fill={lit ? "#E9B36A" : "#D9A8B1"}
        />
        <g opacity=".7">
          {windowRows.flatMap((y) =>
            wingX.map((x) => (
              <rect
                key={`${x}-${y}`}
                x={x - 3}
                y={y}
                width="7"
                height="12"
                rx="1"
                fill={look.window}
              />
            )),
          )}
        </g>
        <path d="M120 148h140M112 153h156M104 158h172" opacity=".6" />
      </g>
      <g>
        <path d="M40 150c2-30 0-46-4-64M38 118l-14-12M40 106l12-10" />
        <circle
          cx="34"
          cy="76"
          r="26"
          fill="#C9808F"
          stroke="none"
          opacity=".55"
        />
        <circle
          cx="54"
          cy="88"
          r="18"
          fill="#B25D70"
          stroke="none"
          opacity=".45"
        />
        <circle
          cx="20"
          cy="94"
          r="15"
          fill="#E2A9B4"
          stroke="none"
          opacity=".6"
        />
      </g>
      <g>
        <path d="M338 150c-1-24 1-38 3-52" />
        <circle
          cx="340"
          cy="86"
          r="22"
          fill="#E2B97A"
          stroke="none"
          opacity=".6"
        />
        <circle
          cx="356"
          cy="98"
          r="15"
          fill="#C8C79A"
          stroke="none"
          opacity=".7"
        />
        <circle
          cx="324"
          cy="98"
          r="14"
          fill="#D8C18A"
          stroke="none"
          opacity=".6"
        />
      </g>
      <g stroke="none">
        <ellipse
          cx="300"
          cy="62"
          rx="5"
          ry="2.5"
          fill="#C9808F"
          transform="rotate(20 300 62)"
        />
        <ellipse
          cx="64"
          cy="44"
          rx="5"
          ry="2.5"
          fill="#E2B97A"
          transform="rotate(35 64 44)"
        />
        <ellipse
          cx="86"
          cy="22"
          rx="6"
          ry="3"
          fill="#C9808F"
          transform="rotate(-20 86 22)"
        />
      </g>
      <g opacity=".5">
        <path d="M30 156l10-3M60 158l12-2M310 157l12-2M344 155l10-3" />
      </g>
    </svg>
  );
}
