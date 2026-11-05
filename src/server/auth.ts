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
    advanced: {
      useSecureCookies: process.env.NODE_ENV === "production",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
      // The public wrappers own rate limiting using a verified ingress contract.
      // Do not persist attacker-supplied forwarding headers as session metadata.
      ipAddress: { disableIpTracking: true },
    },
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
    rateLimit: { enabled: false },
  });
}
export const auth = makeAuth();
