import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const globalDb = globalThis as unknown as { campusDb?: PrismaClient };
export const db =
  globalDb.campusDb ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 10000,
      allowExitOnIdle: true,
    }),
  });
globalDb.campusDb = db;
