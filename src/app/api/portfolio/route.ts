import { actor, limited, failure, Denied } from "@/server/security";
import {
  uploadOrigin,
  withUploadSlot,
  readUpload,
  validateFile,
} from "@/server/application-files";
import { createPortfolioItem, studentPortfolio } from "@/server/portfolio";
const headers = { "Cache-Control": "private, no-store" };

/** Свои работы студента. */
export async function GET(request: Request) {
  try {
    if (new URL(request.url).search) throw new Denied(400);
    const a = await actor(request.headers);
    return Response.json(await studentPortfolio(a), { headers });
  } catch (e) {
    return failure(e);
  }
}

/** Новая работа: один PDF + поля формы (multipart). */
export async function POST(request: Request) {
  try {
    uploadOrigin(request);
    if (new URL(request.url).search) throw new Denied(400);
    const a = await actor(request.headers);
    await limited("portfolio-upload:" + a.user.id, 10, 600000);
    return await withUploadSlot(async () => {
      const parsed = await readUpload(request, {
        parse: (v) => v,
        fieldLimit: 8192,
        pdfOnly: true,
      });
      const file = await validateFile(parsed.content, parsed.mime);
      return Response.json(
        await createPortfolioItem(a, parsed.metadata, file),
        { headers },
      );
    });
  } catch (e) {
    return failure(e);
  }
}
