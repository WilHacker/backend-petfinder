# Chat Privado entre Dueño y Rescatista

Documentación para el equipo frontend (Android) del sistema de chat privado con
consentimiento, mensajes multimedia y badges en tiempo real.

---

## Índice

1. [Concepto y decisiones de diseño](#1-concepto-y-decisiones-de-diseño)
2. [Requisito previo — rescatista con cuenta](#2-requisito-previo--rescatista-con-cuenta)
3. [Flujo completo](#3-flujo-completo)
4. [Endpoints — referencia completa](#4-endpoints--referencia-completa)
   - 4.1 [Crear avistamiento con JWT (actualizado)](#41-crear-avistamiento-con-jwt-actualizado)
   - 4.2 [Iniciar chat desde avistamiento (nuevo)](#42-iniciar-chat-desde-avistamiento-nuevo)
   - 4.3 [Listar mis chats (nuevo)](#43-listar-mis-chats-nuevo)
   - 4.4 [Detalle del chat (nuevo)](#44-detalle-del-chat-nuevo)
   - 4.5 [Aceptar invitación (nuevo)](#45-aceptar-invitación-nuevo)
   - 4.6 [Rechazar invitación (nuevo)](#46-rechazar-invitación-nuevo)
   - 4.7 [Enviar mensaje (nuevo)](#47-enviar-mensaje-nuevo)
   - 4.8 [Historial de mensajes (nuevo)](#48-historial-de-mensajes-nuevo)
   - 4.9 [Marcar chat como leído (nuevo)](#49-marcar-chat-como-leído-nuevo)
5. [Eventos WebSocket en tiempo real](#5-eventos-websocket-en-tiempo-real)
6. [Badges y no leídos](#6-badges-y-no-leídos)
7. [Límite de invitaciones](#7-límite-de-invitaciones)
8. [Estructura de pantallas sugerida](#8-estructura-de-pantallas-sugerida)

---

## 1. Concepto y decisiones de diseño

### Qué es

Un chat directo y privado entre el **dueño** de una mascota perdida y el **rescatista**
(la persona que reportó verla). A diferencia del sistema de comentarios en avistamientos —
donde el dueño responde a todos los rescatistas en un hilo semi-público — este chat es
una conversación 1:1 completamente privada, con consentimiento explícito del rescatista.

### Decisiones clave

| Decisión | Razonamiento |
| --- | --- |
| **Un chat por (dueño + rescatista + mascota)** | Si el mismo rescatista avistó 3 mascotas distintas, tiene 3 chats separados (organizados por mascota). Si avistó la misma mascota dos veces, comparten el mismo chat. |
| **Invitación con consentimiento** | Antes de abrir el canal, el rescatista recibe una notificación con los datos del dueño y puede aceptar o rechazar. Nadie recibe mensajes sin haber dado su OK. |
| **Máximo 2 intentos de invitación** | Si el rescatista rechaza 2 veces, el dueño ya no puede volver a invitar para esa mascota. Protege al rescatista de ser acosado. |
| **Solo funciona si el rescatista tenía cuenta** | El endpoint de avistamientos es público (`@Public()`). Si el rescatista reportó sin JWT, no hay forma de identificarlo y el chat no está disponible. Si reportó logueado, su `usuario_id` queda guardado. |
| **Mensajes: texto + foto + GPS** | Cualquier combinación es válida. Mínimo un campo obligatorio. La ubicación GPS es muy útil para que el rescatista comparta exactamente dónde vio a la mascota. |
| **Nombre y foto en cada mensaje** | Como WhatsApp — cada burbuja muestra la foto de perfil y nombre del autor. |
| **Badge de no leídos server-side** | El conteo de mensajes sin leer se calcula en la DB y se devuelve en tiempo real vía WebSocket (`chat:unread-count`). |

---

## 2. Requisito previo — rescatista con cuenta

El chat privado **solo está disponible** cuando el rescatista creó el avistamiento con sesión iniciada.

**Android debe enviar el Bearer token en `POST /sightings/pets/:petId`** aunque sea un endpoint público. El backend lo detecta opcionalmente:

- Con JWT válido → guarda `rescatista_usuario_id` → el dueño puede iniciar chat ✅
- Sin JWT (anónimo) → `rescatista_usuario_id = null` → si el dueño intenta iniciar chat recibe `400` ❌

```
POST /sightings/pets/:petId
Authorization: Bearer <token>   ← Enviarlo si el usuario está logueado
```

**En la UI del avistamiento**, el botón "Iniciar chat privado" debe mostrarse solo si
`rescatistaUsuarioId != null` (el backend lo incluye próximamente; por ahora filtrarlo en
el `POST /sightings/{id}/chat` que devuelve `400` si no aplica).

---

## 3. Flujo completo

```
Rescatista (logueado) reporta avistamiento
  POST /sightings/pets/:petId  + Bearer token
  → Backend guarda rescatista_usuario_id en avistamientos
        ↓
Dueño ve el avistamiento, presiona "Iniciar chat privado"
  POST /sightings/:avistamientoId/chat
  → Backend crea conversacion (estado=pendiente)
  → WS chat:invite → user:{rescatistaId}
        ↓
Rescatista recibe notificación:
  "Wilian Almendras quiere hablarte sobre su mascota 'juan'"
  [Aceptar] [Rechazar]
        ↓
        ├── Rechaza → PUT /chats/:id/decline
        │             WS chat:declined → user:{duenoId}
        │             dueño ve "Invitación rechazada (X intentos restantes)"
        │
        └── Acepta → PUT /chats/:id/accept
                      WS chat:accepted → user:{duenoId}
                      Ambos se unen al room chat:{conversacionId}
                            ↓
                      Chat activo — mensajes en tiempo real
                      POST /chats/:id/messages  (texto, foto, GPS)
                      WS chat:message → chat:{conversacionId}
                      WS chat:unread-count → chat:{conversacionId}
                            ↓
                      Abrir chat → marcar como leído
                      PUT /chats/:id/read
                      WS chat:unread-count con noLeidos=0
```

---

## 4. Endpoints — referencia completa

### 4.1 Crear avistamiento con JWT (actualizado)

**Cambio**: ahora el backend guarda `rescatista_usuario_id` si el request incluye un JWT válido.
No hay cambio en la firma del endpoint para el cliente.

```
POST /sightings/pets/:petId
Authorization: Bearer <token>   ← Nuevo: si se envía, activa el chat privado
Content-Type: multipart/form-data
```

| Campo | Tipo | Req | Descripción |
| --- | --- | --- | --- |
| `lat` | number | ✅ | Latitud del avistamiento |
| `lng` | number | ✅ | Longitud del avistamiento |
| `mensajeRescatista` | string | ❌ | Mensaje libre del rescatista |
| `foto` | file | ❌ | Foto de evidencia |

**Respuesta 201:**

```json
{
  "avistamientoId": "ad2bca40-...",
  "mascotaId": "ed2b96d2-...",
  "mensajeRescatista": "Vi a tu mascota cerca del parque",
  "fotoEvidenciaUrl": null,
  "fechaAvistamiento": "2026-06-01T11:55:51.519Z",
  "lat": -17.39,
  "lng": -66.157
}
```

---

### 4.2 Iniciar chat desde avistamiento (nuevo)

Solo el dueño puede llamar este endpoint. Crea la conversación y envía la invitación al
rescatista vía WebSocket.

```
POST /sightings/:avistamientoId/chat
Authorization: Bearer <token-dueno>
```

Sin body.

**Respuesta 201 — primera invitación:**

```json
{
  "conversacionId": "69d5d1cd-...",
  "estado": "pendiente"
}
```

**Respuesta 201 — si el chat ya estaba aceptado:**

```json
{
  "conversacionId": "69d5d1cd-...",
  "estado": "aceptada",
  "mensaje": "El chat ya está activo"
}
```

**Errores:**

| Código | Motivo |
| --- | --- |
| `400` | Avistamiento sin `rescatista_usuario_id` (reportado anónimamente) |
| `400` | El dueño intentó chatear consigo mismo |
| `403` | El usuario no es dueño de la mascota |
| `403` | Se alcanzó el límite de 2 invitaciones (rechazadas ambas) |

---

### 4.3 Listar mis chats (nuevo)

Devuelve todos los chats del usuario autenticado — tanto como dueño como rescatista —
con el badge de mensajes no leídos. Usar para la pantalla principal de chat.

```
GET /chats
Authorization: Bearer <token>
```

**Respuesta 200:**

```json
[
  {
    "conversacionId": "69d5d1cd-...",
    "estado": "aceptada",
    "soyDueno": true,
    "mascota": {
      "mascotaId": "ed2b96d2-...",
      "nombre": "juan",
      "fotoUrl": "https://res.cloudinary.com/..."
    },
    "otroParticipante": {
      "nombre": "Maria",
      "apellidoPaterno": "Lopez",
      "fotoUrl": null
    },
    "ultimoMensaje": "Estaba en la Plaza 14 de Septiembre",
    "ultimaActividad": "2026-06-01T11:56:40.832Z",
    "noLeidos": 1
  }
]
```

| Campo | Descripción |
| --- | --- |
| `estado` | `pendiente` / `aceptada` / `rechazada` |
| `soyDueno` | `true` si el usuario es el dueño de la mascota |
| `otroParticipante` | Datos del otro usuario (nombre, foto) — para el encabezado del chat |
| `noLeidos` | Badge como WhatsApp — mensajes sin leer del otro participante |
| `ultimoMensaje` | Preview del último mensaje (solo texto; null si el último fue foto/GPS) |

---

### 4.4 Detalle del chat (nuevo)

Devuelve los perfiles completos de ambos participantes y el estado de la conversación.
Usar al abrir la pantalla de chat para mostrar el encabezado con foto y nombre.

```
GET /chats/:conversacionId
Authorization: Bearer <token>
```

**Respuesta 200:**

```json
{
  "conversacionId": "69d5d1cd-...",
  "estado": "aceptada",
  "intentos": 1,
  "maxIntentos": 2,
  "mascota": {
    "mascotaId": "ed2b96d2-...",
    "nombre": "juan",
    "fotoUrl": "https://res.cloudinary.com/..."
  },
  "dueno": {
    "usuarioId": "145b307f-...",
    "nombre": "Wilian",
    "apellidoPaterno": "Almendras",
    "fotoUrl": "https://res.cloudinary.com/..."
  },
  "rescatista": {
    "usuarioId": "7766c0ea-...",
    "nombre": "Maria",
    "apellidoPaterno": "Lopez",
    "fotoUrl": null
  }
}
```

> `intentosRestantes = maxIntentos - intentos`. Usar para mostrar "Te quedan X intentos"
> en la UI del dueño cuando la invitación fue rechazada.

---

### 4.5 Aceptar invitación (nuevo)

Solo el rescatista puede aceptar. Al aceptar, ambos usuarios se unen al room WebSocket
`chat:{conversacionId}` y el dueño recibe `chat:accepted`.

```
PUT /chats/:conversacionId/accept
Authorization: Bearer <token-rescatista>
```

Sin body.

**Respuesta 200:**

```json
{
  "ok": true,
  "conversacionId": "69d5d1cd-..."
}
```

**Errores:**

| Código | Motivo |
| --- | --- |
| `400` | La invitación ya fue aceptada o rechazada |
| `403` | El usuario no es el rescatista de esta conversación |

---

### 4.6 Rechazar invitación (nuevo)

Solo el rescatista puede rechazar. El dueño recibe `chat:declined` con los intentos restantes.

```
PUT /chats/:conversacionId/decline
Authorization: Bearer <token-rescatista>
```

Sin body.

**Respuesta 200:**

```json
{
  "ok": true,
  "conversacionId": "69d5d1cd-...",
  "intentosRestantes": 1
}
```

---

### 4.7 Enviar mensaje (nuevo)

Cualquier participante puede enviar. Al menos uno de los tres campos (`contenido`, `foto`,
`lat`+`lng`) debe estar presente — pueden combinarse libremente.

```
POST /chats/:conversacionId/messages
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

| Campo | Tipo | Req | Descripción |
| --- | --- | --- | --- |
| `contenido` | string (max 1000) | ❌ | Texto del mensaje |
| `lat` | number | ❌ | Latitud (requiere también `lng`) |
| `lng` | number | ❌ | Longitud (requiere también `lat`) |
| `foto` | file | ❌ | Imagen (sube a Cloudinary) |

**Combinaciones válidas:**

- Solo texto: `contenido="Hola"`
- Solo foto: `foto=<binary>`
- Solo ubicación: `lat=-17.39 & lng=-66.15`
- Texto + foto: `contenido="Aquí lo vi" & foto=<binary>`
- Texto + foto + GPS: las tres juntas

**Respuesta 201:**

```json
{
  "mensajeId": "5d4e5853-...",
  "conversacionId": "69d5d1cd-...",
  "autorUsuarioId": "145b307f-...",
  "contenido": "Hola Maria! ¿Dónde exactamente viste a juan?",
  "fotoUrl": null,
  "lat": null,
  "lng": null,
  "creadoEl": "2026-06-01T11:56:39.626Z",
  "leidoEl": null,
  "autor": {
    "nombre": "Wilian",
    "apellidoPaterno": "Almendras",
    "fotoPerfilUrl": "https://res.cloudinary.com/..."
  }
}
```

**Errores:**

| Código | Motivo |
| --- | --- |
| `400` | El chat no está activo (pendiente o rechazado) |
| `400` | Ningún campo enviado (mensaje vacío) |
| `403` | El usuario no es participante de este chat |

---

### 4.8 Historial de mensajes (nuevo)

Devuelve todos los mensajes del chat en orden cronológico (más antiguo primero).
Llamar al abrir el chat para cargar la conversación completa.

```
GET /chats/:conversacionId/messages
Authorization: Bearer <token>
```

**Respuesta 200:**

```json
[
  {
    "mensajeId": "5d4e5853-...",
    "conversacionId": "69d5d1cd-...",
    "autorUsuarioId": "145b307f-...",
    "contenido": "Hola Maria! ¿Dónde viste a juan?",
    "fotoUrl": null,
    "lat": null,
    "lng": null,
    "creadoEl": "2026-06-01T11:56:39.626Z",
    "leidoEl": null,
    "autor": {
      "nombre": "Wilian",
      "apellidoPaterno": "Almendras",
      "fotoPerfilUrl": "https://res.cloudinary.com/..."
    }
  },
  {
    "mensajeId": "c29f812e-...",
    "conversacionId": "69d5d1cd-...",
    "autorUsuarioId": "7766c0ea-...",
    "contenido": "Estaba en la Plaza 14 de Septiembre",
    "fotoUrl": null,
    "lat": -17.3941,
    "lng": -66.1567,
    "creadoEl": "2026-06-01T11:56:40.832Z",
    "leidoEl": null,
    "autor": {
      "nombre": "Maria",
      "apellidoPaterno": "Lopez",
      "fotoPerfilUrl": null
    }
  }
]
```

> Para saber si un mensaje es propio o ajeno: comparar `autorUsuarioId` con el `usuarioId`
> del usuario autenticado guardado en sesión.

---

### 4.9 Marcar chat como leído (nuevo)

Marca todos los mensajes del otro participante como leídos y emite `chat:unread-count`
con `noLeidos: 0` a ambos via WebSocket. Llamar cuando el usuario abre la pantalla del chat.

```
PUT /chats/:conversacionId/read
Authorization: Bearer <token>
```

Sin body.

**Respuesta 200:**

```json
{ "ok": true }
```

---

## 5. Eventos WebSocket en tiempo real

Todos los eventos del chat usan el namespace `/realtime` (misma conexión que el resto de la app).

### Conexión

Al conectarse, el gateway une automáticamente al usuario a:

- `pet:{mascotaId}` — rooms de sus mascotas (ya existía)
- `user:{usuarioId}` — room personal para invitaciones (ya existía)
- `chat:{conversacionId}` — rooms de todos sus chats **aceptados** (nuevo)

### `chat:invite`

**Cuándo:** El dueño llama `POST /sightings/:id/chat`.

**Room destino:** `user:{rescatistaUsuarioId}` — solo le llega al rescatista.

**Payload:**

```json
{
  "conversacionId": "69d5d1cd-...",
  "mascota": {
    "mascotaId": "ed2b96d2-...",
    "nombre": "juan",
    "fotoUrl": "https://res.cloudinary.com/..."
  },
  "dueno": {
    "nombre": "Wilian",
    "apellido": "Almendras",
    "fotoUrl": "https://res.cloudinary.com/..."
  },
  "intentosRestantes": 1
}
```

**Android:** Mostrar diálogo/notificación: `"Wilian Almendras quiere hablarte sobre su mascota juan"`.
Botones `[Aceptar]` y `[Rechazar]`.

---

### `chat:accepted`

**Cuándo:** El rescatista llama `PUT /chats/:id/accept`.

**Room destino:** `user:{duenoUsuarioId}` — solo le llega al dueño.

**Payload:**

```json
{
  "conversacionId": "69d5d1cd-...",
  "rescatista": {
    "nombre": "Maria",
    "apellido": "Lopez",
    "fotoUrl": null
  }
}
```

**Android:** Navegar a la pantalla del chat o mostrar toast `"Maria Lopez aceptó tu invitación"`.

---

### `chat:declined`

**Cuándo:** El rescatista llama `PUT /chats/:id/decline`.

**Room destino:** `user:{duenoUsuarioId}` — solo le llega al dueño.

**Payload:**

```json
{
  "conversacionId": "69d5d1cd-...",
  "intentosRestantes": 1
}
```

**Android:** Si `intentosRestantes > 0`, mostrar `"Invitación rechazada. Puedes reintentar."`.
Si `intentosRestantes === 0`, mostrar `"Invitación rechazada. Has alcanzado el límite."`.

---

### `chat:message`

**Cuándo:** Cualquier participante envía un mensaje vía `POST /chats/:id/messages`.

**Room destino:** `chat:{conversacionId}` — ambos participantes lo reciben.

**Payload:**

```json
{
  "mensajeId": "5d4e5853-...",
  "conversacionId": "69d5d1cd-...",
  "autorUsuarioId": "145b307f-...",
  "autorNombre": "Wilian Almendras",
  "autorFotoUrl": "https://res.cloudinary.com/...",
  "contenido": "Hola Maria! ¿Dónde viste a juan?",
  "fotoUrl": null,
  "lat": null,
  "lng": null,
  "creadoEl": "2026-06-01T11:56:39.626Z"
}
```

**Android:** Agregar la burbuja directamente al `RecyclerView` del chat sin hacer un
`GET /messages`. Comparar `autorUsuarioId` con el propio para alinear derecha/izquierda.

---

### `chat:unread-count`

**Cuándo:** Cada vez que se envía un mensaje o se llama `PUT /chats/:id/read`.

**Room destino:** `chat:{conversacionId}` — ambos participantes.

**Payload:**

```json
{
  "conversacionId": "69d5d1cd-...",
  "noLeidos": 1
}
```

**Android:** Actualizar el badge del chat en la lista de conversaciones sin recargar el
`GET /chats`.

---

## 6. Badges y no leídos

El campo `noLeidos` en `GET /chats` cuenta los **mensajes del otro participante** que
aún no han sido marcados como leídos por el usuario actual.

| Situación | `noLeidos` dueño | `noLeidos` rescatista |
| --- | --- | --- |
| Rescatista envía 1 mensaje | 1 | 0 |
| Dueño abre el chat y llama `/read` | 0 | 0 |
| Dueño responde 2 mensajes | 0 | 2 |
| Rescatista abre el chat y llama `/read` | 0 | 0 |

**Flujo recomendado Android:**

1. Abrir pantalla de chat → `GET /chats/:id/messages`
2. Inmediatamente → `PUT /chats/:id/read`
3. Nuevos mensajes llegan por `chat:message` → agregar al RecyclerView
4. Badge actualizado llega por `chat:unread-count` → actualizar UI sin refetch

---

## 7. Límite de invitaciones

Cada par (mascota + dueño + rescatista) tiene máximo **2 intentos**.

| Estado | `intentos` | `maxIntentos` | Puede reintentar |
| --- | --- | --- | --- |
| Primera invitación enviada | 1 | 2 | ✅ (si rechaza, puede 1 vez más) |
| Rescatista rechazó → dueño reintenta | 2 | 2 | ❌ bloqueado |
| Rescatista aceptó | cualquiera | 2 | N/A — chat activo |

Si el dueño llama `POST /sightings/:id/chat` cuando ya se agotaron los intentos,
recibe `403 "Has alcanzado el límite de 2 invitaciones para esta mascota"`.

Si el chat ya está **aceptado**, la misma llamada devuelve `200` con `estado: "aceptada"`
y navega directamente al chat existente (no crea uno nuevo).

---

## 8. Estructura de pantallas sugerida

### Sección "Chats" (reemplaza o coexiste con "Avistamientos")

```
┌─────────────────────────────────┐
│  🐾 juan                    [1] │  ← badge noLeidos
│  Maria Lopez                    │
│  "Estaba en la Plaza 14..."     │
│  hace 2 min                     │
├─────────────────────────────────┤
│  🐾 Firulais              [⏳]  │  ← estado pendiente
│  Carlos Mamani                  │
│  Invitación enviada...          │
└─────────────────────────────────┘
```

- `estado: "aceptada"` → badge numérico de no leídos
- `estado: "pendiente"` → ícono de reloj / "esperando respuesta"
- `estado: "rechazada"` → ícono de x / "Rechazado (X intentos restantes)"

### Pantalla de chat individual

```
┌──────────────────────────────────┐
│ ← [foto] Maria Lopez             │  ← datos de GET /chats/:id (otroParticipante)
│         sobre: juan 🐾           │
├──────────────────────────────────┤
│                      Hola Maria! │  ← burbuja propia (derecha)
│                  ¿Dónde lo viste?│
│                                  │
│ [foto] Estaba en la Plaza 14...  │  ← burbuja ajena (izquierda) con foto perfil
│        📍 Ver en mapa            │  ← si lat/lng presentes
├──────────────────────────────────┤
│ [📎] [📍] [___texto___] [Enviar] │
└──────────────────────────────────┘
```

### Diálogo de invitación (rescatista)

```
┌──────────────────────────────────┐
│  [foto Wilian]                   │
│  Wilian Almendras                │
│  quiere hablarte sobre           │
│  su mascota "juan" 🐾            │
│                                  │
│  [Rechazar]      [Aceptar]       │
└──────────────────────────────────┘
```

Datos del payload `chat:invite`: `dueno.nombre`, `dueno.fotoUrl`, `mascota.nombre`,
`mascota.fotoUrl`, `conversacionId` (para llamar `/accept` o `/decline`).
