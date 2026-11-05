import Link from "next/link";
import { AuthForm } from "../forms";
export default function Page() {
  return (
    <main className="panel">
      <Link href="/">Кампус</Link>
      <h1>Регистрация студента</h1>
      <p>Конкурсный концепт, не официальный сервис</p>
      <p>Не вводите настоящие ФИО, email или личные пароли. Используйте только выданные демонстрационные данные.</p>
      <AuthForm register />
      <Link href="/login">Уже есть аккаунт? Войти</Link>
    </main>
  );
}
