import { applicationHTTP } from "@/server/application-http";
export const GET = (r: Request) => applicationHTTP(r, "list");
export const POST = (r: Request) => applicationHTTP(r, "create");
