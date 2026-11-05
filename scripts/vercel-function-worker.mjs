import { URL } from "node:url";
const { Request } = globalThis;
// Test-only local host of an UNMODIFIED, copied Vercel handler. Not a deploy entrypoint.
import { createServer } from "node:http";
import { createRequire, registerHooks } from "node:module";
import { readFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import path from "node:path";
import process from "node:process";
if (
  Object.keys(process.env).some(
    (key) => key.startsWith("DEMO_") || key === "ALLOW_DEMO_SEED",
  )
)
  throw Error("Seed-only environment leaked to Function runtime");
const root = process.argv[2],
  destination = process.env.VERCEL_TEST_LOADS;
const config = JSON.parse(
  readFileSync(path.join(root, ".vc-config.json"), "utf8"),
);
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    if (result.url.startsWith("file:")) {
      const file = fileURLToPath(result.url);
      if (!file.startsWith(root + path.sep))
        throw Error("Function imported outside isolated artifact");
      if (
        /node_modules\/(?:prisma\/|@visx\/|@prisma\/studio|vercel\/|vitest\/|typescript\/|eslint\/)/.test(
          file,
        )
      )
        throw Error("Function imported a forbidden tool");
      appendFileSync(destination, JSON.stringify({ root, file }) + "\n");
    } else if (!result.url.startsWith("node:"))
      throw Error("Unknown runtime import protocol");
    return result;
  },
});
const handler = createRequire(import.meta.url)(path.join(root, config.handler));
const middleware = path.basename(root) === "_middleware.func";
const server = createServer(async (req, res) => {
  try {
    if (middleware) {
      const response = await handler(
        new Request(new URL(req.url, process.env.BETTER_AUTH_URL), {
          method: req.method,
          headers: req.headers,
          ...(req.method !== "GET" && req.method !== "HEAD"
            ? { body: Readable.toWeb(req), duplex: "half" }
            : {}),
        }),
      );
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          status: response.status,
          headers: [...response.headers],
        }),
      );
    } else await handler(req, res);
  } catch {
    res.statusCode = 500;
    res.end("Isolated function failed");
    // No request/body/env logging. Mark a failed invocation for the verifier.
    appendFileSync(destination, JSON.stringify({ root, failure: true }) + "\n");
  }
});
server.listen(0, "127.0.0.1", () =>
  process.send({ port: server.address().port }),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
