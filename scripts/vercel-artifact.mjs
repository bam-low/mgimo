import { Buffer } from "node:buffer";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { nodeFileTrace } from "@vercel/nft";

export const forbidden =
  /(?:^|\/)(?:tests?|\.git|\.env[^/]*|prisma\/migrations)(?:\/|$)|(?:^|\/)[^/]+\.(?:test|spec)\.[^/]+$|node_modules\/(?:prisma(?:\/|$)|@visx\/|@prisma\/(?:studio[^/]*|engines(?:-version)?)(?:\/|$)|vercel(?:\/|$)|vitest(?:\/|$)|typescript(?:\/|$)|eslint(?:\/|$)|@vercel\/(?:next|nft|build-utils)(?:\/|$)|@rolldown\/|@workflow\/)/;
export function inside(root, file) {
  const relative = path.relative(root, file);
  return (
    relative !== ".." &&
    !relative.startsWith(".." + path.sep) &&
    !path.isAbsolute(relative)
  );
}
export async function walk(root, directory = root, seen = new Set()) {
  const resolved = await realpath(directory);
  if (!inside(root, resolved)) throw Error("Artifact path escapes root");
  if (seen.has(resolved)) return [];
  seen.add(resolved);
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const p = path.join(directory, entry.name),
      target = await realpath(p);
    if (!inside(root, target)) throw Error("Artifact symlink escapes root");
    if ((await stat(p)).isDirectory())
      files.push(...(await walk(root, p, seen)));
    else files.push(p);
  }
  return files;
}
function knownOptionalWarning(message, root) {
  const m = message
    .replaceAll(root + path.sep, "")
    .replaceAll(String.fromCharCode(26), "<turbopack-dynamic>");
  // Exact inactive/optional branches in locked Next 16.4.5 / React 19.2.9.
  if (
    /^Failed to resolve dependency "pg-native":\nCannot find module 'pg-native' loaded from node_modules\/pg\/lib\/native\/client.js$/.test(
      m,
    )
  )
    return true;
  if (
    /^Failed to resolve dependency "cloudflare:sockets":\nCannot find module 'cloudflare:sockets' loaded from node_modules\/pg-cloudflare\/dist\/index.js$/.test(
      m,
    )
  )
    return true;
  return (
    /^Failed to resolve dependency "next\/dist\/server\/web\/sandbox":\nCannot find module 'next\/dist\/server\/web\/sandbox' loaded from node_modules\/next\/dist\/compiled\/next-server\/server.runtime.prod.js$/.test(
      m,
    ) ||
    /^Failed to resolve dependency "@opentelemetry\/api":\nCannot find module '@opentelemetry\/api' loaded from node_modules\/next\/dist\/server\/lib\/(?:trace\/tracer|router-utils\/instrumentation-node-extensions).js$/.test(
      m,
    ) ||
    /^Failed to resolve dependency "\.\/cjs\/react.development.js":\nCannot find module 'node_modules\/react\/cjs\/react.development.ts' loaded from node_modules\/react\/index.js$/.test(
      m,
    ) ||
    /^Failed to resolve dependency "\.next\/<turbopack-dynamic>":\nCannot find module '\.next\/<turbopack-dynamic>' loaded from \.next\/server\/chunks\/(?:ssr\/)?\[turbopack\]_runtime.js$/.test(
      m,
    )
  );
}
export async function inspectFunction(root, lock, secretValues = []) {
  root = await realpath(root);
  const config = JSON.parse(
    await readFile(path.join(root, ".vc-config.json"), "utf8"),
  );
  if (
    (lock.packages["node_modules/next"] &&
      config.framework?.version !==
        lock.packages["node_modules/next"].version) ||
    config.runtime !== "nodejs24.x" ||
    config.handler !== "___next_launcher.cjs" ||
    Object.keys(config.environment ?? {}).length ||
    Object.keys(config.filePathMap ?? {}).length
  )
    throw Error("Unverified function runtime/environment/filePathMap");
  const files = await walk(root);
  const manifest = [];
  for (const file of files) {
    const relative = path.relative(root, file).replaceAll(path.sep, "/");
    if (
      /^(?:scripts|docs|prisma)\//.test(relative) ||
      /(?:^|\/)\.npmrc$/.test(relative) ||
      forbidden.test(relative)
    )
      throw Error("Forbidden runtime file: " + relative);
    // Reject external dev-only/unknown packages, not just known tool names.
    for (const match of relative.matchAll(
      /(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/]+/g,
    )) {
      const packagePath = relative.slice(0, match.index + match[0].length);
      const entry = lock.packages[packagePath];
      if (!entry || entry.dev || entry.version.includes("-"))
        throw Error("Unknown/dev/prerelease runtime package: " + packagePath);
    }
    const bytes = await readFile(file);
    for (const secret of secretValues.filter((s) => s && s.length >= 12)) {
      for (const value of [
        secret,
        Buffer.from(secret).toString("base64"),
        encodeURIComponent(secret),
      ])
        if (bytes.includes(Buffer.from(value)))
          throw Error("Build-time secret leaked into artifact");
    }
    if (
      /\.(?:[cm]?js|json|map)$/.test(relative) &&
      /@prisma\/studio-core|prisma\/build\/index|@visx\/(?:curve|event|grid|group|point|responsive|scale|shape|vendor)/.test(
        bytes.toString(),
      )
    )
      throw Error("Forbidden bundled module marker");
    manifest.push(relative);
  }
  const launcher = await readFile(path.join(root, config.handler), "utf8");
  const conf = /const conf = (.+);\r?\n/.exec(launcher);
  if (!conf || Object.keys(JSON.parse(conf[1]).env ?? {}).length)
    throw Error("Unknown launcher or build-time Next env injection");
  const entries = files.filter(
    (f) =>
      f.endsWith(config.handler) ||
      (f.includes(path.join(".next", "server")) && /\.[cm]?js$/.test(f)),
  );
  const trace = await nodeFileTrace(entries, {
    base: root,
    processCwd: root,
    conditions: ["node", "production"],
  });
  for (const warning of trace.warnings)
    if (!knownOptionalWarning(warning.message, root))
      throw Error(
        "Unreviewed trace warning: " +
          warning.message.replaceAll(root, "<function>"),
      );
  for (const file of trace.fileList) {
    if (!inside(root, path.resolve(root, file)) || forbidden.test(file))
      throw Error("Forbidden dependency graph edge");
    await realpath(path.join(root, file)); // Fail closed on missing graph files.
  }
  return {
    files: manifest.sort(),
    graph: [...trace.fileList].sort(),
    optionalWarnings: trace.warnings.size,
  };
}

export function inspectBundledGraph(graphs, lock) {
  let identifiers = 0;
  function visit(module) {
    for (const identifier of [
      module.identifier,
      ...(module.reasons ?? []).map((r) => r.moduleIdentifier),
    ].filter(Boolean)) {
      identifiers++;
      const normalized = identifier.replaceAll("\\", "/");
      if (forbidden.test(normalized))
        throw Error("Forbidden bundled module graph identifier");
      for (const match of normalized.matchAll(
        /node_modules\/(?:@[^/!|?]+\/)?[^/!|?]+/g,
      )) {
        // Includes loader metadata: Next's locked loaders are framework code,
        // whereas non-runtime tool packages (including nested ones) are rejected.
        const packagePath = match[0];
        const entry = lock.packages[packagePath];
        if (!entry || entry.dev || entry.version.includes("-"))
          throw Error(
            "Unknown/dev/prerelease module bundled in server: " + packagePath,
          );
      }
    }
    for (const nested of module.modules ?? []) visit(nested);
  }
  if (!Array.isArray(graphs) || !graphs.length)
    throw Error("No webpack graphs");
  for (const graph of graphs) {
    if (!graph.modules?.length) {
      if (graph.entrypoints === 0) continue;
      throw Error("Empty webpack graph");
    }
    for (const module of graph.modules) visit(module);
  }
  if (!identifiers) throw Error("No bundle module identifiers");
  return identifiers;
}
