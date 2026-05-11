# PetFinder Backend — Documentación Técnica Completa

> Versión: 1.0 | Stack: NestJS v11 · Prisma 7 · PostgreSQL/PostGIS · Socket.io · Cloudinary

---

## Índice

1. [Resumen del Sistema](#1-resumen-del-sistema)
2. [Enums del Dominio](#2-enums-del-dominio)
3. [Reglas de Negocio](#3-reglas-de-negocio)
4. [API REST — Auth](#4-api-rest--auth)
5. [API REST — Usuarios](#5-api-rest--usuarios)
6. [API REST — Mascotas](#6-api-rest--mascotas)
7. [API REST — Geofencing](#7-api-rest--geofencing)
8. [API REST — Tipos de Mascota](#8-api-rest--tipos-de-mascota)
9. [API REST — Mapa](#9-api-rest--mapa)
10. [WebSocket — Tiempo Real](#10-websocket--tiempo-real)
11. [Geofencing — Lógica Espacial](#11-geofencing--lógica-espacial)
12. [Gestión de Fotos](#12-gestión-de-fotos)
13. [Seguridad y Rate Limiting](#13-seguridad-y-rate-limiting)
14. [Historial de Migraciones](#14-historial-de-migraciones)

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
| Autenticación | JWT (Bearer token, 24 h por defecto) |
| Documentación interactiva | Swagger en `GET /api/docs` |

### Variables de entorno requeridas

```env
DATABASE_URL=postgresql://...        # URL de conexión con pgBouncer (runtime)
DIRECT_URL=postgresql://...          # URL directa sin pgBouncer (migraciones)
JWT_SECRET=tu_secreto_jwt
JWT_EXPIRES_IN=24h                   # Opcional, default 24h
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
FRONTEND_URL=https://petfinder.app   # Para generar URLs del QR
PORT=3000                            # Opcional, default 3000
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
- Los errores de validación incluyen el campo `errores`:
  ```json
  {
    "statusCode": 400,
    "error": "Bad Request",
    "message": "Error de validación",
    "errores": { "nombre": ["El nombre de la mascota es obligatorio"] }
  }
  ```

---

## 2. Enums del Dominio

### EstadoMascota

Estado del ciclo de vida de una mascota. Controla la propagación de GPS y la creación de reportes de extravío.

| Valor | Descripción |
|---|---|
| `en_casa` | Estado por defecto al registrar. La mascota está en casa, sin seguimiento GPS activo. |
| `en_paseo` | La mascota sale con su dueño. Las coordenadas del dueño se propagan automáticamente a la mascota en cada actualización de ubicación. |
| `extraviada` | La mascota está perdida. Se crea automáticamente un `ReporteExtravio` y la mascota aparece en el mapa público. |
| `recuperada` | La mascota fue encontrada. El reporte de extravío abierto se cierra automáticamente. |

### TipoContacto

Tipos de medios de contacto que un dueño puede registrar.

| Valor | Descripción |
|---|---|
| `WhatsApp` | Número de WhatsApp |
| `Celular` | Número de teléfono celular |
| `Fijo` | Número de teléfono fijo |
| `Telegram` | Usuario de Telegram |

### RelacionPropietario

Tipo de relación entre una persona y una mascota.

| Valor | Descripción |
|---|---|
| `Dueño Principal` | Propietario principal. Se asigna automáticamente al crear la mascota. **No se puede eliminar.** |
| `Familiar` | Familiar del dueño con acceso a la mascota. |
| `Cuidador` | Cuidador externo. Es el tipo por defecto al agregar un co-propietario. |

---

## 3. Reglas de Negocio

### Usuarios y Personas

- El sistema separa **Persona** (datos biográficos) de **Usuario** (cuenta de acceso). Una persona puede existir sin usuario (ej. co-propietario sin cuenta).
- Al registrarse, se crean `Persona`, `Usuario` y opcionalmente un `MedioContacto` en una transacción atómica.
- El `ultimoAcceso` del usuario se actualiza en cada `login` exitoso.

### Mascotas

- Al crear una mascota se genera automáticamente una **PlacaQR** con `tokenAcceso` único.
- La mascota se registra **sin coordenadas GPS** — no tiene dispositivo propio. Las coordenadas las aporta el teléfono del dueño vía `PUT /users/me/location`.
- Una mascota puede tener **1 a 4 fotos**. No se puede eliminar la única foto existente.
- El `Dueno_Principal` no puede ser eliminado de la lista de propietarios. Si alguien quiere transferir la mascota, debe eliminarla y registrarla de nuevo.
- Máximo **4 fotos** por mascota (jpeg, png, webp, gif — 5 MB por archivo).

### GPS y propagación de ubicación

- El dueño actualiza su posición con `PUT /users/me/location`.
- Si tiene mascotas en estado `en_paseo`, las coordenadas se propagan automáticamente a esas mascotas.
- Al mismo tiempo, el sistema verifica si la mascota entró o salió de alguna zona segura registrada.

### Estados y ReporteExtravio

| Transición | Efecto |
|---|---|
| Cualquier estado → `extraviada` | Se crea un `ReporteExtravio` con la última ubicación conocida. Si ya había uno abierto, no se duplica. |
| `extraviada` → cualquier otro | El `ReporteExtravio` abierto se cierra (`estado_reporte = 'cerrado'`). |

### Zonas Seguras

- Una mascota puede estar **registrada** en múltiples zonas (ej. casa y trabajo del dueño).
- Pero físicamente solo puede estar **dentro** de una zona a la vez (garantizado por PostGIS, no por restricción de BD).
- Al crear una zona, solo se puede asociar mascotas de las cuales el usuario sea propietario.
- El `Dueno_Principal` no puede ser removido de la mascota.

### Fotos en Cloudinary

- Al reemplazar fotos (`POST /pets/:id/photos`), las fotos anteriores se eliminan de Cloudinary antes de subir las nuevas.
- Si la subida a Cloudinary falla, la mascota conserva sus fotos anteriores (operación fuera de transacción de BD).

---

## 4. API REST — Auth

Base URL: `/auth` | Rate limit: **10 req/min por IP**

---

### POST /auth/register

Crea una cuenta nueva. Genera `Persona`, `Usuario` y opcionalmente un primer `MedioContacto` en una transacción atómica.

**Autenticación:** 🌐 Pública (no requiere token)

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
| `correoElectronico` | string | Sí | Formato email válido, único en el sistema |
| `clave` | string | Sí | Mín. 6 caracteres |
| `medioContacto.tipo` | enum | No (si se envía) | `WhatsApp`, `Celular`, `Fijo`, `Telegram` |
| `medioContacto.valor` | string | No (si se envía) | No vacío, máx. 50 caracteres |

**Respuesta exitosa (201):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": {
    "usuarioId": "a1b2c3d4-...",
    "correoElectronico": "juan@email.com",
    "nombre": "Juan",
    "apellidoPaterno": "Pérez"
  }
}
```

**Errores:**

| Código | Causa |
|---|---|
| 400 | Validación fallida (campos faltantes o incorrectos) |
| 409 | El correo electrónico ya está registrado |

---

### POST /auth/login

Inicia sesión y devuelve un token JWT.

**Autenticación:** 🌐 Pública (no requiere token)

**Body:**

```json
{
  "correoElectronico": "juan@email.com",
  "clave": "miContraseña123"
}
```

| Campo | Tipo | Requerido | Validaciones |
|---|---|---|---|
| `correoElectronico` | string | Sí | Formato email válido |
| `clave` | string | Sí | No vacío |

**Respuesta exitosa (200):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": {
    "usuarioId": "a1b2c3d4-...",
    "correoElectronico": "juan@email.com",
    "nombre": "Juan",
    "apellidoPaterno": "Pérez"
  }
}
```

**Errores:**

| Código | Causa |
|---|---|
| 400 | Validación fallida |
| 401 | Correo o contraseña incorrectos |

---

## 5. API REST — Usuarios

Base URL: `/users` | Rate limit: **120 req/min (global)**

Todos los endpoints excepto los marcados 🌐 requieren header:
```
Authorization: Bearer <accessToken>
```

---

### GET /users/me

Devuelve el perfil completo del usuario autenticado, incluyendo datos biográficos, medios de contacto y última ubicación GPS conocida.

**Autenticación:** 🔒 Privada

**Respuesta exitosa (200):**

```json
{
  "usuarioId": "a1b2c3d4-...",
  "correoElectronico": "juan@email.com",
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

**Errores:**

| Código | Causa |
|---|---|
| 401 | Token ausente o inválido |
| 404 | Usuario no encontrado |

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
  "fechaNacimiento": "1990-05-15",
  "fotoPerfilUrl": "https://res.cloudinary.com/..."
}
```

| Campo | Tipo | Requerido | Validaciones |
|---|---|---|---|
| `nombre` | string | No | No vacío, máx. 100 caracteres |
| `apellidoPaterno` | string | No | No vacío, máx. 100 caracteres |
| `apellidoMaterno` | string \| null | No | Máx. 100 caracteres, acepta null para borrar |
| `ci` | string \| null | No | Máx. 20 caracteres |
| `fechaNacimiento` | string (ISO date) | No | Formato `YYYY-MM-DD` |
| `fotoPerfilUrl` | string \| null | No | URL válida |

**Respuesta exitosa (200):** Objeto `Persona` actualizado.

```json
{
  "personaId": "p1p2p3p4-...",
  "nombre": "Juan Carlos",
  "apellidoPaterno": "Pérez",
  "apellidoMaterno": "López",
  "ci": "12345678",
  "fotoPerfilUrl": "https://res.cloudinary.com/...",
  "fechaNacimiento": "1990-05-15T00:00:00.000Z"
}
```

**Errores:**

| Código | Causa |
|---|---|
| 400 | Validación fallida |
| 401 | Token inválido |
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

| Campo | Tipo | Requerido | Validaciones |
|---|---|---|---|
| `tipo` | enum | Sí | `WhatsApp`, `Celular`, `Fijo`, `Telegram` |
| `valor` | string | Sí | No vacío, máx. 50 caracteres |
| `esPrincipal` | boolean | No | Default `false` |

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

**Errores:**

| Código | Causa |
|---|---|
| 400 | Tipo de contacto inválido |
| 401 | Token inválido |
| 404 | Usuario no encontrado |

---

### DELETE /users/me/contacts/:id

Elimina un medio de contacto del usuario autenticado.

**Autenticación:** 🔒 Privada

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | integer | ID del medio de contacto a eliminar |

**Respuesta exitosa (200):** Objeto del contacto eliminado.

```json
{
  "contactoId": 5,
  "personaId": "p1p2p3p4-...",
  "tipo": "Telegram",
  "valor": "@juan_petfinder",
  "esPrincipal": false
}
```

**Errores:**

| Código | Causa |
|---|---|
| 401 | Token inválido |
| 403 | El contacto pertenece a otro usuario |
| 404 | Contacto no encontrado |

---

### PUT /users/me/location

Actualiza la ubicación GPS del usuario. Este es el endpoint central del sistema de seguimiento:
1. Guarda la nueva posición del usuario.
2. Inserta un registro en el historial de ubicaciones.
3. Propaga las coordenadas a todas las mascotas del usuario que estén en estado `en_paseo`.
4. Por cada mascota actualizada, verifica si entró o salió de alguna zona segura y emite los eventos WebSocket correspondientes.
5. Emite `owner:location-updated` a todos los co-propietarios vía WebSocket.

**Autenticación:** 🔒 Privada

**Body:**

```json
{
  "lat": -17.7863,
  "lng": -63.1812
}
```

| Campo | Tipo | Requerido | Validaciones |
|---|---|---|---|
| `lat` | number | Sí | −90 a 90 |
| `lng` | number | Sí | −180 a 180 |

**Respuesta exitosa (200):**

```json
{ "message": "Ubicación actualizada" }
```

**Errores:**

| Código | Causa |
|---|---|
| 400 | Coordenadas fuera de rango |
| 401 | Token inválido |

---

### GET /users/:personaId/card

Devuelve la tarjeta de perfil de un usuario para mostrar en el popup del mapa. Incluye sus mascotas registradas.

**Autenticación:** 🔒 Privada (cualquier usuario autenticado puede ver la tarjeta de otro)

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `personaId` | UUID | ID de la persona |

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

**Errores:**

| Código | Causa |
|---|---|
| 401 | Token inválido |
| 404 | Persona no encontrada |

---

### GET /users/map

Lista los dueños visibles en el mapa con su última ubicación GPS conocida. Acepta filtro por proximidad.

**Autenticación:** 🔒 Privada

**Query params (todos opcionales):**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `lat` | number | Latitud del centro para filtrar por proximidad |
| `lng` | number | Longitud del centro para filtrar por proximidad |
| `radio` | number | Radio en metros (default: 5000 m si se pasan `lat`/`lng`) |

**Respuesta exitosa (200):**

```json
[
  {
    "usuario_id": "a1b2c3d4-...",
    "nombre": "Juan",
    "apellido_paterno": "Pérez",
    "lat": -17.7863,
    "lng": -63.1812
  }
]
```

> Máximo 200 resultados. Solo usuarios con `estado_cuenta = 'activa'` y ubicación registrada.

---

## 6. API REST — Mascotas

Base URL: `/pets` | Rate limit: **120 req/min (global)**

---

### POST /pets

Registra una nueva mascota con fotos opcionales. Crea automáticamente una PlacaQR. Soporta `multipart/form-data`.

**Autenticación:** 🔒 Privada

**Content-Type:** `multipart/form-data`

**Campos del formulario:**

| Campo | Tipo | Requerido | Validaciones |
|---|---|---|---|
| `nombre` | string | Sí | No vacío, máx. 100 caracteres |
| `tipoId` | integer | No | ID válido de `tipos_mascota` |
| `sexo` | string | No | `M` o `F` |
| `colorPrimario` | string | No | Máx. 50 caracteres |
| `rasgosParticulares` | string | No | Texto libre |
| `fotos` | File[] | No | 0 a 4 archivos; jpeg/png/webp/gif; máx. 5 MB cada uno |
| `fotoPrincipalIndex` | integer | No | Índice 0-based de la foto principal (default: 0); 0 a 3 |

**Ejemplo con curl:**

```bash
curl -X POST http://localhost:3000/pets \
  -H "Authorization: Bearer <token>" \
  -F "nombre=Firulais" \
  -F "tipoId=1" \
  -F "sexo=M" \
  -F "colorPrimario=Café" \
  -F "fotos=@foto1.jpg" \
  -F "fotos=@foto2.jpg" \
  -F "fotoPrincipalIndex=0"
```

**Respuesta exitosa (201):**

```json
{
  "mascotaId": "m1m2m3m4-...",
  "nombre": "Firulais",
  "tipoId": 1,
  "sexo": "M",
  "colorPrimario": "Café",
  "rasgosParticulares": null,
  "estado": "en_casa",
  "creadoEl": "2026-05-11T10:00:00.000Z",
  "propietarios": [
    {
      "personaId": "p1p2p3p4-...",
      "mascotaId": "m1m2m3m4-...",
      "tipoRelacion": "Dueño Principal",
      "recibeAlertas": true,
      "mostrarEnQr": true
    }
  ],
  "placaQr": {
    "placaId": "q1q2q3q4-...",
    "mascotaId": "m1m2m3m4-...",
    "tokenAcceso": "t1t2t3t4-...",
    "estaActiva": true
  },
  "fotos": [
    { "fotoId": 1, "fotoUrl": "https://res.cloudinary.com/...", "esPrincipal": true }
  ]
}
```

> Al crear la mascota, se emite el evento WebSocket `pet:registered` al socket del dueño.

**Errores:**

| Código | Causa |
|---|---|
| 400 | Más de 4 fotos / MIME inválido / archivo > 5 MB / `fotoPrincipalIndex` fuera de rango |
| 401 | Token inválido |

---

### GET /pets

Lista todas las mascotas donde el usuario autenticado es propietario o cuidador.

**Autenticación:** 🔒 Privada

**Respuesta exitosa (200):**

```json
[
  {
    "mascotaId": "m1m2m3m4-...",
    "nombre": "Firulais",
    "estado": "en_casa",
    "tipoMascota": { "tipoId": 1, "nombre": "Perro" },
    "placaQr": {
      "placaId": "q1q2q3q4-...",
      "tokenAcceso": "t1t2t3t4-...",
      "estaActiva": true
    },
    "fotos": [
      { "fotoId": 1, "fotoUrl": "https://res.cloudinary.com/...", "esPrincipal": true }
    ],
    "propietarios": [
      {
        "personaId": "p1p2p3p4-...",
        "tipoRelacion": "Dueño Principal",
        "persona": { "nombre": "Juan", "apellidoPaterno": "Pérez" }
      }
    ]
  }
]
```

---

### GET /pets/map

Devuelve todas las mascotas del usuario con su última ubicación GPS conocida. Las mascotas sin GPS tienen `lat`/`lng` en `null`.

**Autenticación:** 🔒 Privada

**Respuesta exitosa (200):**

```json
[
  {
    "mascota_id": "m1m2m3m4-...",
    "nombre": "Firulais",
    "estado": "en_paseo",
    "foto_url": "https://res.cloudinary.com/...",
    "lat": -17.7863,
    "lng": -63.1812
  },
  {
    "mascota_id": "m5m6m7m8-...",
    "nombre": "Pelusa",
    "estado": "en_casa",
    "foto_url": null,
    "lat": null,
    "lng": null
  }
]
```

---

### GET /pets/:id/owners-map

Devuelve todos los propietarios y cuidadores de una mascota con su última ubicación GPS conocida.

**Autenticación:** 🔒 Privada (debe ser propietario de la mascota)

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | UUID | ID de la mascota |

**Respuesta exitosa (200):**

```json
[
  {
    "persona_id": "p1p2p3p4-...",
    "nombre": "Juan",
    "apellido_paterno": "Pérez",
    "foto_perfil_url": "https://res.cloudinary.com/...",
    "tipo_relacion": "Dueño Principal",
    "lat": -17.7863,
    "lng": -63.1812
  },
  {
    "persona_id": "p5p6p7p8-...",
    "nombre": "María",
    "apellido_paterno": "García",
    "foto_perfil_url": null,
    "tipo_relacion": "Familiar",
    "lat": null,
    "lng": null
  }
]
```

**Errores:**

| Código | Causa |
|---|---|
| 401 | Token inválido |
| 403 | No eres propietario de esta mascota |
| 404 | Mascota no encontrada |

---

### PUT /pets/:id/status

Cambia el estado de una mascota. Al cambiar a `en_paseo`, la próxima actualización de ubicación del dueño propagará las coordenadas. Al cambiar a `extraviada`, se crea un reporte de extravío.

**Autenticación:** 🔒 Privada (debe ser propietario de la mascota)

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | UUID | ID de la mascota |

**Body:**

```json
{ "estado": "en_paseo" }
```

| Campo | Tipo | Requerido | Validaciones |
|---|---|---|---|
| `estado` | enum | Sí | `en_casa`, `en_paseo`, `extraviada`, `recuperada` |

**Respuesta exitosa (200):**

```json
{
  "mascotaId": "m1m2m3m4-...",
  "nombre": "Firulais",
  "estado": "en_paseo"
}
```

> Emite el evento WebSocket `pet:status-changed` a todos los co-propietarios en el room `pet:{mascotaId}`.

**Errores:**

| Código | Causa |
|---|---|
| 400 | Estado inválido |
| 401 | Token inválido |
| 403 | No eres propietario de esta mascota |
| 404 | Mascota no encontrada |

---

### GET /pets/:id/card

Devuelve la tarjeta pública de una mascota. Usada al escanear el QR de la placa. Muestra propietarios con `mostrarEnQr = true`.

**Autenticación:** 🌐 Pública (no requiere token — accesible desde el QR de la placa)

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | UUID | ID de la mascota |

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
  "fotos": [
    { "fotoId": 1, "url": "https://res.cloudinary.com/...", "esPrincipal": true },
    { "fotoId": 2, "url": "https://res.cloudinary.com/...", "esPrincipal": false }
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

**Errores:**

| Código | Causa |
|---|---|
| 404 | Mascota no encontrada |

---

### GET /pets/:id

Devuelve el detalle completo de una mascota, incluyendo ficha médica y ubicación GPS.

**Autenticación:** 🔒 Privada (debe ser propietario de la mascota)

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | UUID | ID de la mascota |

**Respuesta exitosa (200):**

```json
{
  "mascotaId": "m1m2m3m4-...",
  "nombre": "Firulais",
  "estado": "en_paseo",
  "tipoMascota": { "tipoId": 1, "nombre": "Perro" },
  "placaQr": { "placaId": "q1q2-...", "tokenAcceso": "t1t2-...", "estaActiva": true },
  "fotos": [
    { "fotoId": 1, "fotoUrl": "https://...", "esPrincipal": true, "creadoEl": "2026-05-11T..." }
  ],
  "fichaMedica": {
    "fichaId": 1,
    "alergias": "Ninguna",
    "enfermedadesCronicas": null,
    "medicacionDiaria": null,
    "tipoSangre": null,
    "notasVeterinarias": null
  },
  "propietarios": [
    {
      "personaId": "p1p2p3p4-...",
      "tipoRelacion": "Dueño Principal",
      "persona": {
        "nombre": "Juan",
        "apellidoPaterno": "Pérez",
        "mediosContacto": [{ "tipo": "WhatsApp", "valor": "+591 70123456" }]
      }
    }
  ],
  "ubicacion": { "lat": -17.7863, "lng": -63.1812 }
}
```

**Errores:**

| Código | Causa |
|---|---|
| 401 | Token inválido |
| 403 | No eres propietario de esta mascota |
| 404 | Mascota no encontrada |

---

### PUT /pets/:id

Actualiza los datos de una mascota. Solo se modifican los campos enviados.

**Autenticación:** 🔒 Privada (debe ser propietario de la mascota)

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | UUID | ID de la mascota |

**Body:**

```json
{
  "nombre": "Firulais Jr.",
  "tipoId": 2,
  "sexo": "M",
  "colorPrimario": "Negro",
  "rasgosParticulares": "Oreja derecha caída"
}
```

Todos los campos son opcionales (igual a `POST /pets` sin `fotos`).

**Respuesta exitosa (200):** Objeto `Mascota` actualizado.

**Errores:**

| Código | Causa |
|---|---|
| 401 | Token inválido |
| 403 | No eres propietario de esta mascota |
| 404 | Mascota no encontrada |

---

### DELETE /pets/:id

Elimina una mascota y todo su contenido asociado (fotos, zonas, reportes) en cascada.

**Autenticación:** 🔒 Privada (debe ser propietario de la mascota)

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | UUID | ID de la mascota |

**Respuesta exitosa (200):**

```json
{ "message": "Mascota eliminada" }
```

**Errores:**

| Código | Causa |
|---|---|
| 401 | Token inválido |
| 403 | No eres propietario de esta mascota |
| 404 | Mascota no encontrada |

---

### GET /pets/:id/qr

Genera y devuelve el código QR de la placa de la mascota como imagen PNG en formato Base64 (data URL).

**Autenticación:** 🔒 Privada (debe ser propietario de la mascota)

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | UUID | ID de la mascota |

**Respuesta exitosa (200):**

```
data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK...
```

> El QR codifica la URL `{FRONTEND_URL}/scan/{tokenAcceso}`.

**Errores:**

| Código | Causa |
|---|---|
| 401 | Token inválido |
| 403 | No eres propietario de esta mascota |
| 404 | Mascota o placa QR no encontrada |

---

### POST /pets/:id/owners

Agrega un co-propietario o cuidador a una mascota. Si el nuevo propietario tiene sesión activa, su socket se une automáticamente al room `pet:{mascotaId}`.

**Autenticación:** 🔒 Privada (debe ser propietario de la mascota)

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | UUID | ID de la mascota |

**Body:**

```json
{
  "personaId": "p5p6p7p8-...",
  "tipoRelacion": "Familiar",
  "recibeAlertas": true,
  "mostrarEnQr": true
}
```

| Campo | Tipo | Requerido | Validaciones |
|---|---|---|---|
| `personaId` | UUID | Sí | La persona debe existir en el sistema |
| `tipoRelacion` | enum | No | `Dueño Principal`, `Familiar`, `Cuidador` (default: `Cuidador`) |
| `recibeAlertas` | boolean | No | Default `true` |
| `mostrarEnQr` | boolean | No | Default `true` |

**Respuesta exitosa (201):**

```json
{
  "personaId": "p5p6p7p8-...",
  "mascotaId": "m1m2m3m4-...",
  "tipoRelacion": "Familiar",
  "recibeAlertas": true,
  "mostrarEnQr": true,
  "persona": { "nombre": "María", "apellidoPaterno": "García" }
}
```

> Emite los eventos WebSocket `owner:added` y `pet:assigned` a los propietarios del room.

**Errores:**

| Código | Causa |
|---|---|
| 400 | La persona ya es propietaria de la mascota |
| 401 | Token inválido |
| 403 | No eres propietario de esta mascota |
| 404 | Mascota o persona no encontrada |

---

### DELETE /pets/:id/owners/:personaId

Elimina un co-propietario o cuidador de una mascota. **No se puede eliminar al `Dueño Principal`.**

**Autenticación:** 🔒 Privada (debe ser propietario de la mascota)

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | UUID | ID de la mascota |
| `personaId` | UUID | ID de la persona a eliminar |

**Respuesta exitosa (200):** Objeto de la relación eliminada.

**Errores:**

| Código | Causa |
|---|---|
| 401 | Token inválido |
| 403 | No eres propietario de esta mascota / Se intenta eliminar al Dueño Principal |
| 404 | Mascota no encontrada / El propietario indicado no está en la lista |

---

### POST /pets/:id/photos

Reemplaza **todas** las fotos actuales de la mascota por las nuevas. Elimina las fotos anteriores de Cloudinary antes de subir las nuevas.

**Autenticación:** 🔒 Privada (debe ser propietario de la mascota)

**Content-Type:** `multipart/form-data`

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | UUID | ID de la mascota |

**Campos del formulario:**

| Campo | Tipo | Requerido | Validaciones |
|---|---|---|---|
| `fotos` | File[] | Sí | 1 a 4 archivos; jpeg/png/webp/gif; máx. 5 MB cada uno |
| `fotoPrincipalIndex` | integer | No | Índice 0-based (default: 0) |

**Respuesta exitosa (200):** Array de fotos creadas.

```json
[
  { "fotoId": 10, "fotoUrl": "https://res.cloudinary.com/...", "esPrincipal": true },
  { "fotoId": 11, "fotoUrl": "https://res.cloudinary.com/...", "esPrincipal": false }
]
```

**Errores:**

| Código | Causa |
|---|---|
| 400 | Sin fotos / más de 4 / MIME inválido / archivo > 5 MB |
| 401 | Token inválido |
| 403 | No eres propietario de esta mascota |
| 404 | Mascota no encontrada |

---

### DELETE /pets/:id/photos/:fotoId

Elimina una foto individual de la mascota. No se puede eliminar si es la única foto.

**Autenticación:** 🔒 Privada (debe ser propietario de la mascota)

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | UUID | ID de la mascota |
| `fotoId` | integer | ID de la foto a eliminar |

**Respuesta exitosa (200):**

```json
{ "message": "Foto eliminada" }
```

**Errores:**

| Código | Causa |
|---|---|
| 400 | Es la única foto de la mascota |
| 401 | Token inválido |
| 403 | No eres propietario de esta mascota |
| 404 | Mascota o foto no encontrada |

---

## 7. API REST — Geofencing

Base URL: `/geofencing` | Rate limit: **120 req/min (global)**

---

### POST /geofencing/pets/:petId/zones

Crea una zona segura y la asocia a la mascota indicada en la URL, más las mascotas adicionales del body. El usuario debe ser propietario de **todas** las mascotas indicadas.

**Autenticación:** 🔒 Privada

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `petId` | UUID | ID de la mascota principal (debe ser tuya) |

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
| `mascotaIds` | UUID[] | No | Máx. 20 mascotas adicionales; el usuario debe ser propietario de todas |

**Respuesta exitosa (201):** Objeto de la zona creada (mismo formato que `GET /geofencing/zones/:id`).

**Errores:**

| Código | Causa |
|---|---|
| 400 | Validación fallida |
| 401 | Token inválido |
| 403 | No eres propietario de la mascota principal o de alguna mascota adicional |

---

### GET /geofencing/pets/:petId/zones

Lista todas las zonas seguras en las que está registrada una mascota.

**Autenticación:** 🔒 Privada (debe ser propietario de la mascota)

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `petId` | UUID | ID de la mascota |

**Respuesta exitosa (200):**

```json
[
  {
    "zona_id": 1,
    "nombre_zona": "Casa",
    "radio_metros": 200,
    "esta_activa": true,
    "centro_lat": -17.7863,
    "centro_lng": -63.1812,
    "mascota_ids": ["m1m2m3m4-...", "m5m6m7m8-..."]
  }
]
```

---

### GET /geofencing/zones/:id

Devuelve el detalle completo de una zona segura, incluyendo la geometría GeoJSON si es polígono.

**Autenticación:** 🔒 Privada (debe tener al menos una mascota en la zona)

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | integer | ID de la zona |

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

> Para zonas poligonales, `geometria_geojson` contiene un objeto GeoJSON `Polygon` y `radio_metros` es `null`.

**Errores:**

| Código | Causa |
|---|---|
| 401 | Token inválido |
| 403 | No tienes ninguna mascota en esta zona |
| 404 | Zona no encontrada |

---

### PUT /geofencing/zones/:id

Actualiza el nombre o la geometría de una zona segura.

**Autenticación:** 🔒 Privada (debe tener al menos una mascota en la zona)

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | integer | ID de la zona |

**Body:**

```json
{
  "nombreZona": "Casa Nueva",
  "tipo": "circulo",
  "lat": -17.79,
  "lng": -63.19,
  "radioMetros": 300
}
```

Todos los campos son opcionales. Solo se actualizan los campos enviados.

**Respuesta exitosa (200):** Objeto de la zona actualizada.

**Errores:**

| Código | Causa |
|---|---|
| 401 | Token inválido |
| 403 | No tienes acceso a esta zona |
| 404 | Zona no encontrada |

---

### DELETE /geofencing/zones/:id

Elimina una zona segura y todos sus registros de visitas asociados en cascada.

**Autenticación:** 🔒 Privada (debe tener al menos una mascota en la zona)

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `id` | integer | ID de la zona |

**Respuesta exitosa (200):**

```json
{ "message": "Zona eliminada" }
```

**Errores:**

| Código | Causa |
|---|---|
| 401 | Token inválido |
| 403 | No tienes acceso a esta zona |

---

## 8. API REST — Tipos de Mascota

Base URL: `/tipos-mascota`

---

### GET /tipos-mascota

Lista todos los tipos de mascota disponibles en el sistema (catálogo).

**Autenticación:** 🌐 Pública (no requiere token — se usa al registrar una mascota sin estar autenticado aún)

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

## 9. API REST — Mapa

Base URL: `/map`

---

### GET /map/snapshot

Carga inicial del mapa para el usuario autenticado. Devuelve en una sola llamada toda la información geoespacial necesaria:
- Co-propietarios y cuidadores con GPS activo.
- Mascotas con reporte de extravío abierto (máx. 50 más recientes).
- Zonas seguras del usuario con las mascotas asociadas.

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
          "fotoUrl": "https://res.cloudinary.com/..."
        }
      ]
    },
    {
      "zonaId": 2,
      "nombre": "Parque",
      "tipo": "poligono",
      "geometria": {
        "type": "Polygon",
        "coordinates": [[[-63.180, -17.785], [-63.182, -17.786], [-63.179, -17.787], [-63.180, -17.785]]]
      },
      "mascotas": []
    }
  ]
}
```

---

### GET /map/public/lost-pets

Lista las últimas 100 mascotas con reporte de extravío abierto y ubicación GPS conocida. Endpoint para mostrar en la pantalla pública de la app sin requerir login.

**Autenticación:** 🌐 Pública (no requiere token)

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

> Solo aparecen mascotas con `estado_reporte = 'abierto'` y `ultima_ubicacion_conocida IS NOT NULL`.

---

## 10. WebSocket — Tiempo Real

### Configuración de conexión

| Propiedad | Valor |
|---|---|
| Namespace | `/realtime` |
| URL de conexión | `ws://localhost:3000/realtime` |
| Protocolo | Socket.io v4 |
| Autenticación | JWT Bearer en el handshake |

**Ejemplo de conexión (cliente JavaScript):**

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000/realtime', {
  auth: {
    token: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  }
});

socket.on('connect', () => console.log('Conectado al servidor PetFinder'));
socket.on('connect_error', (err) => console.error('Error de conexión:', err.message));
```

> Si el token está ausente o es inválido, el servidor rechaza la conexión inmediatamente con `disconnect(true)`.

---

### Estructura de Rooms

Al conectarse, el servidor une automáticamente el socket del usuario a los siguientes rooms:

| Room | Propósito |
|---|---|
| `pet:{mascotaId}` | Uno por cada mascota donde el usuario es propietario o cuidador. Recibe eventos de la mascota. |
| `user:{usuarioId}` | Room personal. Recibe notificaciones directas al usuario. |

Los rooms se mantienen actualizados automáticamente cuando:
- Se agrega un co-propietario → el nuevo propietario se une a `pet:{mascotaId}`.
- Se registra una nueva mascota → el creador se une a `pet:{nuevaMascotaId}`.

---

### Catálogo de Eventos del Servidor

#### `pet:location-updated`

Emitido cuando se actualiza la ubicación de una mascota en estado `en_paseo`. Se envía al room `pet:{mascotaId}`.

```json
{
  "mascotaId": "m1m2m3m4-...",
  "lat": -17.7863,
  "lng": -63.1812,
  "estado": "en_paseo",
  "fechaActualizacion": "2026-05-11T10:15:00.000Z"
}
```

**Disparador:** `PUT /users/me/location` cuando el usuario tiene mascotas `en_paseo`.

---

#### `owner:location-updated`

Emitido cuando el dueño actualiza su ubicación. Permite a los co-propietarios ver el marcador del dueño moverse en el mapa. Se envía a todos los rooms `pet:{mascotaId}` del usuario.

```json
{
  "personaId": "p1p2p3p4-...",
  "usuarioId": "a1b2c3d4-...",
  "lat": -17.7863,
  "lng": -63.1812,
  "fechaActualizacion": "2026-05-11T10:15:00.000Z"
}
```

**Disparador:** `PUT /users/me/location`.

---

#### `pet:status-changed`

Emitido cuando el estado de una mascota cambia. Se envía al room `pet:{mascotaId}`.

```json
{
  "mascotaId": "m1m2m3m4-...",
  "nombre": "Firulais",
  "estado": "extraviada",
  "fechaCambio": "2026-05-11T10:30:00.000Z"
}
```

**Disparador:** `PUT /pets/:id/status`.

---

#### `pet:registered`

Emitido al creador cuando registra una nueva mascota. Se envía al room personal `user:{usuarioId}`.

```json
{
  "mascotaId": "m1m2m3m4-...",
  "nombre": "Firulais",
  "estado": "en_casa",
  "fotoPrincipalUrl": "https://res.cloudinary.com/..."
}
```

**Disparador:** `POST /pets`.

---

#### `pet:assigned`

Emitido al nuevo propietario cuando es agregado a una mascota. Se envía a su room personal `user:{usuarioId}`.

```json
{
  "mascotaId": "m1m2m3m4-...",
  "personaId": "p5p6p7p8-...",
  "nombreCompleto": "María García",
  "tipoRelacion": "Familiar",
  "fechaAgregado": "2026-05-11T10:00:00.000Z"
}
```

**Disparador:** `POST /pets/:id/owners`.

---

#### `owner:added`

Emitido a todos los propietarios existentes cuando se agrega un nuevo co-propietario. Se envía al room `pet:{mascotaId}`.

```json
{
  "mascotaId": "m1m2m3m4-...",
  "personaId": "p5p6p7p8-...",
  "nombreCompleto": "María García",
  "tipoRelacion": "Familiar",
  "fechaAgregado": "2026-05-11T10:00:00.000Z"
}
```

**Disparador:** `POST /pets/:id/owners`.

---

#### `pet:entered-zone`

Emitido cuando una mascota entra a una zona segura. Se envía al room `pet:{mascotaId}`.

```json
{
  "mascotaId": "m1m2m3m4-...",
  "zonaId": 1,
  "fechaHora": "2026-05-11T10:15:00.000Z"
}
```

**Disparador:** `PUT /users/me/location` cuando la mascota cruza el límite de una zona registrada.

---

#### `pet:exited-zone`

Emitido cuando una mascota sale de una zona segura. Incluye la duración de la visita. Se envía al room `pet:{mascotaId}`.

```json
{
  "mascotaId": "m1m2m3m4-...",
  "zonaId": 1,
  "fechaHora": "2026-05-11T11:30:00.000Z",
  "duracionMinutos": 75
}
```

**Disparador:** `PUT /users/me/location` cuando la mascota sale del límite de una zona registrada.

---

## 11. Geofencing — Lógica Espacial

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

### Invariante física

Una mascota puede estar **registrada** en múltiples zonas (ej. casa + parque + trabajo del dueño). Sin embargo, sus coordenadas GPS solo pueden corresponder a una zona física a la vez, garantizado por la naturaleza de PostGIS, no por restricciones de base de datos.

---

## 12. Gestión de Fotos

### Restricciones

| Restricción | Valor |
|---|---|
| Máximo fotos por mascota | 4 |
| Mínimo fotos por mascota | 1 (no se puede borrar la única foto) |
| Formatos aceptados | `image/jpeg`, `image/png`, `image/webp`, `image/gif` |
| Tamaño máximo por archivo | 5 MB |

### Flujo de subida

1. Las fotos se envían como `multipart/form-data` al endpoint.
2. Se validan MIME y tamaño **antes** de tocar Cloudinary.
3. Se suben a Cloudinary en la carpeta `mascotas/{mascotaId}/`.
4. Se insertan los registros en `fotos_mascota` con la URL de Cloudinary.
5. Se marca como `esPrincipal = true` la foto en el índice `fotoPrincipalIndex`.

### Flujo de reemplazo (`POST /pets/:id/photos`)

1. Se eliminan **todas** las fotos anteriores de Cloudinary.
2. Se hace `DELETE` en `fotos_mascota`.
3. Se suben las nuevas fotos.
4. Se insertan los nuevos registros.

> Si la eliminación de Cloudinary falla en alguna foto, el proceso continúa de todas formas para no bloquear al usuario.

---

## 13. Seguridad y Rate Limiting

### JWT

| Propiedad | Valor |
|---|---|
| Algoritmo | HS256 |
| Duración | 24 h (configurable via `JWT_EXPIRES_IN`) |
| Payload | `{ sub: usuarioId, personaId }` |
| Header requerido | `Authorization: Bearer <token>` |

### Rate Limiting (Throttler)

| Scope | Límite |
|---|---|
| Global (todos los endpoints) | 120 req/min por IP |
| Auth endpoints (`/auth/*`) | 10 req/min por IP |

### Ownership checks

Todos los endpoints que operan sobre recursos específicos verifican que el usuario sea propietario:

| Módulo | Verificación |
|---|---|
| Mascotas | `propietarios_mascota WHERE persona_id = :personaId AND mascota_id = :mascotaId` |
| Fotos | Implícita a través de la verificación de mascota |
| Zonas | `zona_mascotas JOIN propietarios_mascota WHERE persona_id = :personaId` |
| Contactos | `medios_contacto.persona_id = usuario.persona_id` |

### Endpoints públicos (sin token)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/register` | Registro de cuenta |
| POST | `/auth/login` | Login |
| GET | `/tipos-mascota` | Catálogo de tipos |
| GET | `/pets/:id/card` | Tarjeta pública de mascota (escaneo QR) |
| GET | `/map/public/lost-pets` | Mascotas perdidas (mapa público) |

### Filtro de excepciones de Prisma

Los errores de base de datos se mapean automáticamente a respuestas HTTP legibles:

| Código Prisma | HTTP | Mensaje |
|---|---|---|
| P2002 | 409 Conflict | "El correo electrónico ya está registrado" / "El CI ya está registrado" |
| P2003 | 400 Bad Request | "No se puede completar la operación: referencia inválida" |
| P2014 | 409 Conflict | "La relación ya existe" |
| P2025 | 404 Not Found | "El registro no fue encontrado" |

---

## 14. Historial de Migraciones

| Fecha | Nombre | Cambios |
|---|---|---|
| 2026-05-01 | `init_petfinder_limpio` | Schema inicial: personas, usuarios, mascotas, razas, placas QR, zonas, historial |
| 2026-05-02 | `petfinder_schema_final_v2` | Columnas renombradas a snake_case; campos PostGIS de ubicación; enums en minúsculas; secuencia para historial |
| 2026-05-07 | `cambio_razas_a_tipo_mascota` | Elimina tabla `razas`; crea `tipos_mascota` como catálogo reemplazable |
| 2026-05-07 | `ajuste_relaciones_final` | Refactoriza `zona_mascota` a tabla many-to-many; una mascota puede estar registrada en múltiples zonas |
| 2026-05-11 | `one_zone_per_pet` | ~~Intento de UNIQUE en mascota_id~~ — aplicado y revertido en la siguiente migración |
| 2026-05-11 | `revert_one_zone_per_pet` | `DROP INDEX zona_mascotas_mascota_id_key` — la presencia física en una sola zona se garantiza via PostGIS, no via constraint de BD |
