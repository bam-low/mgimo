import { registerHooks } from "node:module";
import { appendFileSync } from "node:fs";
import { URL, fileURLToPath } from "node:url";
const destination = new URL(
  "../.runtime-evidence/runtime-requires.txt",
  import.meta.url,
);
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    appendFileSync(
      destination,
      (result.url.startsWith("file:")
        ? fileURLToPath(result.url)
        : result.url) + "\n",
    );
    return result;
  },
});
