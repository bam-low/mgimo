import { register } from "@/server/enrollment";
import {
  readJSON,
  sameOrigin,
  limited,
  failure,
  Denied,
} from "@/server/security";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await limited("register-global", 40, 60000);
    const body = await readJSON(request);
    await limited(
      "register:" + String(body.email).toLowerCase(),
      5,
      15 * 60000,
    );
    try {
      await register(body, request.headers);
    } catch (e) {
      if (!(e instanceof Denied && e.status === 409)) throw e;
    }
    return Response.json(
      {
        message:
          "Проверьте данные и войдите. Если регистрация завершена, в кабинете появится статус прикрепления.",
      },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
