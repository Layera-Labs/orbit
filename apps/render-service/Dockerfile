# The render service.
#
# ffmpeg is the reason this image exists at all: the service shells out to it,
# and `renderProject` also uses @resvg for text rasterization, so neither a
# plain `node` base nor a serverless function will do. Anything that runs a
# container will run this.
#
# Built from the REPO ROOT, not this directory:
#   docker build -f apps/render-service/Dockerfile -t orbit-render .
# The service imports workspace packages (@orbit/video, @orbit/billing, …) by
# source, so it needs the whole pnpm workspace present to install and build.

# The architecture is STATED, because one dependency here is a native addon.
#
# `@resvg/resvg-js` ships per-platform prebuilds and is loaded into the service
# process, so an image whose addon does not match the machine running it starts
# fine, answers /health, and then fails every render carrying a caption. ffmpeg
# is a subprocess and would fail loudly; this one does not.
#
# Left unstated, `docker build` produces an image for whatever the BUILD host
# is. That is correct today — the deploy builds on the VPS
# (`scripts/orbit-render deploy`) — and silently wrong the first time someone
# builds on a Mac and pushes. Naming it costs nothing where it actually runs,
# since the VPS is amd64 anyway.
#
# To run the image locally on Apple silicon instead:
#   docker build --build-arg PLATFORM=linux/arm64 -f apps/render-service/Dockerfile .
ARG PLATFORM=linux/amd64

# ---- build ------------------------------------------------------------------
# Build and run on the SAME platform, deliberately. The usual cross-compile
# idiom (`--platform=$BUILDPLATFORM` on the build stage) is wrong here: it would
# resolve the native addon for the builder and ship it to a different target.
FROM --platform=${PLATFORM} node:22-trixie-slim AS build
WORKDIR /app

# Corepack pins pnpm to whatever packageManager says, so the image and a
# developer's machine resolve the same tree.
RUN corepack enable

# Manifests first: this layer is what Docker can cache, and it only busts when a
# dependency actually changes rather than on every source edit.
# The root tsconfig is not optional: every package `extends` it, and without it
# each one compiles against tsc's defaults — ES5, no module resolution — and
# fails on the workspace's own type definitions.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY apps/render-service/package.json apps/render-service/
COPY packages packages
RUN pnpm install --frozen-lockfile --filter @orbit/render-service...

COPY apps/render-service apps/render-service
RUN pnpm --filter @orbit/render-service... build

# Re-link, production only.
#
# NOT `pnpm prune --prod`: that strips the per-package `node_modules`
# directories a pnpm workspace resolves through, leaving only the root store, so
# the service starts and immediately cannot find `cors`. A second install with
# `--prod` rebuilds the links with the dev dependencies left out.
RUN CI=true pnpm install --frozen-lockfile --prod --filter @orbit/render-service...

# ---- run --------------------------------------------------------------------
FROM --platform=${PLATFORM} node:22-trixie-slim
WORKDIR /app

# ffmpeg AND ffprobe: the engine probes for an audio stream before building the
# filtergraph, and a clip with no audio used to crash the render without it.
#
# **The DISTRIBUTION is what decides which transitions this service can do**, so
# the base tag above is a product decision and not a housekeeping one. `xfade`'s
# `cover*` and `reveal*` families — the editor's Push and Reveal, 8 of the 36 it
# offers — arrived in ffmpeg 6.1. Debian bookworm ships 5.1, so on
# `node:20-bookworm-slim` those eight were hidden from both pickers by the
# capability gate and refused by `renderProject`: correct behaviour, and a
# quarter of the catalogue missing. Trixie (Debian 13) ships 7.1 and has them.
# Check with `scripts/orbit-render caps` after any change here — that is the
# whole reason it prints a verdict rather than a version.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=8787

COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages packages
COPY --from=build /app/apps/render-service apps/render-service

# A writable home for a mounted volume, owned by the user the service runs as.
#
# The service writes media and renders to the OS temp dir, which is
# world-writable — fine, but it also dies with the container. A deployment
# therefore mounts a volume and points TMPDIR at it (see compose.vps.yaml), and
# a named volume mounted on a path that does NOT exist in the image is created
# root-owned, which an unprivileged process cannot write to. Creating the
# directory here first is what makes Docker seed the volume with this
# ownership instead. Costs nothing when no volume is mounted.
RUN mkdir -p /data && chown node:node /data

# Unprivileged, and the image already ships a `node` user.
USER node

EXPOSE 8787

# The service's own health endpoint, so an orchestrator sees "started" only once
# it is actually answering rather than once the process exists.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/render-service/dist/main.js"]
