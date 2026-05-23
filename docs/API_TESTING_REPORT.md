# Reporte de Pruebas API — PetFinder Backend (Organizado por Sprint)

**Fecha:** 2026-05-17 (pruebas) · **Actualizado:** 2026-05-22 (reorganizado por sprint)
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
- 🔌 **WebSocket** — el endpoint emite uno o más eventos en tiempo real
- 📱 **FCM** — el endpoint dispara push notifications a dispositivos Android
- 🔁 **Cross-sprint** — endpoint que aparece en múltiples sprints; se indica el motivo

Cada endpoint documenta:

1. **Request** — método, URL, headers, body
2. **Response** — status code + body
3. **Estado** — ✅ / ⚠️ / ❌
4. **Notas** — observaciones

---

## 0. Integración WebSocket — Socket.IO / Kotlin

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

## 0.3 — Catálogo completo de eventos

| Evento | Room | Trigger HTTP | Payload clave |
| --- | --- | --- | --- |
| `pet:location-updated` | `pet:{id}` | `PUT /pets/{id}/location` · GPS dueño en paseo | `mascotaId, lat, lng, estado` |
| `pet:status-changed` | `pet:{id}` | `PUT /pets/{id}/status` | `mascotaId, nombre, estado` |
| `pet:profile-updated` | `pet:{id}` | `PUT /pets/{id}` · subir/borrar foto de mascota | `mascotaId, nombre?, colorPrimario?, fotoPrincipalUrl?` |
| `pet:registered` | `user:{id}` (dueño) | `POST /pets` | `mascotaId, nombre, estado, fotoPrincipalUrl` |
| `owner:location-updated` | todos los `pet:{id}` del usuario | `PUT /users/me/location` | `personaId, usuarioId, lat, lng` |
| `owner:added` | `pet:{id}` | `POST /pets/{id}/owners` | `mascotaId, personaId, nombreCompleto, tipoRelacion` |
| `pet:assigned` | `user:{id}` del nuevo dueño | `POST /pets/{id}/owners` | mismo payload que `owner:added` |
| `pet:entered-zone` | `pet:{id}` | `PUT /users/me/location` (geofencing) | `mascotaId, zonaId, fechaHora` |
| `pet:exited-zone` | `pet:{id}` | `PUT /users/me/location` (geofencing) | `mascotaId, zonaId, duracionMinutos?` |
| `owner:profile-updated` | todos los `pet:{id}` del usuario | `PUT /users/me/photo` | `personaId, fotoPerfilUrl, fechaActualizacion` |

> Los rooms se unen **automáticamente** al conectarse — el servidor lee las mascotas del JWT y hace `socket.join(pet:{mascotaId})` por cada una.

## 0.4 — Escuchar eventos en Kotlin

```kotlin
fun listenPetEvents() {
    socket?.on("pet:location-updated") { args ->
        val data = args[0] as JSONObject
        val mascotaId = data.getString("mascotaId")
        val lat       = data.getDouble("lat")
        val lng       = data.getDouble("lng")
        val estado    = data.getString("estado")
        // Actualizar marcador en el mapa
    }

    socket?.on("pet:status-changed") { args ->
        val data      = args[0] as JSONObject
        val mascotaId = data.getString("mascotaId")
        val estado    = data.getString("estado")
        // Actualizar UI — badge de estado
    }

    socket?.on("pet:profile-updated") { args ->
        val data          = args[0] as JSONObject
        val mascotaId     = data.getString("mascotaId")
        val fotoPrincipal = data.optString("fotoPrincipalUrl", "")
        // Recargar card de mascota si está en pantalla
    }

    socket?.on("owner:location-updated") { args ->
        val data      = args[0] as JSONObject
        val personaId = data.getString("personaId")
        val lat       = data.getDouble("lat")
        val lng       = data.getDouble("lng")
        // Mover marcador del colaborador en el mapa
    }

    socket?.on("owner:profile-updated") { args ->
        val data          = args[0] as JSONObject
        val personaId     = data.getString("personaId")
        val fotoPerfilUrl = data.optString("fotoPerfilUrl", "")
        // Recargar avatar del colaborador
    }

    socket?.on("pet:entered-zone") { args ->
        val data      = args[0] as JSONObject
        val mascotaId = data.getString("mascotaId")
        val zonaId    = data.getInt("zonaId")
        // Mostrar notificación local
    }

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
- El plan gratuito de Render hace _spin down_ tras 15 min de inactividad — la primera conexión puede tardar ~30 s en despertar el servidor. Las siguientes son instantáneas.
- Si el servidor se reinicia, el cliente debe reconectar automáticamente. Socket.IO lo hace con `reconnection: true` (habilitado por defecto).

---

## Sprint 1 — Autenticación, Registro de mascota, QR básico, Mapa y Zonas seguras

**Historias:** H1 · H2 · H3 · H10 · H31 · H32

---

## H1 — Autenticación básica (registro, login, sesión)

> Sin dependencias de WebSocket ni FCM. Estos endpoints son el punto de entrada de toda la app.

### `POST /auth/register`

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

- Genera `accessToken` (JWT, 24 h) + `refreshToken` (UUID, 30 días).
- Asigna rol `usuario` por defecto.
- `medioContacto` espera `{ tipo, valor }` con `tipo ∈ {WhatsApp, Celular, Fijo, Telegram}` — **Resuelto E4**.

---

### `POST /auth/login`

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

### `POST /auth/refresh`

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

### `POST /auth/logout`

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

### `GET /auth/google` y `GET /auth/google/callback`

**Request:** navegar en el navegador a `GET /auth/google` (sin headers — público). Passport redirige automáticamente a la pantalla de selección de cuenta de Google.

**Flujo:**

1. `GET /auth/google` → 302 a `accounts.google.com` (OAuth consent screen)
2. Usuario selecciona cuenta → Google redirige a `GET /auth/google/callback`
3. Server procesa el perfil, genera tokens y hace **302 al deep link de Android**

**Redirect — 302 (callback → app Android):**

```text
petfinder://auth/callback?accessToken=eyJ...&refreshToken=5df6bd17-...&userId=a69b8530-...&rol=usuario&nombre=WILLIAN+ANDRES
```

**Parámetros del deep link:**

| Param | Valor |
| --- | --- |
| `accessToken` | JWT de acceso (24 h) |
| `refreshToken` | Token de refresco (30 días, UUID) |
| `userId` | `usuarioId` del usuario |
| `rol` | `"admin"` o `"usuario"` |
| `nombre` | Nombre del usuario (primer nombre del perfil Google) |

**Estado:** ✅ OK

**Notas:**

- Android intercepta `petfinder://auth/callback` con su intent filter → `MainActivity.onNewIntent()` guarda la sesión en DataStore y navega a Main.
- Email ya existente → login directo (vinculación automática, no crea usuario nuevo).
- Email nuevo → crea `Persona` + `Usuario` con `claveHash` de UUID aleatorio (sin contraseña).
- El callback ya no devuelve JSON — siempre hace 302 al deep link.

---

## H2 — Registro y gestión de mascota + fotos

> 🔌 **WebSocket:** `pet:registered` (al dueño creador tras `POST /pets`), `pet:profile-updated` (al subir/borrar fotos)

### `POST /pets` (multipart con fotos)

**Request:** `multipart/form-data`

- `nombre=Pelusa`
- `tipoId=2` (Gato — ver `GET /tipos-mascota`)
- `sexo=F`
- `colorPrimario=Negro y blanco`
- `rasgosParticulares=Mancha blanca en la cola`
- `fotos=@imagen.png` (binary, 0 a 4 fotos, máx. 5 MB cada una)
- `fotoPrincipalIndex=0`

**Response — 201 Created:** mascota completa con `mascotaId`, `placaQr.tokenAcceso`, `propietarios` (auto-asignado el creador como `Dueno_Principal`) y `fotos[]` con URL de Cloudinary.

**Estado:** ✅ OK — placa QR generada automáticamente, foto subida a Cloudinary. Emite `pet:registered` al room `user:{personaId}` del creador.

---

### `GET /pets`

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

### `GET /pets/{id}`

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

### `POST /pets/{id}/photos`

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

**Estado:** ✅ OK — **Resuelto E3.** Ahora **agrega** las fotos (no reemplaza). Verificado: 1 foto inicial → POST 2 fotos → total 3 fotos, original con `esPrincipal: true` preservada. Límite máximo: 4 fotos por mascota.

---

### `DELETE /pets/{id}/photos/{fotoId}`

> 🔌 **WebSocket:** `pet:profile-updated` (con `fotoPrincipalUrl` actualizada si se borró la principal)

**Casos probados:**

1. DELETE foto inexistente (`fotoId=99999`) → **404 `"Foto no encontrada"`** ✅ (**Resuelto E5**)
2. DELETE foto cuando es la única → 400 `"La mascota debe tener al menos 1 foto"` ✅
3. DELETE foto no principal con varias fotos restantes → 200 `{ "message": "Foto eliminada" }` ✅

**Estado:** ✅ OK

---

### `DELETE /pets/{id}`

**Response — 200 OK:** `{ "message": "Mascota eliminada" }`

**Estado:** ✅ OK — borra mascota, placa QR y fotos asociadas (cascade).

---

## H3 — Código QR básico (formato PNG)

> El QR se crea automáticamente al registrar la mascota (`POST /pets`). Este endpoint lo descarga.

### `GET /pets/{id}/qr?format=png`

**Request:**

```http
GET /pets/776cb109-96d4-4e00-b4db-59ab18ac1325/qr?format=png&size=600
Authorization: Bearer <accessToken>
```

**Response — 200 OK:**

```text
data:image/png;base64,iVBORw0KGgo...
```

Listo para mostrar en un `ImageView` de Kotlin (`BitmapFactory.decodeByteArray`) o `<img src>` en web.

**Parámetros:**

| Param | Valores | Default | Descripción |
| --- | --- | --- | --- |
| `format` | `png`, `svg` | `png` | Formato de salida |
| `size` | 100 – 1000 | 300 | Tamaño del PNG en px (ignorado si `format=svg`) |

**Estado:** ✅ OK

**Notas:**

- El QR codifica la URL `https://petfinder.app/qr/{tokenAcceso}` — al escanear, la web llama primero `GET /pets/public/{token}` y luego `POST /pets/public/{token}/scan`.
- El formato SVG (recomendado para impresión) se introduce en Sprint 3 — H6.

---

## H10 — Zonas seguras (Geofencing)

> 🔌 **WebSocket:** `pet:entered-zone` y `pet:exited-zone` — se emiten cuando `PUT /users/me/location` (H31) detecta que la mascota entra o sale de una zona configurada aquí.

### `POST /geofencing/pets/{petId}/zones` — círculo

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

### `POST /geofencing/pets/{petId}/zones` — polígono

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

### `GET /geofencing/zones`

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

### `GET /geofencing/pets/{petId}/zones`

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

**Nota:** a diferencia de `GET /geofencing/zones`, devuelve `mascota_ids` (array de UUIDs) en lugar del objeto mascota completo.

**Estado:** ✅ OK

---

### `GET /geofencing/zones/{id}`

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

**Nota:** `geometria_geojson` es `null` para zonas de tipo círculo. Para polígonos contiene el GeoJSON con las coordenadas.

**Estado:** ✅ OK

---

### `PUT /geofencing/zones/{id}`

**Request:** `{ "nombreZona": "Casa UMSS (1km)", "radioMetros": 1000 }`

**Response — 200 OK:** zona con `nombre_zona: "Casa UMSS (1km)"` y `radio_metros: 1000`.

**Estado:** ✅ OK — **Resuelto E2.** `updateZone()` reescrito con ramas independientes; soporta partial updates de cualquier combinación de campos. Verificado: radio 300 → PUT `{"radioMetros": 2500}` → GET muestra 2500.

🔁 **Cross-sprint — H15 (Sprint 3):** también se usa para personalizar el `radioMetros` de una zona existente desde la pantalla de configuración de zona segura.

---

### `DELETE /geofencing/zones/{id}`

**Response — 200 OK:** `{ "message": "Zona eliminada" }`

**Estado:** ✅ OK

---

### `POST /geofencing/zones/{id}/pets`

**Request:**

```json
{ "mascotaIds": ["df9d9bca-5bf2-4abe-9795-58e1e5f58685"] }
```

**Response — 201 Created:** zona actualizada con la nueva lista de `mascota_ids`.

**Casos probados:**

1. Agregar mascota nueva → aparece en `mascota_ids` ✅
2. Agregar mascota ya asignada (idempotente) → lista sin duplicados ✅
3. Array vacío `[]` → 400 `"mascotaIds must contain at least 1 elements"` ✅

**Estado:** ✅ OK — usa `createMany + skipDuplicates`.

---

### `PUT /geofencing/zones/{id}/pets`

**Request:** `{ "mascotaIds": ["776cb109-96d4-4e00-b4db-59ab18ac1325"] }`

**Response — 200 OK:** zona con solo la mascota indicada.

**Estado:** ✅ OK — reemplaza **toda** la lista (`deleteMany` + `createMany` en transacción).

---

### `DELETE /geofencing/zones/{id}/pets`

**Request:** `{ "mascotaIds": ["df9d9bca-5bf2-4abe-9795-58e1e5f58685"] }`

**Response — 200 OK:** `{ "message": "1 mascota(s) desasignada(s) de la zona" }`

**Casos probados:**

1. Desasignar mascota existente → 200 con conteo correcto ✅
2. Desasignar mascota que ya no estaba → 200 con `0 mascota(s)` ✅
3. Array vacío `[]` → 400 ✅

**Estado:** ✅ OK

---

## H31 — Ver mis mascotas en el mapa

> 🔌 **WebSocket:** `pet:location-updated` — los co-propietarios reciben la ubicación actualizada de la mascota en tiempo real cuando el dueño hace `PUT /pets/{id}/location` o tiene la mascota en `estado=en_paseo`.

### `GET /pets/map`

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

**Estado:** ✅ OK — devuelve TODAS las mascotas del dueño autenticado. Las que no tienen GPS vienen con `lat/lng: null`.

---

### `PUT /pets/{id}/location`

> 🔌 **WebSocket:** `pet:location-updated` a todos los propietarios de la mascota.

**Request:** `{ "lat": -17.3935, "lng": -66.1457 }`

**Response — 200 OK:** `{ "message": "Ubicación de la mascota actualizada" }`

**Estado:** ✅ OK

---

### `PUT /users/me/location`

> 🔌 **WebSocket:** `owner:location-updated` a todos los rooms de mascotas del usuario. Si la mascota está en `estado=en_paseo`, también emite `pet:location-updated`. Si hay zonas configuradas, puede emitir `pet:entered-zone` / `pet:exited-zone`.

**Request:** `{ "lat": -17.3935, "lng": -66.1457 }`

**Response — 200 OK:** `{ "message": "Ubicación actualizada" }`

**Estado:** ✅ OK

🔁 **Cross-sprint — H32 (Sprint 1):** los co-propietarios reciben `owner:location-updated` para ver al dueño en el mapa.
🔁 **Cross-sprint — H7 (Sprint 3):** componente clave de la actualización en tiempo real (propagación GPS en paseo).

---

### `GET /map/snapshot` — sección `misMascotas`

> 🔌 **WebSocket:** actualiza `misMascotas` cuando llega `pet:location-updated` o `pet:status-changed`.

**Response — 200 OK (fragmento `misMascotas`):**

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
    }
  ]
}
```

**Estado:** ✅ OK — estructura rediseñada en Etapa 5. Ver detalles completos del endpoint en **H31/H32 — `GET /map/snapshot` (completo)** más abajo.

---

## H32 — Ver propietarios en el mapa

> 🔌 **WebSocket:** `owner:location-updated` — los co-propietarios y cuidadores aparecen en tiempo real al mover su GPS.

### `GET /pets/{id}/owners-map`

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

**Estado:** ✅ OK — devuelve todos los dueños y cuidadores con su última ubicación GPS conocida. Los que no han compartido ubicación vienen con `lat/lng: null`.

---

### `GET /users/map`

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

### `GET /map/snapshot` — completo (H31 + H32 + H13)

> 🔌 **WebSocket:** escuchar `pet:location-updated`, `owner:location-updated`, `pet:status-changed` para mantener el snapshot actualizado sin polling.
> 🔁 **Cross-sprint:** la sección `desaparecidas` se usa en **H13 (Sprint 2)** y los filtros `?tipoId=N` en **H21 (Sprint 4)**.

**Request:** `GET /map/snapshot` (con auth)

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

**Estado:** ✅ OK

**Notas:**

- `misMascotas` — mascotas propias. `recompensa` solo aparece cuando `estado = "extraviada"`.
- `colaboradores` — co-propietarios/cuidadores con GPS activo y `estadoCuenta = "activa"`.
- `desaparecidas` — mascotas de otros usuarios con reporte abierto (máx. 50). `recompensa: null` si no hay.
- `zonas` — `mascotaIds` es array de UUIDs; el detalle se cruza con `misMascotas` en el cliente.
- **`?tipoId=N`** filtra la sección `desaparecidas` (Sprint 4 — H21).

---

## Endpoints de soporte — Sprint 1

> Estos endpoints son fundacionales y se usan a lo largo de todos los sprints.

### `GET /tipos-mascota` (público)

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

**Estado:** ✅ OK — público, no requiere auth.

🔁 **Cross-sprint — H21 (Sprint 4):** se usa como catálogo para el filtro `?tipoId=N` en el mapa.

---

### `POST /tipos-mascota` (admin)

**Request (con usuario rol=`usuario`):** → 403 Forbidden ✅ (RBAC funcional)

**Request (con usuario rol=`admin`):** `{ "nombre": "Tortuga" }`

**Response — 201 Created:** `{ "tipoId": 11, "nombre": "Tortuga" }`

**Estado:** ✅ OK

---

### `DELETE /tipos-mascota/{id}` (admin)

**Response — 200 OK:** `{ "tipoId": 11, "nombre": "Tortuga" }`

**Estado:** ✅ OK

---

### `GET /users/me`

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

### `PUT /users/me`

**Request:** `{ "nombre": "Juan Carlos", "apellidoMaterno": "López", "fechaNacimiento": "1995-03-22" }`

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

### `PUT /users/me/photo`

> 🔌 **WebSocket:** `owner:profile-updated` a todos los rooms de mascotas del usuario (notifica a co-propietarios el cambio de foto).

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

🔁 **Cross-sprint — H7 (Sprint 3):** componente de la actualización en tiempo real del perfil del propietario.

---

## Sprint 2 — Ficha pública, Estado de mascota, Escaneo QR y Mapa de extraviadas

**Historias:** H4 · H9 · H11 · H12 · H13 · H19

---

## H4 — Ver ficha pública de mascota y registros médicos

> Permite que cualquier persona que escanee el QR (sin cuenta) vea la información completa de la mascota. También habilita la gestión del historial médico por parte del dueño.

### `GET /pets/public/{token}`

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

- Recibe el `tokenAcceso` de `PlacaQr` (no el `mascotaId`). El QR generado por `GET /pets/{id}/qr` ya contiene este token.
- Solo retorna propietarios con `mostrarEnQr: true` — campo de privacidad del dueño.
- Verifica que la placa esté activa (`estaActiva: true`).
- Es la primera llamada que la **página web** hace al cargar tras el escaneo.

🔁 **Cross-sprint — H16 (Sprint 4):** la sección `propietarios[].contactos` es la base de la red colaborativa para contactar al dueño.
🔁 **Cross-sprint — H24 (Sprint 4):** el campo `recompensa` en el `reporteActivo` se muestra en esta ficha cuando la mascota está extraviada.

---

### `GET /pets/{id}/card`

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

### `POST /pets/{id}/medical`

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

### `GET /pets/{id}/medical`

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

### `PUT /pets/{id}/medical/{registroId}`

**Request:** todos los campos son opcionales — se actualiza solo lo que viene en el body.

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

---

### `DELETE /pets/{id}/medical/{registroId}`

**Response — 200 OK:** `{ "message": "Registro eliminado" }`

**Estado:** ✅ OK

---

## H9 — Cambiar estado de mascota

> 🔌 **WebSocket:** `pet:status-changed` a todos los propietarios de la mascota.
> 📱 **FCM:** `sendPetLostAlert` cuando `estado = "extraviada"` (push a propietarios con `recibeAlertas: true`).

### `PUT /pets/{id}/status`

**Casos probados:**

**`estado=extraviada`:**

```json
{ "estado": "extraviada" }
```

**Response — 200 OK:** `{ "mascotaId": "...", "nombre": "Pelusa", "estado": "extraviada" }`

**Estado:** ✅ OK — **Resuelto E1.** Dispara `sendPetLostAlert` + `sendZoneAlert` sin tumbar el servidor. Ver también **H19** para el flujo completo con alertas de zona.

---

**`estado=recuperada`:**

```json
{ "estado": "recuperada" }
```

**Response — 200 OK:** `{ "mascotaId": "...", "nombre": "Rocky", "estado": "recuperada" }`

**Estado:** ✅ OK — cierra el reporte de extravío abierto. No dispara notificaciones FCM.

---

**`estado=en_paseo` y `estado=en_casa`:**

```json
{ "estado": "en_paseo" }
→ { "mascotaId": "776cb109-...", "nombre": "Rocky", "estado": "en_paseo" }

{ "estado": "en_casa" }
→ { "mascotaId": "776cb109-...", "nombre": "Rocky", "estado": "en_casa" }
```

**Estado:** ✅ OK

**Notas:**

- `en_paseo` activa propagación automática de GPS: cuando el dueño actualiza `PUT /users/me/location`, las mascotas en `en_paseo` también se actualizan y se emite `pet:location-updated`.
- `en_casa` cierra el reporte de extravío abierto (mismo branch que `recuperada`).

🔁 **Cross-sprint — H19 (Sprint 2):** el flujo `extraviada` también dispara `sendZoneAlert` a usuarios de zonas cercanas.
🔁 **Cross-sprint — H7 (Sprint 3):** el endpoint completo se documenta en el contexto de actualización en tiempo real.

---

## H11 — Registrar escaneo QR

> Registro básico de escaneo, sin notificación push. Quien escanea el QR (sin cuenta) llama este endpoint.

### `POST /pets/public/{token}/scan`

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

**Estado:** ✅ OK

**Notas:**

- `lat` y `lng` son opcionales — si el escáner rechazó el permiso, el body va vacío y se guarda `null`.
- Rango validado: `lat ∈ [-90, 90]`, `lng ∈ [-180, 180]`.
- Flujo de la web: llamar primero sin coords al cargar → pedir permiso de geolocalización → si acepta, llamar de nuevo con coords.

🔁 **Cross-sprint — H12 (Sprint 2):** el mismo endpoint también dispara `sendQrScanAlert` por FCM cuando la mascota está extraviada.

---

## H12 — Notificación push al escanear QR

> 📱 **FCM:** `sendQrScanAlert` — push a los propietarios cuando alguien escanea el QR de una mascota extraviada. Requiere que el dueño tenga `tokenFcm` registrado.

### `POST /pets/public/{token}/scan` (con FCM)

> 🔁 **Cross-sprint desde H11:** el mismo endpoint descrito en H11. Aquí se documenta el contexto FCM adicional.

**Comportamiento FCM:**

- Si la mascota está en `estado=extraviada` **y** los propietarios con `recibeAlertas: true` tienen `tokenFcm` registrado → el servidor llama `sendQrScanAlert` en background.
- Si el propietario no tiene `tokenFcm` → la notificación se omite silenciosamente (no falla).
- El escaneo se registra en BD independientemente del resultado FCM.

**Estado:** ✅ OK (FCM fire-and-forget — envuelto en try/catch)

---

### `GET /pets/{id}/scans`

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
    "lat": null,
    "lng": null,
    "escaneadoEl": "2026-05-18T03:49:37.437Z"
  }
]
```

**Estado:** ✅ OK

**Notas:**

- Ordenado del más reciente al más antiguo (`escaneadoEl DESC`).
- `lat/lng: null` si el escaneador no compartió ubicación GPS.
- Protección de ownership: un usuario que no sea propietario ni cuidador recibe 403.

🔁 **Cross-sprint — H17 (Sprint 4):** el historial completo de escaneos se documenta en el contexto del seguimiento y trazabilidad.

---

### `PUT /users/me/fcm-token` (soporte para FCM)

> 🔁 **Cross-sprint:** necesario para **cualquier** notificación push — H12, H19 (Sprint 2) y H14 (Sprint 3). Sin este token registrado, las push se omiten silenciosamente.

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

**Estado:** ✅ OK

**Notas:**

- Android debe llamar este endpoint al arrancar la app **o** cuando Firebase renueva el token (callback `onNewToken`).
- El token se puede actualizar cuantas veces se quiera; sobreescribe el anterior en BD.

---

## H13 — Mapa público de mascotas extraviadas

> Sin autenticación. Cualquier usuario (incluso sin cuenta) puede ver las mascotas extraviadas en el mapa.

### `GET /map/public/lost-pets` (público)

**Query params opcionales:** `?tipoId=N` — filtra por tipo de mascota.

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

- `ubicacion` es un objeto `{lat, lng}` (no campos planos).
- `recompensa: null` si el dueño no ofrece recompensa económica.
- Máx. 100 resultados, ordenados por `fecha_perdida DESC`.

🔁 **Cross-sprint — H21 (Sprint 4):** el filtro `?tipoId=N` se usa para mostrar solo perros, solo gatos, etc.
🔁 **Cross-sprint — H24 (Sprint 4):** el campo `recompensa` se muestra en los marcadores del mapa.

---

## H19 — Alertas de zona cuando la mascota se extravía

> 📱 **FCM:** `sendZoneAlert` — push a usuarios activos en zonas geográficas cercanas a la última ubicación de la mascota cuando el estado cambia a `extraviada`.

### `PUT /pets/{id}/status` → `extraviada` (con sendZoneAlert)

> 🔁 **Cross-sprint desde H9:** el mismo endpoint. Aquí se documenta el flujo completo de notificaciones de zona.

**Flujo completo al poner `estado=extraviada`:**

1. BD: `mascota.estado = 'extraviada'`
2. Crea registro en `ReporteMascota` con `estado = 'abierto'` y `lat/lng` actuales
3. Emite `pet:status-changed` por WebSocket 🔌
4. Llama `sendPetLostAlert` → FCM push a co-propietarios con `recibeAlertas: true` 📱
5. Llama `sendZoneAlert` → consulta PostGIS (`ST_DWithin`) para encontrar usuarios con GPS activo en radio cercano → FCM push a cada uno 📱

**Fix aplicado (E1):** `recibe_alertas` (snake_case) corregido en el SQL crudo; todos los métodos envueltos en `try/catch` para que un fallo de notificación nunca tumbe el proceso Node.

**Estado:** ✅ OK — verificado live: PUT → 200 OK, ping al server 4 s después → 200 OK (proceso vivo).

---

## Sprint 3 — Colaboración, QR para impresión, Tiempo real, Alerta comunitaria

**Historias:** H5 · H6 · H7 · H8 · H14 · H15

---

## H5 — Agregar y remover co-propietarios y cuidadores

> 🔌 **WebSocket:** `owner:added` al room `pet:{id}` (todos los propietarios actuales reciben la notificación) y `pet:assigned` al room `user:{id}` del nuevo propietario (el nuevo dueño recibe la asignación en su propio stream).

### `POST /pets/{id}/owners`

> **Breaking change (Sprint 3):** El campo `personaId` fue reemplazado por `correoElectronico`. El servidor busca la cuenta por email y resuelve el `personaId` internamente.

**Request (happy path — agregar cuidadora):**

```json
{ "correoElectronico": "maria.test@petfinder.dev", "tipoRelacion": "Cuidador" }
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

**Campos opcionales del body:**

| Campo | Tipo | Default | Descripción |
| --- | --- | --- | --- |
| `correoElectronico` | string (email) | **requerido** | Email del usuario a agregar |
| `tipoRelacion` | `Dueno_Principal`, `Familiar`, `Cuidador` | `Cuidador` | Rol del nuevo propietario |
| `recibeAlertas` | boolean | `true` | Recibe push FCM de la mascota |
| `mostrarEnQr` | boolean | `true` | Su contacto aparece en la ficha pública |

**Casos de error:**

1. Formato de correo inválido → 400 `"Debe ser un correo electrónico válido"` ✅
2. Correo sin cuenta registrada → 404 `"No existe una cuenta con ese correo electrónico"` ✅
3. Misma persona dos veces → 400 `"Esta persona ya es propietaria o cuidadora de la mascota"` ✅

**Estado:** ✅ OK — probado con segundo usuario real (`maria.test@petfinder.dev`).

---

### `DELETE /pets/{id}/owners/{personaId}`

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

**Estado:** ✅ OK

---

## H6 — QR formato SVG para impresión

> El SVG es el formato recomendado para impresión — vectorial, sin pixelado, generado en el servidor. Android convierte el SVG a PDF/JPEG/PNG localmente con AndroidSVG.

### `GET /pets/{id}/qr?format=svg`

**Request:**

```http
GET /pets/776cb109-96d4-4e00-b4db-59ab18ac1325/qr?format=svg
Authorization: Bearer <accessToken>
```

**Response — 200 OK:**

```text
Content-Type: image/svg+xml
Content-Disposition: attachment; filename="qr.svg"

<svg xmlns="http://www.w3.org/2000/svg" ...>...</svg>
```

**Flujo recomendado en Android:**

1. `GET /qr?format=svg` → recibir SVG como `String`
2. `AndroidSVG.getFromString(svg).renderToPicture()` → `Bitmap`
3. Opciones desde el `Bitmap`:
   - Mostrar en pantalla: `ImageView.setImageBitmap(bitmap)`
   - Guardar PNG: `bitmap.compress(PNG, 100, outputStream)`
   - Generar PDF: `PdfDocument` del SDK nativo → incrustar bitmap → guardar `.pdf`
   - Compartir: `FileProvider` + `Intent.ACTION_SEND`

**Estado:** ✅ OK

---

### `GET /pets/{id}/qr?format=png` — referencia completa

> 🔁 **Cross-sprint desde H3 (Sprint 1):** mismo endpoint, ahora con el parámetro `?format=` documentado completo.

**Parámetros del endpoint:**

| Param | Valores | Default | Descripción |
| --- | --- | --- | --- |
| `format` | `png`, `svg` | `png` | Formato de salida |
| `size` | 100 – 1000 | 300 | Tamaño del PNG en px (ignorado si `format=svg`) |

**Estado:** ✅ OK — ver detalles de PNG en Sprint 1 — H3.

---

## H7 — Actualización de información en tiempo real

> Agrupa todos los endpoints que emiten eventos WebSocket y mantienen el estado sincronizado entre dispositivos.
> 🔌 **WebSocket:** `pet:profile-updated`, `pet:status-changed`, `pet:location-updated`, `owner:location-updated`, `owner:profile-updated`, `pet:entered-zone`, `pet:exited-zone`

### `PUT /pets/{id}` (actualizar perfil de mascota)

> 🔌 **WebSocket:** `pet:profile-updated` a room `pet:{id}`
> 🔁 **Cross-sprint desde H2 (Sprint 1):** el endpoint siempre existió; H7 lo incorpora en el flujo de actualización en tiempo real.

**Request:**

```json
{ "colorPrimario": "Blanco con negro", "rasgosParticulares": "Cola con punta blanca" }
```

**Response — 200 OK:** mascota actualizada.

**Estado:** ✅ OK

---

### `PUT /pets/{id}/status` (tiempo real)

> 🔌 **WebSocket:** `pet:status-changed` a room `pet:{id}`
> 🔁 **Cross-sprint desde H9/H19 (Sprint 2):** ver detalles de cada estado en Sprint 2.

Resumen de estados y efectos:

| Estado | WS | FCM | Reporte extravío |
| --- | --- | --- | --- |
| `extraviada` | `pet:status-changed` | `sendPetLostAlert` + `sendZoneAlert` | Abre |
| `recuperada` | `pet:status-changed` | — | Cierra |
| `en_casa` | `pet:status-changed` | — | Cierra |
| `en_paseo` | `pet:status-changed` | — | — (activa propagación GPS) |

---

### `PUT /pets/{id}/location` (tiempo real)

> 🔌 **WebSocket:** `pet:location-updated` a room `pet:{id}`
> 🔁 **Cross-sprint desde H31 (Sprint 1):** ver detalles completos ahí.

---

### `PUT /users/me/location` (tiempo real)

> 🔌 **WebSocket:** `owner:location-updated`, y si mascota en paseo: `pet:location-updated`. Con zonas activas: `pet:entered-zone` / `pet:exited-zone`.
> 🔁 **Cross-sprint desde H31 (Sprint 1):** ver detalles completos ahí.

---

### `PUT /users/me/photo` (tiempo real)

> 🔌 **WebSocket:** `owner:profile-updated` a todos los rooms de mascotas del usuario.
> 🔁 **Cross-sprint desde soporte Sprint 1:** ver detalles completos ahí.

---

## H8 — Contactos de emergencia

> Permite agregar, listar y eliminar medios de contacto del perfil del usuario. Los contactos marcados como `esPrincipal: true` aparecen en la ficha pública de la mascota.

### `POST /users/me/contacts`

**Request:** `{ "tipo": "Celular", "valor": "+591 71234567" }`

**Response — 201 Created:**

```json
{ "contactoId": 8, "personaId": "15e8092d-...", "tipo": "Celular", "valor": "+591 71234567", "esPrincipal": false }
```

**Estado:** ✅ OK

---

### `DELETE /users/me/contacts/{id}`

**Request:** `DELETE /users/me/contacts/8`

**Response — 200 OK:**

```json
{ "contactoId": 8, "personaId": "15e8092d-...", "tipo": "Celular", "valor": "+591 71234567", "esPrincipal": false }
```

**Estado:** ✅ OK

---

### `GET /users/me` — sección `mediosContacto`

> 🔁 **Cross-sprint desde soporte Sprint 1:** el endpoint base. En H8 se usa específicamente para verificar que los contactos de emergencia se listan correctamente.

Ver response completo en **Sprint 1 — Endpoints de soporte — `GET /users/me`**.

---

## H14 — Alerta comunitaria manual ("Pedir ayuda")

> 📱 **FCM:** `sendRadiusAlert` — botón manual en Android que envía push a usuarios de la app activos en el radio indicado (excluye propietarios de la mascota). Requiere que la mascota tenga ubicación GPS registrada.

### `POST /pets/{id}/alert/community`

**Request:**

```http
POST /pets/776cb109-96d4-4e00-b4db-59ab18ac1325/alert/community
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{ "radio": 3000 }
```

El campo `radio` es opcional. Default: `5000` metros. Rango: 100 – 50 000.

**Response — 200 OK (usuarios encontrados):**

```json
{
  "message": "Alerta enviada a 7 usuario(s) cercano(s)",
  "usuariosNotificados": 7
}
```

**Response — 200 OK (nadie en el radio):**

```json
{
  "message": "No hay usuarios cercanos con la app activa en ese radio",
  "usuariosNotificados": 0
}
```

**Casos de error:**

- Mascota no encontrada → 404 ✅
- Usuario no es propietario → 403 ✅
- `radio` < 100 → 400 `"El radio debe ser al menos 100 metros"` ✅
- `radio` > 50000 → 400 `"El radio no puede superar 50 000 metros"` ✅

**Estado:** ✅ OK

**Notas:**

- Usa PostGIS `ST_DWithin` para encontrar usuarios con GPS activo en el radio indicado.
- Excluye a todos los propietarios y cuidadores de la mascota.
- A diferencia de `sendZoneAlert` (automático en H19), este es un disparo **manual** desde el botón "Pedir ayuda" de la app.
- El campo `usuariosNotificados` es útil para mostrar feedback al dueño ("Se notificó a N personas cercanas").

---

## H15 — Configurar radio de zona segura

> 🔁 **Cross-sprint desde H10 (Sprint 1):** los endpoints de zonas ya existen. H15 se enfoca en configurar específicamente el `radioMetros` para personalizar cuándo se disparan las alertas de entrada/salida.

### `POST /geofencing/pets/{petId}/zones` — con radioMetros personalizado

> 🔁 **Cross-sprint desde H10 (Sprint 1):** ver detalles completos ahí.

Crear zona con radio personalizado:

```json
{ "nombreZona": "Parque UMSS", "tipo": "circulo", "lat": -17.394, "lng": -66.148, "radioMetros": 2500 }
```

El radio define el perímetro en metros donde se activan `pet:entered-zone` / `pet:exited-zone`.

---

### `PUT /geofencing/zones/{id}` — actualizar radio

> 🔁 **Cross-sprint desde H10 (Sprint 1):** ver detalles completos ahí.

Actualizar solo el radio de una zona existente:

```json
{ "radioMetros": 1500 }
```

**Estado:** ✅ OK — partial update correcto (**Resuelto E2**).

---

## Sprint 4 — Red colaborativa, Historial, Avistamientos y Filtros avanzados

**Historias:** H16 · H17 · H18 · H20 · H21 · H24

---

## H16 — Perfil público del propietario

> Permite ver el perfil completo de un propietario (no solo sus datos en la ficha de la mascota). Facilita el contacto directo entre usuarios de la red colaborativa.

### `GET /pets/public/{token}` — sección propietarios con contactos

> 🔁 **Cross-sprint desde H4 (Sprint 2):** misma respuesta. En H16 el foco es la sección `propietarios[].contactos` que habilita la red colaborativa — quien encuentra la mascota puede contactar al dueño directamente desde la ficha pública.

Ver response completo en **Sprint 2 — H4 — `GET /pets/public/{token}`**.

**Campo clave para H16:**

```json
"propietarios": [
  {
    "personaId": "dc0c8f82-...",
    "nombreCompleto": "Wilian Almendras",
    "fotoPerfilUrl": "https://res.cloudinary.com/...",
    "tipoRelacion": "Dueno_Principal",
    "contactos": [{ "tipo": "WhatsApp", "valor": "69524395" }]
  }
]
```

Solo aparecen propietarios con `mostrarEnQr: true`.

---

### `GET /users/{personaId}/card`

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

## H17 — Historial de escaneos y reportes de extravío

> Los propietarios pueden revisar quién escaneó el QR de su mascota y cuándo, y ver el historial completo de reportes de extravío (abiertos y cerrados).

### `GET /pets/{id}/scans` (historial)

> 🔁 **Cross-sprint desde H12 (Sprint 2):** el endpoint ya se documentó en el contexto FCM. Aquí se documenta como parte del historial y trazabilidad.

Ver detalles completos en **Sprint 2 — H12 — `GET /pets/{id}/scans`**.

---

### `GET /pets/{id}/reports`

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
- `lat/lng` son la última ubicación conocida de la mascota **al momento del extravío** (snapshot), no la ubicación actual.
- `estado_reporte` cambia de `"abierto"` a `"cerrado"` automáticamente cuando `PUT /pets/{id}/status` recibe `en_casa`, `en_paseo` o `recuperada`.
- Protección de ownership: usuario no propietario ni cuidador recibe 403.

---

## H18 — Avistamientos de mascotas perdidas

> ⏳ **Pendiente de implementación.** Cualquier usuario de la app puede reportar un avistamiento de una mascota perdida con foto de evidencia y coordenadas GPS. El dueño puede agradecer el reporte.

### `POST /sightings/pets/{petId}` — reportar avistamiento

**Request (planificado):**

```http
POST /sightings/pets/776cb109-96d4-4e00-b4db-59ab18ac1325/
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data
```

```text
lat=-17.3950
lng=-66.1470
descripcion=Vi al perro cerca del parque principal
foto=@evidencia.jpg (opcional — ver H20)
```

**Response esperado — 201 Created:**

```json
{
  "avistamientoId": "uuid",
  "mascotaId": "776cb109-...",
  "reportadoPor": "personaId del reporter",
  "lat": -17.395,
  "lng": -66.147,
  "descripcion": "Vi al perro cerca del parque principal",
  "fotoEvidenciaUrl": null,
  "creadoEl": "2026-05-22T10:00:00.000Z"
}
```

**Estado:** ⏳ No implementado

---

### `GET /sightings/pets/{petId}` — listar avistamientos

**Estado:** ⏳ No implementado

---

### `POST /sightings/{id}/thanks` — agradecer avistamiento

**Estado:** ⏳ No implementado

---

### `GET /sightings/{id}/thanks` — ver agradecimientos

**Estado:** ⏳ No implementado

---

## H20 — Foto de evidencia en avistamiento

> ⏳ **Pendiente de implementación.** Extensión de H18 — el mismo endpoint de avistamiento acepta un campo `foto` de tipo `binary` (multipart). La foto se sube a Cloudinary.

### `POST /sightings/pets/{petId}` — con foto

> 🔁 **Cross-sprint desde H18:** mismo endpoint. Aquí se documenta la parte de subida de foto de evidencia.

**Campo adicional en el request:**

```text
foto=@evidencia.jpg  (jpeg, png, webp — máx. 5 MB)
```

**Estado:** ⏳ No implementado (depende de H18)

---

## H21 — Filtro por tipo de mascota en el mapa

> Los mapas públicos y privados pueden filtrarse por tipo de mascota (perro, gato, etc.) usando el `tipoId` del catálogo de `GET /tipos-mascota`.

### `GET /map/public/lost-pets?tipoId=N`

> 🔁 **Cross-sprint desde H13 (Sprint 2):** ver detalles completos ahí.

**Ejemplo:** `GET /map/public/lost-pets?tipoId=1` → solo mascotas de tipo "Perro" extraviadas.

**Estado:** ✅ OK — el parámetro `?tipoId` ya está implementado junto con el endpoint base.

---

### `GET /map/snapshot?tipoId=N`

> 🔁 **Cross-sprint desde H31 (Sprint 1):** ver detalles completos ahí.

**Efecto del filtro:** `?tipoId=N` filtra únicamente la sección `desaparecidas` del snapshot. Las secciones `misMascotas`, `colaboradores` y `zonas` no se filtran.

**Estado:** ✅ OK

---

### `GET /tipos-mascota` — catálogo para el filtro

> 🔁 **Cross-sprint desde soporte Sprint 1:** ver detalles completos ahí.

Usar el `tipoId` de esta respuesta como `?tipoId=N` en los endpoints de mapa.

---

## H24 — Recompensa en mapa y ficha pública

> El dueño puede ofrecer recompensa económica al crear un reporte de extravío. Esta recompensa aparece en la ficha pública y en los marcadores del mapa para incentivar la búsqueda colaborativa.

### `GET /pets/public/{token}` — campo `recompensa`

> 🔁 **Cross-sprint desde H4 (Sprint 2):** mismo endpoint. El campo `recompensa` del `reporteActivo` se expone cuando la mascota está extraviada.

**Fragmento relevante de la respuesta cuando `estaExtraviada: true`:**

```json
{
  "estaExtraviada": true,
  "estado": "extraviada",
  "reporteActivo": {
    "reporteId": 3,
    "recompensa": 200.00,
    "fechaPerdida": "2026-05-19T12:33:42.562Z"
  }
}
```

`recompensa: null` si no se ofrece recompensa.

---

### `GET /map/public/lost-pets` — campo `recompensa` en marcadores

> 🔁 **Cross-sprint desde H13 (Sprint 2):** mismo endpoint. El campo `recompensa` ya está en la respuesta base.

```json
{
  "reporteId": 3,
  "nombre": "Firulais",
  "tipo": "Perro",
  "recompensa": 200.00
}
```

**Estado:** ✅ OK — `recompensa: null` si no hay recompensa; el cliente decide si mostrar el badge.

---

### `PUT /pets/{id}/status` → `extraviada` con recompensa

> 🔁 **Cross-sprint desde H9 (Sprint 2):** mismo endpoint. Cuando se crea el reporte de extravío al poner `estado=extraviada`, el campo `recompensa` se puede incluir en el body para ofrecerla desde el momento del reporte.

**Body con recompensa:**

```json
{ "estado": "extraviada", "recompensa": 200.00 }
```

**Estado:** ✅ OK (el campo `recompensa` se guarda en `ReporteMascota.recompensa`)

---

## Errores detectados y fixes aplicados

Resumen de los hallazgos durante la corrida. **Todos los bugs (E1–E5) fueron corregidos y verificados en vivo en la misma sesión.**

## E1 — 🔴 CRÍTICO ✅ RESUELTO — `sendZoneAlert` mataba el proceso Node

**Endpoint afectado:** `PUT /pets/{id}/status` con `estado=extraviada` (Sprint 2 — H19)

**Síntoma:** la BD se actualiza y la response llega como 200 OK al cliente, pero **el proceso Node muere ~1 s después** sin captura de error.

**Causa raíz:** `src/infrastructure/notifications/notifications.service.ts` ejecutaba SQL crudo con nombre de columna en camelCase:

```sql
AND pm.recibeAlertas = true
```

PostgreSQL convierte identificadores no quoted a lowercase → busca `pm.recibealertas`, pero la columna real es `pm.recibe_alertas` (snake_case por Prisma `@map`).

**Fix aplicado:**

```diff
- AND pm.recibeAlertas = true
+ AND pm.recibe_alertas = true
```

Los 3 métodos `sendPetLostAlert`, `sendQrScanAlert` y `sendZoneAlert` ahora están envueltos en `try/catch` con `this.logger.error(...)`.

**Verificación live:** `PUT /pets/:id/status {"estado":"extraviada"}` → 200 OK, ping al server 4 s después → 200 OK (proceso vivo).

---

## E2 — 🟡 MEDIO ✅ RESUELTO — `PUT /geofencing/zones/{id}` ignoraba `radioMetros`

**Endpoint afectado:** `PUT /geofencing/zones/{id}` (Sprint 1 — H10 / Sprint 3 — H15)

**Causa raíz:** el viejo `updateZone()` requería que `dto.tipo && dto.lat && dto.lng && dto.radioMetros` fueran TODOS truthy. Un PUT parcial con solo `{ radioMetros }` no entraba en esa rama.

**Fix aplicado:** `updateZone()` reescrito con ramas independientes — cada campo se actualiza por separado (`nombreZona`, `lat/lng`, `radioMetros`, `coordenadas`).

**Verificación live:** zona con `radio_metros: 300` → `PUT { "radioMetros": 2500 }` → GET muestra 2500.

---

## E3 — 🟡 MEDIO ✅ RESUELTO — `POST /pets/{id}/photos` reemplazaba en vez de agregar

**Endpoint afectado:** `POST /pets/{id}/photos` (Sprint 1 — H2)

**Causa raíz:** el viejo `uploadPhotos()` borraba todas las fotos previas con `fotoMascota.deleteMany` antes de insertar las nuevas.

**Fix aplicado:**

1. `uploadPhotos()` ahora agrega sin borrar — las fotos existentes se preservan.
2. Se valida el límite máximo: si `total > 4` lanza `BadRequestException`.
3. `fotoPrincipalIndex` es opcional; si no se envía, la principal original se mantiene.

**Verificación live:** 1 foto inicial → POST 2 fotos nuevas → GET muestra 3 fotos, original con `esPrincipal: true` preservada.

---

## E4 — 🟢 MENOR ✅ RESUELTO — Swagger no mostraba el shape correcto de `medioContacto`

**Endpoint afectado:** `POST /auth/register` (Sprint 1 — H1)

**Fix aplicado:** `@ApiPropertyOptional` en `register.dto.ts` ahora incluye `type: MedioContactoDto`, `example: { tipo: 'WhatsApp', valor: '+591 70000000' }` y descripción de los valores válidos para `tipo`.

---

## E5 — 🟢 MENOR ✅ RESUELTO — Mensaje 400 confuso al borrar foto inexistente

**Endpoint afectado:** `DELETE /pets/{id}/photos/{fotoId}` (Sprint 1 — H2)

**Causa raíz:** la regla `mascota.fotos.length <= MIN_FOTOS` se evaluaba ANTES de comprobar si la foto existía.

**Fix aplicado:** en `deletePhoto()` se invirtió el orden — primero `find` por `fotoId` → si no existe lanza `NotFoundException('Foto no encontrada')`.

**Verificación live:** `DELETE /pets/:id/photos/99999` → `404 { "message": "Foto no encontrada" }`.

---

## Resumen final

## Cobertura por sprint

| Sprint | Historias | Endpoints implementados | Endpoints pendientes |
| --- | --- | --- | --- |
| **Sprint 1** | H1, H2, H3, H10, H31, H32 | 28 | 0 |
| **Sprint 2** | H4, H9, H11, H12, H13, H19 | 11 | 0 |
| **Sprint 3** | H5, H6, H7, H8, H14, H15 | 10 | 0 |
| **Sprint 4** | H16, H17, H18, H20, H21, H24 | 7 | 4 (H18, H20) |
| **Soporte** | Tipos mascota, Users | 7 | 0 |
| **TOTAL** | **24 historias** | **56** | **4** |

## Cobertura por módulo

| Módulo | Endpoints | Probados | ✅ OK | ⚠️ Parcial | ❌ Falla |
| --- | --- | --- | --- | --- | --- |
| **Auth** | 6 | 6 | 6 | 0 | 0 |
| **Users** | 9 | 9 | 9 | 0 | 0 |
| **Tipos Mascota** | 3 | 3 | 3 | 0 | 0 |
| **Pets** | 24 | 24 | 24 | 0 | 0 |
| **Geofencing** | 10 | 10 | 10 | 0 | 0 |
| **Map** | 2 | 2 | 2 | 0 | 0 |
| **WebSocket** | 1 namespace | 1 | 1 | 0 | 0 |
| **TOTAL** | **54 + 1 WS** | **54** | **54** | **0** | **0** |

## Cifras

- **Tasa de éxito (happy path):** 54/54 = **100 %**
- **Bugs críticos:** 0 ✅ (E1 resuelto)
- **Bugs medios:** 0 ✅ (E2, E3 resueltos)
- **Mejoras menores:** 0 ✅ (E4, E5 resueltos)
- **Tests unitarios:** 256/256 en verde

## Verificación de flujos clave

- ✅ **Sesión persistente** — refresh tokens con rotación + invalidación post-logout
- ✅ **RBAC** — admin vs usuario, `RolesGuard` operativo
- ✅ **Subida a Cloudinary** — perfil + fotos de mascota
- ✅ **PostGIS** — `ST_DWithin`, `ST_Y/ST_X`, `ST_SetSRID`, polígonos GeoJSON
- ✅ **QR PNG y SVG** — PNG para pantalla, SVG vectorial para impresión/PDF en Android
- ✅ **QR público sin auth** — perfil completo + registro de escaneo con GPS opcional
- ✅ **WebSocket realtime** — JWT en handshake, auto-join a rooms, 10 eventos documentados
- ✅ **Co-propietarios por email** — lookup por `correoElectronico`, no requiere conocer el UUID
- ✅ **Alerta comunitaria manual** — `POST /alert/community` con radio configurable
- ✅ **Notificaciones FCM** — `sendPetLostAlert`, `sendQrScanAlert`, `sendZoneAlert`, `sendRadiusAlert`; todos envueltos en try/catch, no tumban el servidor

## Próximos pasos

1. Implementar módulo de Avistamientos (H18 + H20 — Sprint 4).
2. Probar FCM end-to-end con device token Kotlin real.
3. Agregar tests de integración para la transición `extraviada` y prevenir regresiones de E1.

---
