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
}: {
  label: string;
  name?: string;
  kind?: "date" | "time";
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
}) {
  const id = useId();
  const source = value ?? defaultValue;
  const format = (v: string) => (kind === "date" ? displayDate(v) : v);
  const [text, T] = useState(format(source));
  const [picker, P] = useState(false);
  const native = useRef<HTMLInputElement>(null);
  const visible = useRef<HTMLInputElement>(null);
  const canonical = kind === "date" ? parseDate(text) : parseTime(text);
  useEffect(() => {
    T(kind === "date" ? displayDate(source) : source);
  }, [source, kind]);
  useEffect(() => {
    P(typeof native.current?.showPicker === "function");
  }, []);
  useLayoutEffect(() => {
    visible.current?.setCustomValidity(
      text && !canonical
        ? kind === "date"
          ? "Введите существующую дату ДД.ММ.ГГГГ (2000–2100)."
          : "Введите время ЧЧ:ММ от 00:00 до 23:59."
        : "",
    );
  }, [text, canonical, kind]);
  function change(raw: string) {
    const parsed = kind === "date" ? parseDate(raw) : parseTime(raw);
    // Validate in the input event, before a submit or automation can read the DOM.
    visible.current?.setCustomValidity(
      raw && !parsed
        ? kind === "date"
          ? "Введите существующую дату ДД.ММ.ГГГГ (2000–2100)."
          : "Введите время ЧЧ:ММ от 00:00 до 23:59."
        : "",
    );
    T(raw);
    onValueChange?.(parsed);
  }
  return (
    <div className="localized-field">
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
        <input
          ref={native}
          className="native-schedule-picker"
          type={kind}
          value={canonical}
          min={kind === "date" ? "2000-01-01" : undefined}
          max={kind === "date" ? "2100-12-31" : undefined}
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
            onClick={() => {
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
      </div>
    </div>
  );
}
