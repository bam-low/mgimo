import Link from "next/link";
import { AuthForm } from "../forms";
import { PublicShell } from "../public-shell";
export default function Page() {
  return (
    <PublicShell>
      <p className="eyebrow">С возвращением</p>
      <h1>Вход в Кампус</h1>
      <p className="public-intro">Всё, что нужно для вашего учебного дня.</p>
      <p className="demo-disclaimer">
        Не вводите настоящие ФИО, email или личные пароли. Используйте только
        выданные демонстрационные данные.
      </p>
      <AuthForm />
      <Link className="public-switch" href="/register">
        Регистрация студента
      </Link>
    </PublicShell>
  );
}
