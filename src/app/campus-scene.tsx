// Акварельная иллюстрация университета для приветствия на главной студента.
// Здание читается как вуз: симметричные кирпичные крылья, портик с колоннами,
// фронтон с часами и часовая башня. Без крестов, звёзд-эмблем и гербов.
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

const SKY: Record<DayPhase, [string, string, string]> = {
  morning: ["#f2cfc6", "#f8e2d4", "#fbf1e6"],
  day: ["#c9dceb", "#e3ebef", "#f7f0e6"],
  evening: ["#b89cc0", "#eeb49d", "#f8dcc0"],
  night: ["#262b4a", "#3d4066", "#6a6283"],
};

const WINDOW: Record<DayPhase, string> = {
  morning: "#c8d2df",
  day: "#9fb2c6",
  evening: "#f2c06a",
  night: "#f6c96e",
};

const LIT = (phase: DayPhase) => phase === "evening" || phase === "night";

function windows(
  x0: number,
  y: number,
  count: number,
  step: number,
  fill: string,
  h = 10,
) {
  return Array.from({ length: count }, (_, i) => (
    <rect
      key={`${x0}-${y}-${i}`}
      x={x0 + i * step}
      y={y}
      width={7}
      height={h}
      rx={1}
      fill={fill}
    />
  ));
}

export function CampusScene({ phase }: { phase: DayPhase }) {
  const [top, mid, bottom] = SKY[phase];
  const glass = WINDOW[phase];
  const lit = LIT(phase);
  const night = phase === "night";
  const brick = night ? "#9c7f80" : "#d6a28c";
  const brickDeep = night ? "#86696d" : "#c58d78";
  const stone = night ? "#c9c0bf" : "#f1e5d2";
  const stoneShade = night ? "#ada3a8" : "#e2d2bb";
  const slate = night ? "#5c6078" : "#9aa0b2";
  const leaf = night ? ["#5e6b66", "#6f6a78"] : ["#a9b49a", "#d7a3a6"];
  return (
    <svg
      className="campus-scene"
      viewBox="0 0 380 170"
      role="img"
      aria-label={`Иллюстрация: здание университета, ${PHASES.find((p) => p.id === phase)?.label.toLowerCase()}`}
      data-phase={phase}
    >
      <defs>
        <linearGradient id="cs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="0.55" stopColor={mid} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
        <radialGradient id="cs-glow">
          <stop
            offset="0"
            stopColor={phase === "night" ? "#fff6d8" : "#fff4dc"}
            stopOpacity="0.95"
          />
          <stop
            offset="1"
            stopColor={phase === "night" ? "#fff6d8" : "#fff4dc"}
            stopOpacity="0"
          />
        </radialGradient>
        <radialGradient id="cs-lamp">
          <stop offset="0" stopColor="#ffd98a" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
        </radialGradient>
        <filter id="cs-wc" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.045"
            numOctaves="2"
            seed="7"
          />
          <feDisplacementMap in="SourceGraphic" scale="3.2" />
        </filter>
        <filter id="cs-paper">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="2"
            seed="2"
          />
          <feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0.35 0" />
        </filter>
        <filter id="cs-ragged" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.035"
            numOctaves="3"
            seed="11"
          />
          <feDisplacementMap in="SourceGraphic" scale="14" />
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        <mask
          id="cs-edge"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="380"
          height="170"
        >
          <rect
            x="9"
            y="8"
            width="362"
            height="154"
            rx="16"
            fill="#fff"
            filter="url(#cs-ragged)"
          />
        </mask>
        <filter id="cs-soft">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>

      <g mask="url(#cs-edge)">
        <rect width="380" height="170" fill="url(#cs-sky)" />
        <g filter="url(#cs-soft)" opacity="0.35">
          <ellipse cx="110" cy="60" rx="70" ry="26" fill={mid} />
          <ellipse cx="300" cy="96" rx="80" ry="22" fill={bottom} />
          <ellipse cx="220" cy="20" rx="90" ry="16" fill={top} />
        </g>

        {/* Светила */}
        {phase === "morning" && (
          <g>
            <circle cx="338" cy="92" r="34" fill="url(#cs-glow)" />
            <circle cx="338" cy="92" r="11" fill="#f9d2a6" />
          </g>
        )}
        {phase === "day" && (
          <g>
            <circle cx="320" cy="34" r="30" fill="url(#cs-glow)" />
            <circle cx="320" cy="34" r="11" fill="#fbe3a8" />
          </g>
        )}
        {phase === "evening" && (
          <g>
            <circle
              cx="352"
              cy="104"
              r="40"
              fill="#f6b183"
              opacity="0.45"
              filter="url(#cs-soft)"
            />
            <circle cx="352" cy="106" r="13" fill="#f0a072" />
            <circle cx="96" cy="30" r="5" fill="#f8efe0" opacity="0.8" />
          </g>
        )}
        {night && (
          <g>
            <circle
              cx="318"
              cy="34"
              r="26"
              fill="url(#cs-glow)"
              opacity="0.5"
            />
            <circle cx="318" cy="34" r="10" fill="#f3ead2" />
            <circle cx="323" cy="30" r="9" fill={top} />
            {[
              [150, 20],
              [196, 12],
              [268, 22],
              [352, 58],
              [120, 44],
              [240, 40],
            ].map(([x, y]) => (
              <circle
                key={`${x}-${y}`}
                cx={x}
                cy={y}
                r="0.9"
                fill="#f3ead2"
                opacity="0.8"
              />
            ))}
          </g>
        )}

        {/* Облака */}
        {!night && (
          <g
            fill="#fff"
            opacity={phase === "evening" ? 0.35 : 0.6}
            filter="url(#cs-soft)"
          >
            <ellipse cx="150" cy="40" rx="30" ry="6" />
            <ellipse cx="270" cy="58" rx="22" ry="5" />
          </g>
        )}

        {/* Дальний план */}
        <path
          d="M60 150C110 128 150 134 190 130S300 124 380 136V170H60Z"
          fill={night ? "#3f4560" : "#dcd5c3"}
          opacity="0.6"
        />

        <g filter="url(#cs-wc)">
          {/* Часовая башня */}
          <rect x="212" y="46" width="26" height="34" fill={stone} />
          <rect x="212" y="46" width="26" height="3" fill={stoneShade} />
          <circle
            cx="225"
            cy="60"
            r="7.2"
            fill="#fbf6ec"
            stroke={stoneShade}
            strokeWidth="1.2"
          />
          <path
            d="M225 60V55.4M225 60L228.4 61.6"
            stroke="#5b4b4f"
            strokeWidth="1"
            strokeLinecap="round"
          />
          <rect x="215.5" y="70" width="5" height="8" rx="2.5" fill={glass} />
          <rect x="229.5" y="70" width="5" height="8" rx="2.5" fill={glass} />
          <rect x="216" y="34" width="18" height="12" fill={stone} />
          <rect
            x="219"
            y="36.5"
            width="4"
            height="8"
            rx="2"
            fill={night ? "#3c3f5a" : "#b9a998"}
          />
          <rect
            x="227"
            y="36.5"
            width="4"
            height="8"
            rx="2"
            fill={night ? "#3c3f5a" : "#b9a998"}
          />
          <rect x="214" y="32" width="22" height="2.6" fill={stoneShade} />
          <path d="M215 32L225 16L235 32Z" fill={slate} />
          <path d="M225 16V10" stroke={slate} strokeWidth="1.2" />
          <circle cx="225" cy="9.5" r="1.4" fill={slate} />

          {/* Крылья: кирпич, белые карнизы, мансардная кровля */}
          <path d="M118 92L124 84H190V92Z" fill={slate} />
          <path d="M332 92L326 84H260V92Z" fill={slate} />
          <rect x="118" y="92" width="74" height="58" fill={brick} />
          <rect x="258" y="92" width="74" height="58" fill={brick} />
          <rect x="116" y="91" width="78" height="2.6" fill={stone} />
          <rect x="256" y="91" width="78" height="2.6" fill={stone} />
          <rect x="118" y="116" width="74" height="1.8" fill={stone} />
          <rect x="258" y="116" width="74" height="1.8" fill={stone} />
          <rect x="118" y="146" width="74" height="4" fill={brickDeep} />
          <rect x="258" y="146" width="74" height="4" fill={brickDeep} />
          {windows(125, 98, 6, 11, glass, 12)}
          {windows(265, 98, 6, 11, glass, 12)}
          {windows(125, 123, 6, 11, glass, 14)}
          {windows(265, 123, 6, 11, glass, 14)}

          {/* Центральный корпус с портиком */}
          <rect x="192" y="80" width="66" height="70" fill={stone} />
          <path
            d="M188 96L225 76L262 96Z"
            fill={stone}
            stroke={stoneShade}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <circle
            cx="225"
            cy="89"
            r="4.6"
            fill="#fbf6ec"
            stroke={stoneShade}
            strokeWidth="1"
          />
          <path
            d="M225 89V86.2M225 89L227.2 90"
            stroke="#5b4b4f"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
          <rect x="188" y="96" width="74" height="5" fill={stoneShade} />
          <rect
            x="196"
            y="104"
            width="58"
            height="34"
            fill={night ? "#8f8794" : "#e6d6c1"}
          />
          {windows(200, 108, 5, 11, glass, 11)}
          <path
            d="M219 138V124a6 6 0 0 1 12 0V138Z"
            fill={lit ? "#e8b25c" : "#8c6c5d"}
          />
          {[195, 206, 217, 229, 240, 251].map((x) => (
            <g key={x}>
              <rect x={x} y="101" width="4.4" height="38" fill="#fbf4e8" />
              <rect
                x={x - 0.8}
                y="101"
                width="6"
                height="2"
                fill={stoneShade}
              />
              <rect
                x={x - 0.8}
                y="137"
                width="6"
                height="2"
                fill={stoneShade}
              />
            </g>
          ))}

          {/* Парадная лестница */}
          <path d="M190 139H260L268 150H182Z" fill={stoneShade} />
          <path
            d="M187 143.4H263M184.5 147H265.5"
            stroke={stone}
            strokeWidth="1.1"
          />

          {/* Фонари */}
          {[176, 274].map((x) => (
            <g key={x}>
              <rect
                x={x - 0.7}
                y="130"
                width="1.4"
                height="20"
                fill="#5b4b4f"
              />
              <rect
                x={x - 2.2}
                y="126"
                width="4.4"
                height="5"
                rx="1"
                fill={lit ? "#ffd98a" : "#5b4b4f"}
              />
            </g>
          ))}

          {/* Деревья */}
          <g opacity="0.92">
            <ellipse cx="104" cy="128" rx="17" ry="22" fill={leaf[0]} />
            <ellipse
              cx="90"
              cy="138"
              rx="12"
              ry="14"
              fill={leaf[1]}
              opacity="0.85"
            />
            <ellipse
              cx="116"
              cy="140"
              rx="11"
              ry="10"
              fill={leaf[1]}
              opacity="0.7"
            />
            <rect x="102.5" y="140" width="3" height="10" fill="#7a5f58" />
            <ellipse cx="348" cy="126" rx="18" ry="24" fill={leaf[0]} />
            <ellipse
              cx="362"
              cy="138"
              rx="12"
              ry="14"
              fill={leaf[1]}
              opacity="0.85"
            />
            <ellipse
              cx="336"
              cy="141"
              rx="10"
              ry="9"
              fill={leaf[1]}
              opacity="0.7"
            />
            <rect x="346.5" y="140" width="3" height="10" fill="#7a5f58" />
          </g>
        </g>

        {/* Свет фонарей и окон в тёмное время */}
        {lit && (
          <g>
            <circle cx="176" cy="128" r="9" fill="url(#cs-lamp)" />
            <circle cx="274" cy="128" r="9" fill="url(#cs-lamp)" />
          </g>
        )}

        {/* Дорожка и земля */}
        <path d="M60 150H380V170H60Z" fill={night ? "#4a4d63" : "#e7dccb"} />
        <path
          d="M182 150H268L300 170H150Z"
          fill={night ? "#5b5c70" : "#efe5d4"}
        />

        <rect
          width="380"
          height="170"
          filter="url(#cs-paper)"
          opacity="0.26"
          style={{ mixBlendMode: "multiply" }}
        />
      </g>
    </svg>
  );
}
