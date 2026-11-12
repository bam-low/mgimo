import { applicationHTTP } from "@/server/application-http";
export async function POST(r: Request, c: { params: Promise<{ id: string }> }) {
  return applicationHTTP(r, "action", (await c.params).id, true);
}
