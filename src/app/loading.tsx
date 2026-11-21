import { BrandLoader } from "./brand-loader";

export default function Loading() {
  return (
    <main className="brand-loader-screen">
      <BrandLoader
        page
        title="Открываем Кампус"
        hint="Проверяем доступ и загружаем данные…"
      />
    </main>
  );
}
