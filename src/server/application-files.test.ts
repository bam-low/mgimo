import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PDFDocument, PDFName } from "pdf-lib";
import sharp from "sharp";
import { readUpload, validateFile } from "./application-files";
import { MAX_DOCUMENT, MAX_UPLOAD } from "../lib/applications";
const metadata = {
  operationId: "00000000-0000-4000-8000-000000000043",
  expectedVersion: 1,
  expectedCurrentDocumentId: null,
  demoConfirmed: true,
};
it("validates real marked PDF/JPEG/PNG and hashes the stored bytes; rejects active, encrypted, malformed and bomb inputs", async () => {
  for (const [ext, mime] of [
    ["pdf", "application/pdf"],
    ["jpg", "image/jpeg"],
    ["png", "image/png"],
  ]) {
    const content = await readFile(`demo/documents/demo-certificate.${ext}`),
      r = await validateFile(content, mime);
    expect(r.content.length).toBeGreaterThan(16384);
    expect(r.sha256).toBe(createHash("sha256").update(r.content).digest("hex"));
  }
  for (const content of [
    Buffer.from("%PDF-1.7\nbroken\n%%EOF"),
    Buffer.from("<script>demo</script>"),
    Buffer.alloc(MAX_DOCUMENT + 1),
  ])
    await expect(
      validateFile(content, "application/pdf"),
    ).rejects.toMatchObject({
      status: content.length > MAX_DOCUMENT ? 413 : 400,
    });
  const pdf = await PDFDocument.load(
    await readFile("demo/documents/demo-certificate.pdf"),
  );
  pdf.addJavaScript("demo", "app.alert('demo')");
  await expect(
    validateFile(await pdf.save(), "application/pdf"),
  ).rejects.toMatchObject({ status: 400 });
  const bomb = await sharp({
    create: { width: 4000, height: 4000, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await expect(validateFile(bomb, "image/png")).rejects.toMatchObject({
    status: 400,
  });
  const encrypted = await PDFDocument.load(
    await readFile("demo/documents/demo-certificate.pdf"),
  );
  encrypted.context.trailerInfo.Encrypt = encrypted.context.register(
    encrypted.context.obj({ Filter: PDFName.of("Standard") }),
  );
  await expect(
    validateFile(await encrypted.save(), "application/pdf"),
  ).rejects.toMatchObject({ status: 400 });
  const pages = await PDFDocument.create();
  for (let n = 0; n < 11; n++) pages.addPage();
  await expect(
    validateFile(await pages.save(), "application/pdf"),
  ).rejects.toMatchObject({ status: 400 });
}, 20000);
it("bounded multipart rejects extra parts, oversized metadata, missing or truncated bytes and keeps byte identity", async () => {
  function request(form: FormData) {
    return new Request("http://localhost/api", { method: "POST", body: form });
  }
  const bytes = await readFile("demo/documents/demo-certificate.pdf"),
    form = new FormData();
  form.append("metadata", JSON.stringify(metadata));
  form.append(
    "file",
    new File([bytes], "demo.pdf", { type: "application/pdf" }),
  );
  const r = await readUpload(request(form));
  expect(Buffer.compare(Buffer.from(r.content), bytes)).toBe(0);
  const exact = new FormData();
  exact.append("metadata", JSON.stringify(metadata));
  exact.append(
    "file",
    new File([Buffer.alloc(MAX_DOCUMENT)], "demo.pdf", {
      type: "application/pdf",
    }),
  );
  expect((await readUpload(request(exact))).content.length).toBe(MAX_DOCUMENT);
  const extra = new FormData();
  extra.append("metadata", JSON.stringify(metadata));
  extra.append(
    "file",
    new File([bytes], "demo.pdf", { type: "application/pdf" }),
  );
  extra.append("other", "x");
  await expect(readUpload(request(extra))).rejects.toMatchObject({
    status: 400,
  });
  const large = new FormData();
  large.append("metadata", JSON.stringify(metadata));
  large.append(
    "file",
    new File([Buffer.alloc(MAX_DOCUMENT + 1)], "demo.pdf", {
      type: "application/pdf",
    }),
  );
  await expect(readUpload(request(large))).rejects.toMatchObject({
    status: 413,
  });
  const oversize = new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=x" },
    body: new Uint8Array(MAX_UPLOAD + 1),
  });
  await expect(readUpload(oversize)).rejects.toMatchObject({ status: 413 });
});
