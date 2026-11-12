import { applicationHTTP } from "@/server/application-http";
export async function GET(r: Request, c: { params: Promise<{ id: string }> }) {
  return applicationHTTP(r, "detail", (await c.params).id);
}
