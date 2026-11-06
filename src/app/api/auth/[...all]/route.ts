import { z } from "zod";
import { auth } from "@/server/auth";
import {
  readJSON,
  sameOrigin,
  limited,
  requestSource,
  failure,
  Denied,
} from "@/server/security";
export async function GET(request: Request) {
  try {
    const r = await auth.handler(request);
    r.headers.set("Cache-Control", "no-store");
    return r;
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const path = new URL(request.url).pathname;
    if (
      ![
        "/api/auth/sign-in/email",
        "/api/auth/sign-out",
        "/api/auth/get-session",
      ].includes(path)
    )
      throw new Denied();
    if (path.endsWith("/sign-in/email")) {
      const source = requestSource(request);
      await limited(JSON.stringify(["login-source", source]), 20, 60000);
      const data = z
        .object({
          email: z
            .string()
            .max(254)
            .regex(/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@example\.test$/i),
          password: z.string().min(12).max(128),
        })
        .strict()
        .parse(await readJSON(request.clone()));
      await limited(
        JSON.stringify([
          "login-email",
          source,
          String(data.email).trim().toLowerCase(),
        ]),
        10,
        15 * 60000,
      );
    }
    const r = await auth.handler(request);
    r.headers.set("Cache-Control", "no-store");
    return r;
  } catch (e) {
    return failure(e);
  }
}
