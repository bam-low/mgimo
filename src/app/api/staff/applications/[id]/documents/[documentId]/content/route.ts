import { applicationHTTP } from "@/server/application-http";
export async function GET(
  r: Request,
  c: { params: Promise<{ id: string; documentId: string }> },
) {
  const p = await c.params;
  return applicationHTTP(r, "download", p.id, true, p.documentId);
}
