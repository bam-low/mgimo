"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
type Group = { id: string; name: string };
type Program = Group & { groups: Group[] };
type Faculty = Group & { programs: Program[] };
type University = Group & { faculties: Faculty[] };
export function AuthForm({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [universities, setUniversities] = useState<University[]>([]);
  const [u, U] = useState("");
  const [f, F] = useState("");
  const [p, P] = useState("");
  useEffect(() => {
    if (register)
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
        );
  }, [register]);
  const faculties = universities.find((x) => x.id === u)?.faculties ?? [];
  const programs = faculties.find((x) => x.id === f)?.programs ?? [];
  const groups = programs.find((x) => x.id === p)?.groups ?? [];
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage("");
        const data = Object.fromEntries(new FormData(e.currentTarget));
        try {
          const r = await fetch(
            register ? "/api/register" : "/api/auth/sign-in/email",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            },
          );
          if (!r.ok) throw Error();
          if (register)
            setMessage(
              "Проверьте данные и войдите. При завершённой регистрации статус доступен в кабинете.",
            );
          else {
            router.push("/cabinet");
            router.refresh();
          }
        } catch {
          setMessage(
            "Не удалось выполнить действие. Проверьте данные или попробуйте позже.",
          );
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-5"
    >
      {register && (
        <>
          <label>
            Имя
            <input
              name="firstName"
              required
              maxLength={80}
              autoComplete="given-name"
            />
          </label>
          <label>
            Фамилия
            <input
              name="lastName"
              required
              maxLength={80}
              autoComplete="family-name"
            />
          </label>
        </>
      )}
      <label>
        Email
        <input
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
        />
      </label>
      <label>
        Пароль
        <input
          name="password"
          type="password"
          minLength={12}
          maxLength={128}
          required
          autoComplete={register ? "new-password" : "current-password"}
        />
      </label>
      {register && (
        <>
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
          <p>
            Выбор группы не открывает учебный доступ. Прикрепление проверяет
            сотрудник.
          </p>
        </>
      )}
      <button disabled={busy}>
        {busy ? "Подождите…" : register ? "Создать учётную запись" : "Войти"}
      </button>
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
          const r = await fetch("/api/auth/sign-out", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          });
          if (r.ok) window.location.replace("/login");
          else E("Выход не выполнен. Повторите попытку.");
        }}
      >
        Выйти
      </button>
      <p role="status">{error}</p>
    </>
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
