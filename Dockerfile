# --- Frontend bauen ---
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --include=dev: Vite & TypeScript werden auch gebraucht, falls NODE_ENV=production als Build-Variable gesetzt ist
RUN npm ci --include=dev
COPY . .
RUN npm run build

# --- Laufzeit: nur Node, Server-Code und die gebaute index.html (keine node_modules nötig) ---
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data TZ=Europe/Berlin
COPY --from=build /app/package.json ./
COPY --from=build /app/server ./server
# Status- und Datumslogik teilt sich der Server (MCP-Tools) mit der App
COPY --from=build /app/src/lib ./src/lib
COPY --from=build /app/dist ./dist
# Kein VOLUME hier: /data wird als persistenter Speicher von außen eingehängt (Coolify: Storages, Compose: volumes).
# Ein VOLUME im Image würde bei jedem Deploy ein neues, leeres anonymes Volume anlegen.
RUN mkdir -p /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "server/index.ts"]
