// Invoke the official, locked Next builder and materialize its ABI 2 output.
// No replacement application handler or provider API. FileFsRefs are copied using
// the official build-utils downloader, instead of being left as filePathMap refs.
import { build, version as builderABI } from "@vercel/next";
import { download } from "@vercel/build-utils";
import { mkdir, writeFile, symlink, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
process.env.CAMPUS_VERCEL_BUILD = "1";
const root = process.cwd(),
  output = path.join(root, ".vercel/output");
const result = await build({
  files: {},
  entrypoint: "package.json",
  workPath: root,
  repoRootPath: root,
  config: {
    framework: "nextjs",
    installCommand: "node --version",
    buildCommand: "npm run db:generate && npm run build:vercel-app",
    projectSettings: { nodeVersion: "24.x" },
  },
  meta: { skipDownload: true },
});
if (builderABI !== 2 || !result.output || !Array.isArray(result.routes))
  throw Error("Unknown official builder result");
const seen = new Map();
async function lambda(key, value) {
  if (value.type !== "Lambda" || value.runtime !== "nodejs24.x" || !value.files)
    throw Error("Unverified Lambda runtime/zip");
  const dest = path.join(output, "functions", key + ".func");
  await mkdir(path.dirname(dest), { recursive: true });
  if (seen.has(value)) {
    await symlink(path.relative(path.dirname(dest), seen.get(value)), dest);
    return;
  }
  seen.set(value, dest);
  await mkdir(dest, { recursive: true });
  await download(value.files, dest);
  await writeFile(
    path.join(dest, ".vc-config.json"),
    JSON.stringify({
      ...value,
      files: undefined,
      type: undefined,
      zipBuffer: undefined,
    }),
  );
}
for (const [key, value] of Object.entries(result.output)) {
  if (path.isAbsolute(key) || key.split("/").includes(".."))
    throw Error("Unsafe builder output key");
  if (value.type === "Lambda") await lambda(key, value);
  else if (value.type === "Prerender") {
    // Caching private routes would violate the architecture. Only framework error
    // fallbacks may be prerendered in this fully dynamic application.
    if (
      !/^(?:_global-error|_not-found|404|500)(?:\.|$)/.test(key) ||
      !value.lambda
    )
      throw Error("Unverified prerender of a non-error route");
    await lambda(key, value.lambda);
    let fallback = value.fallback;
    if (fallback) {
      const ext = fallback.fsPath
        ? path.extname(fallback.fsPath)
        : { "text/html": ".html", "text/x-component": ".rsc" }[
            fallback.contentType
          ];
      if (!ext) throw Error("Unknown fallback content type");
      const name = key + ".prerender-fallback" + ext;
      await download({ [name]: fallback }, path.join(output, "functions"));
      fallback = { ...fallback, fsPath: path.basename(name) };
    }
    await writeFile(
      path.join(output, "functions", key + ".prerender-config.json"),
      JSON.stringify({ ...value, lambda: undefined, fallback }),
    );
  } else if (["FileFsRef", "FileBlob", "FileRef"].includes(value.type))
    await download({ [key]: value }, path.join(output, "static"));
  else throw Error("Unverified builder output type: " + value.type);
}
const config = { version: 3, routes: result.routes };
for (const key of ["images", "overrides", "wildcard"])
  if (result[key]) config[key] = result[key];
await writeFile(path.join(output, "config.json"), JSON.stringify(config));
const tool = JSON.parse(
  await readFile("node_modules/@vercel/next/package.json", "utf8"),
);
await writeFile(
  path.join(output, "campus-builder.json"),
  JSON.stringify({
    name: tool.name,
    version: tool.version,
    format: "ABI 2 output via official download",
  }),
);

const graphFiles = (await readdir(".next")).filter((n) =>
  /^campus-modules-.+\.json$/.test(n),
);
if (!graphFiles.length) throw Error("No webpack module graph");
const graphs = [];
for (const file of graphFiles)
  graphs.push(
    JSON.parse(
      (await readFile(path.join(".next", file), "utf8")).replaceAll(
        root + path.sep,
        "",
      ),
    ),
  );
await writeFile(
  path.join(output, "campus-module-graph.json"),
  JSON.stringify(graphs),
);
