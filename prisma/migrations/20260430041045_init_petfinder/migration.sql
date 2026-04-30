-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "nombreCompleto" TEXT NOT NULL,
    "correoElectronico" TEXT NOT NULL,
    "contrasena" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "tipoUsuario" TEXT NOT NULL DEFAULT 'propietario',
    "fechaRegistro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mascota" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "especie" TEXT NOT NULL,
    "raza" TEXT NOT NULL,
    "fechaNacimiento" TIMESTAMP(3),
    "color" TEXT,
    "descripcionMedica" TEXT,
    "fotoUrl" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'activo',
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "Mascota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QR_Mascota" (
    "id" SERIAL NOT NULL,
    "codigoQR" TEXT NOT NULL,
    "urlPublica" TEXT NOT NULL,
    "fechaGeneracion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mascotaId" INTEGER NOT NULL,

    CONSTRAINT "QR_Mascota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistorialEscaneoQR" (
    "id" SERIAL NOT NULL,
    "fechaHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitud" DECIMAL(9,6),
    "longitud" DECIMAL(9,6),
    "qrId" INTEGER NOT NULL,

    CONSTRAINT "HistorialEscaneoQR_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoGeocerca" (
    "id" SERIAL NOT NULL,
    "tipoEvento" TEXT NOT NULL,
    "fechaHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitud" DECIMAL(9,6) NOT NULL,
    "longitud" DECIMAL(9,6) NOT NULL,
    "idDispositivo" TEXT,
    "mascotaId" INTEGER NOT NULL,

    CONSTRAINT "EventoGeocerca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertaPerdida" (
    "id" SERIAL NOT NULL,
    "fechaReporte" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "descripcion" TEXT,
    "latitud" DECIMAL(9,6) NOT NULL,
    "longitud" DECIMAL(9,6) NOT NULL,
    "mascotaId" INTEGER NOT NULL,

    CONSTRAINT "AlertaPerdida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" SERIAL NOT NULL,
    "mensaje" TEXT NOT NULL,
    "fechaHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" TEXT NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_correoElectronico_key" ON "Usuario"("correoElectronico");

-- CreateIndex
CREATE UNIQUE INDEX "QR_Mascota_codigoQR_key" ON "QR_Mascota"("codigoQR");

-- CreateIndex
CREATE UNIQUE INDEX "QR_Mascota_mascotaId_key" ON "QR_Mascota"("mascotaId");

-- AddForeignKey
ALTER TABLE "Mascota" ADD CONSTRAINT "Mascota_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QR_Mascota" ADD CONSTRAINT "QR_Mascota_mascotaId_fkey" FOREIGN KEY ("mascotaId") REFERENCES "Mascota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialEscaneoQR" ADD CONSTRAINT "HistorialEscaneoQR_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "QR_Mascota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoGeocerca" ADD CONSTRAINT "EventoGeocerca_mascotaId_fkey" FOREIGN KEY ("mascotaId") REFERENCES "Mascota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertaPerdida" ADD CONSTRAINT "AlertaPerdida_mascotaId_fkey" FOREIGN KEY ("mascotaId") REFERENCES "Mascota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
