import { headers } from "next/headers";
import Link from "next/link";
import { actor } from "@/server/security";
import { protectedPage } from "@/server/page";
import { readGrades } from "@/server/grades";
import { AppNav } from "../app-nav";
import { Workspace } from "../workspace";
import { RefreshContext } from "../forms";
import { GradeList } from "../grade-list";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const q = await searchParams;
  const data = await protectedPage(async () =>
    readGrades(await actor(await headers()), q),
  );
  return (
    <main className="campus-shell">
      <AppNav role="STUDENT" active="/grades" />
      <Workspace>
        <div className="account-line">
          <span>Личные учебные результаты</span>
        </div>
        <RefreshContext />
        <header className="editorial-heading">
          <p className="eyebrow">Учёба</p>
          <h1>Успеваемость</h1>
          <p>
            Оценки и зачёты, сохранённые сотрудником. Даты в календаре вуза.
          </p>
        </header>
        <GradeList data={data} />
        <nav className="grades-pages" aria-label="Страницы результатов">
          <Link href="/grades">К началу</Link>
          {data.next && (
            <Link href={{ pathname: "/grades", query: { cursor: data.next } }}>
              Следующие результаты
            </Link>
          )}
        </nav>
      </Workspace>
    </main>
  );
}
