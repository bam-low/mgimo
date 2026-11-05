import { register, registration } from "@/server/enrollment";
import { issueRegistrationTicket } from "@/server/demo-identity";
import {
  readJSON,
  sameOrigin,
  limited,
  requestSource,
  failure,
} from "@/server/security";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};
export async function GET(request: Request) {
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site")
      return Response.json({ error: "Unavailable" }, { status: 403, headers });
    const source = requestSource(request);
    await limited(JSON.stringify(["register-ticket", source]), 40, 60000);
    return Response.json(
      { ticket: issueRegistrationTicket(source) },
      { headers },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const source = requestSource(request);
    await limited(JSON.stringify(["register-source", source]), 40, 60000);
    const body = registration.parse(await readJSON(request));
    // Counts valid creation attempts (including failed/replayed ones), not a site-wide quota.
    await limited(JSON.stringify(["register-accounts", source]), 5, 15 * 60000);
    const credentials = await register(body, request.headers, source);
    return Response.json({ credentials }, { status: 201, headers });
  } catch (e) {
    return failure(e);
  }
}
