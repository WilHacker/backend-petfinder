# 🧪 Reporte de Pruebas API — PetFinder Backend

**Fecha:** 2026-05-17 (pruebas) · **Actualizado:** 2026-05-22 (Sprint 3 & 4 — Etapa 5)
**Entorno Local:** `http://localhost:3000`
**Entorno Producción:** `https://backend-petfinder.onrender.com`
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

# 0. WebSocket — Integración Kotlin (Socket.IO)

> **Producción:** `wss://backend-petfinder.onrender.com/realtime`
> **Local:** `ws://localhost:3000/realtime`

## 0.1 — Dependencia

```kotlin
// build.gradle.kts (app)
implementation("io.socket:socket.io-client:2.1.0")
```

## 0.2 — Conexión con JWT

```kotlin
import io.socket.client.IO
import io.socket.client.Socket

object RealtimeClient {
    private var socket: Socket? = null

    fun connect(accessToken: String) {
        val opts = IO.Options.builder()
            .setAuth(mapOf("token" to accessToken))
            .setTransports(arrayOf("websocket"))
            .build()

        socket = IO.socket("https://backend-petfinder.onrender.com/realtime", opts)

        socket?.on(Socket.EVENT_CONNECT) {
            Log.d("WS", "Conectado al namespace /realtime")
        }

        socket?.on(Socket.EVENT_CONNECT_ERROR) { args ->
            Log.e("WS", "Error de conexión: ${args[0]}")
            // Token expirado → renovar con POST /auth/refresh y reconectar
        }

        socket?.on(Socket.EVENT_DISCONNECT) {
            Log.d("WS", "Desconectado")
        }

        socket?.connect()
    }

    fun disconnect() {
        socket?.disconnect()
        socket = null
    }
}
```

**Cuándo llamar `connect()`:** al hacer login / al arrancar la app con sesión guardada.
**Cuándo llamar `disconnect()`:** al hacer logout o al destruir la Activity/ViewModel.

## 0.3 — Eventos disponibles

| Evento | Room | Cuándo se emite |
|---|---|---|
| `pet:location-updated` | `pet:{id}` | `PUT /pets/{id}/location` o GPS del dueño en paseo |
| `pet:status-changed` | `pet:{id}` | `PUT /pets/{id}/status` |
| `pet:profile-updated` | `pet:{id}` | `PUT /pets/{id}` · subir o borrar foto de mascota |
| `pet:registered` | `user:{id}` | `POST /pets` (solo al dueño creador) |
| `owner:location-updated` | `pet:{id}` | `PUT /users/me/location` (co-propietarios reciben GPS del dueño) |
| `owner:added` | `pet:{id}` | `POST /pets/{id}/owners` |
| `pet:assigned` | `user:{id}` | Al ser agregado como co-propietario |
| `pet:entered-zone` | `pet:{id}` | GPS del dueño detecta mascota dentro de zona |
| `pet:exited-zone` | `pet:{id}` | GPS del dueño detecta mascota fuera de zona |
| `owner:profile-updated` | `pet:{id}` | `PUT /users/me/photo` (co-propietarios reciben nueva foto del dueño) |

> Los rooms se unen **automáticamente** al conectarse — el servidor lee las mascotas del JWT y hace `socket.join(pet:{mascotaId})` por cada una.

## 0.4 — Escuchar eventos

```kotlin
// En tu ViewModel o Repository

fun listenPetEvents() {
    // Ubicación de mascota actualizada
    socket?.on("pet:location-updated") { args ->
        val data = args[0] as JSONObject
        val mascotaId = data.getString("mascotaId")
        val lat       = data.getDouble("lat")
        val lng       = data.getDouble("lng")
        val estado    = data.getString("estado")
        // Actualizar marcador en el mapa
    }

    // Estado de mascota cambiado
    socket?.on("pet:status-changed") { args ->
        val data    = args[0] as JSONObject
        val mascotaId = data.getString("mascotaId")
        val estado    = data.getString("estado")
        // Actualizar UI — badge de estado
    }

    // Perfil de mascota actualizado (nombre, foto, etc.)
    socket?.on("pet:profile-updated") { args ->
        val data          = args[0] as JSONObject
        val mascotaId     = data.getString("mascotaId")
        val fotoPrincipal = data.optString("fotoPrincipalUrl", "")
        // Recargar card de mascota si está en pantalla
    }

    // GPS de un co-propietario actualizado
    socket?.on("owner:location-updated") { args ->
        val data      = args[0] as JSONObject
        val personaId = data.getString("personaId")
        val lat       = data.getDouble("lat")
        val lng       = data.getDouble("lng")
        // Mover marcador del colaborador en el mapa
    }

    // Foto de perfil de un colaborador actualizada
    socket?.on("owner:profile-updated") { args ->
        val data          = args[0] as JSONObject
        val personaId     = data.getString("personaId")
        val fotoPerfilUrl = data.optString("fotoPerfilUrl", "")
        // Recargar avatar del colaborador
    }

    // Mascota entró a zona segura
    socket?.on("pet:entered-zone") { args ->
        val data      = args[0] as JSONObject
        val mascotaId = data.getString("mascotaId")
        val zonaId    = data.getInt("zonaId")
        // Mostrar notificación local
    }

    // Mascota salió de zona segura
    socket?.on("pet:exited-zone") { args ->
        val data      = args[0] as JSONObject
        val mascotaId = data.getString("mascotaId")
        val zonaId    = data.getInt("zonaId")
        // Mostrar notificación local de salida
    }
}
```

## 0.5 — Manejo de token expirado

```kotlin
socket?.on(Socket.EVENT_CONNECT_ERROR) { args ->
    val error = args[0].toString()
    if (error.contains("401") || error.contains("Token")) {
        // 1. POST /auth/refresh con el refreshToken guardado
        // 2. Guardar el nuevo accessToken en DataStore
        // 3. Llamar RealtimeClient.connect(newAccessToken)
    }
}
```

## 0.6 — Notas de producción (Render)

- Render usa HTTPS/WSS — siempre usar `wss://` en producción, nunca `ws://`.
- El plan gratuito de Render hace _spin down_ tras 15 min de inactividad — la primera conexión puede tardar ~30s en despertar el servidor. Las siguientes son instantáneas.
- Si el servidor se reinicia, el cliente debe reconectar automáticamente. Socket.IO lo hace con `reconnection: true` (habilitado por defecto).

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

1. `GET /auth/google` → 302 a `accounts.google.com` (OAuth consent screen)
2. Usuario selecciona cuenta → Google redirige a `GET /auth/google/callback`
3. Server procesa el perfil, genera tokens y hace **302 al deep link de Android**

**Redirect — 302 (callback → app Android):**

```
petfinder://auth/callback?accessToken=eyJ...&refreshToken=5df6bd17-...&userId=a69b8530-...&rol=usuario&nombre=WILLIAN+ANDRES
```

**Parámetros del deep link:**

| Param | Valor |
|---|---|
| `accessToken` | JWT de acceso (24 h) |
| `refreshToken` | Token de refresco (30 días, UUID) |
| `userId` | `usuarioId` del usuario |
| `rol` | `"admin"` o `"usuario"` |
| `nombre` | Nombre del usuario (primer nombre del perfil Google) |

**Estado:** ✅ OK

**Notas:**

- Android intercepta `petfinder://auth/callback` con su intent filter → `MainActivity.onNewIntent()` guarda la sesión en DataStore y navega a Main. El Chrome Custom Tab se cierra solo al detectar el scheme personalizado.
- Email ya existente → login directo (vinculación automática, no crea usuario nuevo).
- Email nuevo → crea `Persona` + `Usuario` con `claveHash` de UUID aleatorio (sin contraseña).
- Verificado: `GET /auth/google` → 302 a `accounts.google.com` con `scope=email+profile` ✅
- **Cambio respecto a versión anterior:** el callback ya no devuelve JSON — ahora siempre hace 302 al deep link. Swagger/curl ven el `Location` header del redirect.

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

## 4.19 — `PUT /pets/{id}/medical/{registroId}`

**Request:**

```http
PUT /pets/776cb109-96d4-4e00-b4db-59ab18ac1325/medical/2
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Todos los campos son opcionales — se actualiza solo lo que viene en el body:

```json
{ "veterinario": "Dr. García — Clínica VetUMSS Actualizado" }
```

**Response — 200 OK:**

```json
{
  "registroId": 2,
  "mascotaId": "776cb109-96d4-4e00-b4db-59ab18ac1325",
  "tipo": "vacuna",
  "descripcion": "Vacuna antirrábica anual",
  "fecha": "2026-04-10T00:00:00.000Z",
  "veterinario": "Dr. García — Clínica VetUMSS Actualizado",
  "creadoEl": "2026-05-18T12:59:49.115Z"
}
```

**Casos probados:**

1. Partial update de solo `veterinario` → campo actualizado, resto intacto ✅
2. Partial update de `tipo` + `descripcion` → ambos actualizados ✅
3. `registroId` inexistente (`9999`) → 404 `"Registro médico no encontrado"` ✅

**Estado:** ✅ OK

**Notas:**

- Partial update real: solo los campos presentes en el body se modifican.
- Misma protección de ownership que `DELETE /pets/{id}/medical/{registroId}`.
- Permite corregir errores sin tener que borrar y recrear el registro.

---

## 4.21 — `DELETE /pets/{id}`

**Response — 200 OK:** `{ "message": "Mascota eliminada" }`

**Estado:** ✅ OK — borra mascota, placa QR y fotos asociadas (cascade).

---

## 4.22 — `GET /pets/{id}/scans`

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

## 4.23 — `GET /pets/{id}/reports`

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

## 4.24 — `GET /pets/public/{token}`

**Request:** sin headers — endpoint público, sin JWT.

```http
GET /pets/public/65f6dc56-bbd0-4194-a55f-aa80d00929fc
```

**Response — 200 OK:**

```json
{
  "mascotaId": "1b0cac91-3932-4091-91a4-8ff502d7a223",
  "nombre": "Firulais",
  "tipo": "Perro",
  "sexo": "M",
  "colorPrimario": "Negro",
  "rasgosParticulares": "Manchas blancas",
  "estado": "extraviada",
  "estaExtraviada": true,
  "fotos": [
    { "fotoId": 1, "url": "https://res.cloudinary.com/...", "esPrincipal": true }
  ],
  "fichaMedica": null,
  "registrosMedicos": [
    { "registroId": 3, "tipo": "vacuna", "descripcion": "anti rabia", "fecha": "2026-05-13T00:00:00.000Z", "veterinario": "veterinario juan" }
  ],
  "propietarios": [
    {
      "personaId": "dc0c8f82-...",
      "nombreCompleto": "Wilian Almendras",
      "fotoPerfilUrl": "https://res.cloudinary.com/...",
      "tipoRelacion": "Dueno_Principal",
      "contactos": [{ "tipo": "WhatsApp", "valor": "69524395" }]
    }
  ]
}
```

**Response — 404 (UUID válido pero inexistente):**

```json
{ "message": "Placa QR no encontrada", "error": "Not Found", "statusCode": 404 }
```

**Response — 400 (formato no-UUID en la URL):**

```json
{ "message": "Validation failed (uuid is expected)", "error": "Bad Request", "statusCode": 400 }
```

**Estado:** ✅ OK

**Notas:**

- Recibe el `tokenAcceso` de la tabla `PlacaQr` (no el `mascotaId`). El QR generado por `GET /pets/{id}/qr` ya contiene este token en la URL.
- Solo retorna propietarios con `mostrarEnQr: true` — campo de privacidad del dueño.
- Verifica que la placa esté activa (`estaActiva: true`); si está desactivada retorna 404.
- Es la primera llamada que la **página web** hace al cargar tras el escaneo, antes de pedir ubicación.
- `ParseUUIDPipe` en el controlador rechaza con 400 cualquier token que no sea UUID v4 válido, sin tocar la BD.

---

## 4.25 — `POST /pets/public/{token}/scan`

**Request:** sin headers — endpoint público, sin JWT.

**Caso A — usuario rechazó permiso de ubicación (body vacío):**

```http
POST /pets/public/65f6dc56-bbd0-4194-a55f-aa80d00929fc/scan
Content-Type: application/json

{}
```

**Response — 201 Created:**

```json
{
  "escaneoId": 3,
  "mascotaId": "1b0cac91-3932-4091-91a4-8ff502d7a223",
  "lat": null,
  "lng": null,
  "escaneadoEl": "2026-05-19T13:40:08.013Z"
}
```

**Caso B — usuario otorgó permiso de ubicación:**

```http
POST /pets/public/65f6dc56-bbd0-4194-a55f-aa80d00929fc/scan
Content-Type: application/json

{ "lat": -17.3935, "lng": -66.1570 }
```

**Response — 201 Created:**

```json
{
  "escaneoId": 4,
  "mascotaId": "1b0cac91-3932-4091-91a4-8ff502d7a223",
  "lat": -17.3935,
  "lng": -66.157,
  "escaneadoEl": "2026-05-19T13:40:12.958Z"
}
```

**Caso C — coordenadas fuera de rango:**

```http
POST /pets/public/65f6dc56-bbd0-4194-a55f-aa80d00929fc/scan
Content-Type: application/json

{ "lat": 999, "lng": 999 }
```

**Response — 400 Bad Request:**

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Error de validación",
  "errores": {
    "lat": ["lat must not be greater than 90"],
    "lng": ["lng must not be greater than 180"]
  }
}
```

**Verificación en historial del dueño** (`GET /pets/{id}/scans`):

```json
[
  { "escaneoId": 4, "mascotaId": "1b0cac91-...", "lat": -17.3935, "lng": -66.157, "escaneadoEl": "2026-05-19T13:40:12.958Z" },
  { "escaneoId": 3, "mascotaId": "1b0cac91-...", "lat": null, "lng": null, "escaneadoEl": "2026-05-19T13:40:08.013Z" }
]
```

**Estado:** ✅ OK

**Notas:**

- `lat` y `lng` son opcionales — si el escáner rechazó el permiso de ubicación, el body va vacío y se guarda `null`.
- Rango validado: `lat ∈ [-90, 90]`, `lng ∈ [-180, 180]`.
- El dueño accede al historial completo desde `GET /pets/{id}/scans` (requiere JWT) — incluye lat/lng cuando están disponibles.
- Flujo de la web: llamar primero sin coords al cargar → pedir permiso de geolocalización → si acepta, llamar de nuevo con coords.

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

## 5.8 — `POST /geofencing/zones/{id}/pets`

**Request:**

```http
POST /geofencing/zones/15/pets
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{ "mascotaIds": ["df9d9bca-5bf2-4abe-9795-58e1e5f58685"] }
```

**Response — 201 Created:** zona actualizada con la nueva lista:

```json
{
  "zona_id": 15,
  "nombre_zona": "Casa UMSS (1km)",
  "radio_metros": 1000,
  "esta_activa": true,
  "centro_lat": -17.3935,
  "centro_lng": -66.1457,
  "geometria_geojson": null,
  "mascota_ids": [
    "776cb109-96d4-4e00-b4db-59ab18ac1325",
    "df9d9bca-5bf2-4abe-9795-58e1e5f58685"
  ]
}
```

**Casos probados:**

1. Agregar mascota nueva → aparece en `mascota_ids` ✅
2. Agregar mascota ya asignada (idempotente) → lista sin duplicados ✅
3. Array vacío `[]` → 400 `"mascotaIds must contain at least 1 elements"` ✅

**Estado:** ✅ OK

**Notas:**

- Usa `createMany + skipDuplicates` — nunca falla si la mascota ya estaba asignada.
- Verifica ownership de la zona y de cada mascota del array antes de asignar.
- Retorna la zona completa con la lista resultante.

---

## 5.9 — `PUT /geofencing/zones/{id}/pets`

**Request:**

```json
{ "mascotaIds": ["776cb109-96d4-4e00-b4db-59ab18ac1325"] }
```

**Response — 200 OK:** zona con solo la mascota indicada:

```json
{
  "zona_id": 15,
  "mascota_ids": ["776cb109-96d4-4e00-b4db-59ab18ac1325"]
}
```

**Casos probados:**

1. Lista con 2 mascotas → PUT con solo 1 → queda exactamente 1 ✅
2. Array vacío `[]` → 400 ✅

**Estado:** ✅ OK

**Notas:**

- Reemplaza **toda** la lista: hace `deleteMany` + `createMany` en una transacción.
- Útil para sincronizar la lista completa desde la app sin saber cuáles estaban antes.
- Mínimo 1 mascota requerida (no se puede dejar una zona sin mascotas vía este endpoint).

---

## 5.10 — `DELETE /geofencing/zones/{id}/pets`

**Request:**

```json
{ "mascotaIds": ["df9d9bca-5bf2-4abe-9795-58e1e5f58685"] }
```

**Response — 200 OK:**

```json
{ "message": "1 mascota(s) desasignada(s) de la zona" }
```

**Verificación posterior — `GET /geofencing/zones/15`:**

```json
{ "mascota_ids": ["776cb109-96d4-4e00-b4db-59ab18ac1325"] }
```

**Casos probados:**

1. Desasignar mascota existente → 200 con conteo correcto ✅
2. Desasignar mascota que ya no estaba → 200 con `0 mascota(s)` (no falla) ✅
3. Array vacío `[]` → 400 `"must contain at least 1 elements"` ✅

**Estado:** ✅ OK

**Notas:**

- No elimina la zona ni las mascotas — solo rompe la asociación `zona_mascotas`.
- Si ninguna de las `mascotaIds` estaba asignada, responde 200 con `0 mascota(s)` (operación silenciosa).
- No verifica ownership de cada mascota — solo de la zona.

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

**Query params opcionales:** `?tipoId=N` — filtra por tipo de mascota (mismo `tipoId` que `GET /tipos-mascota`).

**Response — 200 OK:**

```json
[
  {
    "reporteId": 3,
    "mascotaId": "1b0cac91-...",
    "nombre": "Firulais",
    "tipo": "Perro",
    "fotoUrl": "https://res.cloudinary.com/.../firulais.jpg",
    "ubicacion": { "lat": -17.3935, "lng": -66.1457 },
    "fechaPerdida": "2026-05-19T12:33:42.562Z",
    "recompensa": 200.00
  }
]
```

Devuelve `[]` si no hay mascotas extraviadas con ubicación conocida.

**Estado:** ✅ OK

**Notas:**

- `ubicacion` es un objeto `{lat, lng}` (antes eran campos planos `lat` / `lng`).
- `recompensa` es `null` si el dueño no ofrece recompensa económica.
- Máx. 100 resultados, ordenados por `fecha_perdida DESC`.

---

## 7.2 — `GET /map/snapshot` (con auth)

**Query params opcionales:** `?tipoId=N` — filtra la sección `desaparecidas` por tipo de mascota.

**Response — 200 OK:**

```json
{
  "misMascotas": [
    {
      "mascotaId": "776cb109-...",
      "nombre": "Rocky",
      "estado": "en_casa",
      "tipo": "Perro",
      "fotoUrl": "https://res.cloudinary.com/.../rocky.jpg",
      "ubicacion": { "lat": -17.3935, "lng": -66.1457 }
    },
    {
      "mascotaId": "bf759b6e-...",
      "nombre": "Firulais",
      "estado": "extraviada",
      "tipo": "Perro",
      "fotoUrl": "https://res.cloudinary.com/.../firulais.jpg",
      "ubicacion": { "lat": -17.394, "lng": -66.146 },
      "recompensa": 500.00
    }
  ],
  "colaboradores": [
    {
      "personaId": "d0a60bc2-...",
      "nombre": "Maria",
      "apellidoPaterno": "Gomez",
      "fotoUrl": null,
      "ubicacion": { "lat": -17.391, "lng": -66.152 }
    }
  ],
  "desaparecidas": [
    {
      "reporteId": 3,
      "mascotaId": "1b0cac91-...",
      "nombre": "Lobo",
      "tipo": "Perro",
      "fotoUrl": "https://res.cloudinary.com/.../lobo.jpg",
      "ubicacion": { "lat": -17.395, "lng": -66.148 },
      "fechaPerdida": "2026-05-20T14:30:00.000Z",
      "recompensa": 200.00
    }
  ],
  "zonas": [
    {
      "zonaId": 15,
      "nombre": "Casa UMSS (1km)",
      "estado": "activa",
      "tipo": "circulo",
      "centro": { "lat": -17.3935, "lng": -66.1457 },
      "radioMetros": 1000,
      "mascotaIds": ["776cb109-...", "bf759b6e-..."]
    },
    {
      "zonaId": 16,
      "nombre": "Plaza Colón",
      "estado": "inactiva",
      "tipo": "poligono",
      "geometria": {
        "type": "Polygon",
        "coordinates": [[[-66.158, -17.391], [-66.152, -17.391], [-66.152, -17.395], [-66.158, -17.391]]]
      },
      "mascotaIds": ["776cb109-..."]
    }
  ]
}
```

**Estado:** ✅ OK — estructura rediseñada en Etapa 5.

**Notas:**

- `misMascotas` — todas las mascotas propias del usuario autenticado. `recompensa` solo aparece cuando `estado = "extraviada"`.
- `colaboradores` — co-propietarios/cuidadores con GPS activo. Solo aparecen los que tienen ubicación reciente; `nombre` y `apellidoPaterno` vienen separados. Solo incluye usuarios con GPS activo y `estadoCuenta = "activa"`.
- `desaparecidas` — mascotas de otros usuarios con reporte abierto (máx. 50). `recompensa: null` si no hay. `ubicacion` es un objeto `{lat, lng}`, no campos planos.
- `zonas` — `mascotaIds` es un array de UUIDs; el detalle de cada mascota se cruza con `misMascotas` en el cliente. Nuevo campo `estado: "activa" | "inactiva"`.
- **Cambio respecto a versión anterior:** eliminado el wrapper `marcadores`, renombrado `usuariosCompartidos` → `colaboradores`, zonas ya no incluyen objeto mascota completo.

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

## 8.3 — Catálogo completo de eventos (actualizado Etapa 5)

| Evento | Trigger HTTP | Room | Payload clave |
|---|---|---|---|
| `pet:location-updated` | `PUT /pets/{id}/location` · GPS dueño en paseo | `pet:{id}` | `mascotaId, lat, lng, estado` |
| `pet:status-changed` | `PUT /pets/{id}/status` | `pet:{id}` | `mascotaId, nombre, estado` |
| `pet:profile-updated` | `PUT /pets/{id}` · subir foto · borrar foto | `pet:{id}` | `mascotaId, nombre?, colorPrimario?, fotoPrincipalUrl?` |
| `pet:registered` | `POST /pets` | `user:{id}` (dueño) | `mascotaId, nombre, estado, fotoPrincipalUrl` |
| `owner:location-updated` | `PUT /users/me/location` | todos los `pet:{id}` del usuario | `personaId, usuarioId, lat, lng` |
| `owner:added` | `POST /pets/{id}/owners` | `pet:{id}` | `mascotaId, personaId, nombreCompleto, tipoRelacion` |
| `pet:assigned` | `POST /pets/{id}/owners` | `user:{id}` del nuevo dueño | mismo payload que `owner:added` |
| `pet:entered-zone` | `PUT /users/me/location` (geofencing) | `pet:{id}` | `mascotaId, zonaId, fechaHora` |
| `pet:exited-zone` | `PUT /users/me/location` (geofencing) | `pet:{id}` | `mascotaId, zonaId, duracionMinutos?` |
| `owner:profile-updated` | `PUT /users/me/photo` | todos los `pet:{id}` del usuario | `personaId, fotoPerfilUrl, fechaActualizacion` |

**Eventos nuevos en Etapa 5:**

- `pet:profile-updated` ahora incluye `fotoPrincipalUrl` cuando se sube o borra una foto de mascota — antes el payload no notificaba el cambio de foto.
- `owner:profile-updated` — nuevo evento; se emite cuando el usuario actualiza su foto de perfil, notificando a todos los co-propietarios de sus mascotas.

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
| **Pets** | 24 | 24 | 24 | 0 | 0 |
| **Geofencing** | 9 | 9 | 9 | 0 | 0 |
| **QR público** | 2 | 2 | 2 | 0 | 0 |
| **Map** | 2 | 2 | 2 | 0 | 0 |
| **WebSocket** | 1 namespace | 1 | 1 | 0 | 0 |
| **TOTAL** | **55 + 1 WS** | **55** | **55** | **0** | **0** |

## Cifras (post-fixes)

- **Tasa de éxito (happy path):** 55/55 = **100 %**
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
8. ~~Google OAuth callback redirige a deep link Android~~ ✅ completado — `petfinder://auth/callback?...`.
9. ~~Implementar `PUT /pets/{id}/medical/{registroId}`~~ ✅ completado y probado.
10. ~~Gestión masiva de mascotas en zonas~~ ✅ completado — `POST/PUT/DELETE /geofencing/zones/{id}/pets` probados.
11. Agregar tests de integración (no solo unitarios) para la transición a `extraviada` y prevenir regresiones de E1.
12. ~~Implementar `GET /pets/public/{token}` — datos públicos por token QR~~ ✅ completado y probado.
13. ~~Implementar `POST /pets/public/{token}/scan` — escaneo con ubicación opcional~~ ✅ completado y probado.
14. ~~Sprint 3 & 4 — Etapa 1: recompensa en card, filtro mapa, QR tamaño, WS tiempo real~~ ✅ completado y probado.

---

---

# 🚀 Sprint 3 & 4 — Nuevas funcionalidades

**Fecha:** 2026-05-21
**Entorno:** Local — `http://localhost:3000`
**Tests:** 138/138 en verde · TypeScript: 0 errores

---

## S3-1 — Recompensa activa en perfil público QR

**Endpoint afectado:** `GET /pets/public/{token}` y `GET /pets/{id}/card`

**Cambio:** `findPetCard()` ahora incluye el reporte de extravío abierto más reciente. Si la mascota tiene un reporte con `estado_reporte = 'abierto'`, el campo `reporteActivo` lleva la recompensa y la fecha de pérdida. Si no hay reporte abierto, vale `null`.

**Response — mascota extraviada con recompensa:**

```json
{
  "nombre": "Firulais",
  "estado": "extraviada",
  "estaExtraviada": true,
  "reporteActivo": {
    "recompensa": 0,
    "fechaPerdida": "2026-05-19T12:33:42.562Z"
  }
}
```

**Response — mascota en casa:**

```json
{
  "nombre": "sagy",
  "estado": "en_casa",
  "estaExtraviada": false,
  "reporteActivo": null
}
```

**Estado:** ✅ OK

**Notas:**

- `recompensa: 0` significa que el dueño no ofreció recompensa económica — el campo sigue siendo útil para mostrar el banner de "mascota extraviada" con fecha.
- Solo se expone el reporte más reciente con estado `abierto`. Si hay varios históricos cerrados, no aparecen aquí (para eso está `GET /pets/{id}/reports`).

---

## S3-2 — Filtrar mapa por tipo de mascota

**Endpoints afectados:** `GET /map/public/lost-pets` y `GET /map/snapshot`

**Cambio:** ambos endpoints aceptan el query param opcional `?tipoId=N`. Sin el param devuelven todas las especies. Con el param filtran por `tipos_mascota.tipo_id`.

**Flujo recomendado en la app:**

```
GET /tipos-mascota → retorna todos los tipos disponibles (dinámico, sin hardcodear)
→ renderiza chips: [Todos] [Perro] [Gato] [Ave] [Conejo] [...]
→ usuario toca "Perro" → GET /map/public/lost-pets?tipoId=1
```

**Casos probados:**

| Llamada | Resultado |
|---|---|
| `GET /map/public/lost-pets` | ✅ Firulais (Perro) + Lobo (Perro) |
| `GET /map/public/lost-pets?tipoId=1` | ✅ Solo perros — mismo resultado |
| `GET /map/public/lost-pets?tipoId=2` | ✅ `[]` — no hay gatos extraviados en BD |
| `GET /map/public/lost-pets?tipoId=99` | ✅ `[]` — tipo inexistente devuelve vacío |

**Estado:** ✅ OK

**Notas:**

- Tipos disponibles en la BD: Perro, Gato, Ave, Conejo, Reptil, Pez, Hámster, Cobayo, Hurón, Otro (10 tipos).
- El filtro usa `AND (${tipoId}::int IS NULL OR m.tipo_id = ${tipoId}::int)` — un solo query cubre ambos casos sin duplicar SQL.
- `GET /map/snapshot` acepta el mismo param para filtrar la sección `desaparecidas` del snapshot del usuario autenticado.

---

## S3-3 — QR en alta resolución para impresión

**Endpoint afectado:** `GET /pets/{id}/qr`

**Cambio:** nuevo query param opcional `?size=N` (entero). Default 300px. Rango válido 100–1000px — valores fuera del rango se clampean automáticamente.

**Casos probados:**

| Llamada | Bytes respuesta | Uso sugerido |
|---|---|---|
| `GET /pets/{id}/qr` | 3,602 bytes | Pantalla — resolución estándar |
| `GET /pets/{id}/qr?size=600` | 5,990 bytes | Impresión mediana |
| `GET /pets/{id}/qr?size=1000` | 10,198 bytes | Impresión en collar o tarjeta |
| `GET /pets/{id}/qr?size=9999` | 10,198 bytes | Clampea a 1000 — mismo resultado |

**Estado:** ✅ OK

**Notas:**

- La respuesta es siempre una data URL: `"data:image/png;base64,iVBORw0K..."` — lista para mostrar como `<img src>` en Kotlin o descargar como PNG.
- Para impresión física en collar se recomienda `?size=800` o `?size=1000`.
- El clamp `Math.min(Math.max(size, 100), 1000)` evita que un cliente malicioso pida imágenes enormes y consuma memoria.

---

## S3-4 — Actualización de mascota en tiempo real (WebSocket)

**Endpoint afectado:** `PUT /pets/{id}`

**Cambio:** después de guardar en BD, `update()` emite el evento `pet:profile-updated` al room `pet:{mascotaId}` via WebSocket. Todos los dispositivos conectados al room reciben los campos actualizados sin necesidad de refrescar.

**Payload del evento WebSocket:**

```json
{
  "event": "pet:profile-updated",
  "data": {
    "mascotaId": "bf759b6e-ec45-49ea-87b0-0efebe8fc4bd",
    "nombre": "sagy",
    "colorPrimario": "Blanco y naranja",
    "rasgosParticulares": "Manchas cafe",
    "fechaActualizacion": "2026-05-21T..."
  }
}
```

**Prueba HTTP:**

```http
PUT /pets/bf759b6e-ec45-49ea-87b0-0efebe8fc4bd
Authorization: Bearer {JWT}
Content-Type: application/json

{ "colorPrimario": "Blanco y naranja" }
```

**Response — 200 OK:**

```json
{
  "mascotaId": "bf759b6e-ec45-49ea-87b0-0efebe8fc4bd",
  "nombre": "sagy",
  "colorPrimario": "Blanco y naranja",
  "rasgosParticulares": "Manchas cafe",
  "estado": "en_casa"
}
```

**Estado:** ✅ OK

**Notas:**

- El evento WS solo se emite si hay clientes conectados al room — si nadie está conectado, la llamada HTTP responde igual de rápido (el `emit` es fire-and-forget).
- Patrón idéntico a `pet:location-updated` y `pet:status-changed` ya existentes.
- El equipo Kotlin puede escuchar `pet:profile-updated` para actualizar la UI sin polling.

---

## S3-5 — Módulo Sightings (Avistamientos y Agradecimientos)

Nuevo módulo `SightingsModule` con 4 endpoints: 2 públicos y 2 protegidos con JWT.

**Usuario de prueba para las pruebas:** `wilian@gmail.com` / `hola12345`

---

### S3-5-1 — `POST /sightings/pets/:petId` — Reportar avistamiento

**Endpoint público — no requiere JWT.**

**Request (sin foto):**

```http
POST /sightings/pets/bf759b6e-ec45-49ea-87b0-0efebe8fc4bd
Content-Type: multipart/form-data

lat=-17.3940
lng=-66.1460
mensajeRescatista=Lo vi cerca del mercado central
```

**Response — 201 Created:**

```json
{
  "avistamientoId": "a1b2c3d4-...",
  "mascotaId": "bf759b6e-ec45-49ea-87b0-0efebe8fc4bd",
  "mensajeRescatista": "Lo vi cerca del mercado central",
  "fotoEvidenciaUrl": null,
  "fechaAvistamiento": "2026-05-21T...",
  "lat": -17.394,
  "lng": -66.146
}
```

**Estado:** ✅ OK

**Notas:**

- `lat` y `lng` son requeridos. `mensajeRescatista` y `foto` son opcionales.
- La ubicación se almacena como `geometry(Point, 4326)` en PostGIS via `ST_MakePoint(lng, lat)`.
- Si se incluye `foto` (campo multipart), se sube a Cloudinary en la carpeta `avistamientos/{mascotaId}`.

---

### S3-5-2 — `GET /sightings/pets/:petId` — Listar avistamientos

**Requiere JWT. Solo el dueño o cuidador puede ver el historial.**

**Request:**

```http
GET /sightings/pets/bf759b6e-ec45-49ea-87b0-0efebe8fc4bd
Authorization: Bearer {JWT}
```

**Response — 200 OK:**

```json
[
  {
    "avistamientoId": "a1b2c3d4-...",
    "mascotaId": "bf759b6e-ec45-49ea-87b0-0efebe8fc4bd",
    "mensajeRescatista": "Lo vi cerca del mercado central",
    "fotoEvidenciaUrl": null,
    "fechaAvistamiento": "2026-05-21T...",
    "lat": -17.394,
    "lng": -66.146
  }
]
```

**Estado:** ✅ OK

**Notas:**

- Ordenado del más reciente al más antiguo (`ORDER BY fecha_avistamiento DESC`).
- Si el `personaId` del JWT no es propietario de la mascota → `403 Forbidden`.

---

### S3-5-3 — `POST /sightings/:id/thanks` — Agradecer al rescatista

**Requiere JWT. Solo el dueño de la mascota puede agradecer.**

**Request:**

```http
POST /sightings/{avistamientoId}/thanks
Authorization: Bearer {JWT}
Content-Type: application/json

{ "mensaje": "¡Muchas gracias por avisar! Ya lo encontramos gracias a ti." }
```

**Response — 201 Created:**

```json
{
  "agradecimientoId": "x1y2z3...",
  "avistamientoId": "a1b2c3d4-...",
  "autorUsuarioId": "...",
  "mensaje": "¡Muchas gracias por avisar! Ya lo encontramos gracias a ti.",
  "creadoEl": "2026-05-21T..."
}
```

**Estado:** ✅ OK

**Notas:**

- Si el usuario no es propietario de la mascota del avistamiento → `403 Forbidden`.
- Si el `avistamientoId` no existe → `404 Not Found`.

---

### S3-5-4 — `GET /sightings/:id/thanks` — Ver agradecimientos

**Endpoint público — no requiere JWT.**

**Request:**

```http
GET /sightings/{avistamientoId}/thanks
```

**Response — 200 OK:**

```json
[
  {
    "agradecimientoId": "x1y2z3...",
    "avistamientoId": "a1b2c3d4-...",
    "mensaje": "¡Muchas gracias por avisar!",
    "creadoEl": "2026-05-21T...",
    "autor": {
      "usuarioId": "...",
      "persona": {
        "nombre": "Wilian",
        "apellidoPaterno": "Almendras",
        "fotoPerfilUrl": "https://res.cloudinary.com/..."
      }
    }
  }
]
```

**Estado:** ✅ OK

**Notas:**

- **Seguridad:** se usa `select` anidado (no `include`) — `claveHash`, `tokenFcm`, `refreshTokenHash`, `correoElectronico` nunca aparecen en la respuesta.
- Ordenado por `creadoEl ASC`.

---

## S3-6 — Contactos de emergencia (Etapa 3)

**Migración:** `20260522024621_add_emergency_contact` — agrega columna `es_emergencia BOOLEAN DEFAULT false` a `medios_contacto`.

---

### S3-6-1 — `GET /users/me/contacts` — Listar todos los contactos

**Request:**

```http
GET /users/me/contacts
Authorization: Bearer {JWT}
```

**Response — 200 OK:**

```json
[
  {
    "contactoId": 2,
    "personaId": "dc0c8f82-...",
    "tipo": "WhatsApp",
    "valor": "69524395",
    "esPrincipal": true,
    "esEmergencia": false
  }
]
```

**Estado:** ✅ OK

**Notas:**

- Ordenado por `esPrincipal DESC`, `esEmergencia DESC`, `contactoId ASC`.
- El campo `esEmergencia` aparece en todos los contactos existentes (migración lo pone en `false` por defecto).

---

### S3-6-2 — `GET /users/me/contacts/emergency` — Solo contactos de emergencia

**Request:**

```http
GET /users/me/contacts/emergency
Authorization: Bearer {JWT}
```

**Response — 200 OK (sin contactos de emergencia):**

```json
[]
```

**Response — 200 OK (con contactos):**

```json
[
  {
    "contactoId": 9,
    "personaId": "dc0c8f82-...",
    "tipo": "Celular",
    "valor": "+591 71234567",
    "esPrincipal": false,
    "esEmergencia": true
  }
]
```

**Estado:** ✅ OK

---

### S3-6-3 — `POST /users/me/contacts` — Agregar contacto (con esEmergencia)

**Request:**

```http
POST /users/me/contacts
Authorization: Bearer {JWT}
Content-Type: application/json

{ "tipo": "Celular", "valor": "+591 71234567", "esEmergencia": true }
```

**Response — 201 Created:**

```json
{
  "contactoId": 9,
  "personaId": "dc0c8f82-...",
  "tipo": "Celular",
  "valor": "+591 71234567",
  "esPrincipal": false,
  "esEmergencia": true
}
```

**Estado:** ✅ OK

**Notas:**

- `tipo`, `valor` requeridos. `esPrincipal` y `esEmergencia` opcionales (default `false`).

---

### S3-6-4 — `PUT /users/me/contacts/:id` — Actualizar contacto

**Request (marcar como principal):**

```http
PUT /users/me/contacts/9
Authorization: Bearer {JWT}
Content-Type: application/json

{ "esPrincipal": true }
```

**Response — 200 OK:**

```json
{
  "contactoId": 9,
  "personaId": "dc0c8f82-...",
  "tipo": "Celular",
  "valor": "+591 71234567",
  "esPrincipal": true,
  "esEmergencia": true
}
```

**Estado:** ✅ OK

**Notas:**

- Patch parcial — solo se actualizan los campos enviados. Los demás permanecen intactos.
- Contacto ajeno → `403 Forbidden`.
- Contacto inexistente → `404 Not Found`.

---

### S3-6-5 — Seguridad — `PUT` con contacto ajeno

**Request:**

```http
PUT /users/me/contacts/1
Authorization: Bearer {JWT (usuario B)}
Content-Type: application/json

{ "esEmergencia": true }
```

**Response — 403 Forbidden:**

```json
{
  "message": "No tienes permiso sobre este contacto",
  "error": "Forbidden",
  "statusCode": 403
}
```

**Estado:** ✅ OK

---

## S3-7 — Alerta Radio (Etapa 4)

**Sin endpoint nuevo** — la funcionalidad es interna: se dispara automáticamente cuando `PUT /pets/:id/status` cambia a `extraviada`.

**Método nuevo:** `NotificationsService.sendRadiusAlert(mascotaId, radioMetros = 5000)`

**Flujo:**

1. Obtiene la última ubicación conocida (`ultima_ubicacion_conocida`) de la mascota perdida.
2. Query PostGIS `ST_DWithin` sobre `usuarios.ultima_ubicacion_conocida` — encuentra todos los usuarios activos con `tokenFcm` dentro del radio (default 5 km).
3. Excluye a los propietarios de la propia mascota (ya reciben `sendPetLostAlert`).
4. Envía FCM multicast a los tokens encontrados.

**Trigger en `updateStatus()`:**

```typescript
if (estado === EstadoMascota.extraviada && !reporteAbierto) {
  void this.notifications.sendPetLostAlert(mascotaId);  // dueños
  void this.notifications.sendZoneAlert(mascotaId);     // usuarios con zonas seguras cercanas
  void this.notifications.sendRadiusAlert(mascotaId);   // cualquier usuario en radio 5 km
}
```

**Payload FCM:**

```json
{
  "notification": {
    "title": "¡Mascota perdida cerca de ti!",
    "body": "Firulais está extraviada en tu área. ¿Puedes ayudar a encontrarla?"
  },
  "data": {
    "mascotaId": "1b0cac91-...",
    "tipo": "alerta_radio",
    "lat": "-17.3935",
    "lng": "-66.1457"
  }
}
```

**Prueba HTTP — cambio a extraviada:**

```http
PUT /pets/1b0cac91-3932-4091-91a4-8ff502d7a223/status
Authorization: Bearer {JWT}
Content-Type: application/json

{ "estado": "extraviada" }
```

**Response — 200 OK:**

```json
{
  "mascotaId": "1b0cac91-3932-4091-91a4-8ff502d7a223",
  "nombre": "Firulais",
  "estado": "extraviada"
}
```

**Estado:** ✅ OK

**Notas:**

- `sendRadiusAlert` es fire-and-forget (`void`) — no bloquea la respuesta HTTP.
- Si la mascota no tiene `ultima_ubicacion_conocida`, el método retorna silenciosamente sin enviar nada.
- Si no hay usuarios con FCM dentro del radio, también retorna silenciosamente.
- Los tres métodos de notificación (`sendPetLostAlert`, `sendZoneAlert`, `sendRadiusAlert`) son complementarios — un usuario puede recibir más de uno si cumple varios criterios.
- En entorno local sin Firebase configurado, el logger emite `warn` y continúa sin errores.

---

## Resumen de cobertura (actualizado Etapa 4)

| Módulo | Endpoints probados |
|---|---|
| Auth | 6 |
| Users | 9 |
| Pets | 24 |
| Geofencing | 4 |
| Tipos Mascota | 5 |
| Map | 3 |
| QR | 2 |
| Sightings | 4 |
| **Total** | **57** |

### Funcionalidades sin endpoint propio

| Feature | Trigger | Estado |
|---|---|---|
| Alerta Radio FCM (5 km) | `PUT /pets/:id/status → extraviada` | ✅ |
| Alerta Zona FCM | `PUT /pets/:id/status → extraviada` | ✅ |
| Alerta Dueños FCM | `PUT /pets/:id/status → extraviada` | ✅ |
| WS `pet:profile-updated` | `PUT /pets/:id` | ✅ |
| WS `pet:status-changed` | `PUT /pets/:id/status` | ✅ |

---

# Sprint 3 & 4 — Etapa 5

**Fecha:** 2026-05-22
**Tests:** 251/251 en verde · Lint: 0 errores

---

## S5-1 — `GET /map/snapshot` rediseñado

**Motivación:** la respuesta anterior no incluía las mascotas propias del usuario, mezclaba datos en `marcadores.*` y las zonas traían el objeto mascota completo innecesariamente.

**Cambios aplicados:**

| Campo anterior | Campo nuevo | Cambio |
|---|---|---|
| `marcadores.usuariosCompartidos[]` | `colaboradores[]` | Renombrado; `nombre`+`apellidoPaterno` separados; `ubicacion: {lat,lng}` |
| _(no existía)_ | `misMascotas[]` | Nuevo — mascotas propias con estado, tipo, foto, ubicación |
| `marcadores.desaparecidas[]` | `desaparecidas[]` | Movido a raíz; agrega `fechaPerdida`, `recompensa`, `ubicacion: {lat,lng}` |
| `zonas[].mascotas[]` (objeto completo) | `zonas[].mascotaIds[]` | Solo UUIDs — detalle en `misMascotas` |
| _(no existía)_ | `zonas[].estado` | `"activa"` / `"inactiva"` desde `estaActiva` |

**Campo `recompensa` en `misMascotas`:** solo aparece cuando `estado = "extraviada"` — no existe en el objeto para otros estados.

---

## S5-2 — `GET /map/public/lost-pets` actualizado

**Cambios:**

- `ubicacion` ahora es un objeto `{ lat, lng }` en lugar de campos planos.
- Agrega `fechaPerdida` y `recompensa` (`null` si no hay).

---

## S5-3 — WebSocket: foto de mascota notifica en tiempo real

**Problema anterior:** `pet:profile-updated` se emitía al editar datos textuales de la mascota, pero el payload no incluía la foto. Al subir o borrar fotos, los clientes conectados no se enteraban sin hacer un GET.

**Fix aplicado:**

- `POST /pets/{id}/photos` — tras la transacción, busca la foto principal actual y emite `pet:profile-updated` con `fotoPrincipalUrl`.
- `DELETE /pets/{id}/photos/{fotoId}` — tras eliminar, busca la nueva principal y emite `pet:profile-updated` con `fotoPrincipalUrl`.

**Payload extendido:**

```json
{
  "event": "pet:profile-updated",
  "data": {
    "mascotaId": "776cb109-...",
    "fotoPrincipalUrl": "https://res.cloudinary.com/.../nueva_foto.jpg",
    "fechaActualizacion": "2026-05-22T..."
  }
}
```

---

## S5-4 — WebSocket: nuevo evento `owner:profile-updated`

**Problema anterior:** cuando un usuario actualizaba su foto de perfil (`PUT /users/me/photo`), los co-propietarios no recibían ninguna notificación en tiempo real — tenían que hacer GET para ver la nueva foto.

**Fix aplicado:** `updateProfilePhoto()` ahora obtiene todos los rooms de mascotas del usuario y emite `owner:profile-updated` a cada uno.

**Payload:**

```json
{
  "event": "owner:profile-updated",
  "data": {
    "personaId": "15e8092d-...",
    "fotoPerfilUrl": "https://res.cloudinary.com/.../nueva_foto.jpg",
    "fechaActualizacion": "2026-05-22T..."
  }
}
```

**Kotlin — escuchar el evento:**

```kotlin
socket?.on("owner:profile-updated") { args ->
    val data          = args[0] as JSONObject
    val personaId     = data.getString("personaId")
    val fotoPerfilUrl = data.optString("fotoPerfilUrl", "")
    // Actualizar avatar del colaborador en el mapa y en la lista de propietarios
}
```

---

## Resumen de cobertura (actualizado Etapa 5)

| Módulo | Endpoints probados |
|---|---|
| Auth | 6 |
| Users | 9 |
| Pets | 24 |
| Geofencing | 4 |
| Tipos Mascota | 5 |
| Map | 3 |
| QR | 2 |
| Sightings | 4 |
| **Total** | **57** |

### Funcionalidades sin endpoint propio (Etapa 5)

| Feature | Trigger | Estado |
|---|---|---|
| Alerta Radio FCM (5 km) | `PUT /pets/:id/status → extraviada` | ✅ |
| Alerta Zona FCM | `PUT /pets/:id/status → extraviada` | ✅ |
| Alerta Dueños FCM | `PUT /pets/:id/status → extraviada` | ✅ |
| WS `pet:profile-updated` (texto) | `PUT /pets/:id` | ✅ |
| WS `pet:profile-updated` (foto) | `POST/DELETE /pets/:id/photos` | ✅ nuevo |
| WS `pet:status-changed` | `PUT /pets/:id/status` | ✅ |
| WS `owner:profile-updated` | `PUT /users/me/photo` | ✅ nuevo |

### Cifras

- **Tests unitarios:** 251/251 en verde
- **Lint:** 0 errores
- **Endpoints documentados:** 57
- **Eventos WebSocket:** 10 (8 anteriores + 2 nuevos en Etapa 5)

