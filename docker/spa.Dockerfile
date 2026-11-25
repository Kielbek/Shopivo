# syntax=docker/dockerfile:1.7
# Usage: docker build -f docker/spa.Dockerfile --build-arg APP=merchant-dashboard .
FROM node:22-alpine AS build
ARG APP
WORKDIR /workspace
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx ng build ${APP} --configuration production

FROM nginxinc/nginx-unprivileged:1.29-alpine
ARG APP
COPY docker/nginx/spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/dist/${APP}/browser /usr/share/nginx/html
EXPOSE 8080
