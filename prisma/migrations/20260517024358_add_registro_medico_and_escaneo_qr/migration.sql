-- CreateTable
CREATE TABLE "registros_medicos" (
    "registro_id" SERIAL NOT NULL,
    "mascota_id" UUID NOT NULL,
    "tipo" VARCHAR(50) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "fecha" DATE,
    "veterinario" VARCHAR(150),
    "creado_el" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registros_medicos_pkey" PRIMARY KEY ("registro_id")
);

-- CreateTable
CREATE TABLE "escaneos_qr" (
    "escaneo_id" SERIAL NOT NULL,
    "mascota_id" UUID NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "escaneado_el" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escaneos_qr_pkey" PRIMARY KEY ("escaneo_id")
);

-- AddForeignKey
ALTER TABLE "registros_medicos" ADD CONSTRAINT "registros_medicos_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("mascota_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escaneos_qr" ADD CONSTRAINT "escaneos_qr_mascota_id_fkey" FOREIGN KEY ("mascota_id") REFERENCES "mascotas"("mascota_id") ON DELETE CASCADE ON UPDATE CASCADE;
