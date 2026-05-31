# Avistamientos — Sistema Completo de Chat, Calificaciones y Reputación

> **Última actualización:** Mayo 2026  
> **Base URL:** `http://localhost:3000` (dev) — reemplazar por URL de producción  
> **Swagger:** `GET /api/docs` → sección **Sightings**

---

## Cambios respecto a la versión anterior

| Estado | Endpoint | Detalle |
|--------|----------|---------|
| ✅ Sin cambios | `POST /sightings/pets/:petId` | Igual, ahora también notifica |
| ✅ Sin cambios | `GET /sightings/pets/:petId` | Igual |
| ✅ Actualizado | `POST /sightings/:id/comments` | Ahora acepta `replyToUserId` |
| ✅ Actualizado | `GET /sightings/:id/comments` | Ahora requiere JWT, filtra por rol |
| 🔄 Reemplazado | `POST /sightings/:id/rating` | Body cambia completamente — ver abajo |
| ❌ Eliminado | `GET /sightings/:id/rating` | Reemplazado por el de abajo |
| 🆕 Nuevo | `GET /sightings/:id/ratings` | Plural, devuelve array con reputación |
| 🆕 Nuevo | `PUT /sightings/:id/read` | Marca hilo como leído |
| 🆕 Nuevo | `GET /sightings/my-pets/threads` | Lista del dueño (pestaña "Mis mascotas") |
| 🆕 Nuevo | `GET /sightings/my-participations` | Lista del rescatista (pestaña "Ayudé") |
| 🆕 Nuevo | `GET /sightings/unread-count` | Badge del navbar |
| ✅ Actualizado | `GET /users/me` | Ahora incluye `reputacion` y `totalCalificaciones` |
| ✅ Actualizado | `GET /users/:personaId/card` | Ahora incluye `reputacion` y `totalCalificaciones` |

---

## Índice

1. [Cómo funciona el sistema completo](#1-cómo-funciona-el-sistema-completo)
2. [Regla de privacidad GPS](#2-regla-de-privacidad-gps)
3. [Sistema de hilos bilaterales](#3-sistema-de-hilos-bilaterales)
4. [Sistema de no leídos](#4-sistema-de-no-leídos)
5. [Sistema de reputación](#5-sistema-de-reputación)
6. [Endpoints — referencia completa](#6-endpoints--referencia-completa)
7. [Eventos en tiempo real](#7-eventos-en-tiempo-real)
8. [Flujo recomendado Android](#8-flujo-recomendado-android)

---

## 1. Cómo funciona el sistema completo

```
1. Alguien ve la mascota en la calle
       ↓
2. Reporta avistamiento (sin cuenta)
   POST /sightings/pets/{petId}
       ↓
3. El dueño recibe push FCM + evento WebSocket sighting:new
       ↓
4. El dueño abre la pantalla de conversaciones
   GET /sightings/my-pets/threads   → ve sus mascotas con actividad
       ↓
5. El rescatista (u otro usuario) comenta con más info
   POST /sightings/{id}/comments
       ↓
6. El dueño recibe push FCM + WebSocket sighting:comment-new
   → badge del navbar sube automáticamente (noLeidos + 1)
       ↓
7. El dueño abre el hilo y le responde en privado
   PUT /sightings/{id}/read          ← marca como leído (badge baja a 0)
   POST /sightings/{id}/comments     con replyToUserId
       ↓
8. Acuerdan el punto de entrega
       ↓
9. Dueño califica al rescatista (opcional, como Google Play)
   POST /sightings/{id}/rating
       ↓
10. Reputación del rescatista sube y es visible en su perfil público
```

**Reglas de diseño:**
- Reportar avistamiento → **no requiere cuenta**
- Comentar → **requiere cuenta** (para hilos privados y reputación)
- Calificar → **opcional**, solo el dueño, solo a quien comentó
- No leídos → **server-side** (funciona en múltiples dispositivos)

---

## 2. Regla de privacidad GPS

**El problema:** Alguien ve la mascota a las 2 pm, llega a su casa y lo reporta a las 8 pm. Si se guarda su ubicación en ese momento, se expone dónde vive.

**La regla:** `lat/lng` en comentarios **solo se guarda si el comentario incluye foto**. Con foto, el usuario estaba físicamente ahí cuando la sacó. Sin foto, las coordenadas se descartan aunque se envíen.

```
¿Comentario incluye foto?
    Sí → guardar lat + lng + foto
    No → descartar lat/lng (aunque lleguen en el body)
```

**En la respuesta:**
```json
// Con foto → coordenadas guardadas
{ "fotoUrl": "https://cloudinary.com/...", "lat": -17.39, "lng": -66.15 }

// Sin foto → coordenadas descartadas
{ "fotoUrl": null, "lat": null, "lng": null }
```

**Qué debe hacer el frontend:** Solo activar el GPS cuando el usuario adjunte una foto. Sin foto, no pedir GPS.

---

## 3. Sistema de hilos bilaterales

Cuando varios usuarios comentan en el mismo avistamiento, **no se ven entre sí**. Solo el dueño ve todo.

```
¿Quién hace GET /sightings/{id}/comments?
    Es el dueño → ve TODOS los comentarios de todos
    Es otro usuario → ve solo:
        • Sus propios comentarios (autor_usuario_id = yo)
        • Las respuestas del dueño dirigidas a él (reply_to_user_id = yo)
```

**Ejemplo real con 3 usuarios — lo que ve cada uno:**

| Usuario | Comentarios visibles |
|---------|---------------------|
| Wilian (dueño) | Los 3: Carlos, la respuesta propia a Carlos, Ana |
| Carlos | Solo 2: su comentario + la respuesta del dueño a él |
| Ana | Solo 1: su propio comentario |

**Cómo el dueño responde en privado a alguien:**  
Usa el mismo endpoint de comentar pero agrega `replyToUserId`:
```json
POST /sightings/{id}/comments
{ "mensaje": "Gracias, ¿a qué hora fue?", "replyToUserId": "{userId-de-Carlos}" }
```
Ese mensaje solo aparece en el GET de Carlos.

---

## 4. Sistema de no leídos

**Cómo funciona:**  
Cada vez que un usuario abre un hilo, el frontend llama a `PUT /sightings/{id}/read`. Eso guarda un timestamp en la tabla `lecturas_comentarios`. Los "no leídos" son comentarios creados **después** de ese timestamp.

```
noLeidos = comentarios nuevos después de la última lectura

Si nunca abrió el hilo → todos los comentarios cuentan como no leídos
```

**Para el dueño:** cuenta comentarios de rescatistas que no ha visto.  
**Para el rescatista:** cuenta respuestas del dueño dirigidas a él que no ha visto.

**Probado en vivo:**
```
Carlos tiene 1 no leído (respuesta del dueño)
→ GET /sightings/unread-count  →  { "total": 1, "comoRescatista": 1 }
→ PUT /sightings/{id}/read
→ GET /sightings/unread-count  →  { "total": 0, "comoRescatista": 0 }

Wilian tiene 2 no leídos (comentarios de Carlos y Ana)
→ GET /sightings/unread-count  →  { "total": 2, "comoDueno": 2 }
→ PUT /sightings/{id}/read
→ GET /sightings/unread-count  →  { "total": 0, "comoDueno": 0 }

Carlos envía nuevo comentario → badge de Wilian sube a 1 automáticamente
```

**Ventaja sobre client-side:** funciona en múltiples dispositivos, sobrevive reinstalaciones, el badge es confiable.

---

## 5. Sistema de reputación

Funciona como Google Play / Uber Driver Rating:
- **Acumulativo** → cada avistamiento donde ayudaste suma a tu promedio global
- **Opcional** → el dueño decide si califica, sin presión
- **Público** → visible en la tarjeta de perfil del mapa
- **Editable** → el dueño puede cambiar su calificación; el promedio se recalcula

**Reglas:**
- Solo el dueño puede calificar
- Solo puede calificar a quien haya comentado en ese avistamiento
- Una calificación por rescatista por avistamiento (upsert si la edita)

**Fórmula del promedio:**
```
Primera vez:  nuevo = (actual × total + nuevas_estrellas) / (total + 1)
Editando:     nuevo = (actual × total − estrellas_anteriores + nuevas_estrellas) / total
```

**Probado en vivo:**
```
5 estrellas → reputacion: "5.00", totalCalificaciones: 1
Edita a 3   → reputacion: "3.00", totalCalificaciones: 1  ← recalculado correctamente
```

**Dónde aparece sin llamada extra:**
- `GET /users/me` → campo `persona.reputacion` y `persona.totalCalificaciones`
- `GET /users/:personaId/card` → campos `reputacion` y `totalCalificaciones`

---

## 6. Endpoints — referencia completa

### Resumen

| Método | Ruta | Auth | Estado |
|--------|------|------|--------|
| `POST` | `/sightings/pets/:petId` | No | Sin cambios |
| `PUT` | `/sightings/:id/read` | JWT | 🆕 Nuevo |
| `GET` | `/sightings/my-pets/threads` | JWT | 🆕 Nuevo |
| `GET` | `/sightings/my-participations` | JWT | 🆕 Nuevo |
| `GET` | `/sightings/unread-count` | JWT | 🆕 Nuevo |
| `POST` | `/sightings/:id/comments` | JWT | Actualizado (`replyToUserId`) |
| `GET` | `/sightings/:id/comments` | JWT | Actualizado (requiere JWT, filtra) |
| `POST` | `/sightings/:id/rating` | JWT | 🔄 Body cambió completamente |
| `GET` | `/sightings/:id/ratings` | No | 🆕 Reemplaza al antiguo singular |

---

### POST /sightings/pets/:petId — Reportar avistamiento

```
Content-Type: multipart/form-data
Sin token requerido
```

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `lat` | number | Sí | Latitud (-90 a 90) |
| `lng` | number | Sí | Longitud (-180 a 180) |
| `mensajeRescatista` | string | No | Descripción (máx. 500 chars) |
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

**Dispara:** FCM push `¡Vieron a {nombre}!` + WebSocket `sighting:new`

**Errores:** `404` mascota no existe · `400` lat/lng inválidos

---

### PUT /sightings/:id/read — Marcar hilo como leído 🆕

```
Authorization: Bearer {token}
Sin body
```

Llamar cada vez que el usuario **abre** un hilo de conversación. Guarda el timestamp actual como punto de lectura. Los comentarios anteriores a ese timestamp dejan de contar como no leídos.

**Respuesta `200`:**
```json
{ "ok": true }
```

**Errores:** `401` sin token · `404` avistamiento no existe

---

### GET /sightings/my-pets/threads — Lista del dueño 🆕

```
Authorization: Bearer {token}
```

Devuelve todas las mascotas del usuario con el avistamiento más reciente que tenga actividad de comentarios. Si una mascota no tiene conversaciones, aparece con `avistamiento: null`.

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

- `totalHilos` → cantidad de comentaristas distintos (excluyendo al dueño)
- `noLeidos` → comentarios de rescatistas que el dueño no ha visto
- `avistamiento: null` → la mascota no tiene conversaciones activas

**Errores:** `401` sin token

---

### GET /sightings/my-participations — Lista del rescatista 🆕

```
Authorization: Bearer {token}
```

Devuelve los avistamientos donde el usuario autenticado comentó, con el último mensaje propio, la última respuesta del dueño y la calificación recibida.

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
    "noLeidos": 1,
    "calificacion": {
      "estrellas": 3,
      "mensaje": "Fue bueno pero tardó en responder"
    }
  }
]
```

- `ultimaRespuesta` → último mensaje del dueño dirigido a este usuario (`null` si no respondió)
- `noLeidos` → respuestas del dueño que el rescatista no ha visto
- `calificacion: null` → el dueño aún no calificó

**Errores:** `401` sin token

---

### GET /sightings/unread-count — Badge del navbar 🆕

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

- `comoDueno` → comentarios de rescatistas sin leer en sus mascotas
- `comoRescatista` → respuestas del dueño sin leer dirigidas a él
- `total` → suma de ambos para el badge del navbar

**Errores:** `401` sin token

---

### POST /sightings/:id/comments — Comentar o responder

```
Content-Type: multipart/form-data
Authorization: Bearer {token}
```

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `mensaje` | string | Sí | Texto (máx. 500 chars) |
| `lat` | number | No | Solo se guarda con foto (regla de privacidad) |
| `lng` | number | No | Solo se guarda con foto (regla de privacidad) |
| `replyToUserId` | UUID | No | **Solo el dueño** — ID del comentarista al que responde |
| `foto` | archivo | No | Foto de evidencia |

**Respuesta `201` — comentarista:**
```json
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
```

**Respuesta `201` — dueño respondiendo:**
```json
{
  "comentarioId": "c597de41-...",
  "autorUsuarioId": "145b307f-...",
  "replyToUserId": "76a6e9ff-...",
  "mensaje": "Gracias Carlos, ¿a qué hora fue exactamente?",
  "creadoEl": "2026-05-30T17:06:06.293Z",
  "autor": { "nombre": "Wilian", "apellidoPaterno": "Almendras", "fotoPerfilUrl": "..." }
}
```

**Dispara:** FCM push `Nuevo comentario sobre {nombre}` + WebSocket `sighting:comment-new`

**Errores:** `401` sin token · `404` avistamiento no existe · `400` mensaje inválido

---

### GET /sightings/:id/comments — Ver comentarios

```
Authorization: Bearer {token}
```

> **Requiere JWT.** La respuesta varía según el rol — ver [Sistema de hilos bilaterales](#3-sistema-de-hilos-bilaterales).

Array ordenado del más antiguo al más nuevo. Cada elemento:
```json
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
```

Retorna `[]` si no hay comentarios visibles para ese usuario.

**Errores:** `401` sin token · `404` avistamiento no existe

---

### POST /sightings/:id/rating — Calificar rescatista 🔄

> **Body completamente diferente al anterior.** El campo `confirmado` ya no existe.

```
Content-Type: application/json
Authorization: Bearer {token}
```

Solo el dueño puede calificar. Solo puede calificar a quien haya comentado. Hace upsert (si ya calificó, actualiza y recalcula el promedio).

```json
{
  "rescatistaUsuarioId": "76a6e9ff-a9df-44f7-ad82-01a039c4a724",
  "estrellas": 5,
  "mensaje": "Fue muy preciso, nos ayudó a encontrarlo"
}
```

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `rescatistaUsuarioId` | UUID | Sí | ID del comentarista a calificar |
| `estrellas` | integer | Sí | 1 a 5 |
| `mensaje` | string | No | Comentario opcional (máx. 300 chars) |

**Respuesta `201`:**
```json
{
  "calificacionId": "e5d0b297-...",
  "avistamientoId": "35dc7fcf-...",
  "autorUsuarioId": "145b307f-...",
  "rescatistaUsuarioId": "76a6e9ff-...",
  "estrellas": 5,
  "mensaje": "Fue muy preciso, nos ayudó a encontrarlo",
  "creadoEl": "2026-05-31T02:59:15.328Z"
}
```

**Dispara:** WebSocket `sighting:rated`

**Errores:** `401` · `403` no es dueño · `404` avistamiento no existe · `400` estrellas fuera de rango o rescatista no comentó

---

### GET /sightings/:id/ratings — Ver calificaciones 🆕

> Reemplaza al antiguo `GET /sightings/:id/rating` (singular). Ahora devuelve **array**, no objeto.

```
Sin token requerido
```

**Respuesta `200`:**
```json
[
  {
    "calificacionId": "e5d0b297-...",
    "avistamientoId": "35dc7fcf-...",
    "estrellas": 5,
    "mensaje": "Fue muy preciso",
    "creadoEl": "2026-05-31T02:59:15.328Z",
    "rescatista": {
      "usuarioId": "76a6e9ff-...",
      "persona": {
        "nombre": "Carlos",
        "apellidoPaterno": "Lopez",
        "fotoPerfilUrl": null,
        "reputacion": "3.00",
        "totalCalificaciones": 1
      }
    }
  }
]
```

Retorna `[]` si el dueño aún no calificó a nadie.

**Errores:** `404` avistamiento no existe

---

## 7. Eventos en tiempo real

### WebSocket — namespace `/realtime`, room `pet:{mascotaId}`

Unirse al room al conectarse para recibir eventos de esa mascota.

| Evento | Cuándo | Payload |
|--------|--------|---------|
| `sighting:new` | Al crear avistamiento | `{ avistamientoId, lat, lng, fotoUrl, mensaje, fechaAvistamiento }` |
| `sighting:comment-new` | Al comentar | `{ comentarioId, avistamientoId, mensaje, fotoUrl, lat?, lng?, creadoEl }` |
| `sighting:rated` | Al calificar | `{ avistamientoId, rescatistaUsuarioId, estrellas }` |

### FCM push — campo `data`

| `tipo` | Campos extra | Pantalla sugerida |
|--------|-------------|-------------------|
| `nuevo_avistamiento` | `mascotaId` | Lista de avistamientos de la mascota |
| `comentario_avistamiento` | `mascotaId`, `avistamientoId` | Hilo del avistamiento |

---

## 8. Flujo recomendado Android

### Pantalla de chat (dos pestañas con swipe)

```
Pestaña 1 — "Mis mascotas" (dueño)
  Al abrir:
    → GET /sightings/my-pets/threads
    → Mostrar badge con suma de noLeidos de todos los avistamientos

  Al tocar un hilo:
    → PUT /sightings/{id}/read          ← inmediatamente al abrir
    → GET /sightings/{id}/comments      ← con token propio
    → Escuchar WebSocket sighting:comment-new → agregar al hilo en tiempo real

  En cada comentario: botón "Responder"
    → POST /sightings/{id}/comments  con replyToUserId = autorUsuarioId del comentario

  En cada comentario: botón "Calificar" (opcional, mostrar solo si no calificó aún)
    → POST /sightings/{id}/rating
       con rescatistaUsuarioId + estrellas + mensaje opcional
    → Puede editarse después (upsert)

Pestaña 2 — "Ayudé" (rescatista)
  Al abrir:
    → GET /sightings/my-participations
    → Mostrar badge con suma de noLeidos

  Al tocar un hilo:
    → PUT /sightings/{id}/read          ← inmediatamente al abrir
    → GET /sightings/{id}/comments      ← con token propio
    → Escuchar WebSocket sighting:comment-new

  Para comentar:
    → Botón "Comentar"
    → ¿Adjunta foto? → activar GPS y enviar lat + lng
    → Sin foto → NO pedir GPS
    → POST /sightings/{id}/comments  (sin replyToUserId)
```

### Badge del navbar

```
Al iniciar sesión y al volver a la app:
  → GET /sightings/unread-count
  → Mostrar total en el ícono de Chat del navbar

Actualizar en tiempo real:
  → Cuando llega WebSocket sighting:comment-new → incrementar badge +1
  → Cuando el usuario abre un hilo → PUT /:id/read → decrementar según noLeidos que tenía
```

### Tarjeta pública de rescatista (popup del mapa)

```
→ GET /users/{personaId}/card
→ Mostrar: "4.8 ★  (12 calificaciones)"
   reputacion + totalCalificaciones ya vienen en la respuesta
```

### DTOs de Android que deben actualizarse

**`SightingCommentDto` — agregar campo:**
```kotlin
@SerializedName("replyToUserId") val replyToUserId: String?
```

**`CreateRatingRequest` — reescribir:**
```kotlin
// Antes (ya no funciona):
data class CreateRatingRequest(val confirmado: Boolean, val estrellas: Int)

// Ahora:
data class CreateRatingRequest(
    val rescatistaUsuarioId: String,
    val estrellas: Int,
    val mensaje: String? = null
)
```

**`SightingRatingDto` — reescribir:**
```kotlin
data class SightingRatingDto(
    val calificacionId: String,
    val avistamientoId: String,
    val autorUsuarioId: String,
    val rescatistaUsuarioId: String,
    val estrellas: Int,
    val mensaje: String?,
    val creadoEl: String,
    val rescatista: RescatistaDto?
)

data class RescatistaDto(
    val usuarioId: String,
    val persona: PersonaReputacionDto
)

data class PersonaReputacionDto(
    val nombre: String?,
    val apellidoPaterno: String?,
    val fotoPerfilUrl: String?,
    val reputacion: String?,
    val totalCalificaciones: Int?
)
```
