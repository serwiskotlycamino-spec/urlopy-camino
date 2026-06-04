FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package*.json ./
COPY apps/web-admin/package*.json ./apps/web-admin/
RUN npm install --include=optional

COPY . .
RUN npm --workspace apps/web-admin run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /app /app

EXPOSE 8080
CMD ["npm", "--workspace", "apps/web-admin", "run", "start"]
