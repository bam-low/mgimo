import {
  actor,
  staff,
  sameOrigin,
  readJSON,
  limited,
  failure,
  Denied,
} from "./security";
import {
  createApplication,
  listApplications,
  applicationDetail,
  actOnApplication,
  uploadPreflight,
  saveApplicationDocument,
  downloadApplicationDocument,
} from "./applications";
import {
  uploadOrigin,
  withUploadSlot,
  readUpload,
  validateFile,
} from "./application-files";
const headers = { "Cache-Control": "private, no-store" };
export async function applicationHTTP(
  request: Request,
  mode: "list" | "create" | "detail" | "action" | "upload" | "download",
  id?: string,
  staffOnly = false,
  documentId?: string,
) {
  try {
    if (mode === "upload") uploadOrigin(request);
    else if (["create", "action"].includes(mode)) sameOrigin(request);
    const a = await actor(request.headers);
    if (staffOnly) staff(a);
    const q = Object.fromEntries(new URL(request.url).searchParams);
    if (mode === "list")
      return Response.json(await listApplications(a, q), { headers });
    if (mode === "detail")
      return Response.json(await applicationDetail(a, id!, q), { headers });
    if (Object.keys(q).length) throw new Denied(400);
    if (mode === "download") {
      await limited("document-download:" + a.user.id, 60, 60000);
      const d = await downloadApplicationDocument(a, id!, documentId);
      return new Response(new Uint8Array(d.content), { headers: d.headers });
    }
    await limited("application-write:" + a.user.id, 60, 60000);
    if (mode === "create") {
      await limited("application-create:" + a.user.id, 5, 600000);
      return Response.json(
        await createApplication(a, await readJSON(request)),
        { headers },
      );
    }
    if (mode === "action")
      return Response.json(
        await actOnApplication(a, id!, await readJSON(request)),
        { headers },
      );
    await limited("application-upload:" + a.user.id, 6, 600000);
    await uploadPreflight(a, id!);
    return await withUploadSlot(async () => {
      const parsed = await readUpload(request),
        file = await validateFile(parsed.content, parsed.mime);
      return Response.json(
        await saveApplicationDocument(a, id!, parsed.metadata, file),
        { headers },
      );
    });
  } catch (e) {
    return failure(e);
  }
}
