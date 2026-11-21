import { headers } from "next/headers";
import { actor } from "@/server/security";
import { protectedPage } from "@/server/page";
import { studentPortfolio } from "@/server/portfolio";
import { PORTFOLIO_HINT } from "@/lib/portfolio";
import { AppNav } from "../app-nav";
import { Workspace } from "../workspace";
import { RefreshContext } from "../forms";
import { HelpTip } from "../help-tip";
import { PortfolioCard } from "../portfolio-card";
import { PortfolioAdd, OwnPortfolioActions } from "../portfolio-forms";
export const dynamic = "force-dynamic";
export default async function Page() {
  const data = await protectedPage(async () =>
    studentPortfolio(await actor(await headers())),
  );
  const count = (s: string) => data.items.filter((i) => i.status === s).length;
  return (
    <main className="campus-shell">
      <AppNav role="STUDENT" active="/portfolio" />
      <Workspace>
        <RefreshContext />
        <header className="editorial-heading">
          <p className="eyebrow">Учёба / Портфолио</p>
          <h1 className="portfolio-title">
            Портфолио
            <HelpTip text={PORTFOLIO_HINT} label="Зачем нужно портфолио" />
          </h1>
          <p>
            Олимпиады, конкурсы, конференции и соревнования. Добавьте работу и
            отправьте её на модерацию в деканат.
          </p>
        </header>
        {data.items.length > 0 && (
          <ul className="portfolio-summary" aria-label="Итоги портфолио">
            <li data-status="APPROVED">
              <strong>{count("APPROVED")}</strong> подтверждено
            </li>
            <li data-status="PENDING">
              <strong>{count("PENDING")}</strong> на модерации
            </li>
            <li data-status="PRIVATE">
              <strong>{count("PRIVATE")}</strong> только для вас
            </li>
          </ul>
        )}
        <PortfolioAdd
          today={data.today}
          full={data.items.length >= data.limit}
        />
        <section aria-labelledby="portfolio-works" className="portfolio-section">
          <h2 id="portfolio-works" className="section-heading">
            Мои работы
          </h2>
          {data.items.length ? (
            <div className="portfolio-list">
              {data.items.map((item) => (
                <PortfolioCard
                  key={item.id}
                  item={item}
                  timezone={data.timezone}
                  actions={
                    <OwnPortfolioActions
                      id={item.id}
                      status={item.status}
                      version={item.version}
                      title={item.title}
                    />
                  }
                />
              ))}
            </div>
          ) : (
            <p className="notice">
              Пока нет работ. Нажмите «Добавить работу» и прикрепите PDF с
              дипломом, сертификатом или публикацией.
            </p>
          )}
        </section>
      </Workspace>
    </main>
  );
}
