import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "./db";
import type { Prisma } from "../generated/prisma/client";
export function makeAuth(
  client: typeof db | Prisma.TransactionClient = db,
  transactional = false,
) {
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    logger: { disabled: true },
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: process.env.BETTER_AUTH_URL
      ? [process.env.BETTER_AUTH_URL]
      : [],
    database: prismaAdapter(client, {
      provider: "postgresql",
      transaction: !transactional,
    }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    session: {
      cookieCache: { enabled: false },
      expiresIn: 60 * 60 * 8,
      updateAge: 60 * 30,
      freshAge: 60 * 15,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 30,
      customRules: { "/sign-in/email": { window: 60, max: 20 } },
    },
  });
}
export const auth = makeAuth();
