import Link from "next/link";
import { AuthForm } from "../forms";
export default function Page() {
  return (
    <main className="panel">
      <Link href="/">Кампус</Link>
      <h1>Вход в Кампус</h1>
      <p>Конкурсный концепт, не официальный сервис</p>
      <AuthForm />
      <Link href="/register">Регистрация студента</Link>
    </main>
  );
}
