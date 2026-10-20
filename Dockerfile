# VisionInspect web app: Next.js 15 (Node 22) with SQLite (better-sqlite3).
# Stores the database and inspection images in VI_DATA_DIR (/data): mount a persistent volume there.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# better-sqlite3 ships prebuilt binaries (linux-x64/arm64 included), but npm still runs an implicit
# node-gyp build because the package contains binding.gyp. Skip scripts, then run the two that matter.
RUN npm ci --ignore-scripts && npm rebuild esbuild unrs-resolver \
    && node -e "new (require('better-sqlite3'))(':memory:')"
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    VI_DATA_DIR=/data \
    INFERENCE_URL=http://inference:8000
COPY --from=build /app/package.json /app/package-lock.json /app/next.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
