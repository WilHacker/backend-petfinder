import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // 1. Instanciamos el Pool de conexiones usando el driver nativo 'pg'
    // Automáticamente tomará la variable de entorno DATABASE_URL
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    // 2. Envolvemos el pool en el adaptador oficial de Prisma
    const adapter = new PrismaPg(pool);

    // 3. Le pasamos el adaptador al constructor padre (PrismaClientOptions)
    // ¡Esto elimina el error que estás viendo!
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
    // eslint-disable-next-line no-console
    console.info('⚡ Conexión exitosa a Supabase (PetFinder DB) vía Prisma 7 Adapter');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
