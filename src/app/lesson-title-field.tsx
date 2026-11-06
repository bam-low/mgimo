"use client";
import { useEffect, useRef } from "react";
export function LessonTitleField({ initialValue }: { initialValue?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  function fit() {
    const field = ref.current;
    if (!field) return;
    field.style.height = "auto";
    const available = Math.min(
      (window.visualViewport?.height ?? window.innerHeight) * 0.45,
      (field.closest(".workspace-scroll")?.clientHeight || window.innerHeight) -
        32,
    );
    field.style.height =
      Math.min(field.scrollHeight, Math.max(44, available)) + "px";
  }
  useEffect(() => {
    const field = ref.current;
    if (!field) return;
    let width = -1;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next !== width) {
        width = next;
        fit();
      }
    });
    observer.observe(field);
    const resize = () => {
      fit();
      if (document.activeElement === field)
        field.scrollIntoView({ block: "center", behavior: "auto" });
    };
    window.visualViewport?.addEventListener("resize", resize);
    fit();
    void document.fonts.ready.then(fit);
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, []);
  return (
    <label>
      Дисциплина
      <textarea
        ref={ref}
        aria-label="Дисциплина"
        name="title"
        rows={3}
        required
        maxLength={160}
        defaultValue={initialValue}
        onInput={fit}
      />
    </label>
  );
}
