// prisma.config.ts
import { defineConfig } from '@prisma/config';
import * as dotenv from 'dotenv';

// Forzamos la carga del archivo .env
dotenv.config();

export default defineConfig({
  datasource: {
    /**
     * IMPORTANTE: Para 'migrate dev' en Supabase DEBES usar DIRECT_URL (Puerto 5432).
     * El Pooler (Puerto 6543) no permite los bloqueos de sesión necesarios para crear tablas.
     */
    url: process.env.DIRECT_URL,
  },
});
