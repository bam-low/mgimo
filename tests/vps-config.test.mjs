import { test } from "node:test";
import assert from "node:assert/strict";
import { validate } from "../ops/vps/check-release.mjs";
const app = "sha256:" + "a".repeat(64),
  tools = "sha256:" + "b".repeat(64);
function fixture() {
  const restricted = (image) => ({
    image,
    read_only: true,
    cap_drop: ["ALL"],
    security_opt: ["no-new-privileges:true"],
    mem_limit: 128,
    pids_limit: 32,
  });
  return {
    services: {
      db: {
        networks: { private: {} },
        image:
          "postgres:17-bookworm@sha256:839fbb5a4942a7758dd93e18b42ea5649807491a0545b5eeeb8f0b8bb11857a5",
      },
      app: {
        ...restricted(app),
        ports: [{ host_ip: "127.0.0.1", target: 3000 }],
        secrets: [{ source: "runtime.env" }, { source: "db-ca.pem" }],
      },
      tools: restricted(tools),
      cleanup: restricted(app),
    },
    networks: { private: { internal: true }, edge: {} },
  };
}
const images = {
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
