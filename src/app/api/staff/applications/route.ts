import { applicationHTTP } from "@/server/application-http";
export const GET = (r: Request) => applicationHTTP(r, "list", undefined, true);
