import Link from "next/link";
import { AuthForm } from "../forms";
import { PublicShell } from "../public-shell";
export default function Page() {
  return (
    <PublicShell>
      <p className="eyebrow">Знакомство с Кампусом</p>
      <h1>Регистрация студента</h1>
      <p className="public-intro">
        Выберите свой университет и учебную группу. После регистрации деканат
        проверит прикрепление.
      </p>
      <p className="demo-disclaimer">
        Не вводите настоящие ФИО, email или личные пароли. Используйте только
        выданные демонстрационные данные.
      </p>
      <AuthForm register />
      <Link className="public-switch" href="/login">
        Уже есть аккаунт? Войти
      </Link>
    </PublicShell>
  );
}
