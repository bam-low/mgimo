// Original simple icon geometry for Issue #34, authorized by owner clarification.
// No external icon package, copied Figma path or runtime asset service.
const paths = {
  bell: <path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5Zm5 3h4" />,
  home: (
    <>
      <rect x="3" y="3" width="6" height="6" />
      <rect x="15" y="3" width="6" height="6" />
      <rect x="3" y="15" width="6" height="6" />
      <rect x="15" y="15" width="6" height="6" />
    </>
  ),
  document: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 7h6M9 11h6M9 15h4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v5m10-5v5M3 10h18M7 14h3m4 0h3m-10 4h3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3" />
      <path d="M5 21v-2c0-7 14-7 14 0v2Z" />
    </>
  ),
  structure: (
    <>
      <path d="m3 8 9-5 9 5-9 5Zm0 5 9 5 9-5M3 18l9 5 9-5" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20v-2c0-6 12-6 12 0v2M16 5c5 0 5 6 1 7m1 3c3 0 4 2 4 5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  room: (
    <>
      <path d="M4 21V5l10-2v18M2 21h20M14 6h6v15m-10-9h.1" />
    </>
  ),
  book: (
    <>
      <path d="M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2Zm9 2v15" />
    </>
  ),
  arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  plus: <path d="M12 4v16M4 12h16" />,
  edit: (
    <>
      <path d="m4 16 12-12 4 4L8 20l-5 1Z" />
      <path d="m13 7 4 4" />
    </>
  ),
  check: <path d="m5 12 4 4L20 5" />,
  close: <path d="m5 5 14 14M5 19 19 5" />,
  building: (
    <>
      <path d="m3 8 9-5 9 5Zm0 13h18M5 10v8m5-8v8m4-8v8m5-8v8" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  "chevron-left": <path d="m15 5-7 7 7 7" />,
  "chevron-right": <path d="m9 5 7 7-7 7" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
} satisfies Record<string, React.ReactNode>;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      className={`ui-icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
