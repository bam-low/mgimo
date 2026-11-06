// Read-only preflight. This helper never starts containers or publishes ports.
import { spawnSync } from "node:child_process";
import process from "node:process";
import console from "node:console";
export function validate(config, images) {
  const s = config.services;
  if (!s || Object.keys(s).sort().join(",") !== "app,cleanup,db,tools")
    throw Error("Unexpected services");
  if (
    config.networks.private?.internal !== true ||
    Object.keys(config.networks).sort().join(",") !== "edge,private" ||
    !Object.hasOwn(s.db.networks, "private") ||
    Object.hasOwn(s.db.networks, "edge")
  )
    throw Error("Private DB network required");
  if (s.db.ports?.length || s.db.user !== "70:70")
    throw Error("Private pinned PG17 required");
  const p = s.app.ports;
  if (p?.length !== 1 || p[0].host_ip !== "127.0.0.1" || p[0].target !== 3000)
    throw Error("Loopback app only");
  for (const name of ["app", "tools", "cleanup", "db"]) {
    const v = s[name],
      i = images[v.image];
    if (!/^(sha256:[a-f0-9]{64}|[^\s]+@sha256:[a-f0-9]{64})$/.test(v.image))
      throw Error("Immutable image required");
    if (
      !i ||
      i.Architecture !== "amd64" ||
      i.Os !== "linux" ||
      i.Config.User !== (name === "db" ? "70:70" : "1000:1000") ||
      v.user !== i.Config.User ||
      i.Config.Labels?.["io.campus.role"] !==
        (name === "db" ? "database" : name === "tools" ? "tools" : "runtime")
    )
      throw Error("Wrong image role/user");
    if (
      !v.read_only ||
      !v.cap_drop?.includes("ALL") ||
      !v.security_opt?.includes("no-new-privileges:true") ||
      !v.mem_limit ||
      !v.pids_limit
    )
      throw Error("Container restrictions required");
    if (name !== "app" && v.ports?.length) throw Error("No job ports");
  }
  if (
    s.app.secrets.some((x) => !["runtime.env", "db-ca.pem"].includes(x.source))
  )
    throw Error("Owner credentials in app");
}
if (process.argv[1]?.endsWith("/check-release.mjs")) {
  try {
    if (process.argv.length !== 3) throw Error("release.env path required");
    const docker = (a) => {
      const r = spawnSync("docker", a, { encoding: "utf8" });
      if (r.status !== 0) throw Error("Docker preflight failed");
      return JSON.parse(r.stdout);
    };
    const c = docker([
      "compose",
      "--profile",
      "ops",
      "--env-file",
      process.argv[2],
      "-f",
      "ops/vps/compose.yaml",
      "config",
      "--format",
      "json",
    ]);
    const images = {};
    for (const name of ["app", "tools", "db"]) {
      const id = c.services[name].image;
      images[id] = docker(["image", "inspect", id])[0];
    }
    validate(c, images);
    console.log(
      "PASS immutable images, roles, private DB, loopback and limits; no deploy",
    );
  } catch {
    console.error("STOP VPS preflight failed; do not deploy");
    process.exitCode = 1;
  }
}
