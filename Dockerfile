# syntax=docker/dockerfile:1.6
FROM node:22-alpine

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

COPY . .

RUN npm ci --include=dev --ignore-scripts
RUN npx prisma generate
RUN npm run build

# Verificación: el build genera dist/src/main.js (no dist/main.js)
# porque prisma.config.ts en la raíz hace que TS infiera rootDir como el proyecto
RUN test -f /app/dist/src/main.js && echo "✓ main.js encontrado en dist/src/"

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "/app/dist/src/main.js"]
