import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { Denied } from "./security";
const lifetime = 10 * 60000;
const names = ["Альфа", "Бета", "Гамма", "Дельта", "Эпсилон", "Сигма"] as const;
function mac(id: string, issuedAt: string, source: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Denied(503);
  return createHmac("sha256", secret)
    .update(
      JSON.stringify(["campus-demo-registration-v1", id, issuedAt, source]),
    )
    .digest("base64url");
}
export function issueRegistrationTicket(source: string) {
  const id = randomUUID(),
    issuedAt = String(Date.now());
  return `${id}.${issuedAt}.${mac(id, issuedAt, source)}`;
}
export function syntheticIdentity(ticket: string, source: string) {
  const match =
    /^([\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12})\.(\d{13})\.([\w-]{43})$/.exec(
      ticket,
    );
  if (!match) throw new Denied(400);
  const [, id, issuedAt, signature] = match;
  const age = Date.now() - Number(issuedAt);
  const expected = Buffer.from(mac(id, issuedAt, source));
  const actual = Buffer.from(signature);
  if (
    age < -30000 ||
    age > lifetime ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    throw new Denied(400);
  return {
    firstName: "Демо",
    lastName: `Студент ${names[parseInt(id.slice(0, 2), 16) % names.length]} ${id.slice(0, 8)}`,
    email: `student-${id}@example.test`,
    password: randomBytes(32).toString("base64url"),
  };
}
