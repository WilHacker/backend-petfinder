import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const tiposMascota = [
  { nombre: 'Perro' },
  { nombre: 'Gato' },
  { nombre: 'Ave' },
  { nombre: 'Conejo' },
  { nombre: 'Reptil' },
  { nombre: 'Pez' },
  { nombre: 'Hámster' },
  { nombre: 'Cobayo' },
  { nombre: 'Hurón' },
  { nombre: 'Otro' },
];

async function main() {
  console.log('🌱 Iniciando seed de razas...');

  const existing = await prisma.tipoMascota.count();

  if (existing > 0) {
    console.log(`ℹ️  Ya existen ${existing} tipos de mascota — omitiendo seed.`);
    console.log('   Para reinsertar: ejecuta "npx prisma migrate reset" primero.');
    return;
  }

  const { count } = await prisma.tipoMascota.createMany({ data: tiposMascota });
  console.log(`✅ ${count} tipos de mascota insertados correctamente.`);
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
