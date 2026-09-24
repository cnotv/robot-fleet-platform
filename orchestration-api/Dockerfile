FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY prisma ./prisma
# postinstall runs prisma generate, so the client matches the schema in this image.
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Demo fleet from the `fleet` build context (ingestion-service/cmd/simulator), seeded only
# when DEMO_FLEET_FILE points at it. Baked in so remote hosts need no files from the repo.
COPY --from=fleet hotel-fleet.json /app/demo/hotel-fleet.json
USER node
EXPOSE 4000
# ponytail: db push syncs the schema on boot; switch to prisma migrate deploy once there are migrations to keep.
CMD ["sh", "-c", "node_modules/.bin/prisma db push --skip-generate && node dist/index.js"]
