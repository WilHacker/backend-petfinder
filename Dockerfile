# syntax=docker/dockerfile:1.6

# ============================================================
# STAGE 1 — Builder: instala todas las deps y compila TypeScript
# ============================================================
FROM node:22-alpine AS builder

# OpenSSL es requerido por Prisma para conectar a Postgres con SSL
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copiamos solo los manifiestos primero para aprovechar el caché de capas
COPY package.json package-lock.json ./
COPY prisma ./prisma

# --ignore-scripts evita correr postinstall (que llama prisma generate)
# antes de copiar el schema. Lo corremos manualmente después.
RUN npm ci --include=dev --ignore-scripts

# Genera el Prisma Client
RUN npx prisma generate

# Ahora sí copiamos todo el código fuente
COPY . .

# Compila TypeScript → dist/
RUN npm run build

# Elimina devDependencies para producción (reduce tamaño)
RUN npm prune --omit=dev


# ============================================================
# STAGE 2 — Runner: imagen mínima solo con lo necesario
# ============================================================
FROM node:22-alpine AS runner

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Usuario no-root por seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs

# Copiamos solo lo necesario desde el builder
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma

ENV NODE_ENV=production
ENV PORT=3000

USER nestjs

EXPOSE 3000

# Healthcheck básico para que Docker sepa si el contenedor está vivo
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD wget -q -O /dev/null http://localhost:${PORT}/api/docs || exit 1

CMD ["node", "dist/main"]
