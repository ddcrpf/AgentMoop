FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends zip && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ARG PUBLIC_BASE_URL
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY tsconfig*.json ./
COPY src ./src
COPY web ./web
COPY plugin ./plugin
COPY scripts ./scripts
RUN npm run build && scripts/build-plugin.sh "$PUBLIC_BASE_URL"

FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3434 DATA_DIR=/app/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-fund --no-audit && mkdir /app/data && chown node:node /app/data
COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist
USER node
EXPOSE 3434
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "require('node:http').get({hostname:'127.0.0.1',port:3434,path:'/healthz',headers:{Host:new URL(process.env.PUBLIC_BASE_URL).host}},r=>{r.resume();process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"
CMD ["node","dist/http/server.js"]
