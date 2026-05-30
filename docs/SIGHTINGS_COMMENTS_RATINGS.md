# Avistamientos — Comentarios, Calificaciones y Notificaciones

> **Sprint:** Mayo 2026 — Funcionalidad nueva  
> **Base URL:** `http://localhost:3000` (dev) — reemplazar por la URL de producción  
> **Swagger interactivo:** `GET /api/docs` → sección **Sightings**

---

## Contexto

Cuando alguien reporta un avistamiento (`POST /sightings/pets/:petId`), ahora:

1. El dueño recibe **push FCM** y un **evento WebSocket** en tiempo real.
2. Cualquier usuario autenticado puede **comentar** el avistamiento con información adicional.
3. El dueño puede **calificar** el avistamiento: confirmar si fue verídico y puntuar al rescatista (1–5 ⭐).

### Regla de privacidad en comentarios

Un comentarista puede haber visto la mascota a las 2 pm y reportarlo a las 8 pm desde su casa. Si se fuerza a enviar la ubicación siempre, se estaría revelando dónde vive.

**Regla:** `lat/lng` **solo se guarda si el comentario incluye foto**. Sin foto, las coordenadas se descartan aunque se envíen.

---

## Endpoints nuevos

### Resumen rápido

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `POST` | `/sightings/pets/:petId` | ❌ Público | Crear avistamiento *(ya existía — ahora notifica)* |
| `POST` | `/sightings/:id/comments` | ✅ JWT | Comentar un avistamiento |
| `GET` | `/sightings/:id/comments` | ✅ JWT | Ver comentarios (filtrado por rol) |
| `POST` | `/sightings/:id/rating` | ✅ JWT | Calificar avistamiento (solo dueño) |
| `GET` | `/sightings/:id/rating` | ❌ Público | Ver calificación |

---

## 1. Crear avistamiento *(comportamiento actualizado)*

> Ya existía. Se documenta aquí porque ahora dispara notificaciones.

```
POST /sightings/pets/:petId
Content-Type: multipart/form-data
Authorization: no requerido
```

### Parámetros de ruta

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `petId` | `UUID` | ID de la mascota |

### Body (multipart/form-data)

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `lat` | `number` | ✅ | Latitud donde se vio la mascota (-90 a 90) |
| `lng` | `number` | ✅ | Longitud donde se vio la mascota (-180 a 180) |
| `mensajeRescatista` | `string` | ❌ | Descripción de lo que vio (máx. 500 chars) |
| `foto` | `file` | ❌ | Foto de evidencia (imagen) |

### Respuesta exitosa `201`

```json
{
  "avistamientoId": "6fcc2314-48b1-490e-9a0f-ad7c6cef5e20",
  "mascotaId": "1b0cac91-3932-4091-91a4-8ff502d7a223",
  "mensajeRescatista": "Lo vi cerca del mercado central",
  "fotoEvidenciaUrl": null,
  "fechaAvistamiento": "2026-05-30T15:58:12.988Z",
  "lat": -17.3935,
  "lng": -66.157
}
```

### Notificaciones disparadas

| Canal | Evento / Mensaje |
|-------|-----------------|
| **FCM push** | `"¡Vieron a {nombre}!"` → a todos los propietarios con `recibeAlertas: true` |
| **WebSocket** | Evento `sighting:new` en room `pet:{mascotaId}` |

**Payload WebSocket `sighting:new`:**
```json
{
  "avistamientoId": "6fcc2314-...",
  "lat": -17.3935,
  "lng": -66.157,
  "fotoUrl": null,
  "mensaje": "Lo vi cerca del mercado central",
  "fechaAvistamiento": "2026-05-30T15:58:12.988Z"
}
```

### Errores posibles

| Código | Mensaje | Causa |
|--------|---------|-------|
| `404` | `Mascota no encontrada` | El `petId` no existe |
| `400` | Error de validación | `lat` o `lng` fuera de rango o no numéricos |

---

## 2. Comentar un avistamiento

```
POST /sightings/:id/comments
Content-Type: multipart/form-data
Authorization: Bearer {token}
```

> Cualquier usuario autenticado puede comentar. No es necesario ser propietario.

### Parámetros de ruta

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | `UUID` | ID del avistamiento |

### Body (multipart/form-data)

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `mensaje` | `string` | ✅ | Texto del comentario (máx. 500 chars) |
| `lat` | `number` | ❌ | Latitud — **solo se guarda si se adjunta foto** |
| `lng` | `number` | ❌ | Longitud — **solo se guarda si se adjunta foto** |
| `replyToUserId` | `UUID` | ❌ | ID del comentarista al que el **dueño** responde (hilo privado) |
| `foto` | `file` | ❌ | Foto de evidencia (imagen) |

> ⚠️ **Importante para el frontend:** Si el usuario no adjunta foto, no pidas ni envíes `lat/lng` — el backend los descartará de todas formas. Solo activa el GPS cuando haya foto.
>
> El campo `replyToUserId` solo lo usa el **dueño** cuando quiere responderle a un comentarista específico. Un comentarista normal nunca lo envía.

### Respuesta exitosa `201`

**Con foto (GPS guardado):**
```json
{
  "comentarioId": "811f605b-5902-4e32-9aaa-c498b69113e1",
  "avistamientoId": "6fcc2314-48b1-490e-9a0f-ad7c6cef5e20",
  "autorUsuarioId": "145b307f-1d35-4ff6-9557-85070e8c6ddc",
  "replyToUserId": null,
  "mensaje": "Le saqué foto justo aquí, estaba descansando bajo el árbol",
  "fotoUrl": "https://res.cloudinary.com/daelr9ppy/image/upload/v1780156718/comentarios-avistamiento/6fcc2314-.../foto.png",
  "lat": -17.39,
  "lng": -66.155,
  "creadoEl": "2026-05-30T15:58:39.519Z",
  "autor": {
    "nombre": "Wilian",
    "apellidoPaterno": "Almendras",
    "fotoPerfilUrl": "https://res.cloudinary.com/..."
  }
}
```

**Respuesta del dueño a un comentarista específico:**
```json
{
  "comentarioId": "9a2f1c3d-...",
  "avistamientoId": "6fcc2314-...",
  "autorUsuarioId": "145b307f-...",
  "replyToUserId": "811f605b-...",
  "mensaje": "Gracias, ¿recuerdas a qué hora fue exactamente?",
  "fotoUrl": null,
  "lat": null,
  "lng": null,
  "creadoEl": "2026-05-30T16:10:00.000Z",
  "autor": {
    "nombre": "Wilian",
    "apellidoPaterno": "Almendras",
    "fotoPerfilUrl": "https://res.cloudinary.com/..."
  }
}
```

**Sin foto (GPS descartado):**
```json
{
  "comentarioId": "7337f8cd-4c36-4da6-8595-60ad14c839d7",
  "avistamientoId": "6fcc2314-48b1-490e-9a0f-ad7c6cef5e20",
  "autorUsuarioId": "145b307f-1d35-4ff6-9557-85070e8c6ddc",
  "replyToUserId": null,
  "mensaje": "Lo vi en la tarde por el parque",
  "fotoUrl": null,
  "lat": null,
  "lng": null,
  "creadoEl": "2026-05-30T15:58:22.019Z",
  "autor": {
    "nombre": "Wilian",
    "apellidoPaterno": "Almendras",
    "fotoPerfilUrl": "https://res.cloudinary.com/..."
  }
}
```

### Notificaciones disparadas

| Canal | Evento / Mensaje |
|-------|-----------------|
| **FCM push** | `"Nuevo comentario sobre {nombre}"` → propietarios con `recibeAlertas: true` |
| **WebSocket** | Evento `sighting:comment-new` en room `pet:{mascotaId}` |

**Payload WebSocket `sighting:comment-new`:**
```json
{
  "comentarioId": "811f605b-...",
  "avistamientoId": "6fcc2314-...",
  "mensaje": "Le saqué foto justo aquí...",
  "fotoUrl": "https://res.cloudinary.com/...",
  "lat": -17.39,
  "lng": -66.155,
  "creadoEl": "2026-05-30T15:58:39.519Z"
}
```
> `lat` y `lng` son `undefined` en el payload WebSocket si no hay foto.

### Errores posibles

| Código | Mensaje | Causa |
|--------|---------|-------|
| `401` | `Token inválido o expirado` | Sin JWT o token vencido |
| `404` | `Avistamiento no encontrado` | El `id` no existe |
| `400` | Error de validación | `mensaje` vacío o supera 500 chars |

---

## 3. Ver comentarios de un avistamiento

```
GET /sightings/:id/comments
Authorization: Bearer {token}
```

> **Visibilidad filtrada por rol:**
> - **Dueño** → ve todos los comentarios de todos los usuarios.
> - **Comentarista** → solo ve sus propios comentarios y las respuestas del dueño dirigidas a él (`replyToUserId == suId`).

### Parámetros de ruta

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | `UUID` | ID del avistamiento |

### Respuesta exitosa `200`

Array ordenado del más antiguo al más nuevo (filtrado según el token enviado):

```json
[
  {
    "comentarioId": "7337f8cd-...",
    "avistamientoId": "6fcc2314-...",
    "autorUsuarioId": "145b307f-...",
    "mensaje": "Lo vi en la tarde por el parque",
    "fotoUrl": null,
    "lat": null,
    "lng": null,
    "creadoEl": "2026-05-30T15:58:22.019Z",
    "autor": {
      "nombre": "Wilian",
      "apellidoPaterno": "Almendras",
      "fotoPerfilUrl": "https://res.cloudinary.com/..."
    }
  },
  {
    "comentarioId": "811f605b-...",
    "avistamientoId": "6fcc2314-...",
    "autorUsuarioId": "145b307f-...",
    "mensaje": "Le saqué foto justo aquí...",
    "fotoUrl": "https://res.cloudinary.com/.../foto.png",
    "lat": -17.39,
    "lng": -66.155,
    "creadoEl": "2026-05-30T15:58:39.519Z",
    "autor": {
      "nombre": "Wilian",
      "apellidoPaterno": "Almendras",
      "fotoPerfilUrl": "https://res.cloudinary.com/..."
    }
  }
]
```

> Retorna `[]` si no hay comentarios — nunca `null`.

### Errores posibles

| Código | Mensaje | Causa |
|--------|---------|-------|
| `401` | `Token inválido o expirado` | Sin JWT o token vencido |
| `404` | `Avistamiento no encontrado` | El `id` no existe |

---

## 4. Calificar un avistamiento

```
POST /sightings/:id/rating
Content-Type: application/json
Authorization: Bearer {token}
```

> **Solo el propietario** de la mascota puede calificar. Devuelve error 403 para cualquier otro usuario.  
> Si ya existe una calificación, **la actualiza** (upsert) — no crea duplicados.

### Parámetros de ruta

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | `UUID` | ID del avistamiento |

### Body (JSON)

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `confirmado` | `boolean` | ✅ | `true` si el avistamiento fue verídico y útil |
| `estrellas` | `integer` | ✅ | Puntuación al rescatista: 1 a 5 |

```json
{
  "confirmado": true,
  "estrellas": 5
}
```

### Respuesta exitosa `201`

```json
{
  "avistamientoId": "6fcc2314-48b1-490e-9a0f-ad7c6cef5e20",
  "autorUsuarioId": "145b307f-1d35-4ff6-9557-85070e8c6ddc",
  "confirmado": true,
  "estrellas": 5,
  "creadoEl": "2026-05-30T15:58:58.611Z"
}
```

### Notificaciones disparadas

| Canal | Evento / Mensaje |
|-------|-----------------|
| **WebSocket** | Evento `sighting:rated` en room `pet:{mascotaId}` |

**Payload WebSocket `sighting:rated`:**
```json
{
  "avistamientoId": "6fcc2314-...",
  "confirmado": true,
  "estrellas": 5
}
```

### Errores posibles

| Código | Mensaje | Causa |
|--------|---------|-------|
| `401` | `Token inválido o expirado` | Sin JWT o token vencido |
| `403` | `Solo el dueño puede calificar el avistamiento` | El usuario no es propietario |
| `404` | `Avistamiento no encontrado` | El `id` no existe |
| `400` | `estrellas must not be greater than 5` | Valor fuera del rango 1–5 |

---

## 5. Ver calificación de un avistamiento

```
GET /sightings/:id/rating
Authorization: no requerido
```

### Parámetros de ruta

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | `UUID` | ID del avistamiento |

### Respuesta exitosa `200`

**Si el dueño ya calificó:**
```json
{
  "avistamientoId": "6fcc2314-48b1-490e-9a0f-ad7c6cef5e20",
  "autorUsuarioId": "145b307f-1d35-4ff6-9557-85070e8c6ddc",
  "confirmado": true,
  "estrellas": 5,
  "creadoEl": "2026-05-30T15:58:58.611Z"
}
```

**Si el dueño aún no calificó:**
```json
null
```

> El frontend debe manejar el caso `null` (mostrar "Sin calificación aún").

### Errores posibles

| Código | Mensaje | Causa |
|--------|---------|-------|
| `404` | `Avistamiento no encontrado` | El `id` no existe |

---

## Flujo completo recomendado (Android)

```
1. Pantalla de avistamiento
   └── Al abrir: GET /sightings/{id}/comments   (JWT requerido)
                  GET /sightings/{id}/rating
   └── Escuchar WS: sighting:comment-new → agregar comentario a la lista
                    sighting:rated       → actualizar panel de calificación

2. Botón "Comentar" (cualquier usuario autenticado)
   └── Si adjunta foto → activar GPS y enviar lat/lng
   └── Si no adjunta foto → NO pedir GPS (backend lo ignora de todas formas)
   └── POST /sightings/{id}/comments (multipart)
   └── NO enviar replyToUserId — ese campo es solo para el dueño

3. Vista de comentarios según rol
   └── Dueño: ve todos los comentarios de todos los usuarios
   └── Comentarista: ve solo sus mensajes + respuestas del dueño hacia él
       → Renderizar los comentarios del dueño con replyToUserId != null como "respuesta privada"

4. Botón "Responder" (solo visible para el dueño, dentro de cada comentario)
   └── POST /sightings/{id}/comments con replyToUserId = usuarioId del comentarista
   └── El comentarista verá la respuesta en su próximo GET /comments

5. Botón "Calificar" (solo visible para el dueño)
   └── Mostrar: checkbox "¿Fue útil?" + selector de 1-5 estrellas
   └── POST /sightings/{id}/rating (JSON)
   └── Puede editarse (el endpoint hace upsert)

6. Notificaciones push recibidas
   └── tipo: "nuevo_avistamiento"      → navegar a pantalla de avistamientos de la mascota
   └── tipo: "comentario_avistamiento" → navegar al avistamiento específico (avistamientoId en data)
```

---

## Eventos WebSocket — resumen de todos los de avistamientos

| Evento | Room | Quién lo recibe | Cuándo |
|--------|------|-----------------|--------|
| `sighting:new` | `pet:{mascotaId}` | Todos los propietarios conectados | Al crear un avistamiento |
| `sighting:comment-new` | `pet:{mascotaId}` | Todos los propietarios conectados | Al crear un comentario |
| `sighting:rated` | `pet:{mascotaId}` | Todos en el room (propietarios) | Al calificar el avistamiento |

> Para recibir estos eventos el cliente debe unirse al room `pet:{mascotaId}` al conectarse al namespace `/realtime`.

---

## Data FCM — campos del objeto `data`

El objeto `data` de cada push permite al frontend navegar a la pantalla correcta:

| `tipo` | Campos adicionales | Pantalla destino |
|--------|--------------------|-----------------|
| `nuevo_avistamiento` | `mascotaId` | Lista de avistamientos de la mascota |
| `comentario_avistamiento` | `mascotaId`, `avistamientoId` | Detalle del avistamiento específico |
