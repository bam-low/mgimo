# Runtime input is an independently checked standalone artifact, never a checkout.
FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c AS base
FROM base AS artifact
WORKDIR /app
COPY app/ /app/
COPY image-check.mjs /check.mjs
RUN node /check.mjs /app
FROM gcr.io/distroless/cc-debian13:nonroot@sha256:08476c244888bfb425bae1ae4dd7c17f093e972aab8426883d97f3c6f280f7c1 AS runtime
LABEL io.campus.role="runtime" io.campus.node="24.22.1"
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=base /usr/local/bin/node /usr/local/bin/node
COPY --from=artifact --chown=1000:1000 /app/ /app/
COPY --chown=1000:1000 cleanup-client.mjs /opt/campus/cleanup-client.mjs
USER 1000:1000
ENTRYPOINT []
EXPOSE 3000
CMD ["node", "--max-old-space-size=640", "--env-file=/run/secrets/runtime.env", "server.js"]
