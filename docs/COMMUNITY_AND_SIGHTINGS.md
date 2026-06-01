# Avistamientos, Chat Privado y Alerta Comunitaria

Documentación para el equipo frontend (Android) sobre el sistema de avistamientos con chat bilateral, tracking de no leídos, alerta comunitaria y actualizaciones del mapa en tiempo real.

---

## Índice

1. [Flujo general](#1-flujo-general)
2. [Avistamientos](#2-avistamientos)
3. [Comentarios y chat privado](#3-comentarios-y-chat-privado)
4. [No leídos y threads](#4-no-leídos-y-threads)
5. [Alerta comunitaria](#5-alerta-comunitaria)
6. [Mapa — campo alertaComunidad](#6-mapa--campo-alertacomunidad)
7. [Mapa en tiempo real — pins de mascotas perdidas](#7-mapa-en-tiempo-real--pins-de-mascotas-perdidas)
8. [Eventos WebSocket en tiempo real](#8-eventos-websocket-en-tiempo-real)
9. [DTOs Android a actualizar](#9-dtos-android-a-actualizar)

---

## 1. Flujo general

```
Ciudadano ve mascota perdida
        ↓
POST /sightings/pets/:petId   ← sin JWT, cualquiera puede reportar
        ↓
Dueño recibe push FCM + evento WS sighting:new
        ↓
Dueño abre el avistamiento → GET /sightings/:id/comments
        ↓
Dueño responde usando replyToUserId del ciudadano
        ↓
Ciudadano abre la app → ve noLeidos > 0 en el badge
        ↓
Ciudadano abre el hilo → PUT /sightings/:id/read → badge baja a 0
```

---

## 2. Avistamientos

### `POST /sightings/pets/:petId` — Reportar avistamiento

**Auth:** No requiere JWT (público)  
**Content-Type:** `multipart/form-data`

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `lat` | number | ✅ | Latitud donde se vio la mascota |
| `lng` | number | ✅ | Longitud donde se vio la mascota |
| `mensajeRescatista` | string | ❌ | Descripción del avistamiento |
| `foto` | file | ❌ | Foto de evidencia (imagen) |

**Respuesta `201`:**
```json
{
  "avistamientoId": "uuid",
  "mascotaId": "uuid",
  "mensajeRescatista": "Lo vi cerca del mercado",
  "fotoEvidenciaUrl": "https://res.cloudinary.com/...",
  "fechaAvistamiento": "2026-05-31T14:00:00Z",
  "lat": -17.3935,
  "lng": -66.157
}
```

**Efectos secundarios:**
- Push FCM al dueño (`tipo: "nuevo_avistamiento"`)
- Evento WebSocket `sighting:new` al room `pet:{mascotaId}`

---

### `GET /sightings/pets/:petId` — Listar avistamientos

**Auth:** JWT requerido (solo propietarios/cuidadores de la mascota)

**Respuesta `200`:** Array del mismo objeto que el `POST`.

---

### `GET /sightings/:id` — Ver un avistamiento

**Auth:** Público

**Respuesta `200`:** Mismo objeto de avistamiento.

---

## 3. Comentarios y chat privado

### Regla de privacidad GPS

> La ubicación GPS **solo se guarda** cuando el comentario incluye foto adjunta.  
> Si un usuario comenta sin foto (p. ej. reporta desde su casa horas después), su ubicación **no se registra**.  
> El frontend **no debe solicitar GPS** si el usuario no va a adjuntar una foto.

### Sistema bilateral

- El **dueño** ve todos los comentarios de todos los ciudadanos.
- Un **ciudadano** solo ve sus propios mensajes y las respuestas del dueño dirigidas a él.
- El dueño responde a un ciudadano incluyendo `replyToUserId` con el `autorUsuarioId` del comentario original.

---

### `POST /sightings/:id/comments` — Comentar

**Auth:** JWT requerido  
**Content-Type:** `multipart/form-data`

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `mensaje` | string | ❌* | Texto del comentario (máx. 500 chars) |
| `foto` | file | ❌* | Foto (imagen) |
| `lat` | number | ❌ | Solo útil si se adjunta foto |
| `lng` | number | ❌ | Solo útil si se adjunta foto |
| `replyToUserId` | UUID | ❌ | Dueño usa esto para responder a un ciudadano |

> ⚠️ Al menos uno de `mensaje` o `foto` es obligatorio. Si se envían ambos vacíos → `400`.

**Respuesta `201`:**
```json
{
  "comentarioId": "uuid",
  "avistamientoId": "uuid",
  "autorUsuarioId": "uuid",
  "replyToUserId": null,
  "mensaje": "Lo vi cerca del parque, estaba solo",
  "fotoUrl": null,
  "lat": null,
  "lng": null,
  "creadoEl": "2026-05-31T15:30:00Z",
  "autor": {
    "nombre": "Carlos",
    "apellidoPaterno": "Ríos",
    "fotoPerfilUrl": "https://res.cloudinary.com/..."
  }
}
```

Si el comentario tiene foto + GPS:
```json
{
  "comentarioId": "uuid",
  "avistamientoId": "uuid",
  "autorUsuarioId": "uuid",
  "replyToUserId": null,
  "mensaje": null,
  "fotoUrl": "https://res.cloudinary.com/...",
  "lat": -17.392,
  "lng": -66.154,
  "creadoEl": "2026-05-31T15:30:00Z",
  "autor": { ... }
}
```

**Efectos secundarios:**
- Push FCM al dueño (`tipo: "comentario_avistamiento"`)
- Evento WebSocket `sighting:comment-new` al room `pet:{mascotaId}`

---

### `GET /sightings/:id/comments` — Ver comentarios del hilo

**Auth:** JWT requerido

**Comportamiento según rol:**
- **Dueño de la mascota:** recibe todos los comentarios de todos los ciudadanos
- **Ciudadano:** recibe solo sus propios comentarios + las respuestas del dueño dirigidas a él

**Respuesta `200`:** Array ordenado por fecha ascendente
```json
[
  {
    "comentarioId": "uuid",
    "avistamientoId": "uuid",
    "autorUsuarioId": "uuid-carlos",
    "replyToUserId": null,
    "mensaje": "Lo vi cerca del parque",
    "fotoUrl": null,
    "lat": null,
    "lng": null,
    "creadoEl": "2026-05-31T15:30:00Z",
    "autor": {
      "nombre": "Carlos",
      "apellidoPaterno": "Ríos",
      "fotoPerfilUrl": null
    }
  },
  {
    "comentarioId": "uuid",
    "avistamientoId": "uuid",
    "autorUsuarioId": "uuid-wilian",
    "replyToUserId": "uuid-carlos",
    "mensaje": "Gracias, ¿puedes darme más detalles?",
    "fotoUrl": null,
    "lat": null,
    "lng": null,
    "creadoEl": "2026-05-31T16:00:00Z",
    "autor": {
      "nombre": "Wilian",
      "apellidoPaterno": "Almendras",
      "fotoPerfilUrl": "https://..."
    }
  }
]
```

---

### `PUT /sightings/:id/read` — Marcar hilo como leído

**Auth:** JWT requerido  
**Body:** Vacío

Llamar cada vez que el usuario **abre** un hilo de conversación. Registra el timestamp de lectura. Los mensajes anteriores a este timestamp ya no cuentan como no leídos.

**Respuesta `200`:**
```json
{ "ok": true }
```

---

## 4. No leídos y threads

### `GET /sightings/unread-count` — Badge del navbar

**Auth:** JWT requerido

Retorna el total de mensajes no leídos del usuario autenticado, separado por rol.

**Respuesta `200`:**
```json
{
  "total": 3,
  "comoDueno": 2,
  "comoRescatista": 1
}
```

- `comoDueno`: mensajes en avistamientos de tus mascotas que no leíste
- `comoRescatista`: respuestas del dueño a tus comentarios que no leíste
- Usar `total` para el badge del navbar

---

### `GET /sightings/my-pets/threads` — Pestaña "Mis mascotas"

**Auth:** JWT requerido

Lista todas las mascotas del usuario autenticado. Para cada una, muestra el avistamiento más reciente con actividad de comentarios. Las mascotas sin conversaciones aparecen con `avistamiento: null`.

**Respuesta `200`:**
```json
[
  {
    "mascota": {
      "mascotaId": "uuid",
      "nombre": "Firulais",
      "estado": "extraviada",
      "fotoUrl": "https://..."
    },
    "avistamiento": {
      "avistamientoId": "uuid",
      "fechaAvistamiento": "2026-05-30T16:00:00Z",
      "totalHilos": 2,
      "ultimaActividad": "2026-05-31T15:30:00Z",
      "ultimoMensaje": "Lo vi en el parque",
      "noLeidos": 1
    }
  },
  {
    "mascota": {
      "mascotaId": "uuid",
      "nombre": "Akamaru",
      "estado": "en_casa",
      "fotoUrl": "https://..."
    },
    "avistamiento": null
  }
]
```

- `totalHilos`: cuántos ciudadanos distintos comentaron
- `noLeidos`: mensajes sin leer del dueño en ese avistamiento
- `ultimoMensaje`: puede ser `null` si el último comentario era solo una foto

---

### `GET /sightings/my-participations` — Pestaña "Ayudé"

**Auth:** JWT requerido

Lista los avistamientos donde el usuario autenticado dejó algún comentario, con el resumen del intercambio con el dueño.

**Respuesta `200`:**
```json
[
  {
    "avistamientoId": "uuid",
    "mascota": {
      "mascotaId": "uuid",
      "nombre": "Firulais",
      "estado": "extraviada",
      "fotoUrl": "https://..."
    },
    "dueno": {
      "nombre": "Wilian",
      "fotoPerfilUrl": "https://..."
    },
    "miUltimoMensaje": "Lo vi en la calle Sucre",
    "ultimaRespuesta": "Gracias, ¿puedes ir ahí?",
    "ultimaActividad": "2026-05-31T16:00:00Z",
    "noLeidos": 1
  }
]
```

- `miUltimoMensaje`: tu último comentario en ese avistamiento (puede ser `null` si fue solo foto)
- `ultimaRespuesta`: última respuesta que el dueño te envió (puede ser `null`)
- `noLeidos`: respuestas del dueño dirigidas a ti que aún no leíste

---

## 5. Alerta comunitaria

### `POST /pets/:id/alert/community` — Pedir ayuda a la comunidad

**Auth:** JWT requerido (solo propietarios de la mascota)  
**Content-Type:** `application/json`

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `radio` | number | ❌ | Radio de búsqueda en metros. Default: 5000. Mín: 100. Máx: 50000 |

> ⚠️ La mascota debe tener ubicación GPS registrada (`PUT /pets/:id/location`), de lo contrario retorna `400`.

**Respuesta `200`:**
```json
{
  "message": "Alerta enviada a 4 usuario(s) cercano(s)",
  "usuariosNotificados": 4,
  "expiraEl": "2026-06-02T02:08:51.347Z"
}
```

Si no hay usuarios en el radio:
```json
{
  "message": "No se pudo notificar a nadie",
  "usuariosNotificados": 0,
  "expiraEl": "2026-06-02T02:08:51.347Z",
  "razon": "No hay usuarios con la app activa y GPS conocido dentro del radio de 5 km. Intenta ampliar el radio o espera a que haya más usuarios cerca."
}
```

**Efectos del endpoint:**
1. Marca la alerta como activa en la BD con `expiraEl = ahora + 24 horas`
2. Emite evento WebSocket `community:alert-activated` en broadcast (todos los clientes ven el pin actualizarse en el mapa inmediatamente)
3. Envía push FCM a usuarios activos dentro del radio (`tipo: "alerta_radio"`)

**La alerta expira automáticamente:** El mapa lee `expiraEl` y la considera inactiva cuando `expiraEl < ahora`. No es necesario desactivarla manualmente.

---

## 6. Mapa — campo `alertaComunidad`

Ambos endpoints del mapa ahora incluyen el campo `alertaComunidad` en cada mascota perdida.

### `GET /map/public/lost-pets` y `GET /map/snapshot` → `desaparecidas[]`

**Sin alerta activa:**
```json
{
  "reporteId": 36,
  "mascotaId": "uuid",
  "nombre": "bobby",
  "tipo": "Perro",
  "fotoUrl": "https://...",
  "ubicacion": { "lat": -17.35, "lng": -66.17 },
  "fechaPerdida": "2026-06-01T00:22:09Z",
  "recompensa": 0,
  "alertaComunidad": {
    "activa": false,
    "expiraEl": null
  }
}
```

**Con alerta activa:**
```json
{
  "reporteId": 35,
  "mascotaId": "uuid",
  "nombre": "Firulais",
  "tipo": "Perro",
  "fotoUrl": "https://...",
  "ubicacion": { "lat": -17.465, "lng": -66.211 },
  "fechaPerdida": "2026-05-30T16:22:29Z",
  "recompensa": 0,
  "alertaComunidad": {
    "activa": true,
    "expiraEl": "2026-06-01T02:08:51Z"
  }
}
```

**Cómo usarlo en Android:**
- `activa: true` → mostrar el pin con color/ícono diferente (ej. pulsante rojo)
- `activa: false` → pin normal
- Opcionalmente mostrar un countdown con `expiraEl` en la pantalla de detalle

---

## 7. Mapa en tiempo real — pins de mascotas perdidas

El mapa público nunca necesita polling. El backend emite tres eventos broadcast que permiten mantener los pins actualizados sin recargar la pantalla.

### Cuándo aparece un pin nuevo

Cuando el dueño marca su mascota como `extraviada` (`PUT /pets/:id/status`), el backend:

1. Crea el reporte de extravío en BD
2. Emite `map:lost-pet-added` → **broadcast a todos los clientes conectados**

El Android debe escuchar este evento y agregar el pin al mapa directamente, sin llamar a `GET /map/public/lost-pets`.

### Cuándo desaparece un pin

Cuando el dueño recupera su mascota (cualquier estado distinto de `extraviada`), el backend:

1. Cierra el reporte en BD
2. Emite `map:lost-pet-removed` → **broadcast a todos los clientes conectados**

El Android debe escuchar este evento y eliminar el pin del mapa usando el `mascotaId`.

### Cuándo cambia la apariencia de un pin

Cuando el dueño activa la alerta comunitaria (`POST /pets/:id/alert/community`), el backend emite `community:alert-activated` → **broadcast a todos los clientes conectados**.

El Android actualiza el pin existente para mostrarlo destacado (sin eliminarlo ni agregarlo).

### Resumen de eventos del mapa

| Evento | Acción en el mapa |
| --- | --- |
| `map:lost-pet-added` | Agregar nuevo pin de mascota perdida |
| `map:lost-pet-removed` | Eliminar pin existente por `mascotaId` |
| `community:alert-activated` | Actualizar pin existente a estado "alerta activa" |

> **Importante:** Ninguno de estos eventos requiere estar suscrito a un room específico. Los tres son broadcast — llegan a cualquier cliente conectado al namespace `/realtime`.

---

## 8. Eventos WebSocket en tiempo real

Todos los eventos se reciben en el namespace `/realtime`.

### `sighting:new`
**Room:** `pet:{mascotaId}` — solo propietarios/cuidadores de la mascota  
Se emite cuando alguien reporta un nuevo avistamiento de tu mascota.

```json
{
  "avistamientoId": "uuid",
  "lat": -17.3935,
  "lng": -66.157,
  "fotoUrl": "https://...",
  "mensaje": "Lo vi cerca del mercado",
  "fechaAvistamiento": "2026-05-31T14:00:00Z"
}
```

---

### `sighting:comment-new`
**Room:** `pet:{mascotaId}` — solo propietarios/cuidadores de la mascota  
Se emite cuando alguien deja un comentario en un avistamiento de tu mascota.

```json
{
  "comentarioId": "uuid",
  "avistamientoId": "uuid",
  "mensaje": "Hola, ¿puedes ir ahí?",
  "fotoUrl": null,
  "lat": null,
  "lng": null,
  "creadoEl": "2026-05-31T15:30:00Z"
}
```

> `mensaje` puede ser `null` si el comentario fue solo una foto.  
> `lat`/`lng` solo vienen si el comentario tenía foto adjunta.

---

### `community:alert-activated`
**Broadcast:** todos los clientes conectados  
Se emite cuando un dueño activa la alerta comunitaria.

```json
{
  "mascotaId": "uuid",
  "lat": -17.465,
  "lng": -66.211,
  "radioMetros": 5000,
  "expiraEl": "2026-06-02T02:08:51Z"
}
```

**Flujo en Android:**

1. Buscar el pin de `mascotaId` en el mapa
2. Actualizar su estado a `alertaComunidad.activa = true` con `expiraEl`
3. Cambiar el ícono/color del pin sin llamar a `GET /map/public/lost-pets`

---

### `map:lost-pet-added`

**Broadcast:** todos los clientes conectados  
Se emite cuando una mascota pasa a estado `extraviada`. Contiene todos los datos necesarios para agregar el pin al mapa directamente.

```json
{
  "mascotaId": "uuid",
  "nombre": "Firulais",
  "tipo": "Perro",
  "fotoUrl": "https://res.cloudinary.com/...",
  "lat": -17.465,
  "lng": -66.211,
  "fechaPerdida": "2026-06-01T04:44:45Z",
  "recompensa": 0
}
```

> `tipo` puede ser `null` si la mascota no tiene tipo registrado.  
> `fotoUrl` puede ser `null` si la mascota no tiene fotos.  
> `recompensa` puede ser `null` si el dueño no ofrece recompensa.  
> Si la mascota no tiene GPS registrado, este evento **no se emite** (no hay coordenadas para el pin).

**Flujo en Android:**

1. Recibir el evento
2. Crear el objeto pin con los datos del payload
3. Agregarlo al mapa sin necesidad de llamar a ningún endpoint

---

### `map:lost-pet-removed`

**Broadcast:** todos los clientes conectados  
Se emite cuando una mascota deja de estar `extraviada` (el dueño la recuperó o cambió su estado).

```json
{
  "mascotaId": "uuid"
}
```

**Flujo en Android:**

1. Recibir el evento
2. Buscar el pin con ese `mascotaId` en el mapa
3. Eliminarlo

---

### `pet:status-changed`
**Room:** `pet:{mascotaId}` — solo propietarios/cuidadores de la mascota  
Se emite en todos los cambios de estado. Útil para actualizar la pantalla de detalle de la mascota o la lista de mascotas propias, pero **no para el mapa público** (usar `map:lost-pet-added` / `map:lost-pet-removed` para eso).

```json
{
  "mascotaId": "uuid",
  "nombre": "Firulais",
  "estado": "extraviada",
  "fechaCambio": "2026-06-01T04:44:45Z"
}
```

---

## 9. DTOs Android a actualizar

### Nuevos campos en `SightingDto`
Sin cambios respecto a la versión anterior.

### `CreateCommentRequest` — actualizar
```kotlin
data class CreateCommentRequest(
    val mensaje: String?,        // ahora opcional (era requerido)
    val lat: Double?,
    val lng: Double?,
    val replyToUserId: String?,  // nuevo — UUID del ciudadano al que responde el dueño
    val foto: MultipartBody.Part? // File opcional
)
```

### Nuevo `CommentDto`
```kotlin
data class CommentDto(
    val comentarioId: String,
    val avistamientoId: String,
    val autorUsuarioId: String?,
    val replyToUserId: String?,  // nuevo
    val mensaje: String?,        // ahora nullable
    val fotoUrl: String?,
    val lat: Double?,
    val lng: Double?,
    val creadoEl: String,
    val autor: AutorDto?
)

data class AutorDto(
    val nombre: String,
    val apellidoPaterno: String?,
    val fotoPerfilUrl: String?
)
```

### Nuevo `ThreadDto` (pestaña Mis mascotas)
```kotlin
data class MyPetsThreadDto(
    val mascota: MascotaResumenDto,
    val avistamiento: AvistamientoThreadDto?
)

data class AvistamientoThreadDto(
    val avistamientoId: String,
    val fechaAvistamiento: String,
    val totalHilos: Int,
    val ultimaActividad: String?,
    val ultimoMensaje: String?,
    val noLeidos: Int
)
```

### Nuevo `ParticipationDto` (pestaña Ayudé)
```kotlin
data class ParticipationDto(
    val avistamientoId: String,
    val mascota: MascotaResumenDto,
    val dueno: DuenoResumenDto,
    val miUltimoMensaje: String?,
    val ultimaRespuesta: String?,
    val ultimaActividad: String?,
    val noLeidos: Int
)
```

### Nuevo `UnreadCountDto`
```kotlin
data class UnreadCountDto(
    val total: Int,
    val comoDueno: Int,
    val comoRescatista: Int
)
```

### Actualizar `LostPetDto` (mapa)
```kotlin
data class LostPetDto(
    val reporteId: Int,
    val mascotaId: String,
    val nombre: String,
    val tipo: String,
    val fotoUrl: String?,
    val ubicacion: UbicacionDto,
    val fechaPerdida: String,
    val recompensa: Double?,
    val alertaComunidad: AlertaComunidadDto  // nuevo
)

data class AlertaComunidadDto(
    val activa: Boolean,
    val expiraEl: String?
)
```

### Actualizar `CommunityAlertResponse`
```kotlin
data class CommunityAlertResponse(
    val message: String,
    val usuariosNotificados: Int,
    val expiraEl: String,     // nuevo — ISO 8601, 24h desde el momento de activación
    val razon: String?
)
```

### Eliminar (ya no existen)
- `CreateRatingRequest`
- `SightingRatingDto`
- `RescatistaReputacionDto`
- `PersonaReputacionDto`
- Campos `reputacion` y `totalCalificaciones` de cualquier DTO de usuario
