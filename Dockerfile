# syntax=docker/dockerfile:1.6
FROM node:22-alpine

# OpenSSL para Prisma + libc6-compat para algunas deps nativas
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copiamos todo el contexto del repo
COPY . .

# Instalamos TODAS las dependencias (devDeps incluidas)
RUN npm ci --include=dev --ignore-scripts

# Generamos el Prisma Client
RUN npx prisma generate

# Compilamos TypeScript → dist/
RUN npm run build

# Verificación crítica: si dist/main.js no existe, falla el build aquí (no en runtime)
RUN ls -la /app/dist && test -f /app/dist/main.js

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "/app/dist/main.js"]
