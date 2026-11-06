import { headers } from "next/headers";
import { actor, staff } from "@/server/security";
import { protectedPage } from "@/server/page";
import { staffStructure } from "@/server/structure";
import { AppNav } from "../../app-nav";
import { StructureEditor } from "../../structure-forms";
import { Logout, RefreshContext } from "../../forms";
export const dynamic = "force-dynamic";
export default async function Page() {
  const tree = await protectedPage(async () => {
    const a = await actor(await headers());
    staff(a);
    return staffStructure(a.membership.universityId);
  });
  return (
    <main className="campus-shell">
      <AppNav role="STAFF" active="/staff/structure" />
      <div className="account-line">
        <span>Рабочее пространство сотрудника</span>
        <div className="logout-control">
          <Logout />
        </div>
      </div>
      <RefreshContext />
      <header className="editorial-heading">
        <p className="eyebrow">Деканат / 01</p>
        <h1>Учебная структура</h1>
        <p>Факультеты, направления и группы — в одном контексте.</p>
      </header>
      <p className="notice">
        Деактивация закрывает учебный доступ всей вложенной структуры. Запросы,
        прикрепления и история сохраняются; перенос в другой вуз или направление
        здесь не выполняется.
      </p>
      <StructureEditor tree={tree} />
    </main>
  );
}
