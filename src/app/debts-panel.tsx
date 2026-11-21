"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { displayDate } from "./schedule-input-values";

type Debt = { id: string; subject: string; result: string; issuedOn: string };

/** «Требуют потенциального исправления»: студент сам отмечает, что разобрался. */
export function DebtsPanel({ open, hidden }: { open: Debt[]; hidden: Debt[] }) {
  const router = useRouter();
  const [gone, G] = useState<Record<string, boolean>>({});
  const [showHidden, S] = useState(false);
  const [busy, B] = useState("");
  const [error, E] = useState("");
  const visible = open.filter((d) => !gone[d.id]);
  const restored = hidden.filter((d) => gone[d.id]);
  const stillHidden = hidden.filter((d) => !gone[d.id]);
  const all = [...visible, ...restored];
  async function toggle(d: Debt, hide: boolean) {
    B(d.id);
    E("");
    G((g) => ({ ...g, [d.id]: !g[d.id] }));
    try {
      const r = await fetch("/api/grades/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gradeId: d.id, hidden: hide }),
      });
      if (!r.ok) throw Error();
      router.refresh();
    } catch {
      G((g) => ({ ...g, [d.id]: !g[d.id] }));
      E(
        "Не удалось сохранить отметку. Проверьте соединение и попробуйте ещё раз.",
      );
    } finally {
      B("");
    }
  }
  if (!open.length && !hidden.length) return null;
  return (
    <section className="debts-panel" aria-labelledby="debts-title">
      <div className="debts-head">
        <h2 id="debts-title">Требуют потенциального исправления</h2>
        {all.length > 0 && <span className="debts-count">{all.length}</span>}
      </div>
      <p className="debts-hint">
        Сюда автоматически попадают «2» и «незачёт». Можно ли их исправить,
        уточните в деканате. Отметьте долг, когда разберётесь, и он скроется из
        списка.
      </p>
      {all.length ? (
        <ul className="debts-list">
          {all.map((d) => (
            <li key={d.id}>
              <label className="debt-row">
                <input
                  type="checkbox"
                  checked={false}
                  disabled={busy === d.id}
                  onChange={() => toggle(d, true)}
                  aria-label={`Скрыть долг: ${d.subject}, ${d.result}`}
                />
                <span className="debt-subject">{d.subject}</span>
                <span
                  className="debt-result"
                  data-kind={d.result === "2" ? "mark" : "credit"}
                >
                  {d.result}
                </span>
                <time className="debt-date" dateTime={d.issuedOn}>
                  {displayDate(d.issuedOn)}
                </time>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="debts-empty">Все долги отмечены. Отличная работа!</p>
      )}
      {stillHidden.length > 0 && (
        <details
          className="debts-hidden"
          open={showHidden}
          onToggle={(e) => S(e.currentTarget.open)}
        >
          <summary>Показать скрытые ({stillHidden.length})</summary>
          <ul className="debts-list is-hidden">
            {stillHidden.map((d) => (
              <li key={d.id}>
                <div className="debt-row">
                  <span className="debt-subject">{d.subject}</span>
                  <span
                    className="debt-result"
                    data-kind={d.result === "2" ? "mark" : "credit"}
                  >
                    {d.result}
                  </span>
                  <button
                    type="button"
                    className="secondary debt-restore"
                    disabled={busy === d.id}
                    onClick={() => toggle(d, false)}
                  >
                    Вернуть
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p role="status" className="form-message">
        {error}
      </p>
    </section>
  );
}
