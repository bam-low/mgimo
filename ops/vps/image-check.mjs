import process from "node:process";
import console from "node:console";
import { readdir, readFile, realpath, lstat } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(process.argv[2] ?? "/app");
const bad =
  /(?:^|\/)(?:scripts|ops|tests|\.git|\.env[^/]*)(?:\/|$)|(?:^|\/)[^/]+\.env$|node_modules\/(?:prisma\/|@visx\/|@prisma\/(?:studio|engines)|vitest\/|typescript\/|eslint\/|@vercel\/(?:next|nft|build-utils)\/)/;
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name),
      resolved = await realpath(file);
    if (!resolved.startsWith(root + path.sep))
      throw Error("Runtime symlink escape");
    if (bad.test(path.relative(root, file)))
      throw Error("Forbidden runtime tool/env file");
    if (entry.isDirectory()) await walk(file);
    else if (!(await lstat(file)).isSymbolicLink()) {
      const bytes = await readFile(file);
      if (
        /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\r\n]+-----END/.test(
          bytes.toString(),
        )
      )
        throw Error("Private key in runtime");
    }
  }
}
await walk(root);
if (Number(process.versions.node.split(".")[0]) !== 24)
  throw Error("Node24 required");
console.log(
  "PASS runtime files: no owner tools, env files, private keys, Prisma CLI/Studio/alpha",
);
