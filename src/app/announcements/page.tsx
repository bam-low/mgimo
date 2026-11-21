import { headers } from "next/headers";
import { actor } from "@/server/security";
import { protectedPage } from "@/server/page";
import { studentAnnouncements } from "@/server/announcements";
import { AppNav } from "../app-nav";
import { Workspace } from "../workspace";
import { RefreshContext } from "../forms";
import { AnnouncementList } from "../announcement-list";
export const dynamic = "force-dynamic";
export default async function Page() {
  const data = await protectedPage(async () =>
    studentAnnouncements(await actor(await headers())),
  );
  return (
    <main className="campus-shell">
      <AppNav role="STUDENT" active="/announcements" />
      <Workspace>
        <RefreshContext />
        <header className="editorial-heading">
          <p className="eyebrow">Деканат / Объявления</p>
          <h1>Объявления</h1>
          <p>Для всего вуза, вашего факультета, направления и группы.</p>
        </header>
        <AnnouncementList
          items={data.items}
          timezone={data.timezone}
          empty="Сейчас объявлений нет. Новые появятся здесь и на главной."
        />
      </Workspace>
    </main>
  );
}
