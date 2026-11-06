import { redirect, notFound } from "next/navigation";
import { Denied, reportFailure } from "./errors";
// Keep redirects outside load(): only actual authentication/authorization failures
// redirect to login; a database outage must not look like an expired session.
export async function protectedPage<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (e) {
    if (e instanceof Denied) {
      if (e.status === 404) notFound();
      redirect("/login");
    }
    reportFailure(e);
  }
  // Deliberately omit the original cause: Next logs page errors.
  throw new Error("Сервис временно недоступен. Повторите попытку.");
}
