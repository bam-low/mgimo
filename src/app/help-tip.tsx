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
  const bubble = useRef<HTMLSpanElement>(null);
  /** Пузырь не выходит за край экрана: сдвиг внутрь, если не помещается. */
  function fit() {
    const b = bubble.current;
    if (!b) return;
    b.style.setProperty("--shift", "0px");
    const r = b.getBoundingClientRect(),
      pad = 12;
    let shift = 0;
    if (r.right > window.innerWidth - pad)
      shift = window.innerWidth - pad - r.right;
    if (r.left + shift < pad) shift = pad - r.left;
    b.style.setProperty("--shift", `${Math.round(shift)}px`);
  }
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
    <span
      className="help-tip"
      ref={box}
      data-open={open ? "" : undefined}
      onPointerEnter={fit}
      onFocus={fit}
    >
      <button
        type="button"
        className="help-tip-button"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => {
          fit();
          O(!open);
        }}
      >
        ?
      </button>
      <span role="tooltip" id={id} className="help-tip-bubble" ref={bubble}>
        {text}
      </span>
    </span>
  );
}
