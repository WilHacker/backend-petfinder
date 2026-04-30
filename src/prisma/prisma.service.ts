import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    // eslint-disable-next-line no-console
    console.info('✅ Conexión exitosa a Supabase (PetFinder DB)');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
