# 🧪 Reporte de Pruebas API — PetFinder Backend

**Fecha:** 2026-05-17 (pruebas) · **Actualizado:** 2026-05-18 (post-fixes + 3 nuevos endpoints)
**Entorno:** Local — `http://localhost:3000`
**Herramienta:** `curl` ejecutado desde Bash
**Ubicación de pruebas:** Cochabamba, Bolivia — UMSS (`lat: -17.3935, lng: -66.1457`)
**Usuario de prueba:** `test.umss@petfinder.dev`

---

## Convenciones

- ✅ **OK** — funciona como se espera
- ⚠️ **Parcial** — funciona pero con observaciones
- ❌ **Falla** — no funciona, va a sección de errores

Cada endpoint documenta:
1. **Request** — método, URL, headers, body
2. **Response** — status code + body
3. **Estado** — ✅ / ⚠️ / ❌
4. **Notas** — observaciones

---

# 1. Auth Module

## 1.1 — `POST /auth/register`

**Request:**

```http
POST /auth/register
Content-Type: application/json
```

```json
{
  "nombre": "Juan",
  "apellidoPaterno": "Pérez",
  "apellidoMaterno": "López",
  "ci": "1234567",
  "correoElectronico": "test.umss@petfinder.dev",
  "clave": "TestPetFinder2026!",
  "medioContacto": { "tipo": "WhatsApp", "valor": "70012345" }
}
```

**Response — 201 Created:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "00faab00-9d52-47f5-8d7e-4e4449b1ebcd",
  "usuario": {
    "usuarioId": "fc2e47f0-cce1-4665-af7a-d75056d675b3",
    "correoElectronico": "test.umss@petfinder.dev",
    "nombre": "Juan",
    "apellidoPaterno": "Pérez",
    "rol": "usuario"
  }
}
```

**Estado:** ✅ OK

**Notas:**
- Genera `accessToken` (JWT, 24h) + `refreshToken` (UUID, 30 días).
- Asigna rol `usuario` por defecto.
- El schema exige `{ tipo, valor }` con `tipo ∈ {WhatsApp, Celular, Fijo, Telegram}`. **Resuelto E4** — Swagger ahora muestra el ejemplo correcto en `@ApiPropertyOptional` con descripción explícita de los valores válidos para `tipo`.

---

## 1.2 — `POST /auth/login`

**Request:**

```http
POST /auth/login
Content-Type: application/json
```

```json
{ "correoElectronico": "test.umss@petfinder.dev", "clave": "TestPetFinder2026!" }
```

**Response — 200 OK:**

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "330602ce-9154-41c2-8a4f-720153b25ee0",
  "usuario": {
    "usuarioId": "fc2e47f0-cce1-4665-af7a-d75056d675b3",
    "correoElectronico": "test.umss@petfinder.dev",
    "nombre": "Juan",
    "apellidoPaterno": "Pérez",
    "rol": "usuario"
  }
}
```

**Estado:** ✅ OK

**Notas:** mismo formato que `register`. Cada login emite un nuevo `refreshToken` e invalida el anterior.

---

## 1.3 — `POST /auth/refresh`

**Request:**

```http
POST /auth/refresh
Content-Type: application/json
```

```json
{ "refreshToken": "330602ce-9154-41c2-8a4f-720153b25ee0" }
```

**Response — 200 OK:**

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "8251497b-a87d-4d47-b28a-a7c7ad4f9743"
}
```

**Estado:** ✅ OK

**Notas:**
- Rotación correcta: reusar el refresh token viejo devuelve 401:
  ```json
  { "message": "Refresh token inválido o expirado", "error": "Unauthorized", "statusCode": 401 }
  ```

---

## 1.4 — `POST /auth/logout`

**Request:**

```http
POST /auth/logout
Authorization: Bearer <accessToken>
```

**Response — 200 OK:**

```json
{ "message": "Sesión cerrada correctamente" }
```

**Estado:** ✅ OK

**Notas:** después del logout el `refreshToken` previo ya no funciona (devuelve 401). Confirma que `auth.service.logout()` limpia el `refreshTokenHash` en BD.

---

## 1.5 — `GET /auth/google` y `GET /auth/google/callback`

**Request:** navegar en el navegador a `GET /auth/google` (sin headers — público). Passport redirige automáticamente a la pantalla de selección de cuenta de Google.

**Flujo:**
1. `GET /auth/google` → redirige a Google OAuth consent screen
2. Usuario selecciona cuenta → Google redirige a `GET /auth/google/callback`
3. Server procesa el perfil de Google y responde con JSON

**Response — 200 OK (cuenta existente vinculada automáticamente):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "5df6bd17-9ce6-4c75-9c5d-e1d12660e729",
  "usuario": {
    "usuarioId": "a69b8530-4411-44cf-9656-c8032852404f",
    "correoElectronico": "202203303@est.umss.edu",
    "nombre": "WILLIAN ANDRES",
    "apellidoPaterno": "ALMENDRAS CALIZAYA",
    "rol": "usuario"
  }
}
```

**Estado:** ✅ OK

**Notas:**
- Email ya existente → hace login directo (no crea usuario nuevo). Vinculación automática.
- Email nuevo → crea `Persona` + `Usuario` con `claveHash` de UUID aleatorio (el usuario no necesita contraseña).
- Nombre y apellido vienen tal como están en el perfil de Google (pueden estar en mayúsculas).
- **Bug detectado y corregido en esta sesión:** `findOrCreateGoogleUser` retornaba solo `{ accessToken, refreshToken }` sin el objeto `usuario`. Fix: ambos paths (existente y nuevo) ahora construyen y retornan el objeto `usuario` igual que `login` y `register`. Tests: 138/138 en verde.

---

# 2. Users Module

## 2.1 — `GET /users/me`

**Request:** `GET /users/me` — `Authorization: Bearer <accessToken>`

**Response — 200 OK:**

```json
{
  "usuarioId": "fc2e47f0-cce1-4665-af7a-d75056d675b3",
  "correoElectronico": "test.umss@petfinder.dev",
  "tokenFcm": null,
  "configPrivacidad": { "mostrar_foto_qr": true },
  "estadoCuenta": "activa",
  "ultimoAcceso": "2026-05-18T03:32:32.681Z",
  "fechaUltimaUbicacion": null,
  "persona": {
    "personaId": "15e8092d-ae32-4582-b072-84ab428e7274",
    "nombre": "Juan",
    "apellidoPaterno": "Pérez",
    "apellidoMaterno": "López",
    "ci": "1234567",
    "fotoPerfilUrl": null,
    "fechaNacimiento": null,
    "mediosContacto": [
      { "contactoId": 7, "personaId": "15e8092d-...", "tipo": "WhatsApp", "valor": "70012345", "esPrincipal": true }
    ]
  },
  "ubicacion": null
}
```

**Estado:** ✅ OK

---

## 2.2 — `PUT /users/me`

**Request:** `PUT /users/me`

```json
{ "nombre": "Juan Carlos", "apellidoMaterno": "López", "fechaNacimiento": "1995-03-22" }
```

**Response — 200 OK:**

```json
{
  "personaId": "15e8092d-ae32-4582-b072-84ab428e7274",
  "nombre": "Juan Carlos",
  "apellidoPaterno": "Pérez",
  "apellidoMaterno": "López",
  "ci": "1234567",
  "fotoPerfilUrl": null,
  "fechaNacimiento": "1995-03-22T00:00:00.000Z"
}
```

**Estado:** ✅ OK

---

## 2.3 — `PUT /users/me/photo`

**Request:** `PUT /users/me/photo` — `multipart/form-data` con campo `foto`

```bash
curl -X PUT http://localhost:3000/users/me/photo \
  -H "Authorization: Bearer $TOKEN" \
  -F "foto=@/ruta/a/imagen.png"
```

**Response — 200 OK:**

```json
{
  "personaId": "15e8092d-ae32-4582-b072-84ab428e7274",
  "fotoPerfilUrl": "https://res.cloudinary.com/daelr9ppy/image/upload/v1779075288/personas/15e8092d-.../mruaereofdqm1jiqn7b5.png"
}
```

**Estado:** ✅ OK — Cloudinary devuelve URL pública.

---

## 2.4 — `PUT /users/me/location`

**Request:**

```json
{ "lat": -17.3935, "lng": -66.1457 }
```

**Response — 200 OK:** `{ "message": "Ubicación actualizada" }`

**Estado:** ✅ OK

---

## 2.5 — `POST /users/me/contacts`

**Request:**

```json
{ "tipo": "Celular", "valor": "+591 71234567" }
```

**Response — 201 Created:**

```json
{ "contactoId": 8, "personaId": "15e8092d-...", "tipo": "Celular", "valor": "+591 71234567", "esPrincipal": false }
```

**Estado:** ✅ OK

---

## 2.6 — `DELETE /users/me/contacts/{id}`

**Request:** `DELETE /users/me/contacts/8`

**Response — 200 OK:**

```json
{ "contactoId": 8, "personaId": "15e8092d-...", "tipo": "Celular", "valor": "+591 71234567", "esPrincipal": false }
```

**Estado:** ✅ OK

---

## 2.7 — `GET /users/map`

**Request:** `GET /users/map?radio=10` (radio en km, opcional)

**Response — 200 OK:**

```json
[
  { "usuario_id": "145b307f-...", "nombre": "Wilian", "apellido_paterno": "Almendras", "lat": -17.3934946, "lng": -66.144941 },
  { "usuario_id": "fc2e47f0-...", "nombre": "Juan Carlos", "apellido_paterno": "Pérez", "lat": -17.3935, "lng": -66.1457 }
]
```

**Estado:** ✅ OK — lista usuarios con ubicación reciente cerca del solicitante.

---

# 3. Tipos Mascota

## 3.1 — `GET /tipos-mascota` (público)

**Response — 200 OK:**

```json
[
  { "tipoId": 1, "nombre": "Perro" },
  { "tipoId": 2, "nombre": "Gato" },
  { "tipoId": 3, "nombre": "Ave" },
  { "tipoId": 4, "nombre": "Conejo" },
  { "tipoId": 5, "nombre": "Reptil" },
  { "tipoId": 6, "nombre": "Pez" },
  { "tipoId": 7, "nombre": "Hámster" },
  { "tipoId": 8, "nombre": "Cobayo" },
  { "tipoId": 9, "nombre": "Hurón" },
  { "tipoId": 10, "nombre": "Otro" }
]
```

**Estado:** ✅ OK — endpoint público, no requiere auth.

---

## 3.2 — `POST /tipos-mascota` (admin)

**Request (con usuario rol=`usuario`):** → 403 Forbidden ✅ (RBAC funcional)

**Request (con usuario rol=`admin`):**

```json
{ "nombre": "Tortuga" }
```

**Response — 201 Created:** `{ "tipoId": 11, "nombre": "Tortuga" }`

**Estado:** ✅ OK — `RolesGuard` bloquea correctamente a usuarios normales.

---

## 3.3 — `DELETE /tipos-mascota/{id}` (admin)

**Request:** `DELETE /tipos-mascota/11`

**Response — 200 OK:** `{ "tipoId": 11, "nombre": "Tortuga" }`

**Estado:** ✅ OK

---

# 4. Pets Module

## 4.1 — `POST /pets` (multipart con fotos)

**Request:** `multipart/form-data`
- `nombre=Pelusa`
- `tipoId=2` (Gato)
- `sexo=F`
- `colorPrimario=Negro y blanco`
- `rasgosParticulares=Mancha blanca en la cola`
- `fotos=@imagen.png` (binary)
- `fotoPrincipalIndex=0`

**Response — 201 Created:** mascota completa con `mascotaId`, `placaQr.tokenAcceso`, `propietarios` (auto-asignado el creador como `Dueno_Principal`) y `fotos[]` con URL de Cloudinary.

**Estado:** ✅ OK — placa QR generada automáticamente, foto subida a Cloudinary.

---

## 4.2 — `GET /pets`

**Response — 200 OK:**

```json
[
  {
    "mascotaId": "776cb109-96d4-4e00-b4db-59ab18ac1325",
    "nombre": "Rocky",
    "tipoId": 1,
    "sexo": "M",
    "colorPrimario": "Café",
    "rasgosParticulares": "Orejas caídas",
    "estado": "en_casa",
    "fechaUltimaUbicacion": "2026-05-18T03:51:05.821Z",
    "creadoEl": "2026-05-18T03:48:36.891Z",
    "tipoMascota": { "tipoId": 1, "nombre": "Perro" },
    "placaQr": {
      "placaId": "ab4bec93-e1d7-474e-99f6-1960db92ec3a",
      "tokenAcceso": "fafe5f0d-bc1c-470e-a3f0-5b8042063821",
      "estaActiva": true
    },
    "fotos": [
      {
        "fotoId": 12,
        "mascotaId": "776cb109-...",
        "fotoUrl": "https://res.cloudinary.com/daelr9ppy/image/upload/...",
        "esPrincipal": true,
        "creadoEl": "2026-05-18T03:48:38.581Z"
      }
    ],
    "propietarios": [
      {
        "personaId": "15e8092d-ae32-4582-b072-84ab428e7274",
        "tipoRelacion": "Dueno_Principal",
        "recibeAlertas": true,
        "mostrarEnQr": true,
        "persona": {
          "personaId": "15e8092d-...",
          "nombre": "Juan Carlos",
          "apellidoPaterno": "Pérez",
          "fotoPerfilUrl": "https://res.cloudinary.com/..."
        }
      }
    ]
  }
]
```

**Estado:** ✅ OK

---

## 4.3 — `GET /pets/{id}`

**Response — 200 OK:**

```json
{
  "mascotaId": "776cb109-96d4-4e00-b4db-59ab18ac1325",
  "nombre": "Rocky",
  "tipoId": 1,
  "sexo": "M",
  "colorPrimario": "Café",
  "rasgosParticulares": "Orejas caídas",
  "estado": "en_casa",
  "fechaUltimaUbicacion": "2026-05-18T03:51:05.821Z",
  "creadoEl": "2026-05-18T03:48:36.891Z",
  "tipoMascota": { "tipoId": 1, "nombre": "Perro" },
  "placaQr": {
    "placaId": "ab4bec93-...",
    "mascotaId": "776cb109-...",
    "tokenAcceso": "fafe5f0d-bc1c-470e-a3f0-5b8042063821",
    "estaActiva": true,
    "fechaActivacion": "2026-05-18T03:48:37.355Z"
  },
  "fotos": [
    {
      "fotoId": 12,
      "fotoUrl": "https://res.cloudinary.com/daelr9ppy/image/upload/...",
      "esPrincipal": true,
      "creadoEl": "2026-05-18T03:48:38.581Z"
    }
  ],
  "fichaMedica": null,
  "propietarios": [
    {
      "personaId": "15e8092d-...",
      "tipoRelacion": "Dueno_Principal",
      "recibeAlertas": true,
      "mostrarEnQr": true,
      "persona": {
        "nombre": "Juan Carlos",
        "apellidoPaterno": "Pérez",
        "fotoPerfilUrl": "https://res.cloudinary.com/...",
        "mediosContacto": [{ "tipo": "WhatsApp", "valor": "70012345", "esPrincipal": true }]
      }
    }
  ],
  "ubicacion": { "lat": -17.394, "lng": -66.1465 }
}
```

**Estado:** ✅ OK

---

## 4.4 — `GET /pets/{id}/card`

**Request:** sin headers — endpoint público.

**Response — 200 OK:**

```json
{
  "mascotaId": "776cb109-96d4-4e00-b4db-59ab18ac1325",
  "nombre": "Rocky",
  "tipo": "Perro",
  "sexo": "M",
  "colorPrimario": "Café",
  "rasgosParticulares": "Orejas caídas",
  "estado": "en_casa",
  "estaExtraviada": false,
  "fotos": [
    { "fotoId": 12, "url": "https://res.cloudinary.com/...", "esPrincipal": true }
  ],
  "fichaMedica": null,
  "registrosMedicos": [],
  "propietarios": [
    {
      "personaId": "15e8092d-...",
      "nombreCompleto": "Juan Carlos Pérez",
      "fotoPerfilUrl": "https://res.cloudinary.com/...",
      "tipoRelacion": "Dueno_Principal",
      "contactos": [{ "tipo": "WhatsApp", "valor": "70012345" }]
    }
  ]
}
```

**Estado:** ✅ OK

---

## 4.5 — `GET /pets/{id}/qr`

**Response — 200 OK:** retorna data URL PNG base64 (`data:image/png;base64,iVBORw0KGgo...`) listo para mostrar como `<img src>` en Kotlin.

**Estado:** ✅ OK

---

## 4.6 — `PUT /pets/{id}`

**Request:**

```json
{ "colorPrimario": "Blanco con negro", "rasgosParticulares": "Cola con punta blanca" }
```

**Response — 200 OK:** mascota actualizada.

**Estado:** ✅ OK

---

## 4.7 — `PUT /pets/{id}/location`

**Request:** `{ "lat": -17.3935, "lng": -66.1457 }`

**Response — 200 OK:** `{ "message": "Ubicación de la mascota actualizada" }`

**Estado:** ✅ OK

---

## 4.8 — `GET /pets/map`

**Response — 200 OK:**

```json
[
  {
    "mascota_id": "ad999d9f-...",
    "nombre": "Pelusa",
    "estado": "en_casa",
    "foto_url": "https://res.cloudinary.com/...",
    "lat": -17.3935,
    "lng": -66.1457
  }
]
```

**Estado:** ✅ OK

---

## 4.9 — `POST /pets/{id}/medical`

**Request:**

```json
{
  "tipo": "vacuna",
  "descripcion": "Vacuna antirrábica anual",
  "fecha": "2026-04-10",
  "veterinario": "Dr. López — Veterinaria UMSS"
}
```

**Response — 201 Created:** `{ "registroId": 1, "mascotaId": "...", "tipo": "vacuna", ... }`

**Estado:** ✅ OK

---

## 4.10 — `GET /pets/{id}/medical`

**Response — 200 OK:**

```json
[
  {
    "registroId": 2,
    "mascotaId": "776cb109-96d4-4e00-b4db-59ab18ac1325",
    "tipo": "vacuna",
    "descripcion": "Vacuna antirrábica anual",
    "fecha": "2026-04-10T00:00:00.000Z",
    "veterinario": "Dr. López — Veterinaria UMSS",
    "creadoEl": "2026-05-18T12:59:49.115Z"
  }
]
```

**Estado:** ✅ OK

---

## 4.11 — `POST /pets/{id}/photos`

**Request:** multipart con campo `fotos` (binary). Acepta opcional `fotoPrincipalIndex` para promover una de las fotos recién subidas como principal.

**Response — 201 Created:**

```json
[
  {
    "fotoId": 13,
    "mascotaId": "776cb109-96d4-4e00-b4db-59ab18ac1325",
    "fotoUrl": "https://res.cloudinary.com/daelr9ppy/image/upload/v.../mascotas/776cb109-.../foto.png",
    "esPrincipal": false,
    "creadoEl": "2026-05-18T04:10:22.000Z"
  }
]
```

Las fotos previas se mantienen.

**Estado:** ✅ OK — **Resuelto E3.** Comportamiento corregido: ahora **agrega** las fotos (no reemplaza). Verificado live: 1 foto inicial → POST 2 fotos → total 3 fotos, original con `esPrincipal: true` preservada. Límite máximo: 4 fotos por mascota; si el total excedería, devuelve 400.

---

## 4.12 — `GET /pets/{id}/owners-map`

**Response — 200 OK:**

```json
[
  {
    "persona_id": "15e8092d-ae32-4582-b072-84ab428e7274",
    "nombre": "Juan Carlos",
    "apellido_paterno": "Pérez",
    "foto_perfil_url": "https://res.cloudinary.com/...",
    "tipo_relacion": "Dueño Principal",
    "lat": -17.3935,
    "lng": -66.1457
  }
]
```

**Estado:** ✅ OK

---

## 4.13 — `PUT /pets/{id}/status` con `estado=extraviada`

**Request:** `{ "estado": "extraviada" }`

**Response — 200 OK:** `{ "mascotaId": "...", "nombre": "Pelusa", "estado": "extraviada" }`

**Estado:** ✅ OK — **Resuelto E1.** El cambio de estado a `extraviada` dispara el flujo de notificación FCM (`sendPetLostAlert` + `sendZoneAlert`) sin tumbar el server. Verificado live: PUT → 200 OK → ping al server 4 s después → 200 OK (proceso vivo).

**Fix aplicado:**

1. Corregido nombre de columna en SQL crudo de `notifications.service.ts`: `pm.recibeAlertas` → `pm.recibe_alertas`.
2. Envueltos `sendPetLostAlert`, `sendQrScanAlert` y `sendZoneAlert` en `try/catch` con `this.logger.error(...)` — un fallo en notificaciones nunca derribará Node.

---

## 4.14 — `PUT /pets/{id}/status` con `estado=recuperada`

**Request:** `{ "estado": "recuperada" }`

**Response — 200 OK:** `{ "mascotaId": "...", "nombre": "Rocky", "estado": "recuperada" }`

**Estado:** ✅ OK — cierra cualquier reporte de extravío abierto. No dispara notificaciones FCM.

---

## 4.14b — `PUT /pets/{id}/status` con `estado=en_paseo` y `estado=en_casa`

**Casos probados:**

```json
{ "estado": "en_paseo" }
→ { "mascotaId": "776cb109-...", "nombre": "Rocky", "estado": "en_paseo" }

{ "estado": "en_casa" }
→ { "mascotaId": "776cb109-...", "nombre": "Rocky", "estado": "en_casa" }
```

**Estado:** ✅ OK

**Notas:**
- `en_paseo` activa propagación automática de GPS: cuando el dueño actualiza su ubicación, las mascotas en estado `en_paseo` también se actualizan automáticamente y se emite `pet:location-updated` por WebSocket.
- `en_casa` cierra cualquier reporte de extravío abierto (mismo branch que `recuperada`).
- Ninguno de los dos dispara notificaciones FCM.

---

## 4.15 — `DELETE /pets/{id}/medical/{registroId}`

**Response — 200 OK:** `{ "message": "Registro eliminado" }`

**Estado:** ✅ OK

---

## 4.16 — `DELETE /pets/{id}/photos/{fotoId}`

**Casos probados:**

1. DELETE foto inexistente (`fotoId=99999`) → **404 `"Foto no encontrada"`** ✅ (**Resuelto E5** — se valida la existencia ANTES de la regla de mínimo).
2. DELETE foto cuando es la única → 400 `"La mascota debe tener al menos 1 foto"` ✅ (regla de negocio correcta).
3. DELETE foto no principal con varias fotos restantes → 200 `{ "message": "Foto eliminada" }` ✅.

**Estado:** ✅ OK

---

## 4.17 — `POST /pets/{id}/owners`

**Request (happy path — agregar cuidadora):**

```json
{ "personaId": "d0a60bc2-45b9-46bc-8572-eaab85926377", "tipoRelacion": "Cuidador" }
```

**Response — 201 Created:**

```json
{
  "personaId": "d0a60bc2-45b9-46bc-8572-eaab85926377",
  "mascotaId": "776cb109-96d4-4e00-b4db-59ab18ac1325",
  "tipoRelacion": "Cuidador",
  "recibeAlertas": true,
  "mostrarEnQr": true,
  "persona": {
    "personaId": "d0a60bc2-...",
    "nombre": "Maria",
    "apellidoPaterno": "Gomez",
    "fotoPerfilUrl": null
  }
}
```

**Casos de error probados:**

1. UUID nil `00000000-...` → 400 `"El ID de la persona debe ser un UUID v4 válido"` ✅
2. Misma persona dos veces → 400 `"Esta persona ya es propietaria o cuidadora de la mascota"` ✅

**Estado:** ✅ OK — probado con segundo usuario real (`maria.test@petfinder.dev`).

---

## 4.18 — `DELETE /pets/{id}/owners/{personaId}`

**Casos probados:**

1. **Happy path** — remover cuidadora María → 200 OK:

```json
{
  "personaId": "d0a60bc2-45b9-46bc-8572-eaab85926377",
  "mascotaId": "776cb109-96d4-4e00-b4db-59ab18ac1325",
  "tipoRelacion": "Cuidador",
  "recibeAlertas": true,
  "mostrarEnQr": true
}
```

1. **Protección del Dueño Principal** — intentar eliminar al `Dueno_Principal` → 403:

```json
{ "message": "No se puede eliminar al Dueño Principal de la mascota", "error": "Forbidden", "statusCode": 403 }
```

**Estado:** ✅ OK — validaciones correctas en ambos casos.

---

## 4.19 — `DELETE /pets/{id}`

**Response — 200 OK:** `{ "message": "Mascota eliminada" }`

**Estado:** ✅ OK — borra mascota, placa QR y fotos asociadas (cascade).

---

## 4.20 — `GET /pets/{id}/scans`

**Request:** `GET /pets/776cb109-96d4-4e00-b4db-59ab18ac1325/scans` — requiere ser propietario/cuidador.

**Response — 200 OK:**

```json
[
  {
    "escaneoId": 2,
    "mascotaId": "776cb109-96d4-4e00-b4db-59ab18ac1325",
    "lat": -17.3935,
    "lng": -66.1457,
    "escaneadoEl": "2026-05-18T13:20:47.562Z"
  },
  {
    "escaneoId": 1,
    "mascotaId": "776cb109-96d4-4e00-b4db-59ab18ac1325",
    "lat": -17.3935,
    "lng": -66.1457,
    "escaneadoEl": "2026-05-18T03:49:37.437Z"
  }
]
```

**Estado:** ✅ OK

**Notas:**

- Ordenado del más reciente al más antiguo (`escaneadoEl DESC`).
- `lat`/`lng` son `null` si el escaneador no compartió ubicación GPS (la app puede omitir las coordenadas en el body de `POST /qr/{token}/scan`).
- Complementa la notificación push inmediata (`sendQrScanAlert`) con el historial completo — Historia 12.
- Protección de ownership: un usuario que no sea propietario ni cuidador recibe 403.

---

## 4.21 — `GET /pets/{id}/reports`

**Request:** `GET /pets/776cb109-96d4-4e00-b4db-59ab18ac1325/reports` — requiere ser propietario/cuidador.

**Response — 200 OK (reporte abierto):**

```json
[
  {
    "reporte_id": 3,
    "fecha_perdida": "2026-05-18T13:20:43.446Z",
    "recompensa": "0",
    "estado_reporte": "abierto",
    "lat": -17.394,
    "lng": -66.1465
  }
]
```

**Response — 200 OK (tras cerrar con `en_casa`):**

```json
[
  {
    "reporte_id": 3,
    "fecha_perdida": "2026-05-18T13:20:43.446Z",
    "recompensa": "0",
    "estado_reporte": "cerrado",
    "lat": -17.394,
    "lng": -66.1465
  }
]
```

**Estado:** ✅ OK

**Notas:**

- Devuelve **todos** los reportes (abiertos y cerrados), ordenados por `fecha_perdida DESC`.
- `lat`/`lng` son la última ubicación conocida de la mascota **al momento del extravío** (snapshot del momento), no la ubicación actual.
- `estado_reporte` cambia de `"abierto"` a `"cerrado"` automáticamente cuando `PUT /pets/{id}/status` recibe `en_casa`, `en_paseo` o `recuperada`.
- Protección de ownership: mismo guard que los demás endpoints privados de pets.

---

# 5. Geofencing

## 5.1 — `POST /geofencing/pets/{petId}/zones` (círculo)

**Request:**

```json
{ "nombreZona": "Casa UMSS", "tipo": "circulo", "lat": -17.3935, "lng": -66.1457, "radioMetros": 500 }
```

**Response — 201 Created:**

```json
{
  "zona_id": 15,
  "nombre_zona": "Casa UMSS",
  "radio_metros": 500,
  "esta_activa": true,
  "centro_lat": -17.3935,
  "centro_lng": -66.1457,
  "geometria_geojson": null,
  "mascota_ids": ["776cb109-..."]
}
```

**Estado:** ✅ OK

---

## 5.2 — `POST /geofencing/pets/{petId}/zones` (polígono)

**Request:**

```json
{
  "nombreZona": "Plaza Colón",
  "tipo": "poligono",
  "coordenadas": [
    { "lat": -17.391, "lng": -66.158 },
    { "lat": -17.391, "lng": -66.152 },
    { "lat": -17.395, "lng": -66.152 },
    { "lat": -17.395, "lng": -66.158 }
  ]
}
```

**Response — 201 Created:** la zona se guarda como GeoJSON Polygon válido (con cierre automático del primer y último punto).

**Estado:** ✅ OK

---

## 5.3 — `GET /geofencing/zones`

**Response — 200 OK:**

```json
[
  {
    "zona_id": 15,
    "nombre_zona": "Casa UMSS (1km)",
    "tipo": "circulo",
    "radio_metros": 500,
    "esta_activa": true,
    "centro_lat": -17.3935,
    "centro_lng": -66.1457,
    "mascotas": [
      {
        "mascota_id": "776cb109-96d4-4e00-b4db-59ab18ac1325",
        "nombre": "Rocky",
        "estado": "en_casa",
        "tipo_mascota": "Perro"
      }
    ]
  }
]
```

**Estado:** ✅ OK

---

## 5.4 — `GET /geofencing/pets/{petId}/zones`

**Response — 200 OK:**

```json
[
  {
    "zona_id": 15,
    "nombre_zona": "Casa UMSS (1km)",
    "radio_metros": 500,
    "esta_activa": true,
    "centro_lat": -17.3935,
    "centro_lng": -66.1457,
    "mascota_ids": ["776cb109-96d4-4e00-b4db-59ab18ac1325"]
  }
]
```

**Nota:** a diferencia de `GET /geofencing/zones`, este endpoint devuelve `mascota_ids` (array de UUIDs) en lugar del objeto mascota completo, y no incluye el campo `tipo`.

**Estado:** ✅ OK

---

## 5.5 — `GET /geofencing/zones/{id}`

**Response — 200 OK:**

```json
{
  "zona_id": 15,
  "nombre_zona": "Casa UMSS (1km)",
  "radio_metros": 500,
  "esta_activa": true,
  "centro_lat": -17.3935,
  "centro_lng": -66.1457,
  "geometria_geojson": null,
  "mascota_ids": ["776cb109-96d4-4e00-b4db-59ab18ac1325"]
}
```

**Nota:** `geometria_geojson` es `null` para zonas de tipo círculo. Para polígonos contiene el GeoJSON con las coordenadas del polígono.

**Estado:** ✅ OK

---

## 5.6 — `PUT /geofencing/zones/{id}`

**Request:** `{ "nombreZona": "Casa UMSS (1km)", "radioMetros": 1000 }`

**Response — 200 OK:** zona con `nombre_zona: "Casa UMSS (1km)"` y `radio_metros: 1000`. Confirmado con `GET` posterior.

**Estado:** ✅ OK — **Resuelto E2.** `updateZone()` reescrito con ramas independientes: cada campo (`nombreZona`, `lat`/`lng`, `radioMetros`, `coordenadas`) se actualiza por separado. Soporta partial updates de cualquier combinación de campos. Verificado live: zona con radio 300 → PUT `{"radioMetros": 2500}` → GET muestra 2500.

---

## 5.7 — `DELETE /geofencing/zones/{id}`

**Response — 200 OK:** `{ "message": "Zona eliminada" }`

**Estado:** ✅ OK

---

# 6. QR Público (sin auth)

## 6.1 — `GET /qr/{token}`

**Request:** sin headers (público)

**Response — 200 OK:** ficha completa con `mascotaId`, `nombre`, `tipo`, `colorPrimario`, `rasgosParticulares`, `estado`, `estaExtraviada`, `fotos[]`, `fichaMedica`, `registrosMedicos[]`, `propietarios[]` (con `nombreCompleto`, `fotoPerfilUrl`, `contactos`, `tipoRelacion`).

**Estado:** ✅ OK — endpoint público, no requiere JWT, devuelve toda la info necesaria para mostrar el perfil al escanear.

---

## 6.2 — `POST /qr/{token}/scan`

**Request:** `{ "lat": -17.3935, "lng": -66.1457 }`

**Response — 201 Created:** `{ "message": "Escaneo registrado" }`

**Estado:** ✅ OK — el escaneo se guarda en BD; si la mascota está `extraviada` y los dueños tienen `tokenFcm`, dispara push (en este test el dueño no tiene FCM token, por lo que la notificación silenciosamente no se envía).

---

# 7. Map

## 7.1 — `GET /map/public/lost-pets` (público)

**Response — 200 OK:** array con mascotas en estado `extraviada` y su última ubicación conocida. En esta corrida: `[]` (Rocky está `en_casa`).

**Estado:** ✅ OK

---

## 7.2 — `GET /map/snapshot` (con auth)

**Response — 200 OK:**

```json
{
  "marcadores": {
    "usuariosCompartidos": [],
    "desaparecidas": []
  },
  "zonas": [
    {
      "zonaId": 15,
      "nombre": "Casa UMSS (1km)",
      "mascotas": [
        { "mascotaId": "776cb109-...", "nombre": "Rocky", "estado": "en_casa", "fotoUrl": "...", "ubicacion": null }
      ],
      "tipo": "circulo",
      "centro": { "lat": -17.3935, "lng": -66.1457 },
      "radioMetros": 500
    }
  ]
}
```

**Estado:** ✅ OK — snapshot integral para el mapa del frontend.

---

# 8. WebSocket — `/realtime` (namespace Socket.IO)

## 8.1 — Conexión + auth JWT

**Cliente:** Socket.IO v4 con `auth: { token: <JWT> }` en el handshake.

**Comportamiento verificado:**

1. Cliente se conecta a `ws://localhost:3000/socket.io/?EIO=4&transport=websocket`.
2. Envía `40/realtime,{"token":"eyJ..."}` (CONNECT al namespace con auth).
3. Servidor responde `40/realtime,{"sid":"..."}` ✅
4. El gateway une al socket automáticamente a todos los rooms `pet:<mascotaId>` de las mascotas del usuario.
5. También une al room personal `user:<usuarioId>`.

**Estado:** ✅ OK

---

## 8.2 — Push de eventos en tiempo real

**Escenario:** WS conectado al room `pet:<rockyId>` + se ejecuta `PUT /pets/<rockyId>/location`.

**Evento recibido:**

```text
42/realtime,["pet:location-updated",{
  "mascotaId": "776cb109-96d4-4e00-b4db-59ab18ac1325",
  "lat": -17.394,
  "lng": -66.1465,
  "estado": "en_casa",
  "fechaActualizacion": "2026-05-18T03:51:05.821Z"
}]
```

**Estado:** ✅ OK — push se entrega <1s después del PUT HTTP.

Otros eventos confirmados en los logs del server durante las pruebas:

- `pet:registered` — cuando se crea una mascota
- `pet:status-changed` — cuando cambia el estado de una mascota

---

## 2.8 — `PUT /users/me/fcm-token`

**Request:**

```http
PUT /users/me/fcm-token
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{ "tokenFcm": "dS1xF3pT_fakeDeviceToken_Android_12345abc" }
```

**Response — 200 OK:**

```json
{ "message": "Token FCM actualizado" }
```

**Casos de error:**

- `{ "tokenFcm": "" }` → 400 `"tokenFcm should not be empty"` ✅
- Sin body / campo ausente → 400 validación ✅

**Verificación:**

```json
// GET /users/me inmediatamente después:
{ "tokenFcm": "dS1xF3pT_fakeDeviceToken_Android_12345abc", ... }
```

**Estado:** ✅ OK

**Notas:**

- Android debe llamar este endpoint al arrancar la app o cuando Firebase renueva el token (callback `onNewToken`).
- Sin un token registrado, `sendPetLostAlert`, `sendQrScanAlert` y `sendZoneAlert` omiten al usuario silenciosamente (no fallan, solo no le llega la push).
- El token se puede actualizar cuantas veces se quiera; sobreescribe el anterior en BD.

---

## 2.9 — `GET /users/{personaId}/card`

**Request:** `GET /users/15e8092d-ae32-4582-b072-84ab428e7274/card`

**Response — 200 OK:**

```json
{
  "personaId": "15e8092d-...",
  "nombreCompleto": "Juan Carlos Pérez",
  "fotoPerfilUrl": null,
  "contactos": [ { "tipo": "WhatsApp", "valor": "70012345" } ],
  "mascotas": []
}
```

**Estado:** ✅ OK

---

# 🐛 Errores detectados y fixes aplicados

Resumen de los hallazgos durante la corrida. **Todos los bugs (E1–E5) fueron corregidos y verificados en vivo en la misma sesión.** Tests: 136/136 en verde.

## E1 — 🔴 CRÍTICO ✅ RESUELTO — `sendZoneAlert` mataba el proceso Node

**Endpoint afectado:** `PUT /pets/{id}/status` con `estado=extraviada`

**Síntoma:** la BD se actualiza y la response llega como 200 OK al cliente, pero **el proceso Node muere ~1s después** sin captura de error. Esto deja el server caído y a todos los usuarios desconectados.

**Causa raíz:** `src/infrastructure/notifications/notifications.service.ts:128` ejecuta SQL crudo con un nombre de columna en camelCase:

```sql
AND pm.recibeAlertas = true
```

PostgreSQL convierte identificadores no quoted a lowercase → busca `pm.recibealertas`, pero la columna real es `pm.recibe_alertas` (snake_case por Prisma `@map`).

**Fix aplicado:**

```diff
- AND pm.recibeAlertas = true
+ AND pm.recibe_alertas = true
```

Adicionalmente, los 3 métodos `sendPetLostAlert`, `sendQrScanAlert` y `sendZoneAlert` ahora están envueltos en `try/catch` con `this.logger.error(...)`. Un fallo en notificaciones jamás derriba Node.

**Verificación live:** `PUT /pets/:id/status {"estado":"extraviada"}` → 200 OK, ping al server 4 s después → 200 OK (proceso vivo).

---

## E2 — 🟡 MEDIO ✅ RESUELTO — `PUT /geofencing/zones/{id}` ignoraba `radioMetros`

**Endpoint afectado:** `PUT /geofencing/zones/{id}`

**Causa raíz:** el código viejo en `updateZone()` requería que `dto.tipo === 'circulo' && dto.lat && dto.lng && dto.radioMetros` fueran TODOS truthy para tocar la geometría. Un PUT parcial con solo `{ radioMetros }` no entraba en esa rama.

**Fix aplicado:** `updateZone()` reescrito en `src/modules/geofencing/geofencing.service.ts` con ramas independientes. Cada campo se actualiza por separado:

- `nombreZona` → `prisma.zonaSegura.update`
- `lat` + `lng` (sin necesidad de radio) → `UPDATE punto_central` via `$executeRaw`
- `radioMetros` solo → `UPDATE radio_metros` via `$executeRaw`
- `coordenadas` (polígono) → `UPDATE geometria` + recalcular centroide

**Verificación live:** zona con `radio_metros: 300` → `PUT { "radioMetros": 2500 }` → GET muestra 2500. Test agregado: `actualiza sólo el radio cuando solo viene radioMetros` (1 llamada a `$executeRaw`).

---

## E3 — 🟡 MEDIO ✅ RESUELTO — `POST /pets/{id}/photos` reemplazaba en vez de agregar

**Endpoint afectado:** `POST /pets/{id}/photos`

**Causa raíz:** el viejo `uploadPhotos()` borraba explícitamente todas las fotos previas con `fotoMascota.deleteMany` antes de insertar las nuevas.

**Fix aplicado:**

1. `uploadPhotos()` ahora **agrega** sin borrar — los fotos existentes se preservan.
2. Se valida el límite máximo: si `total > 4` lanza `BadRequestException`.
3. El parámetro `fotoPrincipalIndex` ahora es opcional. Si se envía, se ejecuta `fotoMascota.updateMany` para desactivar el `esPrincipal` previo y promueve la foto recién subida en ese índice; si no se envía, todas las nuevas quedan `esPrincipal: false` y la principal original se mantiene.
4. Renombrado el método del controller: `replacePhotos` → `addPhotos`. Swagger actualizado: "Agregar fotos a la mascota (no reemplaza las existentes; máx. 4 fotos totales)".

**Verificación live:** 1 foto inicial con `esPrincipal: true` → `POST` con 2 fotos nuevas → `GET /pets/:id/card` muestra 3 fotos; la original mantiene `esPrincipal: true`, las dos nuevas con `esPrincipal: false`.

---

## E4 — 🟢 MENOR ✅ RESUELTO — Swagger no mostraba el shape correcto de `medioContacto`

**Síntoma:** Swagger no dejaba claro que `medioContacto` espera `{ tipo, valor }` con `tipo ∈ {WhatsApp, Celular, Fijo, Telegram}`.

**Fix aplicado:** en `src/modules/auth/dto/register.dto.ts` el decorador `@ApiPropertyOptional` ahora incluye `type: MedioContactoDto`, un `example: { tipo: 'WhatsApp', valor: '+591 70000000' }` y una descripción explícita de los valores permitidos para `tipo`.

**Verificación live:** Swagger JSON ya muestra el ejemplo y la descripción correctos.

---

## E5 — 🟢 MENOR ✅ RESUELTO — Mensaje 400 confuso al borrar foto inexistente

**Endpoint afectado:** `DELETE /pets/{id}/photos/{fotoId}`

**Causa raíz:** la regla `mascota.fotos.length <= MIN_FOTOS` se evaluaba ANTES de comprobar si la foto existía.

**Fix aplicado:** en `deletePhoto()` se invirtió el orden — primero `find` por `fotoId` → si no existe lanza `NotFoundException('Foto no encontrada')`. Solo si la foto sí existe se aplica la regla de mínimo.

**Verificación live:** `DELETE /pets/:id/photos/99999` → `404 { "message": "Foto no encontrada", "error": "Not Found", "statusCode": 404 }`.

---

## E6 — 🟢 Pendientes (cobertura, no son bugs)

- `POST /pets/{id}/owners` happy path — requiere segundo usuario.
- `DELETE /pets/{id}/owners/{personaId}` happy path.
- `GET /auth/google` + callback (pospuesto a sesión con cuenta de Google).
- Push FCM end-to-end con dispositivo Kotlin real.

---

# 📊 Resumen final

## Cobertura

| Módulo | Endpoints | Probados | ✅ OK | ⚠️ Parcial | ❌ Falla |
|---|---|---|---|---|---|
| **Auth** | 6 | 6 | 6 | 0 | 0 |
| **Users** | 9 | 9 | 9 | 0 | 0 |
| **Tipos Mascota** | 3 | 3 | 3 | 0 | 0 |
| **Pets** | 21 | 21 | 21 | 0 | 0 |
| **Geofencing** | 6 | 6 | 6 | 0 | 0 |
| **QR público** | 2 | 2 | 2 | 0 | 0 |
| **Map** | 2 | 2 | 2 | 0 | 0 |
| **WebSocket** | 1 namespace | 1 | 1 | 0 | 0 |
| **TOTAL** | **50 + 1 WS** | **50** | **50** | **0** | **0** |

## Cifras (post-fixes)

- **Tasa de éxito (happy path):** 50/50 = **100 %**
- **Bugs críticos:** 0 ✅ (E1 resuelto)
- **Bugs medios:** 0 ✅ (E2, E3 resueltos)
- **Mejoras menores:** 0 ✅ (E4, E5 resueltos)
- **Tests unitarios:** 138/138 en verde (5 nuevos cubren los nuevos comportamientos + Google OAuth)

## Verificación de flujos clave

- ✅ **Sesión persistente** — refresh tokens con rotación + invalidación post-logout
- ✅ **RBAC** — admin vs usuario, `RolesGuard` operativo
- ✅ **Subida a Cloudinary** — perfil + fotos de mascota
- ✅ **PostGIS** — `ST_DWithin`, `ST_Y/ST_X`, `ST_SetSRID`, polígonos GeoJSON
- ✅ **QR público sin auth** — perfil completo + registro de escaneo con GPS
- ✅ **WebSocket realtime** — JWT en handshake, auto-join a rooms, push de `pet:location-updated`
- ✅ **Notificaciones FCM end-to-end** — flujo `extraviada` ya no tumba el server; pendiente probar con device token Kotlin real.

## Próximos pasos sugeridos

1. Probar FCM end-to-end con un device token Kotlin real (único gap restante).
2. ~~Probar `auth/google` con cuenta real~~ ✅ completado.
3. ~~Cubrir happy path de owners~~ ✅ completado — `POST` y `DELETE /pets/{id}/owners/{personaId}` probados con segundo usuario real.
4. ~~Probar `en_paseo` y `en_casa`~~ ✅ completado.
5. ~~Implementar `PUT /users/me/fcm-token`~~ ✅ completado y probado.
6. ~~Implementar `GET /pets/{id}/scans`~~ ✅ completado y probado.
7. ~~Implementar `GET /pets/{id}/reports`~~ ✅ completado y probado.
8. Agregar tests de integración (no solo unitarios) para la transición a `extraviada` y prevenir regresiones de E1.

---

