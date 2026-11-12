// Dedicated validation worker. Never receives sessions, database URLs or filenames.
import { Buffer } from "node:buffer";
import { parentPort, workerData } from "node:worker_threads";
import { PDFDocument, PDFDict, PDFArray, PDFName, PDFRawStream } from "pdf-lib";
import sharp from "sharp";
const max = 3 * 1024 * 1024;
const forbidden = new Set([
  "JavaScript",
  "JS",
  "OpenAction",
  "AA",
  "Launch",
  "URI",
  "EmbeddedFiles",
  "EmbeddedFile",
  "Filespec",
  "AcroForm",
  "XFA",
  "RichMedia",
  "Movie",
  "Sound",
  "SubmitForm",
  "ImportData",
  "GoToR",
  "GoToE",
  "GoTo",
  "Named",
  "Hide",
  "ResetForm",
  "SetOCGState",
  "Trans",
  "Thread",
  "GoTo3DView",
  "Rendition",
  "Collection",
  "EF",
]);
async function validate(bytes, mime) {
  const data = Buffer.from(bytes);
  if (!data.length || data.length > max) throw Error();
  if (mime === "application/pdf") {
    if (
      !/^%PDF-(?:1\.[0-7]|2\.0)\b/.test(
        data.subarray(0, 16).toString("ascii"),
      ) ||
      !/%%EOF\s*$/.test(data.subarray(-1024).toString("ascii"))
    )
      throw Error();
    const pdf = await PDFDocument.load(data, {
      ignoreEncryption: false,
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    if (pdf.isEncrypted || pdf.getPageCount() < 1 || pdf.getPageCount() > 10)
      throw Error();
    const objects = pdf.context.enumerateIndirectObjects();
    if (objects.length > 10000) throw Error();
    const seen = new WeakSet();
    let count = 0;
    function visit(o) {
      if (!o || typeof o !== "object" || seen.has(o)) return;
      seen.add(o);
      if (++count > 100000) throw Error();
      if (o instanceof PDFName && forbidden.has(o.decodeText())) throw Error();
      if (o instanceof PDFRawStream) {
        // External stream files and optional decode parameters are unsupported.
        if (o.dict.has(PDFName.of("F"))) throw Error();
        visit(o.dict);
      } else if (o instanceof PDFDict)
        for (const [k, v] of o.entries()) {
          if (k.decodeText() === "Annots") {
            const annotations = pdf.context.lookup(v);
            if (!(annotations instanceof PDFArray) || annotations.size() !== 0)
              throw Error();
          }
          visit(k);
          visit(v);
        }
      else if (o instanceof PDFArray) for (const v of o.asArray()) visit(v);
    }
    for (const [, o] of objects) visit(o);
    pdf.getPages();
    return data;
  }
  const png = data
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg =
    data[0] === 255 &&
    data[1] === 216 &&
    data[2] === 255 &&
    data.at(-2) === 255 &&
    data.at(-1) === 217;
  if (!((mime === "image/png" && png) || (mime === "image/jpeg" && jpeg)))
    throw Error();
  const image = sharp(data, {
    limitInputPixels: 12000000,
    failOn: "warning",
    animated: true,
  });
  const m = await image.metadata();
  if (
    !m.width ||
    !m.height ||
    m.width > 10000 ||
    m.height > 10000 ||
    m.width * m.height > 12000000 ||
    (m.pages ?? 1) !== 1 ||
    !["png", "jpeg"].includes(m.format)
  )
    throw Error();
  const normalized = await image
    .rotate()
    .toFormat(mime === "image/png" ? "png" : "jpeg")
    .toBuffer();
  if (!normalized.length || normalized.length > max) throw Error();
  return normalized;
}
try {
  const content = await validate(workerData.content, workerData.mime);
  parentPort.postMessage({ ok: true, content: new Uint8Array(content) });
} catch {
  parentPort.postMessage({ ok: false });
}
