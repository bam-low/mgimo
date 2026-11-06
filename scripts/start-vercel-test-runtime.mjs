import { runtimeTestEnv } from "./runtime-test-env.mjs";
import { setTimeout, clearTimeout } from "node:timers";
import { URL } from "node:url";
const { fetch, Headers } = globalThis;
// Minimal local routing harness for generated Functions; does NOT claim to emulate Vercel ingress.
import { readFile, readdir, realpath } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { fork } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import path from "node:path";
import process from "node:process";
import console from "node:console";
const root = (
  await readFile(".runtime-evidence/vercel-root.txt", "utf8")
).trim();
const loads = path.resolve(".runtime-evidence/vercel-loads.jsonl");
const children = [],
  workers = new Map();
async function discover(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const p = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (!entry.isDirectory()) continue;
    if (!entry.name.endsWith(".func")) {
      await discover(p);
      continue;
    }
    const child = fork(
      path.resolve("scripts/vercel-function-worker.mjs"),
      [p],
      {
        cwd: p,
        stdio: ["ignore", "inherit", "inherit", "ipc"],
        env: {
          ...runtimeTestEnv(),
          NODE_ENV: "production",
          NODE_PATH: "",
          VERCEL_TEST_LOADS: loads,
          AUTH_TRUSTED_IP_HEADER: "x-vercel-forwarded-for",
        },
      },
    );
    children.push(child);
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Function startup timed out")),
        15000,
      );
      child.once("message", ({ port }) => {
        clearTimeout(timer);
        resolve(port);
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(Error("Function failed to start"));
      });
    });
    workers.set(p, port);
  }
}
await discover(path.join(root, "functions"));
const output = JSON.parse(
  await readFile(path.join(root, "config.json"), "utf8"),
);
const middlewarePort = workers.get(
  path.join(root, "functions/_middleware.func"),
);
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, process.env.BETTER_AUTH_URL);
    if (
      ["/_next/static/", "/fonts/", "/design/"].some((prefix) =>
        url.pathname.startsWith(prefix),
      )
    ) {
      const file = await realpath(path.join(root, "static", url.pathname));
      if (!file.startsWith(path.join(root, "static") + path.sep))
        throw Error("Static escape");
      res.setHeader(
        "content-type",
        file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".woff")
            ? "font/woff"
            : file.endsWith(".svg")
              ? "image/svg+xml"
              : file.endsWith(".txt")
                ? "text/plain"
                : "application/javascript",
      );
      createReadStream(file).pipe(res);
      return;
    }
    // TEST simulation only. This verifies application behavior after overwrite,
    // not the external platform's actual overwrite guarantee (manual launch gate).
    req.headers["x-vercel-forwarded-for"] = req.socket.remoteAddress;
    delete req.headers["x-forwarded-for"];
    const mh = { ...req.headers };
    delete mh["content-length"];
    delete mh["transfer-encoding"];
    const m = await fetch(`http://127.0.0.1:${middlewarePort}${url.pathname}`, {
      headers: mh,
    });
    const meta = await m.json(),
      headers = new Headers(meta.headers);
    for (const name of (
      headers.get("x-middleware-override-headers") ?? ""
    ).split(",")) {
      const value = headers.get("x-middleware-request-" + name);
      if (name && value !== null) req.headers[name] = value;
    }
    for (const [name, value] of headers)
      if (!name.startsWith("x-middleware-")) res.setHeader(name, value);
    for (const route of output.routes ?? [])
      if (
        route.src &&
        route.headers &&
        new RegExp(route.src).test(url.pathname)
      )
        for (const [name, value] of Object.entries(route.headers))
          res.setHeader(name, value);
    const entry = url.pathname.startsWith("/api/auth/")
      ? "api/auth/[...all].func"
      : url.pathname === "/"
        ? "index.func"
        : url.pathname.slice(1) + ".func";
    const target = await realpath(path.join(root, "functions", entry));
    const port = workers.get(target);
    if (!port) throw Error("Unknown output function");
    const upstream = httpRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (r) => {
        res.statusCode = r.statusCode;
        for (const [name, value] of Object.entries(r.headers))
          if (value !== undefined) res.setHeader(name, value);
        r.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.statusCode = 500;
      res.end("Local function proxy failed");
    });
    req.pipe(upstream);
  } catch {
    res.statusCode = 500;
    res.end("Local Vercel harness failed");
  }
});
server.listen(3000, "127.0.0.1", () =>
  console.log("Isolated Vercel test harness ready (not a public ingress)"),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    for (const child of children) child.kill(signal);
    server.close(() => process.exit(0));
  });
