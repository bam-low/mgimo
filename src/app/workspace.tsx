"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** Mobile navigation owns a flex row; only this region scrolls behind no UI. */
export function Workspace({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const region = ref.current;
    const shell = region?.parentElement;
    const viewport = window.visualViewport;
    let frame = 0;
    function resize() {
      if (viewport)
        shell?.style.setProperty("--campus-viewport", `${viewport.height}px`);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const focused = document.activeElement;
        if (
          focused instanceof HTMLElement &&
          region?.contains(focused) &&
          focused.matches("input, textarea, select")
        ) {
          focused.scrollIntoView({
            block: "center",
            inline: "nearest",
            behavior: "auto",
          });
        }
      });
    }
    resize();
    viewport?.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", resize);
      shell?.style.removeProperty("--campus-viewport");
    };
  }, []);
  return (
    <div className="workspace-scroll" id="workspace" tabIndex={-1} ref={ref}>
      {children}
    </div>
  );
}
