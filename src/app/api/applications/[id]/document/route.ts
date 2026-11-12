import { applicationHTTP } from "@/server/application-http";
export async function GET(r: Request, c: { params: Promise<{ id: string }> }) {
  return applicationHTTP(r, "download", (await c.params).id);
}
