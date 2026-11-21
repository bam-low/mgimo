"use client";
import { useEffect, useId, useRef, useState } from "react";

/** Маленький «?» в кружке: подсказка при наведении, фокусе и нажатии (телефон). */
export function HelpTip({
  text,
  label = "Подсказка",
}: {
  text: string;
  label?: string;
}) {
  const id = useId();
  const [open, O] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) O(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && O(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <span className="help-tip" ref={box} data-open={open ? "" : undefined}>
      <button
        type="button"
        className="help-tip-button"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => O(!open)}
      >
        ?
      </button>
      <span role="tooltip" id={id} className="help-tip-bubble">
        {text}
      </span>
    </span>
  );
}
