# ChatterBots Remix — production image (also usable on any VPS/Fly/Coolify).
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server.ts ./server.ts
# Runtime-writable sandboxed folder for the filesystem adapter.
RUN mkdir -p adapter-workspace
EXPOSE 3000
CMD ["npm", "start"]
