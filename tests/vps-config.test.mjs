import { test } from "node:test";
import assert from "node:assert/strict";
import { validate } from "../ops/vps/check-release.mjs";
const app = "sha256:" + "a".repeat(64),
  tools = "sha256:" + "b".repeat(64),
  db = "sha256:" + "c".repeat(64);
function fixture() {
  const restricted = (image) => ({
    image,
    user: "1000:1000",
    read_only: true,
    cap_drop: ["ALL"],
    security_opt: ["no-new-privileges:true"],
    mem_limit: 128,
    pids_limit: 32,
  });
  return {
    services: {
      db: { ...restricted(db), user: "70:70", networks: { private: {} } },
      app: {
        ...restricted(app),
        ports: [{ host_ip: "127.0.0.1", target: 3000 }],
        secrets: [{ source: "runtime.env" }, { source: "db-ca.pem" }],
      },
      tools: {
        ...restricted(tools),
        secrets: [
          { source: "migration.env" },
          { source: "runtime-db.env" },
          { source: "db-ca.pem" },
        ],
      },
      cleanup: restricted(app),
    },
    networks: { private: { internal: true }, edge: {} },
  };
}
const images = {
  [db]: {
    Architecture: "amd64",
    Os: "linux",
    Config: { User: "70:70", Labels: { "io.campus.role": "database" } },
  },
  [app]: {
    Architecture: "amd64",
    Os: "linux",
    Config: { User: "1000:1000", Labels: { "io.campus.role": "runtime" } },
  },
  [tools]: {
    Architecture: "amd64",
    Os: "linux",
    Config: { User: "1000:1000", Labels: { "io.campus.role": "tools" } },
  },
};
test("accepts constrained immutable release", () =>
  validate(fixture(), images));
for (const [label, change] of [
  [
    "bootstrap secret in migration",
    (c) => c.services.tools.secrets.push({ source: "bootstrap.env" }),
  ],
  [
    "session secret in migration",
    (c) => c.services.tools.secrets.push({ source: "runtime.env" }),
  ],
  [
    "root DB override",
    (c) => {
      c.services.db.user = "0:0";
    },
  ],
  [
    "root app override",
    (c) => {
      c.services.app.user = "0:0";
    },
  ],
  [
    "public app",
    (c) => {
      c.services.app.ports[0].host_ip = "0.0.0.0";
    },
  ],
  [
    "DB port",
    (c) => {
      c.services.db.ports = [{ target: 5432 }];
    },
  ],
  [
    "mutable image",
    (c) => {
      c.services.app.image = "campus:latest";
    },
  ],
  [
    "tools as runtime",
    (c) => {
      c.services.app.image = tools;
    },
  ],
  [
    "owner secrets",
    (c) => {
      c.services.app.secrets.push({ source: "bootstrap.env" });
    },
  ],
  [
    "outbound network",
    (c) => {
      c.networks.private.internal = false;
    },
  ],
  [
    "writeable app",
    (c) => {
      c.services.app.read_only = false;
    },
  ],
])
  test("rejects " + label, () => {
    const c = fixture();
    change(c);
    assert.throws(() => validate(c, images));
  });
