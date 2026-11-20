"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
type Group = { id: string; name: string };
type Program = Group & { groups: Group[] };
type Faculty = Group & { programs: Program[] };
type University = Group & { faculties: Faculty[] };
export function AuthForm({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const pending = useRef<AbortController | null>(null);
  const mayShow = useRef(true);
  const credentialHeading = useRef<HTMLHeadingElement>(null);
  const [loading, setLoading] = useState(register);
  const [credentials, setCredentials] = useState<{
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  } | null>(null);
  const [ticket, setTicket] = useState("");
  const [reveal, setReveal] = useState(false);
  async function freshTicket() {
    setTicket("");
    setMessage("");
    try {
      const response = await fetch("/api/register", { cache: "no-store" });
      if (!response.ok) throw Error();
      setTicket((await response.json()).ticket);
    } catch {
      setMessage("Не удалось подготовить попытку. Попробуйте позже.");
    }
  }
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [universities, setUniversities] = useState<University[]>([]);
  const [u, U] = useState("");
  const [f, F] = useState("");
  const [p, P] = useState("");
  useEffect(() => {
    if (register) {
      void freshTicket();
      fetch("/api/structure")
        .then((r) => {
          if (!r.ok) throw Error();
          return r.json();
        })
        .then(setUniversities)
        .catch(() =>
          setMessage(
            "Не удалось загрузить учебную структуру. Обновите страницу.",
          ),
        )
        .finally(() => setLoading(false));
      const clear = () => {
        mayShow.current = false;
        pending.current?.abort();
        pending.current = null;
        setCredentials(null);
        setTicket("");
        setReveal(false);
        setBusy(false);
      };
      const hidden = () => {
        if (document.visibilityState !== "hidden") return;
        setReveal(false);
        // Delivered credentials stay in this page's memory while the user saves
        // them elsewhere. An unfinished attempt must never deliver a late secret.
        mayShow.current = false;
        if (pending.current) {
          pending.current.abort();
          pending.current = null;
          setTicket("");
          setBusy(false);
          setMessage(
            "Попытка прервана при скрытии страницы. Если аккаунт уже создан, реквизиты повторно не выдаются. Начните новую попытку.",
          );
        }
      };
      window.addEventListener("pagehide", clear);
      document.addEventListener("visibilitychange", hidden);
      return () => {
        window.removeEventListener("pagehide", clear);
        document.removeEventListener("visibilitychange", hidden);
        mayShow.current = false;
        pending.current?.abort();
        pending.current = null;
      };
    }
  }, [register]);
  useEffect(() => {
    if (credentials) credentialHeading.current?.focus();
  }, [credentials]);
  const faculties = universities.find((x) => x.id === u)?.faculties ?? [];
  const programs = faculties.find((x) => x.id === f)?.programs ?? [];
  const groups = programs.find((x) => x.id === p)?.groups ?? [];
  if (register && credentials)
    return (
      <section className="space-y-5" aria-labelledby="credentials-title">
        <h2 id="credentials-title" ref={credentialHeading} tabIndex={-1}>
          Демонстрационный аккаунт создан
        </h2>
        <p>
          Это вымышленная личность. Сохраните реквизиты приватно перед переходом
          ко входу: после ухода или обновления страницы пароль повторно не
          выдаётся. Можно переключиться в заметки или менеджер паролей и
          вернуться: реквизиты останутся только в памяти этой открытой страницы,
          а показ пароля выключится.
        </p>
        <label>
          Вымышленный персонаж
          <input
            readOnly
            value={credentials.firstName + " " + credentials.lastName}
            autoComplete="off"
          />
        </label>
        <label>
          Демонстрационный логин
          <input
            data-testid="demo-email"
            readOnly
            value={credentials.email}
            autoComplete="off"
          />
        </label>
        <label>
          Демонстрационный пароль
          <input
            data-testid="demo-password"
            readOnly
            type={reveal ? "text" : "password"}
            value={credentials.password}
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          aria-pressed={reveal}
          onClick={() => setReveal(!reveal)}
        >
          {reveal ? "Скрыть пароль" : "Показать пароль"}
        </button>
        <p>
          Не публикуйте пароль в чатах, скриншотах или репозитории. Выбор группы
          пока не даёт учебного доступа.
        </p>
        <Link
          href="/login"
          onClick={() => {
            mayShow.current = false;
            setCredentials(null);
            setReveal(false);
          }}
        >
          Перейти к входу
        </Link>
      </section>
    );
  return (
    <form
      autoComplete="off"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage("");
        const data = Object.fromEntries(new FormData(e.currentTarget));
        mayShow.current = true;
        const controller = new AbortController();
        pending.current = controller;
        try {
          const r = await fetch(
            register ? "/api/register" : "/api/auth/sign-in/email",
            {
              method: "POST",
              signal: controller.signal,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(register ? { ...data, ticket } : data),
            },
          );
          if (!r.ok) {
            if (r.status === 429) {
              setMessage("Лимит попыток достигнут. Попробуйте позже.");
              return;
            }
            if (register && (r.status === 409 || r.status === 400)) {
              setTicket("");
              setMessage(
                "Попытка недоступна или уже использована. Начните новую попытку.",
              );
              return;
            }
            throw Error();
          }
          if (register) {
            const result = await r.json();
            if (
              pending.current === controller &&
              !controller.signal.aborted &&
              mayShow.current &&
              document.visibilityState === "visible"
            )
              setCredentials(result.credentials);
            setTicket("");
          } else {
            router.push("/cabinet?entry=1");
            router.refresh();
          }
        } catch {
          if (pending.current === controller)
            setMessage(
              "Не удалось выполнить действие. Проверьте данные или попробуйте позже.",
            );
        } finally {
          if (pending.current === controller) {
            pending.current = null;
            setBusy(false);
          }
        }
      }}
      className="space-y-5"
    >
      {!register && (
        <>
          <label>
            Демонстрационный логин
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="off"
              placeholder="выданный адрес @example.test"
            />
          </label>
          <label>
            Демонстрационный пароль
            <input
              name="password"
              type="password"
              minLength={12}
              maxLength={128}
              required
              autoComplete="off"
            />
          </label>
        </>
      )}
      {register && (
        <div className="register-picks">
          <label>
            Университет
            <select
              required
              aria-label="Университет"
              name="universityId"
              value={u}
              onChange={(e) => {
                U(e.target.value);
                F("");
                P("");
              }}
            >
              <option value="">Выберите университет</option>
              {universities.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Факультет
            <select
              required
              aria-label="Факультет"
              name="facultyId"
              value={f}
              disabled={!u}
              onChange={(e) => {
                F(e.target.value);
                P("");
              }}
            >
              <option value="">Выберите факультет</option>
              {faculties.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Направление
            <select
              required
              aria-label="Направление"
              name="programId"
              value={p}
              disabled={!f}
              onChange={(e) => P(e.target.value)}
            >
              <option value="">Выберите направление</option>
              {programs.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Группа
            <select
              key={p}
              required
              aria-label="Группа"
              name="groupId"
              disabled={!p}
            >
              <option value="">Выберите группу</option>
              {groups.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <button disabled={busy || (register && (!ticket || !groups.length))}>
        {busy
          ? "Подождите…"
          : register
            ? "Создать демонстрационный аккаунт"
            : "Войти"}
      </button>
      {register && !ticket && !busy && (
        <button type="button" onClick={freshTicket}>
          Новая попытка
        </button>
      )}
      {register && loading && <p>Загрузка демонстрационной структуры…</p>}
      {register && !loading && !universities.length && (
        <p>Демонстрационная структура пока недоступна. Попробуйте позже.</p>
      )}
      {register && (
        <p className="form-footnote">
          Имя, логин и случайный пароль создаёт сервер. Если ответ потерялся, не
          отправляйте форму повторно: новая попытка расходует лимит.
        </p>
      )}
      <p role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}
export function ActionForm({
  url,
  requestId,
  groups,
}: {
  url: string;
  requestId?: string;
  groups?: Group[];
}) {
  const [message, M] = useState("");
  const [busy, B] = useState(false);
  const router = useRouter();
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        B(true);
        const body = Object.fromEntries(new FormData(e.currentTarget));
        try {
          const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...body,
              ...(requestId ? { requestId } : {}),
            }),
          });
          if (!r.ok) throw Error();
          M("Изменения сохранены");
          router.refresh();
        } catch {
          M("Действие недоступно. Обновите страницу.");
        } finally {
          B(false);
        }
      }}
    >
      {groups ? (
        <label>
          Новая группа
          <select aria-label="Новая группа" name="groupId" required>
            <option value="">Выберите группу</option>
            {groups.map((g) => (
              <option value={g.id} key={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <label>
            Решение
            <select aria-label="Решение" name="status">
              <option value="APPROVED">Подтвердить</option>
              <option value="REJECTED">Отклонить</option>
            </select>
          </label>
          <label>
            Причина / комментарий
            <textarea name="reason" required maxLength={500} />
          </label>
        </>
      )}
      <button disabled={busy}>{busy ? "Сохранение…" : "Отправить"}</button>
      <p role="status">{message}</p>
    </form>
  );
}
export function Logout() {
  const [error, E] = useState("");
  return (
    <>
      <button
        onClick={async () => {
          try {
            const r = await fetch("/api/auth/sign-out", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            });
            if (r.ok) window.location.replace("/login");
            else E("Выход не выполнен. Повторите попытку.");
          } catch {
            E("Выход не выполнен. Проверьте соединение и повторите попытку.");
          }
        }}
      >
        Выйти
      </button>
      <p role="status">{error}</p>
    </>
  );
}
export function MembershipForm({
  membershipId,
  enrollmentId,
  allowed,
  groups,
}: {
  membershipId: string;
  enrollmentId?: string;
  allowed: boolean;
  groups: Group[];
}) {
  const [action, A] = useState<"TRANSFER" | "REVOKE" | "ALLOW_RESUBMISSION">(
    enrollmentId ? "TRANSFER" : "ALLOW_RESUBMISSION",
  );
  const [busy, B] = useState(false),
    [message, M] = useState("");
  const router = useRouter();
  if (!enrollmentId && allowed)
    return <p role="status">Повторная подача разрешена сотрудником.</p>;
  return (
    <form
      className="space-y-3"
      aria-busy={busy}
      onSubmit={async (e) => {
        e.preventDefault();
        B(true);
        M("");
        const form = new FormData(e.currentTarget);
        try {
          const r = await fetch("/api/staff/membership", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              membershipId,
              action,
              reason: form.get("reason"),
              ...(action !== "ALLOW_RESUBMISSION"
                ? { expectedEnrollmentId: enrollmentId }
                : {}),
              ...(action === "TRANSFER"
                ? { groupId: form.get("groupId") }
                : {}),
            }),
          });
          if (!r.ok) throw Error();
          M("Изменения сохранены");
          router.refresh();
        } catch {
          M(
            "Действие недоступно. Обновите страницу и проверьте текущее прикрепление.",
          );
        } finally {
          B(false);
        }
      }}
    >
      <label>
        Действие
        <select
          aria-label="Действие"
          value={action}
          onChange={(e) => A(e.target.value as typeof action)}
        >
          {enrollmentId ? (
            <>
              <option value="TRANSFER">Перевести в другую группу</option>
              <option value="REVOKE">Отозвать прикрепление</option>
            </>
          ) : (
            <option value="ALLOW_RESUBMISSION">
              Разрешить повторную подачу
            </option>
          )}
        </select>
      </label>
      {action === "TRANSFER" && (
        <label>
          Целевая группа
          <select aria-label="Целевая группа" name="groupId" required>
            <option value="">Выберите группу</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Причина действия
        <textarea name="reason" required maxLength={500} />
      </label>
      <button disabled={busy || (action === "TRANSFER" && !groups.length)}>
        {busy ? "Сохранение…" : "Применить действие"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
export function RefreshContext() {
  const router = useRouter();
  useEffect(() => {
    const update = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [router]);
  return null;
}
