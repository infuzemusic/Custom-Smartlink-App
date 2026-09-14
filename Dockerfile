# Runs anywhere that takes a container: Fly, Railway, Render, Cloud Run, your own box.
# On Vercel none of this is needed — it builds the project directly.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# sharp ships prebuilt binaries; --include=optional is what pulls the right one.
RUN npm ci --include=optional

FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `next build` runs without a database: every page that reads one is force-dynamic.
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# The standalone bundle carries its own traced dependencies; static assets and public/
# are not traced and have to be placed alongside it.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
# Migrations run as a release step against this same image. The standalone bundle
# inlines pure-JS dependencies into its server chunks rather than leaving them in
# node_modules, so the migration script — which runs outside that bundle — needs its
# own copy of the driver. Without this, `db:migrate` fails with ERR_MODULE_NOT_FOUND
# in the container even though the app itself runs fine.
COPY --from=build --chown=nextjs:nodejs /app/db ./db
COPY --from=build --chown=nextjs:nodejs /app/node_modules/postgres ./node_modules/postgres

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
