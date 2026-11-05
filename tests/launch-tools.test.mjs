import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  mkdir,
  chmod,
  stat,
  symlink,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, X509Certificate } from "node:crypto";
import {
  generatedOwnerConfig,
  neonRootCA,
  runtimeConfig,
  writePrivateConfig,
} from "../scripts/launch-config.mjs";
import { vercelPreflight } from "../scripts/launch-vercel.mjs";
import { launchDatabaseURL } from "../scripts/launch-db.mjs";
const { Response, URL } = globalThis;
test("psql CA export uses the existing trusted public ISRG Root X1, no network or TLS downgrade", () => {
  const cert = new X509Certificate(neonRootCA());
  assert.equal(cert.ca, true);
  assert.equal(
    cert.fingerprint256,
    "96:BC:EC:06:26:49:76:F3:74:60:77:9A:CF:28:C5:A7:CF:E8:A3:C0:AA:E1:1A:8F:FC:EE:05:C0:BD:DF:08:C6",
  );
});
test("private configuration has six independent random values and an exclusive outside-repo file", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "campus-launch-tools-"));
  try {
    const body = generatedOwnerConfig();
    const values = body
      .split("\n")
      .filter((l) => /^[A-Z0-9_]+=[\da-f]{64}$/.test(l))
      .map((l) => l.split("=")[1]);
    assert.equal(values.length, 6);
    assert.equal(new Set(values).size, 6);
    const output = path.join(directory, "owner.env");
    await writePrivateConfig(output, body);
    assert.equal((await readFile(output, "utf8")) === body, true);
    assert.equal((await stat(output)).mode & 0o077, 0);
    await assert.rejects(() => writePrivateConfig(output, "overwrite"));
    await assert.rejects(() =>
      writePrivateConfig(path.resolve(".env.launch-unwanted"), body),
    );
    const alias = path.join(directory, "repo-link");
    await symlink(path.resolve("."), alias);
    await assert.rejects(() =>
      writePrivateConfig(path.join(alias, ".env.launch-unwanted"), body),
    );
    const shared = path.join(directory, "shared");
    await mkdir(shared);
    await chmod(shared, 0o755);
    await assert.rejects(() =>
      writePrivateConfig(path.join(shared, "owner.env"), body),
    );
    const otherRepo = path.join(directory, "other-repo");
    await mkdir(otherRepo, { mode: 0o700 });
    await mkdir(path.join(otherRepo, ".git"));
    await assert.rejects(() =>
      writePrivateConfig(path.join(otherRepo, "owner.env"), body),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
function owner() {
  return {
    DIRECT_DATABASE_URL:
      "postgresql://owner:fictional@ep-synthetic.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full",
    CAMPUS_POOLED_HOST: "ep-synthetic-pooler.eu-central-1.aws.neon.tech",
    CAMPUS_RUNTIME_PASSWORD: randomBytes(32).toString("hex"),
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    CRON_SECRET: randomBytes(32).toString("hex"),
    BETTER_AUTH_URL: "https://synthetic.vercel.app",
    DEMO_STAFF_PASSWORD: randomBytes(32).toString("hex"),
    VERCEL_TOKEN: randomBytes(32).toString("hex"),
  };
}
test("runtime file only contains limited pooled URL and five approved runtime variables", () => {
  const env = owner(),
    body = runtimeConfig(env);
  assert.equal(body.includes(env.DIRECT_DATABASE_URL), false);
  assert.equal(body.includes(env.DEMO_STAFF_PASSWORD), false);
  assert.equal(body.includes(env.VERCEL_TOKEN), false);
  assert.deepEqual(
    body
      .trim()
      .split("\n")
      .map((l) => l.split("=")[0]),
    [
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "CRON_SECRET",
      "BETTER_AUTH_URL",
      "AUTH_TRUSTED_IP_HEADER",
    ],
  );
  const url = new URL(body.split("\n")[0].slice("DATABASE_URL=".length));
  assert.equal(url.username, "campus_runtime");
  assert.equal(url.password === env.CAMPUS_RUNTIME_PASSWORD, true);
  assert.equal(url.searchParams.get("sslmode"), "verify-full");
  for (const change of [
    { CAMPUS_POOLED_HOST: "other-pooler.eu-central-1.aws.neon.tech" },
    { BETTER_AUTH_URL: "http://localhost" },
    { BETTER_AUTH_URL: "https://synthetic.vercel.app/path" },
    {
      DIRECT_DATABASE_URL: env.DIRECT_DATABASE_URL.replace(
        "verify-full",
        "require",
      ),
    },
  ])
    assert.throws(() => runtimeConfig({ ...env, ...change }));
  assert.throws(() =>
    runtimeConfig({
      ...env,
      DIRECT_DATABASE_URL: env.DIRECT_DATABASE_URL + "&user=owner",
    }),
  );
});
test("database entry rejects non-Neon, admin runtime, weak TLS and non-loopback local exceptions", () => {
  const safe =
    "postgresql://campus_runtime:fictional@ep-synthetic-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full";
  assert.equal(launchDatabaseURL(safe, false, {}).enableChannelBinding, true);
  for (const url of [
    safe.replace("verify-full", "require"),
    safe.replace("campus_runtime", "owner"),
    safe.replace(".neon.tech", ".example.invalid"),
  ])
    assert.throws(() => launchDatabaseURL(url, false, {}));
  assert.throws(() =>
    launchDatabaseURL(safe, false, { NODE_TLS_REJECT_UNAUTHORIZED: "0" }),
  );
  assert.throws(() =>
    launchDatabaseURL(safe + "&host=other.example.invalid", false, {}),
  );
  assert.throws(() =>
    launchDatabaseURL(safe + "&sslmode=no-verify", false, {}),
  );
  assert.throws(() =>
    launchDatabaseURL(safe, false, { CAMPUS_LAUNCH_LOCAL_TEST: "yes" }),
  );
  assert.throws(() =>
    launchDatabaseURL(
      "postgresql://campus_runtime:fictional@127.0.0.1/demo",
      false,
      { CAMPUS_LAUNCH_LOCAL_TEST: "yes" },
    ),
  );
  assert.equal(
    Boolean(
      launchDatabaseURL(
        "postgresql://campus_runtime:fictional@127.0.0.1/campus_test",
        false,
        { CAMPUS_LAUNCH_LOCAL_TEST: "yes" },
      ),
    ),
    true,
  );
});
function mock(overrides = {}) {
  const env = {
    VERCEL_TOKEN: randomBytes(32).toString("hex"),
    VERCEL_TEAM_ID: "team_synthetic",
    VERCEL_PROJECT_ID: "prj_synthetic",
    CAMPUS_VERCEL_PROJECT_NAME: "campus-synthetic",
    BETTER_AUTH_URL: "https://synthetic.vercel.app",
  };
  const calls = [];
  const project = {
    id: env.VERCEL_PROJECT_ID,
    name: env.CAMPUS_VERCEL_PROJECT_NAME,
    accountId: env.VERCEL_TEAM_ID,
    nodeVersion: "24.x",
    framework: null,
    serverlessFunctionRegion: "fra1",
    ssoProtection: { deploymentType: "all" },
    buildCommand: "npm run build:vercel && npm run check:vercel-runtime",
    installCommand: "npm ci --include=dev --ignore-scripts",
    trustedSources: { enableVercelCiSameRepository: false },
    ...overrides,
  };
  const request = async (url, options) => {
    assert.equal(url.startsWith("https://api.vercel.com/"), true);
    assert.equal(options.redirect, "error");
    assert.equal(
      options.headers.Authorization === "Bearer " + env.VERCEL_TOKEN,
      true,
    );
    calls.push({ url, options });
    if (url.includes("/v2/teams/"))
      return Response.json({
        id: env.VERCEL_TEAM_ID,
        billing: { plan: "hobby" },
      });
    if (url.includes("/v11/projects"))
      return Response.json({ ...project, latestDeployments: [] });
    if (url.includes("/v6/deployments"))
      return Response.json({ deployments: [] });
    if (url.includes("/domains?"))
      return Response.json({
        domains: [{ name: "synthetic.vercel.app", verified: true }],
      });
    return Response.json(project);
  };
  return { env, calls, request, project };
}
test("Vercel create sends All Deployments atomically, no Git/env/deployment request", async () => {
  const m = mock();
  await vercelPreflight("create", m.env, m.request);
  const writes = m.calls.filter((c) => c.options.method === "POST");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].url.includes("/v11/projects?"), true);
  const body = JSON.parse(writes[0].options.body);
  assert.equal(body.ssoProtection.deploymentType, "all");
  assert.equal("gitRepository" in body, false);
  assert.equal("environmentVariables" in body, false);
  const patches = m.calls.filter((c) => c.options.method === "PATCH");
  assert.equal(patches.length, 1);
  assert.equal(
    JSON.parse(patches[0].options.body).trustedSources
      .enableVercelCiSameRepository,
    false,
  );
  assert.equal(
    m.calls.some((c) => /\/deployments/.test(c.url)),
    false,
  );
  const bad = mock({ ssoProtection: { deploymentType: "preview" } });
  await assert.rejects(() => vercelPreflight("create", bad.env, bad.request));
  assert.equal(
    bad.calls.some((c) => c.options.method === "PATCH"),
    false,
  );
});
test("Vercel read-only gate requires all URLs, zero deployments, no bypass and verified origin", async () => {
  const good = mock();
  await vercelPreflight("check", good.env, good.request);
  assert.equal(
    good.calls.every((c) => !c.options.method),
    true,
  );
  for (const change of [
    { ssoProtection: { deploymentType: "preview" } },
    {
      ssoProtection: {
        deploymentType: "prod_deployment_urls_and_all_previews",
      },
    },
    { ssoProtection: null },
    { nodeVersion: "26.x" },
    { framework: "nextjs" },
    { protectionBypass: { synthetic: {} } },
    { optionsAllowlist: { paths: [{ value: "/api/*" }] } },
    { trustedSources: null },
    { trustedSources: { enableVercelCiSameRepository: true } },
    { link: { type: "github", org: "bam-low", repo: "mgimo" } },
  ]) {
    const m = mock(change);
    await assert.rejects(() => vercelPreflight("check", m.env, m.request));
  }
  const origin = mock();
  origin.env.BETTER_AUTH_URL = "https://unverified.vercel.app";
  await assert.rejects(() =>
    vercelPreflight("check", origin.env, origin.request),
  );
  const linked = mock({
    link: { type: "github", org: "bam-low", repo: "mgimo" },
  });
  await vercelPreflight("check-linked", linked.env, linked.request);
  linked.project.link.repo = "other-synthetic";
  await assert.rejects(() =>
    vercelPreflight("check-linked", linked.env, linked.request),
  );
  const existing = mock();
  await assert.rejects(() =>
    vercelPreflight("check", existing.env, (url, options) =>
      url.includes("/v6/deployments")
        ? Response.json({ deployments: [{ id: "dpl_synthetic" }] })
        : existing.request(url, options),
    ),
  );
});
test("Vercel refuses paid/trial/API errors before project creation and does not echo response secrets", async () => {
  for (const billing of [
    { plan: "pro" },
    { plan: "hobby", trial: { start: 1 } },
    { plan: "hobby", status: "trialing" },
  ]) {
    const m = mock();
    let writes = 0;
    await assert.rejects(() =>
      vercelPreflight("create", m.env, async (u, o) => {
        if (o.method) writes++;
        return Response.json({ id: m.env.VERCEL_TEAM_ID, billing });
      }),
    );
    assert.equal(writes, 0);
  }
  const m = mock();
  let error;
  try {
    await vercelPreflight(
      "create",
      m.env,
      async () => new Response(m.env.VERCEL_TOKEN, { status: 403 }),
    );
  } catch (e) {
    error = e;
  }
  assert.equal(Boolean(error), true);
  assert.equal(String(error).includes(m.env.VERCEL_TOKEN), false);
});
