// Owner-only API operations; no deployment endpoint, Git linking or secret upload.
import process from "node:process";
import console from "node:console";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
const { fetch, AbortSignal } = globalThis;
export async function vercelPreflight(mode, env, request = fetch) {
  if (!env.VERCEL_TOKEN || !/^team_[\w]+$/.test(env.VERCEL_TEAM_ID ?? ""))
    throw Error("Private token and exact Hobby team ID required");
  const api = async (route, options = {}) => {
    const response = await request("https://api.vercel.com" + route, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: "Bearer " + env.VERCEL_TOKEN,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) throw Error("Vercel API rejected request");
    return response.json();
  };
  const team = await api("/v2/teams/" + env.VERCEL_TEAM_ID);
  if (
    team.id !== env.VERCEL_TEAM_ID ||
    team.billing?.plan !== "hobby" ||
    team.billing.trial ||
    team.billing.status === "trialing"
  )
    throw Error("Non-trial Hobby required");
  const scope = "?teamId=" + encodeURIComponent(env.VERCEL_TEAM_ID);
  if (mode === "create") {
    if (!/^[a-z][a-z0-9-]{2,60}$/.test(env.CAMPUS_VERCEL_PROJECT_NAME ?? ""))
      throw Error("Exact project name required");
    const project = await api("/v11/projects" + scope, {
      method: "POST",
      body: JSON.stringify({
        name: env.CAMPUS_VERCEL_PROJECT_NAME,
        framework: null,
        installCommand: "npm ci --include=dev --ignore-scripts",
        buildCommand: "npm run build:vercel && npm run check:vercel-runtime",
        serverlessFunctionRegion: "fra1",
        ssoProtection: { deploymentType: "all" },
        skipGitConnectDuringLink: true,
      }),
    });
    if (
      project.ssoProtection?.deploymentType !== "all" ||
      project.link ||
      project.latestDeployments?.length ||
      !project.id ||
      project.accountId !== env.VERCEL_TEAM_ID ||
      project.name !== env.CAMPUS_VERCEL_PROJECT_NAME
    )
      throw Error("Empty protected project NOT VERIFIED; no deploy requested");
    const configured = await api("/v9/projects/" + project.id + scope, {
      method: "PATCH",
      body: JSON.stringify({
        nodeVersion: "24.x",
        ssoProtection: { deploymentType: "all" },
        trustedSources: {
          enableVercelCiSameRepository: false,
          oidcProviders: {},
          projects: {},
        },
      }),
    });
    if (
      configured.ssoProtection?.deploymentType !== "all" ||
      configured.nodeVersion !== "24.x" ||
      configured.trustedSources?.enableVercelCiSameRepository !== false
    )
      throw Error("Empty project settings NOT VERIFIED");
    return "PASS empty project created with All Deployments; no Git link, env upload or deployment requested. Verify dashboard, copy project ID locally, then run check.";
  }
  if (
    !["check", "check-linked"].includes(mode) ||
    !/^prj_[\w]+$/.test(env.VERCEL_PROJECT_ID ?? "")
  )
    throw Error("Exact project ID required");
  const project = await api("/v9/projects/" + env.VERCEL_PROJECT_ID + scope);
  const deployments = await api(
    "/v6/deployments" +
      scope +
      "&projectId=" +
      env.VERCEL_PROJECT_ID +
      "&limit=1",
  );
  const domains = await api(
    "/v9/projects/" + env.VERCEL_PROJECT_ID + "/domains" + scope,
  );
  const origin = new URL(env.BETTER_AUTH_URL);
  const empty = (value) =>
    value == null ||
    (typeof value === "object" && Object.keys(value).length === 0);
  const trusted = project.trustedSources;
  const regions = project.resourceConfig?.functionDefaultRegions ?? [
    project.serverlessFunctionRegion,
  ];
  const linked = mode === "check-linked";
  if (
    project.id !== env.VERCEL_PROJECT_ID ||
    project.accountId !== env.VERCEL_TEAM_ID ||
    project.ssoProtection?.deploymentType !== "all" ||
    project.nodeVersion !== "24.x" ||
    project.framework !== null ||
    regions.length !== 1 ||
    regions[0] !== "fra1" ||
    project.installCommand !== "npm ci --include=dev --ignore-scripts" ||
    project.buildCommand !==
      "npm run build:vercel && npm run check:vercel-runtime" ||
    (!linked && (project.link || deployments.deployments?.length !== 0)) ||
    (linked &&
      (project.link?.type !== "github" ||
        project.link.org !== "bam-low" ||
        project.link.repo !== "mgimo")) ||
    !empty(project.protectionBypass) ||
    project.passwordProtection ||
    project.trustedIps ||
    (project.optionsAllowlist?.paths?.length ?? 0) !== 0 ||
    trusted?.enableVercelCiSameRepository !== false ||
    !empty(trusted.oidcProviders) ||
    !empty(trusted.projects) ||
    Object.keys(trusted).some(
      (k) =>
        !["enableVercelCiSameRepository", "oidcProviders", "projects"].includes(
          k,
        ),
    ) ||
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.port ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    !domains.domains?.some(
      (d) => d.name === origin.hostname && d.verified === true && !d.redirect,
    )
  )
    throw Error("Pre-deploy project contract NOT VERIFIED");
  return "PASS API config: Hobby, All Deployments, Other, Node24, fra1, verified origin, no configured external bypass. UI access review and explicit owner deployment approval still required.";
}
export async function main(args = process.argv.slice(2), env = process.env) {
  try {
    if (
      args.join(" ") !== "create --apply --owner-approved-free-project" &&
      !["check", "check-linked"].includes(args.join(" "))
    )
      throw Error("Explicit action required");
    console.log(await vercelPreflight(args[0], env));
    return 0;
  } catch {
    console.error(
      "STOP Vercel preparation NOT VERIFIED. No deploy requested. Check plan/protection/config privately; never share tokens or raw API responses.",
    );
    return 1;
  }
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
)
  process.exitCode = await main();
