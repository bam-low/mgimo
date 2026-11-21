/**
 * Фирменная загрузка «Кампуса»: знак (фронтон и колонны «вырастают» по очереди),
 * заголовок, мягкие полоски-заглушки и плашка «Демонстрационный прототип».
 * Без анимации, если пользователь просит уменьшить движение.
 */
export function BrandLoader({
  title = "Загружаем Кампус",
  hint = "Готовим ваш учебный день…",
  page = false,
  lines = 3,
  className = "",
}: {
  title?: string;
  hint?: string;
  /** На весь экран (смена страницы) или карточкой внутри страницы. */
  page?: boolean;
  lines?: number;
  /** Дополнительный класс (например, schedule-loading для расписания). */
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`brand-loader${page ? " is-page" : ""}${className ? " " + className : ""}`}
    >
      <svg
        className="brand-loader-mark"
        viewBox="0 0 104 104"
        aria-hidden="true"
      >
        <path
          className="bl-roof"
          d="M19.76 34.53 52 19.86l32.24 14.67-2.18 5.3H21.94zm6.66.93h51.16L52 23.92z"
          fillRule="evenodd"
        />
        <rect
          className="bl-beam"
          x="24.96"
          y="42.95"
          width="54.08"
          height="3.33"
        />
        <rect
          className="bl-col bl-col-1"
          x="30.68"
          y="48.88"
          width="7.07"
          height="26.52"
          rx="1"
        />
        <rect
          className="bl-col bl-col-2"
          x="48.46"
          y="48.88"
          width="7.07"
          height="26.52"
          rx="1"
        />
        <rect
          className="bl-col bl-col-3"
          x="66.25"
          y="48.88"
          width="7.07"
          height="26.52"
          rx="1"
        />
        <rect
          className="bl-step"
          x="24.96"
          y="78"
          width="54.08"
          height="3.64"
        />
        <rect
          className="bl-step"
          x="18.72"
          y="84.76"
          width="66.56"
          height="3.64"
        />
      </svg>
      <div className="brand-loader-text">
        <strong>{title}</strong>
        <span>{hint}</span>
      </div>
      {lines > 0 && (
        <div className="brand-loader-lines" aria-hidden="true">
          {Array.from({ length: lines }, (_, i) => (
            <span key={i} style={{ width: `${92 - i * 18}%` }} />
          ))}
        </div>
      )}
      <span className="brand-loader-badge">Демонстрационный прототип</span>
    </div>
  );
}
