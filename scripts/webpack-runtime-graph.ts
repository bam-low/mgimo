import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
interface ModuleInfo {
  identifier?: string;
  modules?: ModuleInfo[];
  reasons?: { moduleIdentifier?: string | null }[];
}
interface Compiler {
  name?: string;
  hooks: {
    done: {
      tap(
        name: string,
        callback: (stats: {
          compilation: { entrypoints: { size: number } };
          toJson(options: object): { modules?: ModuleInfo[] };
        }) => void,
      ): void;
    };
  };
}
// Module graph of server bundles BEFORE minification, including concatenated modules.
// Resource identifiers and importer reasons only; never source text or environment.
export class WebpackRuntimeGraphPlugin {
  apply(compiler: Compiler) {
    compiler.hooks.done.tap("CampusRuntimeGraph", (stats) => {
      const report = stats.toJson({
        all: false,
        modules: true,
        nestedModules: true,
        reasons: true,
        source: false,
        cachedModules: true,
      });
      if (!report.modules?.length && stats.compilation.entrypoints.size)
        throw Error("Missing server module graph: " + compiler.name);
      mkdirSync(".next", { recursive: true });
      const name = (compiler.name ?? "server").replace(/[^a-zA-Z0-9_-]/g, "_");
      writeFileSync(
        path.join(".next", `campus-modules-${name}.json`),
        JSON.stringify({
          ...report,
          modules: report.modules ?? [],
          entrypoints: stats.compilation.entrypoints.size,
        }),
      );
    });
  }
}
