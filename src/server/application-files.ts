import Busboy from "busboy";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Worker } from "node:worker_threads";
import path from "node:path";
import { createHash } from "node:crypto";
import { documentMetadata, MAX_DOCUMENT, MAX_UPLOAD } from "@/lib/applications";
import { Denied } from "./errors";
export function fileError(message: string, status = 400): never {
  const e = new Denied(status);
  e.message = message;
  throw e;
}
export function uploadOrigin(request: Request) {
  if (
    !process.env.BETTER_AUTH_URL ||
    request.headers.get("origin") !==
      new URL(process.env.BETTER_AUTH_URL).origin
  )
    throw new Denied();
  if (
    !/^multipart\/form-data;\s*boundary=/i.test(
      request.headers.get("content-type") ?? "",
    )
  )
    throw new Denied(415);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD)
    throw new Denied(413);
}
let uploads = 0;
export async function withUploadSlot<T>(fn: () => Promise<T>) {
  if (uploads >= 2) fileError("Обработка файлов занята. Повторите позже.", 429);
  uploads++;
  try {
    return await fn();
  } finally {
    uploads--;
  }
}
export async function readUpload(request: Request) {
  if (!request.body) throw new Denied(400);
  let parser: ReturnType<typeof Busboy>;
  try {
    parser = Busboy({
      headers: { "content-type": request.headers.get("content-type")! },
      limits: {
        files: 1,
        fields: 1,
        parts: 3,
        // Busboy emits `limit` when the boundary is reached, even if EOF
        // follows immediately. Admit the inclusive 3 MiB limit and reject
        // the first excess byte in the bounded data handler below.
        fileSize: MAX_DOCUMENT + 1,
        fieldSize: 4096,
        headerPairs: 20,
      },
    });
  } catch {
    throw new Denied(415);
  }
  let meta: unknown,
    filename = "",
    mime = "",
    files = 0,
    fields = 0,
    rejected = false,
    tooLarge = false,
    size = 0;
  const parts: Buffer[] = [];
  parser.on("file", (name, stream, info) => {
    files++;
    filename = info.filename;
    mime = info.mimeType;
    if (name !== "file") rejected = true;
    stream.on("limit", () => {
      tooLarge = true;
    });
    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_DOCUMENT) parts.push(chunk);
      else tooLarge = true;
    });
    stream.on("error", () => {
      rejected = true;
    });
  });
  parser.on("field", (name, value, info) => {
    fields++;
    if (
      name !== "metadata" ||
      info.valueTruncated ||
      Buffer.byteLength(value) > 4096
    )
      rejected = true;
    try {
      meta = JSON.parse(value);
    } catch {
      rejected = true;
    }
  });
  for (const event of ["filesLimit", "fieldsLimit", "partsLimit"] as const)
    parser.on(event, () => {
      rejected = true;
    });
  let total = 0;
  const cap = new Transform({
    transform(chunk, encoding, callback) {
      total += chunk.length;
      callback(
        total > MAX_UPLOAD ? new Denied(413) : null,
        total > MAX_UPLOAD ? undefined : chunk,
      );
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(
        request.body as import("node:stream/web").ReadableStream,
      ),
      cap,
      parser,
      { signal: AbortSignal.any([request.signal, AbortSignal.timeout(30000)]) },
    );
  } catch (e) {
    if (e instanceof Denied) throw e;
    fileError("Передача файла прервана. Прежний документ сохранён.");
  }
  if (tooLarge) throw new Denied(413);
  if (rejected || files !== 1 || fields !== 1 || !size)
    fileError("Нужны один файл и корректные параметры загрузки.");
  const expected =
    mime === "application/pdf"
      ? /\.pdf$/i
      : mime === "image/jpeg"
        ? /\.jpe?g$/i
        : mime === "image/png"
          ? /\.png$/i
          : null;
  if (
    !expected ||
    !expected.test(filename) ||
    [...filename].some(
      (c) => c.charCodeAt(0) < 32 || c === "/" || c === "\\",
    ) ||
    filename.replace(expected, "").includes(".")
  )
    fileError("Допустимы PDF, JPG и PNG с соответствующим расширением.", 415);
  return {
    metadata: documentMetadata.parse(meta),
    mime,
    content: Buffer.concat(parts),
  };
}
export async function validateFile(content: Uint8Array, mime: string) {
  if (!content.length || content.length > MAX_DOCUMENT) throw new Denied(413);
  return new Promise<{ content: Uint8Array; sha256: string; mime: string }>(
    (resolve, reject) => {
      const worker = new Worker(
        path.join(process.cwd(), "src/server/document-worker.mjs"),
        {
          workerData: { content, mime },
          resourceLimits: {
            maxOldGenerationSizeMb: 96,
            maxYoungGenerationSizeMb: 16,
            stackSizeMb: 4,
          },
          env: {},
          execArgv: [],
        },
      );
      let settled = false;
      const timer = setTimeout(() => finish(), 5000);
      function finish(result?: Uint8Array) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        if (!result) {
          const e = new Denied(400);
          e.message =
            "Файл повреждён, содержит неподдерживаемые элементы или превышает пределы проверки. Используйте демонстрационный скан PDF до 10 страниц либо статичный JPG/PNG до 12 Мп.";
          reject(e);
        } else
          resolve({
            content: result,
            mime,
            sha256: createHash("sha256").update(result).digest("hex"),
          });
      }
      worker.once("message", (r: { ok: boolean; content?: Uint8Array }) =>
        finish(r.ok ? r.content : undefined),
      );
      worker.once("error", () => finish());
      worker.once("exit", () => finish());
    },
  );
}
