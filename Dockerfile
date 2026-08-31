# Build the static bundle, then serve it. Two stages so the runtime image
# carries nginx and the built files and nothing else — no Node, no sources, no
# node_modules.

FROM node:22-alpine AS build

WORKDIR /app

# Dependencies first: this layer is reused on every build that does not change
# the lockfile, which is most of them.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Where the app will be served from. Leave as "/" for a domain root; set to
# something like "/crz/" to host it under a path.
#
# Passed on the command line rather than read from the environment in
# vite.config.ts: the app's tsconfig deliberately excludes Node types so
# `process` cannot leak into browser code.
ARG BASE_PATH=/
RUN npm run build -- --base="${BASE_PATH}"

FROM nginx:1.29-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# The image serves static files and talks to nothing. There is no backend, no
# database and no secret to mount — a campaign lives in the browser and in
# whatever .json file its owner exported.
EXPOSE 80
