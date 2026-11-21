import { headers } from "next/headers";
import Link from "next/link";
import { actor } from "@/server/security";
import { protectedPage } from "@/server/page";
import { readGrades } from "@/server/grades";
import { readDebts } from "@/server/debts";
import { DebtsPanel } from "../debts-panel";
import { AppNav } from "../app-nav";
import { Workspace } from "../workspace";
import { RefreshContext } from "../forms";
import { GradeList } from "../grade-list";
import { GradePeriod, checkedPeriod } from "../grade-period";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    cursor?: string;
    from?: string;
    to?: string;
    subjectId?: string;
  }>;
}) {
  const q = await searchParams;
  const period = checkedPeriod(q);
  const [data, debts] = await protectedPage(async () => {
    const a = await actor(await headers());
    return Promise.all([
      readGrades(a, { ...q, from: period.from, to: period.to }),
      readDebts(a),
    ]);
  });
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
        <DebtsPanel
          key={[...debts.open, ...debts.hidden]
            .map((d) => d.id + (debts.hidden.includes(d) ? "h" : ""))
            .join(",")}
          open={debts.open}
          hidden={debts.hidden}
        />
        <GradePeriod query={q} error={period.error} />
        <GradeList data={data} query={q} />
        <nav className="grades-pages" aria-label="Страницы результатов">
          {q.cursor && (
            <Link
              href={{ pathname: "/grades", query: { ...q, cursor: undefined } }}
            >
              К началу
            </Link>
          )}
          {data.subjectId && data.next && (
            <Link
              href={{ pathname: "/grades", query: { ...q, cursor: data.next } }}
            >
              Следующие результаты
            </Link>
          )}
        </nav>
      </Workspace>
    </main>
  );
}
