# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS build
WORKDIR /workspace
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx ng build storefront --configuration production && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/dist/storefront ./dist/storefront
USER node
EXPOSE 4000
# Required: SHOPIVO_API_URL (internal backend URL). Optional: SHOPIVO_TRUST_PROXY (load balancer address/CIDR).
CMD ["node", "dist/storefront/server/server.mjs"]
