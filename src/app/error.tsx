"use client";
import { PublicShell } from "./public-shell";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <PublicShell>
      <h1>Сервис временно недоступен</h1>
      <p role="alert">
        Не удалось загрузить страницу. Ваши права будут проверены снова при
        повторной попытке.
      </p>
      <button onClick={reset}>Повторить попытку</button>
    </PublicShell>
  );
}
