FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
RUN npm ci

COPY . .
RUN npm --workspace apps/api run build

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /app /app

EXPOSE 8080
CMD ["node", "apps/api/dist/main.js"]
