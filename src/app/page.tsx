import { platform } from "@/lib/platform";

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main">К содержанию</a>
      <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-5 sm:px-10">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-300 py-6">
          <p className="font-serif text-2xl font-semibold">{platform.name}</p>
          <p className="text-sm text-stone-600">Платформа для университетов</p>
        </header>
        <main id="main" tabIndex={-1} className="flex flex-1 flex-col justify-center py-16 sm:py-24">
          <p className="mb-6 text-sm font-medium uppercase tracking-widest text-stone-600">{platform.status}</p>
          <h1 className="max-w-3xl font-serif text-5xl leading-tight sm:text-7xl">{platform.name}</h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-stone-700">
            Пространство для учёбы и взаимодействия с деканатом.
            Сейчас мы готовим основу платформы.
          </p>
          <section aria-labelledby="project-status" className="mt-10 max-w-xl border-l-2 border-stone-500 pl-5">
            <h2 id="project-status" className="font-semibold">{platform.disclaimer}</h2>
            <p className="mt-3 leading-relaxed text-stone-700">
              Это стартовая страница конкурсного прототипа. Личный кабинет,
              регистрация и учебные данные пока не реализованы.
            </p>
          </section>
        </main>
        <footer className="border-t border-stone-300 py-6 text-sm leading-relaxed text-stone-600">
          Рабочее имя платформы — «{platform.name}». Оно не обозначает конкретный университет.
        </footer>
      </div>
    </>
  );
}
