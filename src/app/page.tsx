import Link from "next/link";
import { PublicShell } from "./public-shell";
import { Icon } from "./ui-icon";
export default function Home() {
  return (
    <PublicShell landing>
      <p className="eyebrow">Знакомство с Кампусом</p>
      <h2 className="landing-title">Посмотрите, как работает Кампус</h2>

      <ul className="public-features">
        <li>
          <Icon name="calendar" />
          <span>Своя группа. Актуальное расписание.</span>
        </li>
        <li>
          <Icon name="book" />
          <span>Учебные результаты и зачёты.</span>
        </li>
        <li>
          <Icon name="document" />
          <span>Обращения и ответы вашего деканата.</span>
        </li>
      </ul>
      <nav aria-label="Доступ к платформе">
        <Link className="card-action" href="/login">
          Войти в Кампус <Icon name="arrow" />
        </Link>
        <Link className="landing-register" href="/register">
          Регистрация студента
        </Link>
      </nav>
      <p className="demo-disclaimer">
        Конкурсный концепт «Цифровой деканат будущего». Только вымышленные
        данные.
      </p>
    </PublicShell>
  );
}
