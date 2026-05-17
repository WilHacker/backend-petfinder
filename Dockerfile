# syntax=docker/dockerfile:1.6
FROM node:22-alpine

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

COPY . .

# Verificación 1: que src/cloudinary tenga los archivos fuente
RUN echo "=== src/cloudinary ===" && ls -la /app/src/cloudinary/ && test -f /app/src/cloudinary/cloudinary.module.ts

RUN npm ci --include=dev --ignore-scripts
RUN npx prisma generate
RUN npm run build

# Verificación 2: que el build haya producido los archivos
RUN echo "=== dist/cloudinary tras nest build ===" && ls -la /app/dist/cloudinary/ && test -f /app/dist/cloudinary/cloudinary.module.js
RUN echo "=== dist completo ===" && find /app/dist -name "*.js" | head -30

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "/app/dist/main.js"]
