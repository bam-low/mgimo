import Link from "next/link";
import { PublicShell } from "./public-shell";
export default function NotFound() {
  return (
    <PublicShell>
      <p className="error-code" aria-hidden="true">
        404
      </p>
      <h1>Страница не найдена</h1>
      <p className="public-intro">
        Возможно, ссылка устарела или в адресе есть опечатка.
      </p>
      <Link className="card-action" href="/">
        На главную Кампуса
      </Link>
      <Link className="public-switch" href="/login">
        Войти в личный кабинет
      </Link>
    </PublicShell>
  );
}
