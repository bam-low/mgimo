import { actor, failure } from "@/server/security";
import { importTemplate } from "@/server/schedule-import";

/** Шаблон таблицы для импорта расписания (CSV для Excel). */
export async function GET(request: Request) {
  try {
    const csv = await importTemplate(await actor(request.headers));
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          "attachment; filename=\"campus-schedule-template.csv\"; filename*=UTF-8''%D1%88%D0%B0%D0%B1%D0%BB%D0%BE%D0%BD-%D1%80%D0%B0%D1%81%D0%BF%D0%B8%D1%81%D0%B0%D0%BD%D0%B8%D1%8F.csv",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
