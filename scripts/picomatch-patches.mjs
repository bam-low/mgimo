import ts from "typescript";
import { createHash } from "node:crypto";

export function verifiedPatch(source, file, spec) {
  const hash = value => createHash("sha256").update(value).digest("hex");
  if (hash(source) === spec.patchedSHA256) return source;
  if (hash(source) !== spec.originalSHA256) throw Error(`Непроверенная версия встроенной зависимости: ${file}`);
  const patched = spec.replacement ?? replaceFactories(source, file, spec);
  if (hash(patched) !== spec.patchedSHA256) throw Error(`Неверный результат security patch: ${file}`);
  return patched;
}

// The containing files are pinned byte-for-byte by the manifest. AST boundaries
// avoid rewriting strings/comments or guessing where a minified factory ends.
export function replaceFactories(source, file, spec) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const edits = [];
  function visit(node) {
    let body, target, moduleName, exportsName;
    if (ts.isMethodDeclaration(node) && ts.isStringLiteral(node.name)) {
      const match = /\/picomatch@(2|4)\.[^/]+\/node_modules\/picomatch\/(index\.js|lib\/(?:constants|utils|scan|parse|picomatch)\.js)$/.exec(node.name.text);
      if (match) {
        body = node.body;
        target = `@campus/picomatch-v${match[1]}${match[2] === "index.js" ? "" : "/" + match[2]}`;
        moduleName = node.parameters[1]?.name.getText(ast);
        exportsName = node.parameters[0]?.name.getText(ast);
      }
    }
    if (spec.minified && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && Object.hasOwn(spec.minified, node.name.text)) {
      const factory = node.initializer?.arguments?.[0];
      if (!factory || !ts.isArrowFunction(factory) || !ts.isBlock(factory.body)) throw Error("Неожиданная структура закреплённой фабрики");
      body = factory.body;
      const item = spec.minified[node.name.text];
      target = `@campus/picomatch-v${item.major || spec.major || 2}` + (typeof item === "string" ? item : item.path);
      moduleName = factory.parameters[1]?.name.getText(ast);
      exportsName = factory.parameters[0]?.name.getText(ast);
    }
    if (body) {
      const statement = moduleName ? `${moduleName}.exports = require(${JSON.stringify(target)});` : `Object.assign(${exportsName}, require(${JSON.stringify(target)}));`;
      edits.push({ start: body.getStart(ast), end: body.end, text: `{ ${statement} }` });
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (edits.length !== spec.factories) throw Error(`Неожиданное число фабрик picomatch в ${file}: ${edits.length}`);
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}
