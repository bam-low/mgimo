// Рисунок для приветствия на главной студента: университет с часовой башней,
// портиком на шесть колонн, крыльями и лестницей, деревья по бокам. Мягкая
// акварельная манера по референсу владельца. Время суток меняет небо, светило,
// тон здания и свет в окнах; рамки нет — фон растворяется в карточке.
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

type Look = {
  wash: string;
  light: string;
  lightAt: [number, number];
  cloud: string;
  windowTop: string;
  windowBottom: string;
  /** Тонировка всей сцены (умножение), прозрачность. */
  tint?: [string, number];
};

const LOOK: Record<DayPhase, Look> = {
  morning: {
    wash: "#FBE6DD",
    light: "#F6C46A",
    lightAt: [126, 74],
    cloud: "#F2C3CF",
    windowTop: "#F2B4A6",
    windowBottom: "#F7D6A2",
  },
  day: {
    wash: "#E8EFF3",
    light: "#F9DC8A",
    lightAt: [118, 50],
    cloud: "#FFFFFF",
    windowTop: "#E9DDE5",
    windowBottom: "#F6EEF1",
  },
  evening: {
    wash: "#F6CDBA",
    light: "#F09A6E",
    lightAt: [128, 96],
    cloud: "#E9B3C2",
    windowTop: "#F1AE5E",
    windowBottom: "#F8D18A",
    tint: ["#F2BFA6", 0.22],
  },
  night: {
    wash: "#CFCADF",
    light: "#F6EFD9",
    lightAt: [308, 44],
    cloud: "#D9D3E6",
    windowTop: "#F6C766",
    windowBottom: "#FBE19C",
    tint: ["#8C88AC", 0.34],
  },
};

const STROKE = "#C68C93";

export function CampusScene({ phase }: { phase: DayPhase }) {
  const look = LOOK[phase];
  const night = phase === "night";
  const lit = phase === "evening" || night;
  const label = PHASES.find((p) => p.id === phase)?.label.toLowerCase();
  const [lx, ly] = look.lightAt;
  const wingWindows = [101, 114, 127, 252, 265, 278].flatMap((x) =>
    [108, 129].map((y) => ({ x, y })),
  );
  return (
    <svg
      className="campus-scene"
      viewBox="0 0 380 197"
      role="img"
      aria-label={`Рисунок: здание университета, ${label}`}
      data-phase={phase}
    >
      <defs>
        <radialGradient id="cs-wash" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={look.wash} stopOpacity="0.95" />
          <stop offset="0.6" stopColor={look.wash} stopOpacity="0.5" />
          <stop offset="1" stopColor={look.wash} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cs-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F8DDD7" />
          <stop offset="1" stopColor="#F1CDC9" />
        </linearGradient>
        <linearGradient id="cs-window" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={look.windowTop} />
          <stop offset="1" stopColor={look.windowBottom} />
        </linearGradient>
        <linearGradient id="cs-door" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={lit ? "#E8A267" : "#E7A0A8"} />
          <stop offset="1" stopColor={lit ? "#D9844F" : "#D98893"} />
        </linearGradient>
        <radialGradient id="cs-tint" cx="0.5" cy="0.5" r="0.5">
          <stop
            offset="0"
            stopColor={look.tint?.[0] ?? "#fff"}
            stopOpacity={look.tint?.[1] ?? 0}
          />
          <stop
            offset="0.65"
            stopColor={look.tint?.[0] ?? "#fff"}
            stopOpacity={(look.tint?.[1] ?? 0) * 0.7}
          />
          <stop
            offset="1"
            stopColor={look.tint?.[0] ?? "#fff"}
            stopOpacity="0"
          />
        </radialGradient>
        <radialGradient id="cs-glow">
          <stop offset="0" stopColor="#FFD98A" stopOpacity="0.85" />
          <stop offset="1" stopColor="#FFD98A" stopOpacity="0" />
        </radialGradient>
        {/* Мягкие «акварельные» края у крон, кустов, облаков и светила */}
        <filter id="cs-wc" x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.05"
            numOctaves="2"
            seed="5"
          />
          <feDisplacementMap in="SourceGraphic" scale="3.2" />
          <feGaussianBlur stdDeviation="0.5" />
        </filter>
        <filter id="cs-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>

      {/* Небо: пятно, растворяющееся к краям */}
      <ellipse cx="190" cy="100" rx="180" ry="90" fill="url(#cs-wash)" />

      {/* Облака */}
      <g filter="url(#cs-soft)" opacity={night ? 0.45 : 0.6}>
        <ellipse cx="92" cy="58" rx="26" ry="9" fill={look.cloud} />
        <ellipse cx="110" cy="52" rx="16" ry="8" fill={look.cloud} />
        <ellipse cx="272" cy="60" rx="30" ry="10" fill={look.cloud} />
        <ellipse cx="292" cy="54" rx="18" ry="8" fill={look.cloud} />
      </g>

      {/* Светило: солнце за зданием или луна */}
      {night ? (
        <g>
          <circle cx={lx} cy={ly} r="18" fill="url(#cs-glow)" opacity="0.4" />
          <circle cx={lx} cy={ly} r="9" fill={look.light} />
          <circle cx={lx + 4} cy={ly - 3} r="8" fill={look.wash} />
          {[
            [70, 30],
            [150, 22],
            [236, 26],
            [338, 70],
            [52, 64],
          ].map(([x, y]) => (
            <circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r="0.9"
              fill="#FFF7E6"
              opacity="0.85"
            />
          ))}
        </g>
      ) : (
        <circle
          cx={lx}
          cy={ly}
          r="31"
          fill={look.light}
          opacity="0.72"
          filter="url(#cs-wc)"
        />
      )}

      {/* Земля */}
      <ellipse
        cx="190"
        cy="156"
        rx="170"
        ry="12"
        fill="#F1CFD3"
        opacity="0.6"
        filter="url(#cs-soft)"
      />

      {/* Кусты за деревьями */}
      <g filter="url(#cs-wc)" opacity="0.85">
        <ellipse cx="78" cy="144" rx="16" ry="9" fill="#D9C68F" />
        <ellipse cx="90" cy="146" rx="10" ry="7" fill="#E4D2A2" />
        <ellipse cx="304" cy="143" rx="15" ry="9" fill="#CFC58F" />
        <ellipse cx="292" cy="146" rx="10" ry="7" fill="#E1D3A3" />
      </g>

      {/* Здание */}
      <g stroke={STROKE} strokeWidth="0.9" strokeLinejoin="round">
        {/* Крылья */}
        <path d="M93 96 96 91H138V96Z" fill="#E7BDC0" />
        <path d="M293 96 290 91H248V96Z" fill="#E7BDC0" />
        <rect x="95" y="96" width="43" height="55" fill="url(#cs-wall)" />
        <rect x="248" y="96" width="43" height="55" fill="url(#cs-wall)" />
        {wingWindows.map(({ x, y }) => (
          <rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width="7"
            height="11"
            rx="0.6"
            fill="url(#cs-window)"
          />
        ))}
        {/* Портик */}
        <rect x="138" y="89" width="110" height="62" fill="#F6D9D3" />
        <path d="M134 86 193 56 252 86Z" fill="#F5D7D1" />
        <path d="M145 83 193 60 241 83" fill="none" opacity="0.55" />
        <rect x="134" y="86" width="118" height="4" fill="#F0CCC7" />
        <path d="M140 92.2H246" strokeDasharray="2.6 2.2" opacity="0.5" />
        {[142, 158, 174, 204, 220, 236].map((x) => (
          <g key={x}>
            <rect x={x - 1.2} y="94" width="10.4" height="2.2" fill="#F3DCD6" />
            <rect x={x} y="96" width="8" height="51" fill="#FBEDE8" />
            <rect
              x={x - 1.2}
              y="146.5"
              width="10.4"
              height="2.4"
              fill="#F3DCD6"
            />
          </g>
        ))}
        <path d="M184 151V124a9.5 9.5 0 0 1 19 0V151Z" fill="url(#cs-door)" />
        {/* Часовая башня */}
        <path d="M176 36 192 25 208 36Z" fill="#F2CFCA" />
        <rect x="179" y="36" width="26" height="20" fill="#F7DED8" />
        <rect x="177" y="55" width="30" height="3" fill="#F0CCC7" />
        <circle cx="192" cy="45.5" r="6.3" fill="#FFF8F4" />
        <path d="M192 45.5V41.6M192 45.5 194.8 47.2" strokeLinecap="round" />
        {/* Лестница */}
        <path d="M124 151H262L266 156H120Z" fill="#F3D6D1" />
        <path d="M120 156H266L270 161H116Z" fill="#F0CFCA" />
      </g>

      {/* Деревья: розовое слева, жёлто-зелёное справа */}
      <g>
        <path
          d="M58 153C58 136 57 118 58 98M58 120 46 108M58 112 70 100M58 128 66 120"
          stroke="#B88282"
          strokeWidth="1.3"
          fill="none"
          strokeLinecap="round"
        />
        <g filter="url(#cs-wc)">
          <circle cx="50" cy="94" r="17" fill="#F2B0BF" opacity="0.85" />
          <circle cx="66" cy="88" r="15" fill="#EC98AB" opacity="0.8" />
          <circle cx="40" cy="108" r="12" fill="#F6C3CD" opacity="0.85" />
          <circle cx="70" cy="106" r="13" fill="#EFA6B6" opacity="0.8" />
        </g>
        <path
          d="M326 153C326 138 327 124 326 106M326 128 316 118M326 120 336 110"
          stroke="#B88A78"
          strokeWidth="1.2"
          fill="none"
          strokeLinecap="round"
        />
        <g filter="url(#cs-wc)">
          <circle cx="320" cy="98" r="14" fill="#F4D27C" opacity="0.85" />
          <circle cx="334" cy="104" r="13" fill="#C9C68D" opacity="0.8" />
          <circle cx="314" cy="112" r="11" fill="#EFC56E" opacity="0.8" />
          <circle cx="336" cy="90" r="10" fill="#F6DD98" opacity="0.8" />
        </g>
      </g>

      {/* Летящие листья */}
      <g opacity="0.85">
        <ellipse
          cx="116"
          cy="33"
          rx="4.4"
          ry="2"
          fill="#EBA1B0"
          transform="rotate(-28 116 33)"
        />
        <ellipse
          cx="86"
          cy="54"
          rx="3.6"
          ry="1.7"
          fill="#F2CF7C"
          transform="rotate(24 86 54)"
        />
        <ellipse
          cx="293"
          cy="72"
          rx="3.8"
          ry="1.7"
          fill="#EBA1B0"
          transform="rotate(18 293 72)"
        />
      </g>

      {/* Тонировка вечера и ночи */}
      {look.tint && (
        <ellipse
          cx="190"
          cy="100"
          rx="185"
          ry="96"
          fill="url(#cs-tint)"
          style={{ mixBlendMode: "multiply" }}
        />
      )}

      {/* Свет в окнах и у входа поверх тонировки */}
      {lit && (
        <g style={{ mixBlendMode: "screen" }}>
          {wingWindows.map(({ x, y }) => (
            <rect
              key={`g-${x}-${y}`}
              x={x}
              y={y}
              width="7"
              height="11"
              rx="0.6"
              fill="url(#cs-window)"
              opacity={night ? 0.9 : 0.55}
            />
          ))}
          <circle
            cx="193.5"
            cy="138"
            r="16"
            fill="url(#cs-glow)"
            opacity={night ? 0.7 : 0.4}
          />
        </g>
      )}
    </svg>
  );
}
