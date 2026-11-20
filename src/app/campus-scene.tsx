// Акварельная иллюстрация для приветствия на главной студента: та же картина,
// что на первом экране, «переосвещённая» под время суток. Без чётких контуров:
// размытое небо, мягкие тонировки, светящиеся окна, рваный акварельный край.
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
  {
    sky: [string, string, string];
    wash: string;
    tint: string;
    tintOpacity: number;
    glow: number;
  }
> = {
  morning: {
    sky: ["#f1cfc8", "#f7e3d6", "#fbf2e8"],
    wash: "#f4c9b8",
    tint: "#f6d2c4",
    tintOpacity: 0.32,
    glow: 0,
  },
  day: {
    sky: ["#cfe0ec", "#e6edf0", "#f8f1e7"],
    wash: "#bcd3e4",
    tint: "#ffffff",
    tintOpacity: 0,
    glow: 0,
  },
  evening: {
    sky: ["#bfa1c4", "#eab39e", "#f8dcc1"],
    wash: "#e79c80",
    tint: "#e7a17f",
    tintOpacity: 0.34,
    glow: 0.65,
  },
  night: {
    sky: ["#252a49", "#3a3d63", "#5e5878"],
    wash: "#4b4f7c",
    tint: "#343a68",
    tintOpacity: 0.62,
    glow: 1,
  },
};

/** Окна картины (в координатах сцены 380×170). */
const WINDOWS: [number, number][] = [
  [213.7, 91.8],
  [233.0, 93.6],
  [251.5, 93.6],
  [269.1, 95.3],
  [212.5, 127.0],
  [269.1, 129.6],
  [251.5, 134.9],
  [171.2, 87.4],
  [171.9, 121.7],
  [146.9, 119.0],
  [146.9, 77.7],
  [297.7, 104.1],
  [310.4, 106.4],
  [321.8, 108.5],
  [332.4, 108.5],
  [298.4, 132.8],
  [310.4, 131.7],
  [321.8, 132.2],
  [233.0, 127.8],
];

export function CampusScene({ phase }: { phase: DayPhase }) {
  const look = LOOK[phase];
  const [top, mid, bottom] = look.sky;
  const label = PHASES.find((p) => p.id === phase)?.label.toLowerCase();
  return (
    <svg
      className="campus-scene"
      viewBox="0 0 380 170"
      role="img"
      aria-label={`Акварель: здание университета, ${label}`}
      data-phase={phase}
    >
      <defs>
        <linearGradient id="cs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="0.6" stopColor={mid} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
        <filter id="cs-wash" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.02"
            numOctaves="3"
            seed="4"
          />
          <feDisplacementMap in="SourceGraphic" scale="26" />
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id="cs-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
        <filter id="cs-ragged" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.035"
            numOctaves="3"
            seed="11"
          />
          <feDisplacementMap in="SourceGraphic" scale="24" />
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <mask
          id="cs-edge"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="380"
          height="170"
        >
          <rect x="20" y="16" width="344" height="140" rx="30"
            fill="#fff"
            filter="url(#cs-ragged)"
          />
        </mask>
        <filter id="cs-paper">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="2"
            seed="2"
          />
          <feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0.35 0" />
        </filter>
      </defs>
      <g mask="url(#cs-edge)">
        <rect width="380" height="170" fill="url(#cs-sky)" />
        <g filter="url(#cs-wash)" opacity="0.55">
          <ellipse cx="90" cy="54" rx="80" ry="30" fill={look.wash} />
          <ellipse cx="250" cy="22" rx="110" ry="22" fill={mid} />
          <ellipse cx="330" cy="120" rx="70" ry="34" fill={look.wash} />
        </g>
        {phase === "morning" && (
          <circle
            cx="62"
            cy="96"
            r="16"
            fill="#fbd7b0"
            opacity="0.85"
            filter="url(#cs-blur)"
          />
        )}
        {phase === "day" && (
          <circle
            cx="70"
            cy="38"
            r="14"
            fill="#fde8b4"
            opacity="0.9"
            filter="url(#cs-blur)"
          />
        )}
        {phase === "evening" && (
          <circle
            cx="56"
            cy="112"
            r="20"
            fill="#f19c70"
            opacity="0.7"
            filter="url(#cs-blur)"
          />
        )}
        {phase === "night" && (
          <g filter="url(#cs-blur)">
            <circle cx="66" cy="38" r="20" fill="#f6eed4" opacity="0.25" />
            <circle cx="66" cy="38" r="9" fill="#f6eed4" opacity="0.9" />
          </g>
        )}
        <image
          href="/design/campus-watercolor.png"
          x="110"
          y="-4"
          width="270"
          height="180"
          preserveAspectRatio="xMidYMid meet"
        />
        {look.tintOpacity > 0 && (
          <rect
            width="380"
            height="170"
            fill={look.tint}
            opacity={look.tintOpacity}
            style={{ mixBlendMode: "multiply" }}
          />
        )}
        {look.glow > 0 && (
          <g
            filter="url(#cs-blur)"
            opacity={look.glow}
            style={{ mixBlendMode: "screen" }}
          >
            {WINDOWS.map(([x, y]) => (
              <ellipse
                key={`${x}-${y}`}
                cx={x}
                cy={y}
                rx="4.2"
                ry="6"
                fill="#ffd27a"
              />
            ))}
          </g>
        )}
        <rect
          width="380"
          height="170"
          filter="url(#cs-paper)"
          opacity="0.2"
          style={{ mixBlendMode: "multiply" }}
        />
      </g>
    </svg>
  );
}
