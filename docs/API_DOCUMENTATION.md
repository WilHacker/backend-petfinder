# PetFinder Backend — Documentación Técnica Completa

> Versión: 2.0 | Stack: NestJS v11 · Prisma 7 · PostgreSQL/PostGIS · Socket.io · Cloudinary · Firebase Admin · Passport Google OAuth2

---

## Índice

1. [Resumen del Sistema](#1-resumen-del-sistema)
2. [Enums del Dominio](#2-enums-del-dominio)
3. [Reglas de Negocio](#3-reglas-de-negocio)
4. [API REST — Auth](#4-api-rest--auth)
5. [API REST — Usuarios](#5-api-rest--usuarios)
6. [API REST — Mascotas](#6-api-rest--mascotas)
7. [API REST — QR Inteligente](#7-api-rest--qr-inteligente)
8. [API REST — Geofencing](#8-api-rest--geofencing)
9. [API REST — Tipos de Mascota](#9-api-rest--tipos-de-mascota)
10. [API REST — Mapa](#10-api-rest--mapa)
11. [WebSocket — Tiempo Real](#11-websocket--tiempo-real)
12. [Geofencing — Lógica Espacial](#12-geofencing--lógica-espacial)
13. [Gestión de Fotos](#13-gestión-de-fotos)
14. [Push Notifications — FCM](#14-push-notifications--fcm)
15. [Seguridad y Rate Limiting](#15-seguridad-y-rate-limiting)
16. [Historial de Migraciones](#16-historial-de-migraciones)

---

## 1. Resumen del Sistema

PetFinder es un ecosistema telemático para la gestión, localización y recuperación de mascotas perdidas. El backend expone una API REST + WebSocket en tiempo real.

### Stack técnico

| Componente | Tecnología |
|---|---|
| Framework | NestJS v11 |
| ORM | Prisma 7 con `@prisma/adapter-pg` |
| Base de datos | PostgreSQL (Supabase) + extensión PostGIS |
| Tiempo real | Socket.io (namespace `/realtime`) |
| Almacenamiento de imágenes | Cloudinary |
| Autenticación | JWT Bearer (access 15 min) + Refresh Token (30 días) |
| OAuth2 | Google OAuth2 via `passport-google-oauth20` |
| Push Notifications | Firebase Admin SDK (FCM) |
| Documentación interactiva | Swagger en `GET /api/docs` |

### Variables de entorno requeridas

```env
# Base de datos
DATABASE_URL=postgresql://...        # URL con pgBouncer (runtime)
DIRECT_URL=postgresql://...          # URL directa sin pgBouncer (migraciones)

# JWT
JWT_SECRET=tu_secreto_jwt
JWT_EXPIRES_IN=15m                   # Access token (default 15m)

# Cloudinary
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Firebase Admin SDK
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Google OAuth2
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# General
FRONTEND_URL=https://petfinder.app   # Para generar URLs del QR
PORT=3000
NODE_ENV=development
```

### Cómo levantar el proyecto

```bash
npm install
npx prisma migrate deploy   # Aplica migraciones
npx prisma db seed          # Datos iniciales (tipos de mascota)
npm run start:dev           # Servidor en http://localhost:3000
```

### Convenciones generales

- Todos los IDs de usuario, mascota y zona se manejan como **UUID v4**.
- Las coordenadas GPS siguen el estándar WGS84: `lat` (−90 a 90), `lng` (−180 a 180).
- Las respuestas de error siguen el formato:
  ```json
  { "statusCode": 400, "error": "Bad Request", "message": "Descripción" }
  ```

---

## 2. Enums del Dominio

### EstadoMascota

| Valor | Descripción |
|---|---|
| `en_casa` | Estado por defecto al registrar. Sin seguimiento GPS activo. |
| `en_paseo` | Las coordenadas del dueño se propagan automáticamente a la mascota. |
| `extraviada` | Se crea automáticamente un `ReporteExtravio`. Se envían push notifications a propietarios y usuarios cercanos. |
| `recuperada` | El reporte de extravío abierto se cierra automáticamente. |

### TipoContacto

| Valor | Descripción |
|---|---|
| `WhatsApp` | Número de WhatsApp |
| `Celular` | Número de teléfono celular |
| `Fijo` | Número de teléfono fijo |
| `Telegram` | Usuario de Telegram |

### RelacionPropietario

| Valor | Descripción |
|---|---|
| `Dueño Principal` | Propietario principal. **No se puede eliminar.** |
| `Familiar` | Familiar del dueño con acceso a la mascota. |
| `Cuidador` | Tipo por defecto al agregar un co-propietario. |

### RolUsuario

| Valor | Descripción |
|---|---|
| `usuario` | Rol por defecto. Acceso a sus propios recursos. |
| `admin` | Acceso a endpoints de administración (gestionar tipos de mascota, etc.). |

---

## 3. Reglas de Negocio

### Sesión y Tokens

- El login devuelve un **access token** (JWT, 15 min) y un **refresh token** (UUID, 30 días).
- El refresh token se almacena como hash bcrypt en la BD — nunca se guarda en texto plano.
- Cada uso de `POST /auth/refresh` invalida el refresh token anterior y emite uno nuevo (**rotación**).
- `POST /auth/logout` limpia el hash del refresh token en la BD, invalidando la sesión.

### Registro con Google

- `GET /auth/google` redirige a la pantalla de Google. No requiere token.
- Si el email ya existe en la BD → hace login automático y devuelve tokens.
- Si el email no existe → crea `Persona` + `Usuario` con contraseña aleatoria y devuelve tokens.
- El response es idéntico al login normal: `{ accessToken, refreshToken, usuario }`.

### Roles

- El `rol` se incluye en el payload del JWT para evitar consultas a la BD en cada request.
- Los endpoints de administración usan `@Roles('admin')` + `RolesGuard`.
- El rol por defecto es `usuario`. Solo un admin puede elevar roles (desde la BD directamente por ahora).

### Usuarios y Personas

- El sistema separa **Persona** (datos biográficos) de **Usuario** (cuenta de acceso).
- Al registrarse, se crean `Persona`, `Usuario` y opcionalmente un `MedioContacto` en una transacción atómica.

### Mascotas

- Al crear una mascota se genera automáticamente una **PlacaQR** con `tokenAcceso` único.
- Una mascota puede tener **1 a 4 fotos**. No se puede eliminar la única foto existente.
- El `Dueno_Principal` no puede ser eliminado de la lista de propietarios.

### Registros Médicos

- Cualquier propietario puede agregar registros médicos (vacunas, consultas, cirugías, etc.).
- Los registros son visibles públicamente al escanear el QR de la mascota.
- Los tipos recomendados son: `vacuna`, `consulta`, `cirugia`, `tratamiento`, `desparasitacion`, `otro`.

### QR Inteligente

- El QR de la placa codifica la URL `{FRONTEND_URL}/scan/{tokenAcceso}`.
- El frontend llama a `GET /qr/:token` para obtener el perfil completo de la mascota.
- Después de capturar el GPS del navegador, llama a `POST /qr/:token/scan` con las coordenadas.
- Si se envían coordenadas, el dueño recibe una push notification FCM con el enlace a Google Maps.

### Estados y ReporteExtravio

| Transición | Efecto |
|---|---|
| Cualquier estado → `extraviada` | Se crea `ReporteExtravio`. FCM a propietarios. FCM a usuarios con zonas seguras en un radio de 5 km. |
| `extraviada` → cualquier otro | El `ReporteExtravio` abierto se cierra (`estado_reporte = 'cerrado'`). |

---

## 4. API REST — Auth

Base URL: `/auth` | Rate limit: **10 req/min por IP**

---

### POST /auth/register

Crea una cuenta nueva. Genera `Persona`, `Usuario` y opcionalmente un primer `MedioContacto` en una transacción atómica.

**Autenticación:** 🌐 Pública

**Body:**

```json
{
  "nombre": "Juan",
  "apellidoPaterno": "Pérez",
  "apellidoMaterno": "López",
  "ci": "12345678",
  "correoElectronico": "juan@email.com",
  "clave": "miContraseña123",
  "medioContacto": {
    "tipo": "WhatsApp",
    "valor": "+591 70123456"
  }
}
```

| Campo | Tipo | Requerido | Validaciones |
|---|---|---|---|
| `nombre` | string | Sí | No vacío, máx. 100 caracteres |
| `apellidoPaterno` | string | Sí | No vacío, máx. 100 caracteres |
| `apellidoMaterno` | string | No | Máx. 100 caracteres |
| `ci` | string | No | Único en el sistema, máx. 20 caracteres |
| `correoElectronico` | string | Sí | Formato email válido, único |
| `clave` | string | Sí | Mín. 6 caracteres |
| `medioContacto.tipo` | enum | No | `WhatsApp`, `Celular`, `Fijo`, `Telegram` |
| `medioContacto.valor` | string | No | No vacío, máx. 50 caracteres |

**Respuesta exitosa (201):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "550e8400-e29b-41d4-a716-446655440000",
  "usuario": {
    "usuarioId": "a1b2c3d4-...",
    "correoElectronico": "juan@email.com",
    "nombre": "Juan",
    "apellidoPaterno": "Pérez",
    "rol": "usuario"
  }
}
```

**Errores:**

| Código | Causa |
|---|---|
| 400 | Validación fallida |
| 409 | El correo electrónico ya está registrado |

---

### POST /auth/login

**Autenticación:** 🌐 Pública

**Body:**

```json
{
  "correoElectronico": "juan@email.com",
  "clave": "miContraseña123"
}
```

**Respuesta exitosa (200):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "550e8400-e29b-41d4-a716-446655440000",
  "usuario": {
    "usuarioId": "a1b2c3d4-...",
    "correoElectronico": "juan@email.com",
    "nombre": "Juan",
    "apellidoPaterno": "Pérez",
    "rol": "usuario"
  }
}
```

**Errores:**

| Código | Causa |
|---|---|
| 401 | Correo o contraseña incorrectos |

---

### POST /auth/refresh

Renueva el par de tokens. El refresh token anterior queda **invalidado** (rotación).

**Autenticación:** 🌐 Pública

**Body:**

```json
{ "refreshToken": "550e8400-e29b-41d4-a716-446655440000" }
```

**Respuesta exitosa (200):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "nuevo-uuid-refresh-token",
  "usuario": { ... }
}
```

**Errores:**

| Código | Causa |
|---|---|
| 401 | Refresh token inválido, expirado o ya usado |

---

### POST /auth/logout

Invalida el refresh token del usuario. El access token sigue válido hasta su expiración natural.

**Autenticación:** 🔒 Privada (Bearer token)

**Respuesta exitosa (200):**

```json
{ "message": "Sesión cerrada" }
```

---

### GET /auth/google

Inicia el flujo OAuth2 con Google. Redirige automáticamente a la pantalla de login de Google.

**Autenticación:** 🌐 Pública

> No retorna JSON — redirige al navegador a Google.

---

### GET /auth/google/callback

Callback interno de Google OAuth. Retorna tokens igual que el login normal.

**Autenticación:** 🌐 Pública (manejado por Passport)

**Respuesta exitosa (200):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "550e8400-...",
  "usuario": {
    "usuarioId": "a1b2c3d4-...",
    "correoElectronico": "juan@gmail.com",
    "nombre": "Juan",
    "apellidoPaterno": "Pérez",
    "rol": "usuario"
  }
}
```

> Si el email ya existe en el sistema, vincula automáticamente la cuenta sin crear un usuario duplicado.

---

## 5. API REST — Usuarios

Base URL: `/users` | Rate limit: **120 req/min (global)**

Todos los endpoints requieren header:
```
Authorization: Bearer <accessToken>
```

---

### GET /users/me

Devuelve el perfil completo del usuario autenticado.

**Autenticación:** 🔒 Privada

**Respuesta exitosa (200):**

```json
{
  "usuarioId": "a1b2c3d4-...",
  "correoElectronico": "juan@email.com",
  "rol": "usuario",
  "tokenFcm": null,
  "configPrivacidad": { "mostrar_foto_qr": true },
  "estadoCuenta": "activa",
  "ultimoAcceso": "2026-05-11T10:30:00.000Z",
  "fechaUltimaUbicacion": "2026-05-11T10:15:00.000Z",
  "persona": {
    "personaId": "p1p2p3p4-...",
    "nombre": "Juan",
    "apellidoPaterno": "Pérez",
    "apellidoMaterno": "López",
    "ci": "12345678",
    "fotoPerfilUrl": "https://res.cloudinary.com/...",
    "fechaNacimiento": "1990-05-15",
    "mediosContacto": [
      { "contactoId": 1, "tipo": "WhatsApp", "valor": "+591 70123456", "esPrincipal": true }
    ]
  },
  "ubicacion": { "lat": -17.7863, "lng": -63.1812 }
}
```

> `ubicacion` es `null` si el usuario nunca actualizó su posición.

---

### PUT /users/me

Actualiza los datos biográficos del usuario autenticado. Solo se actualizan los campos enviados.

**Autenticación:** 🔒 Privada

**Body:**

```json
{
  "nombre": "Juan Carlos",
  "apellidoPaterno": "Pérez",
  "apellidoMaterno": "López",
  "ci": "12345678",
  "fechaNacimiento": "1990-05-15"
}
```

**Respuesta exitosa (200):** Objeto `Persona` actualizado.

---

### PUT /users/me/photo

Sube o reemplaza la foto de perfil del usuario. Si ya tenía foto, la elimina de Cloudinary antes de subir la nueva.

**Autenticación:** 🔒 Privada

**Content-Type:** `multipart/form-data`

**Campos del formulario:**

| Campo | Tipo | Requerido | Validaciones |
|---|---|---|---|
| `foto` | File | Sí | `image/jpeg`, `image/png`, `image/webp`; máx. 5 MB |

**Ejemplo con curl:**

```bash
curl -X PUT http://localhost:3000/users/me/photo \
  -H "Authorization: Bearer <token>" \
  -F "foto=@mi_foto.jpg"
```

**Respuesta exitosa (200):**

```json
{
  "personaId": "p1p2p3p4-...",
  "fotoPerfilUrl": "https://res.cloudinary.com/daelr9ppy/image/upload/personas/p1p2p3p4/foto.jpg"
}
```

**Errores:**

| Código | Causa |
|---|---|
| 400 | MIME no permitido o archivo > 5 MB |
| 404 | Usuario no encontrado |

---

### POST /users/me/contacts

Agrega un nuevo medio de contacto al perfil del usuario.

**Autenticación:** 🔒 Privada

**Body:**

```json
{
  "tipo": "Telegram",
  "valor": "@juan_petfinder",
  "esPrincipal": false
}
```

**Respuesta exitosa (201):**

```json
{
  "contactoId": 5,
  "personaId": "p1p2p3p4-...",
  "tipo": "Telegram",
  "valor": "@juan_petfinder",
  "esPrincipal": false
}
```

---

### DELETE /users/me/contacts/:id

Elimina un medio de contacto del usuario autenticado.

**Autenticación:** 🔒 Privada

**Errores:**

| Código | Causa |
|---|---|
| 403 | El contacto pertenece a otro usuario |
| 404 | Contacto no encontrado |

---

### PUT /users/me/location

Actualiza la ubicación GPS del usuario:
1. Guarda la nueva posición del usuario.
2. Inserta en el historial de ubicaciones.
3. Propaga coordenadas a mascotas `en_paseo`.
4. Verifica entrada/salida de zonas seguras y emite eventos WebSocket.
5. Emite `owner:location-updated` a co-propietarios.

**Autenticación:** 🔒 Privada

**Body:**

```json
{ "lat": -17.7863, "lng": -63.1812 }
```

**Respuesta exitosa (200):**

```json
{ "message": "Ubicación actualizada" }
```

---

### GET /users/:personaId/card

Devuelve la tarjeta de perfil de un usuario con sus mascotas registradas.

**Autenticación:** 🔒 Privada

**Respuesta exitosa (200):**

```json
{
  "personaId": "p1p2p3p4-...",
  "nombreCompleto": "Juan Pérez",
  "fotoPerfilUrl": "https://res.cloudinary.com/...",
  "contactos": [
    { "tipo": "WhatsApp", "valor": "+591 70123456" }
  ],
  "mascotas": [
    {
      "mascotaId": "m1m2m3m4-...",
      "nombre": "Firulais",
      "tipo": "Perro",
      "fotoPrincipalUrl": "https://res.cloudinary.com/..."
    }
  ]
}
```

---

### GET /users/map

Lista los dueños visibles en el mapa con su última ubicación GPS.

**Autenticación:** 🔒 Privada

**Query params (todos opcionales):**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `lat` | number | Latitud del centro para filtrar por proximidad |
| `lng` | number | Longitud del centro |
| `radio` | number | Radio en metros (default 5000 si se pasan lat/lng) |

---

## 6. API REST — Mascotas

Base URL: `/pets` | Rate limit: **120 req/min (global)**

---

### POST /pets

Registra una nueva mascota con fotos opcionales. Crea automáticamente una PlacaQR.

**Autenticación:** 🔒 Privada

**Content-Type:** `multipart/form-data`

| Campo | Tipo | Requerido | Validaciones |
|---|---|---|---|
| `nombre` | string | Sí | No vacío, máx. 100 caracteres |
| `tipoId` | integer | No | ID válido de `tipos_mascota` |
| `sexo` | string | No | `M` o `F` |
| `colorPrimario` | string | No | Máx. 50 caracteres |
| `rasgosParticulares` | string | No | Texto libre |
| `fotos` | File[] | No | 0 a 4 archivos; jpeg/png/webp/gif; máx. 5 MB cada uno |
| `fotoPrincipalIndex` | integer | No | Índice 0-based (default 0) |

**Respuesta exitosa (201):**

```json
{
  "mascotaId": "m1m2m3m4-...",
  "nombre": "Firulais",
  "tipoId": 1,
  "sexo": "M",
  "colorPrimario": "Café",
  "estado": "en_casa",
  "placaQr": {
    "placaId": "q1q2q3q4-...",
    "tokenAcceso": "t1t2t3t4-...",
    "estaActiva": true
  },
  "fotos": [
    { "fotoId": 1, "fotoUrl": "https://res.cloudinary.com/...", "esPrincipal": true }
  ]
}
```

---

### GET /pets

Lista todas las mascotas donde el usuario es propietario o cuidador.

**Autenticación:** 🔒 Privada

---

### GET /pets/map

Mascotas del usuario con su última ubicación GPS. Las sin GPS tienen `lat`/`lng` en `null`.

**Autenticación:** 🔒 Privada

---

### GET /pets/:id/owners-map

Todos los propietarios de una mascota con su última ubicación GPS.

**Autenticación:** 🔒 Privada (debe ser propietario)

---

### PUT /pets/:id/location

Actualiza manualmente la ubicación GPS de la mascota. Útil para establecer posición inicial o al recibir un avistamiento. Emite `pet:location-updated` por WebSocket.

**Autenticación:** 🔒 Privada (debe ser propietario)

**Body:**

```json
{ "lat": -17.7832, "lng": -63.1821 }
```

| Campo | Tipo | Validaciones |
|---|---|---|
| `lat` | number | −90 a 90 |
| `lng` | number | −180 a 180 |

**Respuesta exitosa (200):**

```json
{ "message": "Ubicación de la mascota actualizada" }
```

---

### PUT /pets/:id/status

Cambia el estado de una mascota. Al cambiar a `extraviada`:
- Crea un `ReporteExtravio` con la última ubicación conocida (si no hay uno abierto).
- Envía FCM push a todos los propietarios con `recibeAlertas = true`.
- Envía FCM push a usuarios cuyas zonas seguras estén en un radio de 5 km.

**Autenticación:** 🔒 Privada (debe ser propietario)

**Body:**

```json
{ "estado": "extraviada" }
```

**Respuesta exitosa (200):**

```json
{
  "mascotaId": "m1m2m3m4-...",
  "nombre": "Firulais",
  "estado": "extraviada"
}
```

> Emite el evento WebSocket `pet:status-changed` al room `pet:{mascotaId}`.

---

### GET /pets/:id/card

Perfil público de la mascota. Incluye ficha médica, registros médicos y banner de extravío.

**Autenticación:** 🌐 Pública

**Respuesta exitosa (200):**

```json
{
  "mascotaId": "m1m2m3m4-...",
  "nombre": "Firulais",
  "tipo": "Perro",
  "sexo": "M",
  "colorPrimario": "Café",
  "rasgosParticulares": "Mancha blanca en la pata derecha",
  "estado": "extraviada",
  "estaExtraviada": true,
  "fotos": [
    { "fotoId": 1, "url": "https://res.cloudinary.com/...", "esPrincipal": true }
  ],
  "fichaMedica": {
    "alergias": "Ninguna",
    "enfermedadesCronicas": null,
    "medicacionDiaria": null,
    "tipoSangre": "DEA 1.1+",
    "notasVeterinarias": "Control cada 6 meses"
  },
  "registrosMedicos": [
    {
      "registroId": 3,
      "tipo": "vacuna",
      "descripcion": "Vacuna antirrábica anual",
      "fecha": "2025-03-15",
      "veterinario": "Dr. Rodríguez"
    }
  ],
  "propietarios": [
    {
      "personaId": "p1p2p3p4-...",
      "nombreCompleto": "Juan Pérez",
      "fotoPerfilUrl": "https://res.cloudinary.com/...",
      "tipoRelacion": "Dueño Principal",
      "contactos": [
        { "tipo": "WhatsApp", "valor": "+591 70123456" }
      ]
    }
  ]
}
```

> `estaExtraviada: true` — el frontend debe mostrar el banner "¡ESTOY PERDIDO!".

---

### GET /pets/:id

Detalle completo de una mascota (privado, solo propietarios).

**Autenticación:** 🔒 Privada

---

### PUT /pets/:id

Actualiza datos de la mascota. Solo se modifican los campos enviados.

**Autenticación:** 🔒 Privada (debe ser propietario)

---

### DELETE /pets/:id

Elimina una mascota y todo su contenido asociado en cascada.

**Autenticación:** 🔒 Privada (debe ser propietario)

---

### GET /pets/:id/qr

Genera el QR de la placa como imagen PNG en Base64. La URL codificada es `{FRONTEND_URL}/scan/{tokenAcceso}`.

**Autenticación:** 🔒 Privada (debe ser propietario)

**Respuesta exitosa (200):**

```
data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK...
```

---

### GET /pets/:id/medical

Lista todos los registros médicos de la mascota ordenados por fecha descendente.

**Autenticación:** 🔒 Privada (debe ser propietario)

**Respuesta exitosa (200):**

```json
[
  {
    "registroId": 3,
    "mascotaId": "m1m2m3m4-...",
    "tipo": "vacuna",
    "descripcion": "Vacuna antirrábica anual",
    "fecha": "2025-03-15T00:00:00.000Z",
    "veterinario": "Dr. Rodríguez — Clínica Animalitos",
    "creadoEl": "2025-03-15T14:30:00.000Z"
  }
]
```

---

### POST /pets/:id/medical

Agrega un registro médico (vacuna, consulta, cirugía, tratamiento, desparasitación u otro).

**Autenticación:** 🔒 Privada (debe ser propietario)

**Body:**

```json
{
  "tipo": "vacuna",
  "descripcion": "Vacuna antirrábica anual",
  "fecha": "2025-03-15",
  "veterinario": "Dr. Rodríguez — Clínica Animalitos"
}
```

| Campo | Tipo | Requerido | Validaciones |
|---|---|---|---|
| `tipo` | string | Sí | No vacío, máx. 50 caracteres |
| `descripcion` | string | Sí | No vacío |
| `fecha` | string (ISO date) | No | Formato `YYYY-MM-DD` |
| `veterinario` | string | No | Máx. 150 caracteres |

**Respuesta exitosa (201):** Objeto del registro creado.

**Errores:**

| Código | Causa |
|---|---|
| 403 | No eres propietario de esta mascota |
| 404 | Mascota no encontrada |

---

### DELETE /pets/:id/medical/:registroId

Elimina un registro médico.

**Autenticación:** 🔒 Privada (debe ser propietario)

**Respuesta exitosa (200):**

```json
{ "message": "Registro eliminado" }
```

---

### POST /pets/:id/owners

Agrega un co-propietario o cuidador.

**Autenticación:** 🔒 Privada (debe ser propietario)

**Body:**

```json
{
  "personaId": "p5p6p7p8-...",
  "tipoRelacion": "Familiar",
  "recibeAlertas": true,
  "mostrarEnQr": true
}
```

---

### DELETE /pets/:id/owners/:personaId

Elimina un co-propietario. **No se puede eliminar al `Dueño Principal`.**

**Autenticación:** 🔒 Privada (debe ser propietario)

---

### POST /pets/:id/photos

Reemplaza **todas** las fotos actuales de la mascota (1 a 4 imágenes).

**Autenticación:** 🔒 Privada

---

### DELETE /pets/:id/photos/:fotoId

Elimina una foto individual. No se puede eliminar si es la única.

**Autenticación:** 🔒 Privada

---

## 7. API REST — QR Inteligente

Base URL: `/qr` | Todos los endpoints son **públicos** (sin autenticación)

Este módulo es el punto de entrada para quien escanea el QR de una mascota. El flujo típico desde el frontend es:

```
1. Alguien escanea el QR → navega a {FRONTEND_URL}/scan/{token}
2. Frontend llama GET /qr/{token} → obtiene perfil completo
3. Frontend solicita permiso GPS al navegador
4. Frontend llama POST /qr/{token}/scan con { lat, lng }
5. Backend guarda el escaneo y envía FCM push al dueño con la ubicación
```

---

### GET /qr/:token

Devuelve el perfil completo de la mascota a partir del `tokenAcceso` de la placa QR.

**Autenticación:** 🌐 Pública

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `token` | UUID | `tokenAcceso` de la `PlacaQr` |

**Respuesta exitosa (200):**

```json
{
  "mascotaId": "m1m2m3m4-...",
  "nombre": "Firulais",
  "tipo": "Perro",
  "sexo": "M",
  "colorPrimario": "Café",
  "rasgosParticulares": "Mancha blanca en la pata derecha",
  "estado": "extraviada",
  "estaExtraviada": true,
  "fotos": [
    { "fotoId": 1, "url": "https://res.cloudinary.com/...", "esPrincipal": true }
  ],
  "fichaMedica": {
    "alergias": "Polen",
    "enfermedadesCronicas": null,
    "medicacionDiaria": null,
    "tipoSangre": "DEA 1.1+",
    "notasVeterinarias": null
  },
  "registrosMedicos": [
    {
      "registroId": 3,
      "tipo": "vacuna",
      "descripcion": "Vacuna antirrábica anual",
      "fecha": "2025-03-15",
      "veterinario": "Dr. Rodríguez"
    }
  ],
  "propietarios": [
    {
      "personaId": "p1p2p3p4-...",
      "nombreCompleto": "Juan Pérez",
      "fotoPerfilUrl": "https://res.cloudinary.com/...",
      "tipoRelacion": "Dueño Principal",
      "contactos": [
        { "tipo": "WhatsApp", "valor": "+591 70123456" }
      ]
    }
  ]
}
```

> Solo se muestran propietarios con `mostrarEnQr = true`.
> `estaExtraviada: true` → mostrar banner "¡ESTOY PERDIDO!" en la UI.

**Errores:**

| Código | Causa |
|---|---|
| 404 | Token QR no válido, inactivo o sin mascota asociada |

---

### POST /qr/:token/scan

Registra un escaneo del QR. Si se envían coordenadas, notifica al dueño por FCM con la ubicación.

**Autenticación:** 🌐 Pública

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `token` | UUID | `tokenAcceso` de la `PlacaQr` |

**Body:**

```json
{
  "lat": -17.7832,
  "lng": -63.1821
}
```

| Campo | Tipo | Requerido | Validaciones |
|---|---|---|---|
| `lat` | number | No | −90 a 90 |
| `lng` | number | No | −180 a 180 |

> `lat` y `lng` son **opcionales** — el usuario puede denegar el permiso de GPS en el navegador. En ese caso el escaneo se registra sin coordenadas.

**Respuesta exitosa (201):**

```json
{ "message": "Escaneo registrado" }
```

**Efecto FCM (si lat/lng presentes):**

El dueño recibe en su app Kotlin:
- **Título:** `¡Alguien encontró a Firulais!`
- **Body:** `Se escaneó el QR. Toca para ver la ubicación en el mapa.`
- **Data:** `{ mascotaId, tipo: "qr_escaneado", lat, lng, mapsUrl }`

**Errores:**

| Código | Causa |
|---|---|
| 404 | Token QR no válido o inactivo |

---

## 8. API REST — Geofencing

Base URL: `/geofencing` | Rate limit: **120 req/min (global)**

---

### POST /geofencing/pets/:petId/zones

Crea una zona segura y la asocia a la mascota indicada.

**Autenticación:** 🔒 Privada

**Body — Zona circular:**

```json
{
  "nombreZona": "Casa",
  "tipo": "circulo",
  "lat": -17.7863,
  "lng": -63.1812,
  "radioMetros": 200,
  "mascotaIds": ["m5m6m7m8-..."]
}
```

**Body — Zona poligonal:**

```json
{
  "nombreZona": "Parque",
  "tipo": "poligono",
  "coordenadas": [
    { "lat": -17.785, "lng": -63.180 },
    { "lat": -17.786, "lng": -63.182 },
    { "lat": -17.787, "lng": -63.181 },
    { "lat": -17.786, "lng": -63.179 }
  ],
  "mascotaIds": []
}
```

| Campo | Tipo | Requerido | Validaciones |
|---|---|---|---|
| `nombreZona` | string | Sí | No vacío, máx. 100 caracteres |
| `tipo` | enum | Sí | `circulo` o `poligono` |
| `lat` | number | Si `tipo=circulo` | −90 a 90 |
| `lng` | number | Si `tipo=circulo` | −180 a 180 |
| `radioMetros` | number | Si `tipo=circulo` | 10 a 50 000 metros |
| `coordenadas` | CoordDto[] | Si `tipo=poligono` | 3 a 100 puntos `{lat, lng}` |
| `mascotaIds` | UUID[] | No | Máx. 20 mascotas adicionales |

---

### GET /geofencing/zones

Lista **todas** las zonas seguras del usuario autenticado con sus mascotas asociadas, incluyendo tipo de zona (circulo/poligono) y tipo de mascota.

**Autenticación:** 🔒 Privada

**Respuesta exitosa (200):**

```json
[
  {
    "zona_id": 1,
    "nombre_zona": "Casa",
    "tipo_zona": "circulo",
    "radio_metros": 200,
    "centro_lat": -17.7863,
    "centro_lng": -63.1812,
    "esta_activa": true,
    "mascotas": [
      {
        "mascotaId": "m1m2m3m4-...",
        "nombre": "Firulais",
        "estado": "en_casa",
        "fotoUrl": "https://res.cloudinary.com/...",
        "tipoMascota": "Perro"
      }
    ]
  },
  {
    "zona_id": 2,
    "nombre_zona": "Parque",
    "tipo_zona": "poligono",
    "radio_metros": null,
    "centro_lat": null,
    "centro_lng": null,
    "esta_activa": true,
    "mascotas": []
  }
]
```

---

### GET /geofencing/pets/:petId/zones

Lista las zonas seguras donde está registrada una mascota específica.

**Autenticación:** 🔒 Privada (debe ser propietario)

---

### GET /geofencing/zones/:id

Detalle completo de una zona, incluyendo geometría GeoJSON para polígonos.

**Autenticación:** 🔒 Privada

**Respuesta exitosa (200):**

```json
{
  "zona_id": 1,
  "nombre_zona": "Casa",
  "radio_metros": 200,
  "esta_activa": true,
  "centro_lat": -17.7863,
  "centro_lng": -63.1812,
  "geometria_geojson": null,
  "mascota_ids": ["m1m2m3m4-..."]
}
```

> Para polígonos: `geometria_geojson` contiene un `GeoJSON Polygon` y `radio_metros` es `null`.

---

### PUT /geofencing/zones/:id

Actualiza el nombre o geometría de una zona.

**Autenticación:** 🔒 Privada

---

### DELETE /geofencing/zones/:id

Elimina una zona y sus registros de visitas en cascada.

**Autenticación:** 🔒 Privada

---

## 9. API REST — Tipos de Mascota

Base URL: `/tipos-mascota`

---

### GET /tipos-mascota

Lista el catálogo de tipos de mascota.

**Autenticación:** 🌐 Pública

**Respuesta exitosa (200):**

```json
[
  { "tipoId": 1, "nombre": "Perro" },
  { "tipoId": 2, "nombre": "Gato" },
  { "tipoId": 3, "nombre": "Ave" },
  { "tipoId": 4, "nombre": "Conejo" }
]
```

---

### POST /tipos-mascota

Crea un nuevo tipo de mascota. Solo administradores.

**Autenticación:** 🔒 Privada + rol `admin`

**Body:**

```json
{ "nombre": "Hurón" }
```

**Respuesta exitosa (201):**

```json
{ "tipoId": 5, "nombre": "Hurón" }
```

**Errores:**

| Código | Causa |
|---|---|
| 403 | No tienes rol admin |
| 409 | El tipo ya existe |

---

### DELETE /tipos-mascota/:id

Elimina un tipo de mascota. Solo administradores.

**Autenticación:** 🔒 Privada + rol `admin`

**Respuesta exitosa (200):**

```json
{ "message": "Tipo eliminado" }
```

**Errores:**

| Código | Causa |
|---|---|
| 403 | No tienes rol admin |
| 404 | Tipo no encontrado |

---

## 10. API REST — Mapa

Base URL: `/map`

---

### GET /map/snapshot

Carga inicial del mapa. Devuelve en una sola llamada:
- Co-propietarios y cuidadores con GPS activo.
- Mascotas con reporte de extravío abierto (máx. 50, con coordenadas).
- Zonas seguras del usuario con las mascotas asociadas y sus coordenadas GPS.

**Autenticación:** 🔒 Privada

**Respuesta exitosa (200):**

```json
{
  "marcadores": {
    "usuariosCompartidos": [
      {
        "personaId": "p5p6p7p8-...",
        "nombre": "María García",
        "fotoUrl": "https://res.cloudinary.com/...",
        "lat": -17.790,
        "lng": -63.185
      }
    ],
    "desaparecidas": [
      {
        "reporteId": 12,
        "mascotaId": "m9m10-...",
        "nombre": "Luna",
        "tipo": "Gato",
        "fotoUrl": "https://res.cloudinary.com/...",
        "lat": -17.780,
        "lng": -63.175
      }
    ]
  },
  "zonas": [
    {
      "zonaId": 1,
      "nombre": "Casa",
      "tipo": "circulo",
      "centro": { "lat": -17.7863, "lng": -63.1812 },
      "radioMetros": 200,
      "mascotas": [
        {
          "mascotaId": "m1m2m3m4-...",
          "nombre": "Firulais",
          "estado": "en_casa",
          "fotoUrl": "https://res.cloudinary.com/...",
          "ubicacion": { "lat": -17.7863, "lng": -63.1812 }
        }
      ]
    }
  ]
}
```

> `mascota.ubicacion` es `null` si la mascota no tiene coordenadas GPS registradas.

---

### GET /map/public/lost-pets

Mascotas con reporte de extravío abierto y ubicación GPS conocida. Sin autenticación.

**Autenticación:** 🌐 Pública

**Respuesta exitosa (200):**

```json
[
  {
    "reporteId": 12,
    "mascotaId": "m9m10-...",
    "nombre": "Luna",
    "tipo": "Gato",
    "fotoUrl": "https://res.cloudinary.com/...",
    "lat": -17.780,
    "lng": -63.175,
    "fechaPerdida": "2026-05-10T18:00:00.000Z"
  }
]
```

> Máximo 100 resultados. Solo mascotas con `estado_reporte = 'abierto'` y ubicación conocida.

---

## 11. WebSocket — Tiempo Real

### Configuración de conexión

| Propiedad | Valor |
|---|---|
| Namespace | `/realtime` |
| URL de conexión | `ws://localhost:3000/realtime` |
| Protocolo | Socket.io v4 |
| Autenticación | JWT Bearer en el handshake |

**Ejemplo de conexión (Kotlin):**

```kotlin
val socket = IO.socket("http://localhost:3000/realtime", IO.Options().apply {
    auth = mapOf("token" to "Bearer $accessToken")
})
```

---

### Rooms

| Room | Propósito |
|---|---|
| `pet:{mascotaId}` | Eventos de la mascota (ubicación, estado, zonas) |
| `user:{usuarioId}` | Notificaciones directas al usuario |

---

### Catálogo de Eventos

#### `pet:location-updated`
Cuando se actualiza la ubicación de una mascota `en_paseo`.

```json
{
  "mascotaId": "m1m2m3m4-...",
  "lat": -17.7863,
  "lng": -63.1812,
  "estado": "en_paseo",
  "fechaActualizacion": "2026-05-11T10:15:00.000Z"
}
```

#### `owner:location-updated`
Cuando el dueño actualiza su posición.

```json
{
  "personaId": "p1p2p3p4-...",
  "usuarioId": "a1b2c3d4-...",
  "lat": -17.7863,
  "lng": -63.1812,
  "fechaActualizacion": "2026-05-11T10:15:00.000Z"
}
```

#### `pet:status-changed`
Cuando el estado de la mascota cambia.

```json
{
  "mascotaId": "m1m2m3m4-...",
  "nombre": "Firulais",
  "estado": "extraviada",
  "fechaCambio": "2026-05-11T10:30:00.000Z"
}
```

#### `pet:registered`
Al creador cuando registra una nueva mascota.

```json
{
  "mascotaId": "m1m2m3m4-...",
  "nombre": "Firulais",
  "estado": "en_casa",
  "fotoPrincipalUrl": "https://res.cloudinary.com/..."
}
```

#### `pet:assigned`
Al nuevo propietario cuando es agregado a una mascota.

```json
{
  "mascotaId": "m1m2m3m4-...",
  "personaId": "p5p6p7p8-...",
  "nombreCompleto": "María García",
  "tipoRelacion": "Familiar",
  "fechaAgregado": "2026-05-11T10:00:00.000Z"
}
```

#### `owner:added`
A todos los propietarios cuando se agrega un nuevo co-propietario.

```json
{
  "mascotaId": "m1m2m3m4-...",
  "personaId": "p5p6p7p8-...",
  "nombreCompleto": "María García",
  "tipoRelacion": "Familiar",
  "fechaAgregado": "2026-05-11T10:00:00.000Z"
}
```

#### `pet:entered-zone`
Cuando una mascota entra a una zona segura.

```json
{
  "mascotaId": "m1m2m3m4-...",
  "zonaId": 1,
  "fechaHora": "2026-05-11T10:15:00.000Z"
}
```

#### `pet:exited-zone`
Cuando una mascota sale de una zona segura.

```json
{
  "mascotaId": "m1m2m3m4-...",
  "zonaId": 1,
  "fechaHora": "2026-05-11T11:30:00.000Z",
  "duracionMinutos": 75
}
```

---

## 12. Geofencing — Lógica Espacial

### Tipos de zona

| Tipo | Definición | Verificación PostGIS |
|---|---|---|
| `circulo` | Centro (`lat`/`lng`) + radio en metros | `ST_DWithin(...geography, ..., radioMetros)` |
| `poligono` | Array de 3 a 100 coordenadas | `ST_Within(...geometry, geometria)` |

### Flujo completo de detección entrada/salida

Cada vez que el dueño llama `PUT /users/me/location`:

```
1. Actualiza ultima_ubicacion_conocida del usuario
2. Inserta en historial_ubicaciones
3. Propaga coordenadas a mascotas en_paseo (UPDATE ... RETURNING)
4. Por cada mascota actualizada (en paralelo):
   a. Consulta todas las zonas activas donde está registrada
   b. Para cada zona:
      - Evalúa si el punto GPS actual está dentro (PostGIS)
      - Compara con registro_visitas_zonas (¿hay visita abierta?)
      
      Si entró (dentro=true, sin visita abierta):
        → INSERT registro_visitas_zonas
        → Emite pet:entered-zone
        
      Si salió (dentro=false, con visita abierta):
        → UPDATE registro_visitas_zonas SET fecha_hora_salida, duracion_minutos
        → Emite pet:exited-zone con duracionMinutos
```

---

## 13. Gestión de Fotos

### Restricciones

| Restricción | Valor |
|---|---|
| Máximo fotos por mascota | 4 |
| Mínimo fotos por mascota | 1 |
| Formatos aceptados | `image/jpeg`, `image/png`, `image/webp`, `image/gif` |
| Tamaño máximo por archivo | 5 MB |
| Carpeta Cloudinary mascotas | `mascotas/{mascotaId}/` |
| Carpeta Cloudinary perfil | `personas/{personaId}/` |

### Flujo de reemplazo de fotos de mascota

1. Se eliminan **todas** las fotos anteriores de Cloudinary.
2. Se hace `DELETE` en `fotos_mascota`.
3. Se suben las nuevas fotos en paralelo.
4. Se insertan los nuevos registros con `esPrincipal` en el índice indicado.

### Flujo de foto de perfil de usuario

1. Si ya tenía `fotoPerfilUrl` → se elimina de Cloudinary.
2. Se sube la nueva foto a `personas/{personaId}/`.
3. Se actualiza `persona.fotoPerfilUrl` en la BD.

---

## 14. Push Notifications — FCM

El sistema usa **Firebase Admin SDK** para enviar push notifications a la app Kotlin de los dueños.

### Inicialización

Firebase se inicializa en `onModuleInit`. Si faltan las variables de entorno (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`), el módulo registra un warning y continúa sin push notifications (no crashea la app).

### Tipos de alerta

#### `mascota_extraviada`

**Trigger:** `PUT /pets/:id/status` con `estado = extraviada` (primer reporte).

**Destinatarios:** Todos los propietarios con `recibeAlertas = true` y `tokenFcm` registrado.

```json
{
  "notification": {
    "title": "¡Firulais está desaparecida!",
    "body": "Activa la búsqueda y revisa su última ubicación conocida."
  },
  "data": { "mascotaId": "m1m2m3m4-...", "tipo": "mascota_extraviada" }
}
```

#### `qr_escaneado`

**Trigger:** `POST /qr/:token/scan` con coordenadas GPS.

**Destinatarios:** Todos los propietarios con `recibeAlertas = true` y `tokenFcm` registrado.

```json
{
  "notification": {
    "title": "¡Alguien encontró a Firulais!",
    "body": "Se escaneó el QR. Toca para ver la ubicación en el mapa."
  },
  "data": {
    "mascotaId": "m1m2m3m4-...",
    "tipo": "qr_escaneado",
    "lat": "-17.7832",
    "lng": "-63.1821",
    "mapsUrl": "https://maps.google.com/?q=-17.7832,-63.1821"
  }
}
```

#### `mascota_en_zona`

**Trigger:** `PUT /pets/:id/status` con `estado = extraviada` (primer reporte con coordenadas).

**Destinatarios:** Usuarios cuyas zonas seguras estén en un radio de 5 km de la última ubicación conocida de la mascota perdida (excluye a los propietarios de la mascota perdida, que ya reciben `mascota_extraviada`).

```json
{
  "notification": {
    "title": "¡Mascota perdida cerca de tu zona!",
    "body": "Firulais está extraviada cerca de tu área. ¿Puedes ayudar?"
  },
  "data": {
    "mascotaId": "m1m2m3m4-...",
    "tipo": "mascota_en_zona",
    "lat": "-17.7832",
    "lng": "-63.1821"
  }
}
```

### Registro del token FCM en la app Kotlin

```kotlin
FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
    val token = task.result
    // Enviar al backend:
    api.updateFcmToken(token)
}
```

El backend recibe el token en `PUT /users/me` o en un endpoint dedicado (actualizar `usuario.tokenFcm`).

---

## 15. Seguridad y Rate Limiting

### JWT

| Propiedad | Valor |
|---|---|
| Algoritmo | HS256 |
| Duración access token | 15 min (configurable via `JWT_EXPIRES_IN`) |
| Duración refresh token | 30 días (UUID almacenado como hash bcrypt en BD) |
| Payload | `{ sub: usuarioId, personaId, rol }` |
| Header requerido | `Authorization: Bearer <token>` |

### Roles

| Rol | Acceso |
|---|---|
| `usuario` | Sus propios recursos (mascotas, zonas, contactos, ubicación) |
| `admin` | Todo lo anterior + gestión del catálogo de tipos de mascota |

Los endpoints de admin usan `@Roles('admin')` + `RolesGuard`. El rol se lee del JWT payload (no requiere query a BD).

### Rate Limiting (Throttler)

| Scope | Límite |
|---|---|
| Global (todos los endpoints) | 120 req/min por IP |
| Auth endpoints (`/auth/*`) | 10 req/min por IP |

### Endpoints públicos (sin token)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/register` | Registro de cuenta |
| POST | `/auth/login` | Login |
| POST | `/auth/refresh` | Renovar tokens |
| GET | `/auth/google` | Iniciar OAuth Google |
| GET | `/auth/google/callback` | Callback OAuth Google |
| GET | `/tipos-mascota` | Catálogo de tipos |
| GET | `/pets/:id/card` | Tarjeta pública de mascota |
| GET | `/map/public/lost-pets` | Mascotas perdidas (mapa público) |
| GET | `/qr/:token` | Perfil de mascota por token QR |
| POST | `/qr/:token/scan` | Registrar escaneo QR con GPS |

### Filtro de excepciones de Prisma

| Código Prisma | HTTP | Mensaje |
|---|---|---|
| P2002 | 409 Conflict | "El correo electrónico ya está registrado" / "El CI ya está registrado" |
| P2003 | 400 Bad Request | "No se puede completar la operación: referencia inválida" |
| P2014 | 409 Conflict | "La relación ya existe" |
| P2025 | 404 Not Found | "El registro no fue encontrado" |

---

## 16. Historial de Migraciones

| Fecha | Nombre | Cambios |
|---|---|---|
| 2026-05-01 | `init_petfinder_limpio` | Schema inicial: personas, usuarios, mascotas, placas QR, zonas, historial |
| 2026-05-02 | `petfinder_schema_final_v2` | Columnas a snake_case; campos PostGIS; enums en minúsculas |
| 2026-05-07 | `cambio_razas_a_tipo_mascota` | Elimina `razas`; crea `tipos_mascota` como catálogo |
| 2026-05-07 | `ajuste_relaciones_final` | `zona_mascota` como many-to-many; una mascota puede estar en múltiples zonas |
| 2026-05-11 | `one_zone_per_pet` | ~~UNIQUE en mascota_id~~ — aplicado y revertido |
| 2026-05-11 | `revert_one_zone_per_pet` | `DROP INDEX zona_mascotas_mascota_id_key` |
| 2026-05-17 | `add_refresh_token_and_rol` | Agrega `refresh_token_hash` y enum `rol_usuario` + campo `rol` a `usuarios` |
| 2026-05-17 | `add_registro_medico_and_escaneo_qr` | Crea tablas `registros_medicos` y `escaneos_qr` para ficha médica y escaneos QR con GPS |
