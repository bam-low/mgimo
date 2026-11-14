import Link from "next/link";
import { PublicShell } from "./public-shell";
import { Icon } from "./ui-icon";
export default function Home() {
  return (
    <PublicShell>
      <p className="eyebrow">Цифровой деканат будущего</p>
      <h1>
        Всё для вашего
        <br />
        <em>учебного дня.</em>
      </h1>
      <p className="public-intro">
        Расписание, успеваемость, заявки и демонстрационные справки — в одном
        Кампусе.
      </p>
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
      <p className="demo-disclaimer">
        Используйте только вымышленные данные.
      </p>
      <nav aria-label="Доступ к платформе">
        <Link className="card-action" href="/login">
          Войти в Кампус <Icon name="arrow" />
        </Link>
        <Link className="public-switch" href="/register">
          Регистрация студента
        </Link>
      </nav>
    </PublicShell>
  );
}
