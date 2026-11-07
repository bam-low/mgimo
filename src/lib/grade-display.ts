export function resultLabel(r: {
  kind: string;
  mark: number | null;
  credit: string | null;
}) {
  return r.kind === "MARK"
    ? String(r.mark)
    : r.credit === "PASSED"
      ? "Зачтено"
      : "Не зачтено";
}
