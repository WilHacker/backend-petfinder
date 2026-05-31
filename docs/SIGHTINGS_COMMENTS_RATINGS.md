# Avistamientos y Chat Comunitario

> **Última actualización:** Mayo 2026  
> **Base URL:** `http://localhost:3000` (dev)  
> **Swagger:** `GET /api/docs` → sección **Sightings**

---

## Cómo funciona el sistema

### Flujo completo

```
1. Alguien ve una mascota perdida en la calle
       ↓
2. Reporta el avistamiento con su ubicación
   → puede adjuntar foto + texto, solo texto, o solo foto
   → si adjunta foto → se guarda su GPS (estaba físicamente ahí)
   POST /sightings/pets/{petId}   [sin cuenta requerida]
       ↓
3. El dueño recibe notificación inmediata
   → push FCM: "¡Vieron a {nombre}!"
   → WebSocket: evento sighting:new (si tiene la app abierta)
       ↓
4. El dueño abre la pantalla de conversaciones
   GET /sightings/my-pets/threads   → lista sus mascotas con actividad
       ↓
5. El dueño entra al hilo y ve los comentarios
   PUT /sightings/{id}/read         → marca como leído (badge baja a 0)
   GET /sightings/{id}/comments     → ve todos los mensajes del hilo
       ↓
6. El dueño y el que ayudó chatean en privado
   → ambos pueden enviar foto + texto, solo texto, o solo foto
   → si el que ayuda envía foto → se captura su GPS
   → el dueño responde con replyToUserId para que sea mensaje privado
   POST /sightings/{id}/comments
       ↓
7. Acuerdan cómo y dónde devolver la mascota
```

### Reglas del sistema

**Privacidad GPS en comentarios:**  
Solo se guarda la ubicación cuando el mensaje incluye foto. Si alguien vio la mascota a las 2 pm y lo reporta a las 8 pm desde su casa, sin foto no se guarda su ubicación y no se expone dónde vive.

```
¿El mensaje incluye foto?
    Sí → guardar lat + lng
    No → descartar lat/lng aunque lleguen en el body
```

**Hilos privados bilaterales:**  
Cada conversación es privada entre el dueño y cada persona que ayudó. Dos personas que ayudaron no se ven entre sí.

```
¿Quién hace GET /sightings/{id}/comments?
    El dueño    → ve todos los mensajes de todos
    Otro usuario → ve solo sus mensajes + respuestas del dueño a él
```

**Comentarios sin cuenta:**  
Reportar un avistamiento no requiere cuenta. Comentar sí, porque eso habilita el chat privado y el tracking de no leídos.

**Contenido mínimo:**  
Un comentario o mensaje de chat debe tener al menos foto o texto — no puede estar completamente vacío.

---

## Endpoints

### Resumen

| Método | Ruta | Auth | Para qué sirve |
|--------|------|------|----------------|
| `POST` | `/sightings/pets/:petId` | No | Reportar avistamiento |
| `GET` | `/sightings/pets/:petId` | JWT | Ver avistamientos de mi mascota |
| `POST` | `/sightings/:id/comments` | JWT | Enviar mensaje en el hilo |
| `GET` | `/sightings/:id/comments` | JWT | Ver mensajes (filtrado por rol) |
| `PUT` | `/sightings/:id/read` | JWT | Marcar hilo como leído |
| `GET` | `/sightings/my-pets/threads` | JWT | Lista de conversaciones del dueño |
| `GET` | `/sightings/my-participations` | JWT | Lista de conversaciones del que ayudó |
| `GET` | `/sightings/unread-count` | JWT | Badge de no leídos para el navbar |

---

### POST /sightings/pets/:petId — Reportar avistamiento

```
Content-Type: multipart/form-data
Sin token requerido
```

Cualquier persona puede reportar que vio una mascota. Puede enviar foto + texto, solo texto, o solo foto. Si adjunta foto, se guarda su ubicación (estaba físicamente ahí).

**Body:**

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `lat` | number | Sí | Latitud donde se vio la mascota |
| `lng` | number | Sí | Longitud donde se vio la mascota |
| `mensajeRescatista` | string | No | Descripción de lo que vio (máx. 500 chars) |
| `foto` | archivo | No | Foto de evidencia |

**Respuesta `201`:**
```json
{
  "avistamientoId": "35dc7fcf-edfd-44da-8c33-0d23c9dfd585",
  "mascotaId": "1b0cac91-3932-4091-91a4-8ff502d7a223",
  "mensajeRescatista": "Lo vi corriendo por la plaza principal",
  "fotoEvidenciaUrl": null,
  "fechaAvistamiento": "2026-05-30T17:05:54.266Z",
  "lat": -17.3935,
  "lng": -66.157
}
```

**Notificaciones automáticas al dueño:**
- FCM push: *"¡Vieron a {nombre}!"*
- WebSocket `sighting:new` en room `pet:{mascotaId}`

**Errores:**

| Código | Causa |
|--------|-------|
| `404` | La mascota no existe |
| `400` | `lat` o `lng` faltantes o fuera de rango |

---

### POST /sightings/:id/comments — Enviar mensaje en el hilo

```
Content-Type: multipart/form-data
Authorization: Bearer {token}
```

Sirve para dos cosas:
- **Comentarista** → aportar información adicional al avistamiento
- **Dueño** → responder en privado a un comentarista específico (con `replyToUserId`)

Puede enviarse foto + texto, solo texto, o solo foto. Si se adjunta foto y el que ayuda envía sus coordenadas, se guarda su ubicación.

**Body:**

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `mensaje` | string | No* | Texto del mensaje (máx. 500 chars) |
| `lat` | number | No | Latitud — **solo se guarda si se adjunta foto** |
| `lng` | number | No | Longitud — **solo se guarda si se adjunta foto** |
| `replyToUserId` | UUID | No | **Solo el dueño** — ID del comentarista al que responde |
| `foto` | archivo | No* | Foto de evidencia |

> \* Debe llegar al menos `mensaje` o `foto`. Si no viene ninguno → `400`.  
> `replyToUserId` es exclusivo del dueño. Un comentarista nunca lo envía.

**Respuesta `201` — comentarista enviando texto:**
```json
{
  "comentarioId": "34f73509-bdf2-4737-9380-177a384b07d2",
  "avistamientoId": "35dc7fcf-edfd-44da-8c33-0d23c9dfd585",
  "autorUsuarioId": "76a6e9ff-a9df-44f7-ad82-01a039c4a724",
  "replyToUserId": null,
  "mensaje": "Era un perro café con collar azul, estaba tranquilo",
  "fotoUrl": null,
  "lat": null,
  "lng": null,
  "creadoEl": "2026-05-30T17:06:05.596Z",
  "autor": { "nombre": "Carlos", "apellidoPaterno": "Lopez", "fotoPerfilUrl": null }
}
```

**Respuesta `201` — comentarista enviando foto (GPS capturado):**
```json
{
  "comentarioId": "811f605b-5902-4e32-9aaa-c498b69113e1",
  "avistamientoId": "35dc7fcf-edfd-44da-8c33-0d23c9dfd585",
  "autorUsuarioId": "76a6e9ff-a9df-44f7-ad82-01a039c4a724",
  "replyToUserId": null,
  "mensaje": null,
  "fotoUrl": "https://res.cloudinary.com/.../foto.png",
  "lat": -17.39,
  "lng": -66.155,
  "creadoEl": "2026-05-30T15:58:39.519Z",
  "autor": { "nombre": "Carlos", "apellidoPaterno": "Lopez", "fotoPerfilUrl": null }
}
```

**Respuesta `201` — dueño respondiendo en privado a Carlos:**
```json
{
  "comentarioId": "c597de41-c6ae-48dc-833b-e3991584ab64",
  "avistamientoId": "35dc7fcf-edfd-44da-8c33-0d23c9dfd585",
  "autorUsuarioId": "145b307f-1d35-4ff6-9557-85070e8c6ddc",
  "replyToUserId": "76a6e9ff-a9df-44f7-ad82-01a039c4a724",
  "mensaje": "Gracias Carlos, ¿a qué hora fue exactamente?",
  "fotoUrl": null,
  "lat": null,
  "lng": null,
  "creadoEl": "2026-05-30T17:06:06.293Z",
  "autor": { "nombre": "Wilian", "apellidoPaterno": "Almendras", "fotoPerfilUrl": "https://res.cloudinary.com/..." }
}
```

**Notificaciones automáticas al dueño:**
- FCM push: *"Nuevo comentario sobre {nombre}"*
- WebSocket `sighting:comment-new` en room `pet:{mascotaId}`

**Errores:**

| Código | Causa |
|--------|-------|
| `401` | Sin token o token vencido |
| `404` | El avistamiento no existe |
| `400` | No se envió ni mensaje ni foto |

---

### GET /sightings/:id/comments — Ver mensajes del hilo

```
Authorization: Bearer {token}
```

Devuelve los mensajes filtrados según el rol del solicitante:

| Rol | Qué ve |
|-----|--------|
| Dueño de la mascota | Todos los mensajes de todos los usuarios |
| Cualquier otro usuario | Solo sus mensajes + las respuestas del dueño dirigidas a él |

Array ordenado del más antiguo al más nuevo:

```json
[
  {
    "comentarioId": "34f73509-...",
    "avistamientoId": "35dc7fcf-...",
    "autorUsuarioId": "76a6e9ff-...",
    "replyToUserId": null,
    "mensaje": "Era un perro café con collar azul",
    "fotoUrl": null,
    "lat": null,
    "lng": null,
    "creadoEl": "2026-05-30T17:06:05.596Z",
    "autor": { "nombre": "Carlos", "apellidoPaterno": "Lopez", "fotoPerfilUrl": null }
  }
]
```

- `replyToUserId != null` → es una respuesta privada del dueño a ese usuario
- `mensaje` puede ser `null` si el mensaje era solo foto
- `lat`/`lng` son `null` si el mensaje no tenía foto

Retorna `[]` si no hay mensajes visibles para ese usuario.

**Errores:**

| Código | Causa |
|--------|-------|
| `401` | Sin token o token vencido |
| `404` | El avistamiento no existe |

---

### PUT /sightings/:id/read — Marcar hilo como leído

```
Authorization: Bearer {token}
Sin body
```

Llamar **cada vez que el usuario abre un hilo**. Registra el timestamp actual como punto de lectura. Los mensajes anteriores a ese punto dejan de contar como no leídos.

**Respuesta `200`:**
```json
{ "ok": true }
```

**Errores:**

| Código | Causa |
|--------|-------|
| `401` | Sin token o token vencido |
| `404` | El avistamiento no existe |

---

### GET /sightings/my-pets/threads — Conversaciones del dueño

```
Authorization: Bearer {token}
```

Lista todas las mascotas del usuario con el avistamiento más reciente que tenga actividad de mensajes. Si una mascota no tiene conversaciones, aparece con `avistamiento: null`.

**Respuesta `200`:**
```json
[
  {
    "mascota": {
      "mascotaId": "1b0cac91-...",
      "nombre": "Firulais",
      "estado": "extraviada",
      "fotoUrl": "https://cloudinary.com/..."
    },
    "avistamiento": {
      "avistamientoId": "35dc7fcf-...",
      "fechaAvistamiento": "2026-05-30T17:05:54.266Z",
      "totalHilos": 2,
      "ultimaActividad": "2026-05-30T17:06:31.790Z",
      "ultimoMensaje": "¿Ya encontraron a Firulais?",
      "noLeidos": 1
    }
  },
  {
    "mascota": {
      "mascotaId": "7c76b5e2-...",
      "nombre": "Perla",
      "estado": "en_casa",
      "fotoUrl": null
    },
    "avistamiento": null
  }
]
```

- `totalHilos` → cantidad de personas distintas que comentaron (excluyendo al dueño)
- `noLeidos` → mensajes de colaboradores que el dueño no ha visto todavía
- `avistamiento: null` → la mascota no tiene conversaciones activas

**Errores:** `401` sin token

---

### GET /sightings/my-participations — Conversaciones del que ayudó

```
Authorization: Bearer {token}
```

Lista los avistamientos donde el usuario autenticado comentó, con el último mensaje propio y la última respuesta del dueño.

**Respuesta `200`:**
```json
[
  {
    "avistamientoId": "35dc7fcf-...",
    "mascota": {
      "mascotaId": "1b0cac91-...",
      "nombre": "Firulais",
      "estado": "extraviada",
      "fotoUrl": "https://cloudinary.com/..."
    },
    "dueno": {
      "nombre": "Wilian",
      "fotoPerfilUrl": "https://cloudinary.com/..."
    },
    "miUltimoMensaje": "Era un perro café con collar azul",
    "ultimaRespuesta": "Gracias Carlos, ¿a qué hora fue exactamente?",
    "ultimaActividad": "2026-05-30T17:06:06.293Z",
    "noLeidos": 1
  }
]
```

- `ultimaRespuesta` → último mensaje del dueño dirigido a este usuario (`null` si no ha respondido)
- `noLeidos` → respuestas del dueño que el usuario no ha visto
- `miUltimoMensaje` puede ser `null` si el último mensaje fue solo foto

**Errores:** `401` sin token

---

### GET /sightings/unread-count — Badge del navbar

```
Authorization: Bearer {token}
```

**Respuesta `200`:**
```json
{
  "total": 3,
  "comoDueno": 2,
  "comoRescatista": 1
}
```

- `comoDueno` → mensajes de colaboradores sin leer en sus mascotas
- `comoRescatista` → respuestas del dueño sin leer dirigidas a él
- `total` → suma de ambos, para el badge del ícono de chat en el navbar

**Errores:** `401` sin token

---

## Eventos en tiempo real

### WebSocket — namespace `/realtime`, room `pet:{mascotaId}`

El cliente debe unirse al room al conectarse para recibir eventos de esa mascota.

| Evento | Cuándo se emite | Payload |
|--------|-----------------|---------|
| `sighting:new` | Al reportar avistamiento | `{ avistamientoId, lat, lng, fotoUrl, mensaje, fechaAvistamiento }` |
| `sighting:comment-new` | Al enviar un mensaje | `{ comentarioId, avistamientoId, mensaje, fotoUrl, lat?, lng?, creadoEl }` |

> `mensaje` puede ser `null` en ambos payloads cuando el mensaje era solo foto.

### FCM push — campo `data`

| `tipo` | Campos adicionales | Pantalla sugerida |
|--------|-------------------|-------------------|
| `nuevo_avistamiento` | `mascotaId` | Lista de avistamientos de la mascota |
| `comentario_avistamiento` | `mascotaId`, `avistamientoId` | Hilo de conversación del avistamiento |

---

## Flujo recomendado Android

### Pantalla de Chat (dos pestañas con swipe)

```
Navbar: ícono 💬 con badge → GET /sightings/unread-count al iniciar sesión y al volver a la app
El badge sube automáticamente con WebSocket sighting:comment-new

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pestaña 1 — "Mis mascotas" (rol dueño)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Al abrir:
  → GET /sightings/my-pets/threads

Cada tarjeta muestra:
  - Foto y nombre de la mascota
  - Último mensaje del hilo
  - Tiempo desde la última actividad
  - Badge con noLeidos

Al tocar una tarjeta:
  → PUT /sightings/{id}/read          ← INMEDIATAMENTE al abrir el hilo
  → GET /sightings/{id}/comments      ← cargar mensajes
  → Escuchar WebSocket sighting:comment-new → agregar al hilo en tiempo real

En el hilo, el dueño puede:
  → Escribir texto, adjuntar foto, o ambos
  → POST /sightings/{id}/comments  con replyToUserId = autorUsuarioId del comentarista
  → Si adjunta foto → activar GPS y enviar lat/lng
  → Si solo texto → NO pedir GPS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pestaña 2 — "Ayudé" (rol colaborador)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Al abrir:
  → GET /sightings/my-participations

Cada tarjeta muestra:
  - Foto y nombre de la mascota
  - Nombre del dueño
  - Último mensaje propio + última respuesta del dueño
  - Badge con noLeidos

Al tocar una tarjeta:
  → PUT /sightings/{id}/read          ← INMEDIATAMENTE al abrir
  → GET /sightings/{id}/comments      ← cargar mensajes del hilo propio
  → Escuchar WebSocket sighting:comment-new

En el hilo, el colaborador puede:
  → Escribir texto, adjuntar foto, o ambos
  → POST /sightings/{id}/comments  (SIN replyToUserId)
  → Si adjunta foto → activar GPS y enviar lat/lng
  → Si solo texto → NO pedir GPS
```

### Regla GPS para el frontend

```
¿El usuario adjunta foto?
    Sí → solicitar permiso de ubicación → enviar lat + lng junto con la foto
    No → NO solicitar ubicación, no enviar lat/lng
```

### DTOs de Android que necesitan actualizarse

**`SightingCommentDto` — `mensaje` pasa a ser nullable:**
```kotlin
data class SightingCommentDto(
    val comentarioId: String,
    val avistamientoId: String,
    val autorUsuarioId: String?,
    val replyToUserId: String?,   // nuevo
    val mensaje: String?,         // ahora nullable — puede ser solo foto
    val fotoUrl: String?,
    val lat: Double?,
    val lng: Double?,
    val creadoEl: String,
    val autor: AutorDto?
)
```

**`CreateCommentRequest` — `mensaje` pasa a ser opcional:**
```kotlin
data class CreateCommentRequest(
    val mensaje: String? = null,     // opcional: puede enviarse solo foto
    val lat: Double? = null,
    val lng: Double? = null,
    val replyToUserId: String? = null
    // foto va como MultipartBody.Part separado
)
```

> Eliminar completamente `CreateRatingRequest`, `SightingRatingDto`, `RescatistaDto` y `PersonaReputacionDto` — ya no se usan.
