"use client";
import { useId, useRef, useState, useEffect, useLayoutEffect } from "react";
import { Icon } from "./ui-icon";
import { displayDate, parseDate, parseTime } from "./schedule-input-values";

/** Visible ru fields are deterministic; the optional native picker keeps ISO. */
export function ScheduleField({
  label,
  name,
  kind = "date",
  defaultValue = "",
  value,
  onValueChange,
  required = false,
  broad = false,
}: {
  label: string;
  name?: string;
  kind?: "date" | "time";
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  broad?: boolean;
}) {
  const id = useId();
  const source = value ?? defaultValue;
  const format = (v: string) => (kind === "date" ? displayDate(v) : v);
  const [text, T] = useState(format(source));
  const [picker, P] = useState(false);
  const native = useRef<HTMLInputElement>(null);
  const visible = useRef<HTMLInputElement>(null);
  const canonical = kind === "date" ? parseDate(text, broad) : parseTime(text);
  useEffect(() => {
    T(kind === "date" ? displayDate(source) : source);
  }, [source, kind]);
  const [open, O] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The calendar button doubles as the client-ready signal (see E2E).
    P(kind === "date" || typeof native.current?.showPicker === "function");
  }, [kind]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) O(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useLayoutEffect(() => {
    visible.current?.setCustomValidity(
      text && !canonical
        ? kind === "date"
          ? `Введите существующую дату ДД.ММ.ГГГГ${broad ? "." : " (2000–2100)."}`
          : "Введите время ЧЧ:ММ от 00:00 до 23:59."
        : "",
    );
  }, [text, canonical, kind, broad]);
  function change(raw: string) {
    const parsed = kind === "date" ? parseDate(raw, broad) : parseTime(raw);
    // Validate in the input event, before a submit or automation can read the DOM.
    visible.current?.setCustomValidity(
      raw && !parsed
        ? kind === "date"
          ? `Введите существующую дату ДД.ММ.ГГГГ${broad ? "." : " (2000–2100)."}`
          : "Введите время ЧЧ:ММ от 00:00 до 23:59."
        : "",
    );
    T(raw);
    onValueChange?.(parsed);
  }
  return (
    <div className="localized-field" ref={box}>
      <label htmlFor={id}>{label}</label>
      <div className="localized-control">
        <input
          ref={visible}
          id={id}
          type="text"
          value={text}
          required={required}
          inputMode="text"
          placeholder={kind === "date" ? "ДД.ММ.ГГГГ" : "ЧЧ:ММ"}
          maxLength={kind === "date" ? 10 : 5}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => change(e.target.value)}
        />
        {name && <input type="hidden" name={name} value={canonical} />}
        {/* Скрытое системное поле: значение ISO для нативного выбора и автоматизации;
            для даты видимый выбор — свой календарь на кнопке. */}
        <input
          ref={native}
          className="native-schedule-picker"
          type={kind}
          value={canonical}
          min={
            kind === "date" ? (broad ? "0001-01-01" : "2000-01-01") : undefined
          }
          max={
            kind === "date" ? (broad ? "9999-12-31" : "2100-12-31") : undefined
          }
          tabIndex={-1}
          aria-hidden="true"
          lang="ru"
          onChange={(e) => change(format(e.target.value))}
        />
        {picker && (
          <button
            className="picker-trigger secondary"
            type="button"
            aria-label={`${kind === "date" ? "Открыть календарь" : "Выбрать время"}: ${label}`}
            aria-expanded={kind === "date" ? open : undefined}
            aria-haspopup={kind === "date" ? "dialog" : undefined}
            onClick={() => {
              if (kind === "date") {
                O(!open);
                return;
              }
              try {
                native.current?.showPicker();
              } catch {
                visible.current?.focus();
              }
            }}
          >
            <Icon name={kind === "date" ? "calendar" : "clock"} />
          </button>
        )}
        {open && kind === "date" && (
          <CalendarPopover
            label={label}
            value={canonical}
            broad={broad}
            onPick={(iso) => {
              change(displayDate(iso));
              O(false);
              visible.current?.focus();
            }}
            onClose={() => {
              O(false);
              visible.current?.focus();
            }}
          />
        )}
      </div>
    </div>
  );
}

const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const iso = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, "0")}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
function todayIso() {
  const now = new Date();
  return iso(now.getFullYear(), now.getMonth(), now.getDate());
}
function shiftIso(value: string, days: number) {
  const d = new Date(value + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Календарь в стиле системы вместо нативного: месяц, неделя с понедельника, клавиатура. */
function CalendarPopover({
  label,
  value,
  broad,
  onPick,
  onClose,
}: {
  label: string;
  value: string;
  broad: boolean;
  onPick: (iso: string) => void;
  onClose: () => void;
}) {
  const today = todayIso();
  const [focus, F] = useState(value || today);
  const year = Number(focus.slice(0, 4)),
    month = Number(focus.slice(5, 7)) - 1;
  const grid = useRef<HTMLDivElement>(null);
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const inRange = (v: string) =>
    broad
      ? v >= "0001-01-01" && v <= "9999-12-31"
      : v >= "2000-01-01" && v <= "2100-12-31";
  useEffect(() => {
    grid.current
      ?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)
      ?.focus();
  }, [focus]);
  const moveMonth = (delta: number) => {
    const d = new Date(Date.UTC(year, month + delta, 1));
    const last = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
    const next = iso(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      Math.min(Number(focus.slice(8, 10)), last),
    );
    if (inRange(next)) F(next);
  };
  return (
    <div
      className="calendar-popover"
      role="dialog"
      aria-label={`Календарь: ${label}`}
      onKeyDown={(e) => {
        const step: Record<string, number> = {
          ArrowLeft: -1,
          ArrowRight: 1,
          ArrowUp: -7,
          ArrowDown: 7,
        };
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        } else if (step[e.key] && (e.target as HTMLElement).dataset.day) {
          e.preventDefault();
          const next = shiftIso(focus, step[e.key]);
          if (inRange(next)) F(next);
        } else if (e.key === "PageUp" || e.key === "PageDown") {
          e.preventDefault();
          moveMonth(e.key === "PageUp" ? -1 : 1);
        }
      }}
    >
      <div className="calendar-head">
        <button
          type="button"
          className="calendar-nav"
          aria-label="Предыдущий месяц"
          onClick={() => moveMonth(-1)}
        >
          <Icon name="chevron-left" />
        </button>
        <strong aria-live="polite">
          {MONTHS[month]} {year}
        </strong>
        <button
          type="button"
          className="calendar-nav"
          aria-label="Следующий месяц"
          onClick={() => moveMonth(1)}
        >
          <Icon name="chevron-right" />
        </button>
      </div>
      <div className="calendar-grid" ref={grid} role="grid">
        {WEEKDAYS.map((w) => (
          <span key={w} className="calendar-weekday" aria-hidden="true">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`e${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const day = iso(year, month, i + 1);
          return (
            <button
              key={day}
              type="button"
              data-day={day}
              tabIndex={day === focus ? 0 : -1}
              aria-pressed={day === value}
              aria-current={day === today ? "date" : undefined}
              aria-label={displayDate(day)}
              disabled={!inRange(day)}
              className="calendar-day"
              onClick={() => onPick(day)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="calendar-foot">
        <button
          type="button"
          className="calendar-link"
          onClick={() => onPick(today)}
        >
          Сегодня
        </button>
        <button type="button" className="calendar-link" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
