/*
  Warnings:

  - You are about to drop the column `raza_id` on the `mascotas` table. All the data in the column will be lost.
  - You are about to drop the `razas` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "mascotas" DROP CONSTRAINT "mascotas_raza_id_fkey";

-- AlterTable
ALTER TABLE "mascotas" DROP COLUMN "raza_id",
ADD COLUMN     "tipo_id" INTEGER;

-- DropTable
DROP TABLE "razas";

-- CreateTable
CREATE TABLE "tipos_mascota" (
    "tipo_id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,

    CONSTRAINT "tipos_mascota_pkey" PRIMARY KEY ("tipo_id")
);

-- AddForeignKey
ALTER TABLE "mascotas" ADD CONSTRAINT "mascotas_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "tipos_mascota"("tipo_id") ON DELETE SET NULL ON UPDATE CASCADE;
