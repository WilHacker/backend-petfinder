/*
  Warnings:

  - You are about to drop the column `mascota_id` on the `zonas_seguras` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "zonas_seguras" DROP CONSTRAINT "zonas_seguras_mascota_id_fkey";

-- AlterTable
ALTER TABLE "zonas_seguras" DROP COLUMN "mascota_id";

-- CreateTable
CREATE TABLE "zona_mascotas" (
    "zona_id" INTEGER NOT NULL,
    "mascota_id" UUID NOT NULL,

    CONSTRAINT "zona_mascotas_pkey" PRIMARY KEY ("zona_id","mascota_id")
);

-- AddForeignKey
ALTER TABLE "zona_mascotas" ADD CONSTRAINT "zona_mascotas_zona_id_fkey" FOREIGN KEY ("zona_id") REFERENCES "zonas_seguras"("zona_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zona_mascotas" ADD CONSTRAINT "zona_mascotas_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("mascota_id") ON DELETE CASCADE ON UPDATE CASCADE;
