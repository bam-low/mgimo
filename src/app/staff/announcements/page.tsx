import { headers } from "next/headers";
import { StaffNewsTabs } from "../../staff-news-tabs";
import { actor, staff } from "@/server/security";
import { protectedPage } from "@/server/page";
import { staffStructure } from "@/server/structure";
import { staffAnnouncements } from "@/server/announcements";
import { AppNav } from "../../app-nav";
import { Workspace } from "../../workspace";
import { RefreshContext } from "../../forms";
import { AnnouncementList } from "../../announcement-list";
import { AnnouncementForm, DeleteAnnouncement } from "../../announcement-forms";
export const dynamic = "force-dynamic";
export default async function Page() {
  const { tree, data } = await protectedPage(async () => {
    const a = await actor(await headers());
    staff(a);
    const [tree, data] = await Promise.all([
      staffStructure(a.membership.universityId),
      staffAnnouncements(a),
    ]);
    return { tree, data };
  });
  return (
    <main className="campus-shell">
      <AppNav role="STAFF" active="/staff/announcements" />
      <Workspace>
        <RefreshContext />
        <header className="editorial-heading">
          <p className="eyebrow">Деканат / Объявления</p>
          <h1>Объявления</h1>
          <p>
            Короткие сообщения для всего вуза, факультета, направления или
            группы. Только вымышленные данные.
          </p>
        </header>
        <StaffNewsTabs active="announcements" />
        <div className="announcements-layout">
          <AnnouncementForm tree={tree} />
          <section aria-labelledby="active-announcements">
            <h2 id="active-announcements" className="section-heading">
              Действующие объявления
            </h2>
            <AnnouncementList
              items={data.items}
              timezone={data.timezone}
              empty="Действующих объявлений нет. Создайте первое — студенты увидят его на главной."
              action={(n) => <DeleteAnnouncement id={n.id} title={n.title} />}
            />
          </section>
        </div>
      </Workspace>
    </main>
  );
}
