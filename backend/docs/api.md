# API — Sistema de Gestión para el Servicio de Análisis de Laboratorio

Documentación de todos los endpoints del backend (Node.js ES modules + Express + Mongoose).
Arquitectura: **ruta → controller → service → model** (los controllers nunca usan Mongoose directamente).

- **Base URL:** `http://localhost:<PORT>/api` (PUERTO por defecto `3000`).
- **Formato de las respuestas:** siempre JSON. Éxito con `ok: true`, error con `ok: false`.
- **Borrado:** siempre **lógico** (`eliminado`, `eliminadoPor`, `fechaEliminacion`). Ningún `DELETE` borra documentos de la base.
- **Superficies:**
  - `/api/interno/**` → requiere `Authorization: Bearer <JWT>` y rol `admin | encargado | usuario`.
  - `/api/publico/**` → sin login; casi todo `GET` (2 `POST` permitidos).

---

## 1. Índice de secciones

| # | Sección | Endpoints |
|---|---------|-----------|
| 2 | [Autenticación](#2-autenticación) | — |
| 3 | [Formato de error](#3-formato-de-error) | — |
| 4 | [Códigos de estado](#4-códigos-de-estado) | — |
| 5 | [Códigos de muestra vs. código de seguimiento](#5-códigos-de-muestra-vs-código-de-seguimiento) | — |
| 6 | [Salud](#6-salud) | 1 |
| 7 | [Auth](#7-auth) | 3 |
| 8 | [Clientes](#8-clientes) | 5 |
| 9 | [Solicitudes](#9-solicitudes) | 5 |
| 10 | [Parámetros de análisis](#10-parámetros-de-análisis) | 5 |
| 11 | [Cotizaciones](#11-cotizaciones) | 6 |
| 12 | [Pagos](#12-pagos) | 3 |
| 13 | [Muestras](#13-muestras) | 20 |
| 14 | [Análisis (resultados)](#14-análisis-resultados) | 4 |
| 15 | [Incidencias](#15-incidencias) | 11 |
| 16 | [Notificaciones](#16-notificaciones) | 3 |
| 17 | [Disposiciones](#17-disposiciones) | 3 |
| 18 | [Informes](#18-informes) | 6 |
| 19 | [Encuestas](#19-encuestas) | 2 |
| 20 | [Facturas](#20-facturas) | 7 |
| 21 | [API pública](#21-api-pública) | 5 |
| 22 | [Usuarios](#22-usuarios) | 6 |
| 23 | [Auditorías](#23-auditorías) | 1 |
| 24 | [Verificación de conteo](#24-verificación-de-conteo) | 95 + 1 |

---

## 2. Autenticación

### Obtener el token

```http
POST /api/interno/auth/login
Content-Type: application/json

{
  "email": "admin@laboratorio.com",
  "password": "Secreta123"
}
```

**Respuesta 200:**

```json
{
  "ok": true,
  "mensaje": "Inicio de sesión exitoso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY1ZjFhMmIzYzRkNWU2ZjcwODE5MmEzYiIsInJvbCI6ImFkbWluIiwiaWF0IjoxNzY3OTAwMDAwLCJleHAiOjE3Njc5Mjg4MDB9.xYzAbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefghijklmnop",
  "usuario": {
    "id": "65f1a2b3c4d5e6f708192a3b",
    "nombre": "Administrador",
    "email": "admin@laboratorio.com",
    "rol": "admin",
    "permisos": { "editar": false, "eliminar": false }
  }
}
```

- Errores: **401** `"Credenciales inválidas"` (usuario inexistente, eliminado o contraseña incorrecta), **400** `"Datos inválidos"` con `detalles` si el `email` no es válido o `password` está vacío.

### Usar el token

```http
GET /api/interno/clientes
Authorization: Bearer <token>
```

- El token JWT lleva `{ id, rol }` y vence según `JWT_EXPIRES_IN` (por defecto **8 h**).
- Cualquier endpoint de `/api/interno` **sin** token responde **401**:
  - `"No se proporcionó un token de autenticación"` (falta el header o no empieza por `Bearer `).
  - `"Token inválido o expirado"` (firma/expiración incorrecta).
  - `"El usuario del token ya no existe o está inactivo"` (usuario borrado lógicamente).
- Rol insuficiente → **403** `"No tienes permisos para esta acción"`.
- Permiso insuficiente (`requirePermiso`) → **403** `"No tienes el permiso de eliminar"`.
  - `requirePermiso('eliminar')`: el rol **admin siempre pasa**; los demás necesitan `permisos.eliminar === true` en su usuario.
- `POST /api/interno/auth/login` es el **único** endpoint interno sin `auth`; `GET/PUT /api/interno/auth/perfil` usan `auth` **sin** restricción de rol.

---

## 3. Formato de error

Todos los errores (incluidos 404 y 405) se devuelven en JSON con este formato:

```json
{
  "ok": false,
  "mensaje": "Texto claro en español",
  "detalles": [
    { "campo": "email", "mensaje": "Correo inválido" }
  ]
}
```

- `detalles` **solo aparece** cuando la validación zod falla (`validate(...)` o parseo en el controller): mensaje `"Datos inválidos"` + lista `[{ campo, mensaje }]`.
- Los errores no previstos se responden como **500** `"Error interno del servidor"` (el stack solo va al log del servidor, nunca al cliente).
- Ruta inexistente fuera de la superficie pública → **404** `"Ruta no encontrada: <MÉTODO> <ruta>"`.

---

## 4. Códigos de estado

| Código | Cuándo ocurre |
|--------|---------------|
| **200** | Consulta/actualización correcta (también se usa en `POST /cotizaciones/:id/enviar` cuando falla el correo, con `ok:false` y HTTP 200). |
| **201** | Creación (clientes, solicitudes, parámetros, cotizaciones, pagos, muestras, incidencias, respuestas, análisis, disposiciones, informes, facturas, respuesta a encuesta). |
| **400** | Validación zod (`Datos inválidos` + `detalles`), reglas de negocio (transición no permitida, falta motivo, pago no confirmado, duplicados, estado incorrecto, `id` no válido…). |
| **401** | Sin token, token inválido/expirado, credenciales inválidas. |
| **403** | Rol o permiso insuficiente. |
| **404** | Recurso inexistente (o eliminado lógicamente: responde igual que inexistente). |
| **405** | Cualquier método distinto de `GET` en `/api/publico` que no sea uno de los dos `POST` permitidos. |
| **409** | `POST /api/publico/encuestas/:token` cuando la encuesta ya fue respondida. |
| **413** | El PDF generado en un informe supera `MAX_FILE_MB`. |
| **429** | Rate limit de `/api/publico`: **30 consultas/min** por IP (GET) y **10 publicaciones cada 15 min** por IP (los dos POST permitidos). |
| **502** | Fallo del proveedor externo (Factus sandbox) o del envío de correo en facturas/informes. |
| **500** | Error interno no previsto. |

---

## 5. Códigos de muestra vs. código de seguimiento

| | `codigo` de muestra | `codigoSeguimiento` |
|---|---|---|
| **Ejemplo** | `0042-2026` | `9f2c7d1e5a4b8c3d6e1f0a2b4c6d8e0f` (32 hex, 16 bytes) |
| **Naturaleza** | Consecutivo predecible: `AAAA`-`AAAA` (`0042-2026`), generado con `findOneAndUpdate + $inc` sobre la colección `secuencias`. | Token aleatorio e impredecible (`crypto.randomBytes(16).toString('hex')`). |
| **Cuándo se crea** | Solo al **aceptar** la muestra (`POST /api/interno/muestras/:id/aceptar`). | Lo mismo, en el mismo momento. |
| **Uso** | Identificación interna y rótulo (PDF). | **Llave de la API pública**: consulta de seguimiento, descarga del informe y respuesta a incidencias. |
| **Aparece en** | API interna y, como dato informativo, en la consulta pública. | API interna y API pública. |

Otras series con el mismo patrón: informes `0001-2026` (`informes-<año>`), facturas `0001-2026` (`facturas-<año>`), cotizaciones (número consecutivo).

**Borrado lógico:** todos los `DELETE` responden algo del estilo `"...(borrado lógico)"` y marcan `eliminado`, `eliminadoPor`, `fechaEliminacion`. Un documento borrado **no aparece** en los listados ni es recuperable por `GET /:id` (404 igual que si nunca existió).

---

## 6. Salud

> Definido con `app.get` en `src/app.js` (no es una ruta de módulo; no cuenta en las 88 rutas `router.<método>`).

| Método | Ruta | Rol requerido | Descripción |
|--------|------|---------------|-------------|
| GET | `/api/health` | Ninguno (sin JWT) | Estado del servidor y de la conexión a MongoDB. |

```json
{
  "ok": true,
  "mensaje": "API funcionando",
  "baseDatos": "conectada",
  "uptime": 128.452,
  "fecha": "2026-10-08T15:30:00.000Z"
}
```

- `baseDatos` ∈ `desconectada | conectada | conectando | desconectando | desconocido`. El servidor sigue arriba aunque la BD falle.

---

## 7. Auth

| Método | Ruta | Rol requerido | Validación zod | Descripción |
|--------|------|---------------|----------------|-------------|
| POST | `/api/interno/auth/login` | Ninguno (público) | `loginSchema` | Devuelve el JWT. |
| GET | `/api/interno/auth/perfil` | JWT (cualquier rol) | — | Perfil del usuario del token. |
| PUT | `/api/interno/auth/perfil` | JWT (cualquier rol) | `actualizarPerfilSchema` | Actualiza nombre y/o contraseña propios. |

### POST `/api/interno/auth/login`

**Body:** `email` (obligatorio, formato correo) · `password` (obligatorio, no vacío).

Respuesta 200 → ver [§2 Autenticación](#2-autenticación).
Errores: **400** datos inválidos · **401** `"Credenciales inválidas"`.

### GET `/api/interno/auth/perfil`

```json
{
  "ok": true,
  "usuario": {
    "_id": "65f1a2b3c4d5e6f708192a3b",
    "nombre": "Laura Encargada",
    "email": "laura@laboratorio.com",
    "rol": "encargado",
    "permisos": { "editar": true, "eliminar": false },
    "eliminado": false,
    "createdAt": "2026-02-01T14:05:00.000Z",
    "updatedAt": "2026-09-15T09:12:33.000Z"
  }
}
```

Errores: **404** `"Usuario no encontrado"` (caso extremo, tras pasar el `auth`).

### PUT `/api/interno/auth/perfil`

**Body** (al menos uno de los dos, si no → 400 `"Datos inválidos"`):

| Campo | Tipo | Obligatorio |
|-------|------|-------------|
| `nombre` | string (≥1) | No* |
| `password` | string (≥6) | No* |

\* Obligatorio que venga `nombre` **o** `password` (refine de zod).

```json
{
  "ok": true,
  "mensaje": "Perfil actualizado",
  "usuario": {
    "_id": "65f1a2b3c4d5e6f708192a3b",
    "nombre": "Laura Encargada",
    "email": "laura@laboratorio.com",
    "rol": "encargado",
    "permisos": { "editar": true, "eliminar": false }
  }
}
```

> `password` nunca aparece en la respuesta (`select: false` y se hashea con bcrypt en el `pre('save')`).

---

## 8. Clientes

| Método | Ruta | Rol requerido | Validación zod | Descripción |
|--------|------|---------------|----------------|-------------|
| GET | `/api/interno/clientes` | admin, encargado, usuario | — | Listado completo (más recientes primero). |
| GET | `/api/interno/clientes/:id` | admin, encargado, usuario | — | Detalle de un cliente. |
| POST | `/api/interno/clientes` | admin, encargado | `crearClienteSchema` | Crea un cliente. |
| PUT | `/api/interno/clientes/:id` | admin, encargado | `actualizarClienteSchema` | Actualiza campos (parcial). |
| DELETE | `/api/interno/clientes/:id` | admin | — | Borrado **lógico**. |

**Body POST `crearClienteSchema`:**

| Campo | Tipo | Obligatorio |
|-------|------|-------------|
| `nombre` | string (≥1) | **Sí** |
| `tipoDocumento` | `CC \| NIT \| CE \| TI` | No (default `CC`) |
| `numeroDocumento` | string (≥1) | **Sí** |
| `email` | string (correo) | **Sí** |
| `telefono` | string | No |
| `direccion` | string | No |
| `tipoCliente` | `interno \| externo` | **Sí** |

`PUT` usa el mismo esquema en `.partial()` → todos los campos opcionales (pero si vienen, pasan las mismas reglas).

**POST 201:**

```json
{
  "ok": true,
  "mensaje": "Cliente creado",
  "cliente": {
    "_id": "6601b2c3d4e5f60718293a4b",
    "nombre": "Constructora Andina S.A.S.",
    "tipoDocumento": "NIT",
    "numeroDocumento": "900123456-7",
    "email": "contacto@constructoraandina.co",
    "telefono": "3005551234",
    "direccion": "Cra 7 # 34-56, Bogotá",
    "tipoCliente": "externo",
    "eliminado": false,
    "createdAt": "2026-10-08T15:40:00.000Z",
    "updatedAt": "2026-10-08T15:40:00.000Z"
  }
}
```

**GET 200 (listado):**

```json
{
  "ok": true,
  "clientes": [
    {
      "_id": "6601b2c3d4e5f60718293a4b",
      "nombre": "Constructora Andina S.A.S.",
      "tipoDocumento": "NIT",
      "numeroDocumento": "900123456-7",
      "email": "contacto@constructoraandina.co",
      "telefono": "3005551234",
      "direccion": "Cra 7 # 34-56, Bogotá",
      "tipoCliente": "externo"
    },
    {
      "_id": "65f9c8d7e6f5041327181920",
      "nombre": "María Gómez",
      "tipoDocumento": "CC",
      "numeroDocumento": "1025874596",
      "email": "maria.gomez@correo.com",
      "telefono": "",
      "direccion": "",
      "tipoCliente": "interno"
    }
  ]
}
```

**GET 200 (uno):** `{ "ok": true, "cliente": { ...} }`
**PUT 200:** `{ "ok": true, "mensaje": "Cliente actualizado", "cliente": { ...} }`
**DELETE 200:**

```json
{ "ok": true, "mensaje": "Cliente eliminado (borrado lógico)" }
```

Errores típicos: **400** `"Ya existe un cliente con ese documento"` · **404** `"Cliente no encontrado"` · **403** en `POST/PUT` con rol `usuario` y en `DELETE` sin rol `admin`.

---

## 9. Solicitudes

| Método | Ruta | Rol requerido | Validación zod | Descripción |
|--------|------|---------------|----------------|-------------|
| GET | `/api/interno/solicitudes` | admin, encargado, usuario | — | Listado (cliente poblado). |
| GET | `/api/interno/solicitudes/:id` | admin, encargado, usuario | — | Detalle. |
| POST | `/api/interno/solicitudes` | admin, encargado | `crearSolicitudSchema` | Crea solicitud de análisis. |
| PUT | `/api/interno/solicitudes/:id` | admin, encargado | `actualizarSolicitudSchema` | Actualiza campos/estado. |
| DELETE | `/api/interno/solicitudes/:id` | admin | — | Borrado **lógico**. |

**Body POST `crearSolicitudSchema`:**

| Campo | Tipo | Obligatorio |
|-------|------|-------------|
| `cliente` | string (ObjectId) | **Sí** |
| `tipoCliente` | `interno \| externo` | **Sí** |
| `descripcion` | string | No |
| `prioridad` | `baja \| media \| alta` | No (default `media`) |
| `atencionInmediata` | boolean | No |
| `motivoAtencionInmediata` | string | **Sí si `atencionInmediata: true`** (refine) |

**Body PUT `actualizarSolicitudSchema`:** `descripcion`, `prioridad`, `atencionInmediata`, `motivoAtencionInmediata`, `estado` (`pendiente|cotizada|aceptada|pagada|rechazada`) — todos opcionales.

> El servicio fija `requierePago = (tipoCliente === 'externo')` al crear.

**POST 201:**

```json
{
  "ok": true,
  "mensaje": "Solicitud creada",
  "solicitud": {
    "_id": "6610a1b2c3d4e5f607182930",
    "cliente": "6601b2c3d4e5f60718293a4b",
    "tipoCliente": "externo",
    "descripcion": "Análisis de aguas para obra",
    "prioridad": "alta",
    "atencionInmediata": true,
    "motivoAtencionInmediata": "Cierre de obra programado para el viernes",
    "estado": "pendiente",
    "requierePago": true,
    "createdAt": "2026-10-08T16:05:00.000Z",
    "updatedAt": "2026-10-08T16:05:00.000Z"
  }
}
```

**GET 200:**

```json
{
  "ok": true,
  "solicitudes": [
    {
      "_id": "6610a1b2c3d4e5f607182930",
      "cliente": {
        "_id": "6601b2c3d4e5f60718293a4b",
        "nombre": "Constructora Andina S.A.S.",
        "email": "contacto@constructoraandina.co",
        "tipoCliente": "externo"
      },
      "tipoCliente": "externo",
      "descripcion": "Análisis de aguas para obra",
      "prioridad": "alta",
      "estado": "cotizada",
      "requierePago": true
    }
  ]
}
```

**GET 200 (uno):** `{ "ok": true, "solicitud": { ... } }` (con `cliente` poblado completo en `obtener`).
**PUT 200:** `{ "ok": true, "mensaje": "Solicitud actualizada", "solicitud": { ...} }`
**DELETE 200:** `{ "ok": true, "mensaje": "Solicitud eliminada (borrado lógico)" }`

Errores: **400** `"El cliente no existe"` · **400** `"El motivo es obligatorio cuando hay atención inmediata"` · **404** `"Solicitud no encontrada"`.

---

## 10. Parámetros de análisis

| Método | Ruta | Rol requerido | Validación zod | Descripción |
|--------|------|---------------|----------------|-------------|
| GET | `/api/interno/parametros-analisis` | admin, encargado, usuario | — | Catálogo (orden `nombre`). |
| GET | `/api/interno/parametros-analisis/:id` | admin, encargado, usuario | — | Detalle. |
| POST | `/api/interno/parametros-analisis` | admin, encargado | `crearParametroSchema` | Crea parámetro. |
| PUT | `/api/interno/parametros-analisis/:id` | admin, encargado | `actualizarParametroSchema` | Actualiza (parcial). |
| DELETE | `/api/interno/parametros-analisis/:id` | admin | — | Borrado **lógico**. |

**Body POST:**

| Campo | Tipo | Obligatorio |
|-------|------|-------------|
| `nombre` | string (≥1) | **Sí** |
| `descripcion` | string | No |
| `precio` | número ≥ 0 | **Sí** |
| `unidad` | string | No |
| `activo` | boolean | No (default `true`) |

`PUT` = mismo esquema `.partial()`.

**POST 201:**

```json
{
  "ok": true,
  "mensaje": "Parámetro creado",
  "parametro": {
    "_id": "6620f1e2d3c4b5a697889900",
    "nombre": "pH",
    "descripcion": "Potencial de hidrógeno",
    "precio": 18000,
    "unidad": "pH",
    "activo": true,
    "eliminado": false,
    "createdAt": "2026-10-08T16:20:00.000Z",
    "updatedAt": "2026-10-08T16:20:00.000Z"
  }
}
```

**GET 200:**

```json
{
  "ok": true,
  "parametros": [
    { "_id": "6620f1e2d3c4b5a697889900", "nombre": "pH", "descripcion": "Potencial de hidrógeno", "precio": 18000, "unidad": "pH", "activo": true },
    { "_id": "6620f1e2d3c4b5a697889901", "nombre": "Turbidez", "descripcion": "", "precio": 22000, "unidad": "UTN", "activo": true }
  ]
}
```

**GET 200 (uno):** `{ "ok": true, "parametro": { ...} }`
**PUT 200:** `{ "ok": true, "mensaje": "Parámetro actualizado", "parametro": { ...} }`
**DELETE 200:** `{ "ok": true, "mensaje": "Parámetro eliminado (borrado lógico)" }`

Errores: **400** `"Ya existe un parámetro con ese nombre"` · **404** `"Parámetro no encontrado"`.

---

## 11. Cotizaciones

| Método | Ruta | Rol requerido | Validación zod | Descripción |
|--------|------|---------------|----------------|-------------|
| GET | `/api/interno/cotizaciones` | admin, encargado, usuario | — | Listado (solicitud e ítems poblados). |
| GET | `/api/interno/cotizaciones/:id` | admin, encargado, usuario | — | Detalle. |
| POST | `/api/interno/cotizaciones` | admin, encargado | `crearCotizacionSchema` | Crea cotización (numeración automática). |
| POST | `/api/interno/cotizaciones/:id/enviar` | admin, encargado | — | Envía la cotización por correo. |
| POST | `/api/interno/cotizaciones/:id/aceptar` | admin, encargado | — | Acepta (y acepta la solicitud). |
| POST | `/api/interno/cotizaciones/:id/rechazar` | admin, encargado | — | Rechaza (y rechaza la solicitud). |

**Body POST `crearCotizacionSchema`:**

| Campo | Tipo | Obligatorio |
|-------|------|-------------|
| `solicitud` | string (ObjectId) | **Sí** |
| `items` | array de ítems, mínimo 1 | **Sí** |
| `items[].parametro` | string (ObjectId) | **Sí** |
| `items[].descripcion` | string | No (default: nombre del parámetro) |
| `items[].cantidad` | entero ≥ 1 | **Sí** |

> El precio unitario **no** se envía: se toma del catálogo. `total = subtotal = Σ(cantidad × precio)`.

**POST 201:**

```json
{
  "ok": true,
  "mensaje": "Cotización creada",
  "cotizacion": {
    "_id": "6630a1b2c3d4e5f607182940",
    "solicitud": "6610a1b2c3d4e5f607182930",
    "numero": 7,
    "items": [
      {
        "parametro": "6620f1e2d3c4b5a697889900",
        "descripcion": "pH",
        "cantidad": 3,
        "precioUnitario": 18000,
        "subtotal": 54000,
        "_id": "6630a1b2c3d4e5f607182941"
      }
    ],
    "subtotal": 54000,
    "total": 54000,
    "estado": "borrador",
    "enviadaPorCorreo": false,
    "errorCorreo": "",
    "createdAt": "2026-10-08T17:00:00.000Z",
    "updatedAt": "2026-10-08T17:00:00.000Z"
  }
}
```

**GET 200 (listado):**

```json
{
  "ok": true,
  "cotizaciones": [
    {
      "_id": "6630a1b2c3d4e5f607182940",
      "solicitud": { "_id": "6610a1b2c3d4e5f607182930", "estado": "aceptada", "prioridad": "alta" },
      "numero": 7,
      "items": [
        { "parametro": { "_id": "6620f1e2d3c4b5a697889900", "nombre": "pH", "precio": 18000 }, "descripcion": "pH", "cantidad": 3, "precioUnitario": 18000, "subtotal": 54000 }
      ],
      "subtotal": 54000,
      "total": 54000,
      "estado": "aceptada",
      "enviadaPorCorreo": true,
      "errorCorreo": ""
    }
  ]
}
```

**POST `/:id/enviar` 200 (éxito):**

```json
{
  "ok": true,
  "mensaje": "Cotización enviada por correo",
  "cotizacion": {
    "_id": "6630a1b2c3d4e5f607182940",
    "numero": 7,
    "estado": "enviada",
    "enviadaPorCorreo": true,
    "errorCorreo": "",
    "total": 54000
  }
}
```

**POST `/:id/enviar` 200 (fallo de correo — HTTP 200 con `ok:false`):**

```json
{
  "ok": false,
  "mensaje": "No se pudo enviar la cotización por correo: Fallo en la conexión SMTP. La cotización quedó marcada como envío fallido.",
  "cotizacion": {
    "_id": "6630a1b2c3d4e5f607182940",
    "numero": 7,
    "estado": "envio_fallido",
    "enviadaPorCorreo": false,
    "errorCorreo": "Fallo en la conexión SMTP."
  }
}
```

**POST `/:id/aceptar` 200:**

```json
{
  "ok": true,
  "mensaje": "Cotización aceptada",
  "cotizacion": { "_id": "6630a1b2c3d4e5f607182940", "numero": 7, "estado": "aceptada" }
}
```

**POST `/:id/rechazar` 200:**

```json
{
  "ok": true,
  "mensaje": "Cotización rechazada",
  "cotizacion": { "_id": "6630a1b2c3d4e5f607182940", "numero": 7, "estado": "rechazada" }
}
```

Errores: **400** `"La solicitud no existe"` · **400** `"Parámetro no encontrado: <id>"` · **400** `"La solicitud no tiene un cliente con correo"` · **404** `"Cotización no encontrada"`.
Estados posibles: `borrador | enviada | envio_fallido | aceptada | rechazada`.

---

## 12. Pagos

| Método | Ruta | Rol requerido | Validación zod | Descripción |
|--------|------|---------------|----------------|-------------|
| GET | `/api/interno/pagos` | admin, encargado, usuario | — | Listado de pagos simulados. |
| POST | `/api/interno/pagos` | admin, encargado | `crearPagoSchema` | Genera el pago de una cotización aceptada. |
| POST | `/api/interno/pagos/:referencia/confirmar` | admin, encargado | — | Confirma el pago simulado. |

> Pagos 100 % simulados: sin pasarela y **sin datos de tarjeta**. La referencia se genera como `PAY-<timestamp>-<hex>`.

**Body POST:** `{ "cotizacion": "<ObjectId>" }` — `cotizacion` obligatorio.

**POST 201:**

```json
{
  "ok": true,
  "mensaje": "Pago simulado generado",
  "pago": {
    "_id": "6640a1b2c3d4e5f607182950",
    "cotizacion": "6630a1b2c3d4e5f607182940",
    "solicitud": "6610a1b2c3d4e5f607182930",
    "referencia": "PAY-1767900000000-A1B2C3D4",
    "monto": 54000,
    "metodo": "simulado",
    "estado": "pendiente",
    "fechaConfirmacion": null,
    "createdAt": "2026-10-08T17:10:00.000Z",
    "updatedAt": "2026-10-08T17:10:00.000Z"
  }
}
```

**GET 200:**

```json
{
  "ok": true,
  "pagos": [
    {
      "_id": "6640a1b2c3d4e5f607182950",
      "cotizacion": { "_id": "6630a1b2c3d4e5f607182940", "numero": 7, "total": 54000 },
      "solicitud": { "_id": "6610a1b2c3d4e5f607182930", "estado": "pagada" },
      "referencia": "PAY-1767900000000-A1B2C3D4",
      "monto": 54000,
      "metodo": "simulado",
      "estado": "confirmado",
      "fechaConfirmacion": "2026-10-08T17:15:00.000Z"
    }
  ]
}
```

**POST `/:referencia/confirmar` 200:**

```json
{
  "ok": true,
  "mensaje": "Pago confirmado (simulado)",
  "pago": {
    "_id": "6640a1b2c3d4e5f607182950",
    "referencia": "PAY-1767900000000-A1B2C3D4",
    "monto": 54000,
    "metodo": "simulado",
    "estado": "confirmado",
    "fechaConfirmacion": "2026-10-08T17:15:00.000Z"
  }
}
```

> Confirmar también pasa la solicitud asociada a `estado: "pagada"`.

Errores: **404** `"Cotización no encontrada"` · **400** `"La cotización debe estar aceptada para generar el pago"` · **404** `"Pago no encontrado"` (referencia inexistente).

---

## 13. Muestras

| Método | Ruta | Rol requerido | Validación zod | Descripción |
|--------|------|---------------|----------------|-------------|
| GET | `/api/interno/muestras` | admin, encargado, usuario | — | Inventario con filtros. |
| GET | `/api/interno/muestras/pendientes-disposicion` | admin, encargado, usuario | — | Cerradas con plazo de conservación vencido (RF-092). |
| GET | `/api/interno/muestras/:id` | admin, encargado, usuario | — | Detalle completo. |
| POST | `/api/interno/muestras` | admin, encargado | `recibirMuestraSchema` | Registra la recepción. |
| PUT | `/api/interno/muestras/:id` | admin, encargado | `actualizarMuestraSchema` | Actualiza datos básicos. |
| DELETE | `/api/interno/muestras/:id` | admin, encargado, usuario **+ permiso `eliminar`** | — | Borrado **lógico**. |
| POST | `/api/interno/muestras/:id/aceptar` | admin, encargado | — | Acepta: genera `codigo` (`0042-2026`) y `codigoSeguimiento`. |
| POST | `/api/interno/muestras/:id/rechazar` | admin, encargado | `rechazarSchema` | Rechaza con motivo. |
| PATCH | `/api/interno/muestras/:id/parametros` | admin, encargado | `parametrosSchema` | Asigna parámetros del catálogo. |
| POST | `/api/interno/muestras/:id/rotulo` | admin, encargado | — | Genera el PDF del rótulo (se guarda en la BD). |
| GET | `/api/interno/muestras/:id/rotulo/descargar` | admin, encargado, usuario | — | Descarga el rótulo (PDF). |
| PATCH | `/api/interno/muestras/:id/ubicacion` | admin, encargado | `ubicacionSchema` | Ubicación física + clasificación. |
| PATCH | `/api/interno/muestras/:id/estado` | admin, encargado | `estadoSchema` (zod local) | Cambio de estado con transiciones validadas. |
| GET | `/api/interno/muestras/:id/trazabilidad` | admin, encargado, usuario | — | Historial de eventos. |
| POST | `/api/interno/muestras/:id/observaciones` | admin, encargado | `observacionSchema` (zod local) | Registra observación interna/visible. |
| PUT | `/api/interno/muestras/:id/corregir` | admin, encargado | `correccionSchema` (zod local) | Corrige datos con antes/después. |
| POST | `/api/interno/muestras/:id/iniciar` | admin, encargado | — | Inicio formal del proceso. |
| POST | `/api/interno/muestras/:id/cerrar` | admin, encargado | — | Cierra y calcula la conservación (7 días hábiles). |
| PATCH | `/api/interno/muestras/:id/fecha-estimada` | admin, encargado | `fechaSchema` (zod local) | Cambia la fecha estimada con motivo. |
| GET | `/api/interno/muestras/:id/cambios-fecha` | admin, encargado, usuario | — | Historial de cambios de fecha. |

> La ruta `/pendientes-disposicion` está declarada **antes** de `/:id` para no ser capturada como un `id`.

### GET `/api/interno/muestras`

**Query:** `estado` (enum de estados de muestra) · `codigo` (ej. `0042-2026`) · `desde` / `hasta` (fechas de recepción) · `orden` = `reciente` (default) | `llegada`.

```json
{
  "ok": true,
  "muestras": [
    {
      "_id": "6650a1b2c3d4e5f607182960",
      "solicitudId": { "_id": "6610a1b2c3d4e5f607182930", "estado": "pagada", "prioridad": "alta" },
      "clienteId": { "_id": "6601b2c3d4e5f60718293a4b", "nombre": "Constructora Andina S.A.S.", "email": "contacto@constructoraandina.co" },
      "nombreMuestra": "Agua potable red hídrica",
      "descripcion": "Toma en obra",
      "tipoFisico": "liquido",
      "cantidad": 500,
      "unidad": "ml",
      "verificacionFisica": true,
      "estadoRecepcion": "aceptada",
      "motivoRechazo": "",
      "codigo": "0042-2026",
      "codigoSeguimiento": "9f2c7d1e5a4b8c3d6e1f0a2b4c6d8e0f",
      "estado": "en_analisis",
      "parametrosSeleccionados": ["6620f1e2d3c4b5a697889900"],
      "rotuloImpreso": true,
      "ubicacionActual": { "clasificacion": "en_analisis", "ubicacion": "Estante B - Nivel 2", "actualizadoEn": "2026-10-08T18:00:00.000Z" },
      "fechaRecepcion": "2026-10-08T14:30:00.000Z",
      "fechaInicio": "2026-10-08T17:45:00.000Z",
      "fechaEstimadaEntrega": "2026-10-13T00:00:00.000Z",
      "fechaCierre": null,
      "fechaLimiteConservacion": null,
      "pendienteDisposicion": false,
      "ultimoEvento": { "tipo": "cambio_estado", "fecha": "2026-10-08T17:50:00.000Z" }
    }
  ]
}
```

### GET `/api/interno/muestras/pendientes-disposicion`

```json
{
  "ok": true,
  "cantidad": 1,
  "muestras": [
    {
      "_id": "6650a1b2c3d4e5f607182965",
      "codigo": "0038-2026",
      "nombreMuestra": "Suelo agrícola",
      "estado": "cerrada",
      "fechaCierre": "2026-09-14T16:00:00.000Z",
      "fechaLimiteConservacion": "2026-09-23T00:00:00.000Z",
      "pendienteDisposicion": true,
      "clienteId": { "_id": "65f9c8d7e6f5041327181920", "nombre": "María Gómez", "email": "maria.gomez@correo.com" }
    }
  ]
}
```

### GET `/api/interno/muestras/:id`

```json
{
  "ok": true,
  "muestra": {
    "_id": "6650a1b2c3d4e5f607182960",
    "solicitudId": { "_id": "6610a1b2c3d4e5f607182930", "estado": "pagada", "descripcion": "Análisis de aguas para obra", "cliente": "6601b2c3d4e5f60718293a4b" },
    "clienteId": { "_id": "6601b2c3d4e5f60718293a4b", "nombre": "Constructora Andina S.A.S.", "email": "contacto@constructoraandina.co" },
    "nombreMuestra": "Agua potable red hídrica",
    "descripcion": "Toma en obra",
    "tipoFisico": "liquido",
    "cantidad": 500,
    "unidad": "ml",
    "codigo": "0042-2026",
    "codigoSeguimiento": "9f2c7d1e5a4b8c3d6e1f0a2b4c6d8e0f",
    "estado": "en_analisis",
    "parametrosSeleccionados": [
      { "_id": "6620f1e2d3c4b5a697889900", "nombre": "pH", "precio": 18000 }
    ],
    "estadoRecepcion": "aceptada"
  }
}
```

### POST `/api/interno/muestras` (recibir) → 201

**Body `recibirMuestraSchema`:**

| Campo | Tipo | Obligatorio |
|-------|------|-------------|
| `solicitudId` | string (ObjectId) | **Sí** |
| `nombreMuestra` | string (≥1) | **Sí** |
| `descripcion` | string | No |
| `tipoFisico` | `solido \| liquido` | **Sí** |
| `cantidad` | número > 0 | **Sí** |
| `verificacionFisica` | boolean | No |

> La `unidad` se deduce: `solido` → `g`, `liquido` → `ml`.

```json
{
  "ok": true,
  "mensaje": "ADVERTENCIA: la cantidad (250 ml) es menor a 300 ml. Se registra de todas formas.",
  "advertencia": "ADVERTENCIA: la cantidad (250 ml) es menor a 300 ml. Se registra de todas formas.",
  "muestra": {
    "_id": "6650a1b2c3d4e5f607182960",
    "solicitudId": "6610a1b2c3d4e5f607182930",
    "clienteId": "6601b2c3d4e5f60718293a4b",
    "nombreMuestra": "Agua potable red hídrica",
    "descripcion": "Toma en obra",
    "tipoFisico": "liquido",
    "cantidad": 250,
    "unidad": "ml",
    "verificacionFisica": false,
    "estadoRecepcion": "pendiente",
    "codigo": null,
    "codigoSeguimiento": null,
    "estado": "ingresada",
    "pendienteDisposicion": false,
    "fechaRecepcion": "2026-10-08T14:30:00.000Z"
  }
}
```

- Si `cantidad >= 300`, `advertencia` es `null` y `mensaje` es `"Muestra recibida"`.
- **400** `"La solicitud no existe"` · **400** `"No se puede recibir la muestra: la solicitud externa no tiene el pago confirmado"`.

### PUT `/api/interno/muestras/:id` → 200

**Body `actualizarMuestraSchema`** (todos opcionales): `nombreMuestra`, `descripcion`, `verificacionFisica`, `fechaEstimadaEntrega` (ISO datetime), `fechaLimiteConservacion` (ISO datetime).

```json
{ "ok": true, "mensaje": "Muestra actualizada", "muestra": { "_id": "6650a1b2c3d4e5f607182960", "nombreMuestra": "Agua potable red hídrica (corregido)", "estado": "en_analisis" } }
```

### DELETE `/api/interno/muestras/:id` → 200

```json
{ "ok": true, "mensaje": "Muestra eliminada (borrado lógico)" }
```

- Rol: `admin`, `encargado` o `usuario` **y además** el permiso `eliminar` (admin pasa siempre).

### POST `/api/interno/muestras/:id/aceptar` → 200

```json
{
  "ok": true,
  "mensaje": "Muestra aceptada",
  "muestra": {
    "_id": "6650a1b2c3d4e5f607182960",
    "codigo": "0042-2026",
    "codigoSeguimiento": "9f2c7d1e5a4b8c3d6e1f0a2b4c6d8e0f",
    "estadoRecepcion": "aceptada",
    "estado": "ingresada"
  }
}
```

- **400** `"La muestra ya fue aceptada"` · **404** `"Muestra no encontrada"`.

### POST `/api/interno/muestras/:id/rechazar` → 200

**Body:** `{ "motivoRechazo": "Cantidad insuficiente para el análisis" }` (`motivoRechazo` obligatorio ≥1).

```json
{
  "ok": true,
  "mensaje": "Muestra rechazada",
  "muestra": { "_id": "6650a1b2c3d4e5f607182960", "estadoRecepcion": "rechazada", "estado": "rechazada", "motivoRechazo": "Cantidad insuficiente para el análisis" }
}
```

> No genera `codigo` ni `codigoSeguimiento`.

### PATCH `/api/interno/muestras/:id/parametros` → 200

**Body:** `{ "parametrosIds": ["<ObjectId>", "<ObjectId>"] }` (arreglo, mínimo 1).

```json
{
  "ok": true,
  "mensaje": "Parámetros asignados",
  "muestra": { "_id": "6650a1b2c3d4e5f607182960", "parametrosSeleccionados": ["6620f1e2d3c4b5a697889900", "6620f1e2d3c4b5a697889901"] }
}
```

- **400** `"Alguno de los parámetros no existe en el catálogo"`.

### POST `/api/interno/muestras/:id/rotulo` → 200

```json
{
  "ok": true,
  "mensaje": "Rótulo generado e impreso",
  "muestra": { "_id": "6650a1b2c3d4e5f607182960", "codigo": "0042-2026", "rotuloImpreso": true }
}
```

- `rotuloPdf` (Buffer, `select:false`) **no** viaja en la respuesta.
- **400** `"La muestra aún no tiene código (debe estar aceptada)"`.

### GET `/api/interno/muestras/:id/rotulo/descargar` → 200 (PDF)

- Respuesta binaria `application/pdf` con `Content-Disposition: attachment; filename="rotulo-0042-2026.pdf"`.
- **404** `"La muestra no tiene rótulo generado"`.

### PATCH `/api/interno/muestras/:id/ubicacion` → 200

**Body `ubicacionSchema`:** `ubicacion` (string, **obligatoria**) · `clasificacion` (`ingresada | en_proceso | en_analisis`, **obligatoria**).

```json
{
  "ok": true,
  "mensaje": "Ubicación actualizada",
  "muestra": { "_id": "6650a1b2c3d4e5f607182960", "ubicacionActual": { "clasificacion": "en_analisis", "ubicacion": "Estante B - Nivel 2", "actualizadoEn": "2026-10-08T18:00:00.000Z" } }
}
```

### PATCH `/api/interno/muestras/:id/estado` → 200

**Body `estadoSchema`:** `estadoNuevo` (enum de 9 estados, **obligatorio**) · `motivo` (string, opcional).

| Estado actual | Transiciones permitidas |
|---|---|
| `ingresada` | `en_proceso` |
| `en_proceso` | `en_analisis` |
| `en_analisis` | `resultados_validados`, `en_proceso` (repetición, exige `motivo`) |
| `resultados_validados` | `cerrada` |
| `cerrada`, `rechazada`, `en_almacen`, `devuelta`, `desechada` | ninguna |

```json
{
  "ok": true,
  "mensaje": "Estado actualizado",
  "muestra": { "_id": "6650a1b2c3d4e5f607182960", "estado": "en_analisis" }
}
```

Errores: **400** `"Transición no permitida: en_proceso → cerrada"` · **400** `"Debes indicar un motivo para repetir el proceso"` · **400** `"Una muestra rechazada no puede avanzar de estado"`.

### GET `/api/interno/muestras/:id/trazabilidad` → 200

```json
{
  "ok": true,
  "eventos": [
    {
      "_id": "6650a1b2c3d4e5f607182970",
      "muestraId": "6650a1b2c3d4e5f607182960",
      "tipoEvento": "recepcion",
      "estadoAnterior": null,
      "estadoNuevo": null,
      "descripcion": "Muestra recibida: Agua potable red hídrica",
      "ubicacion": "",
      "visibleCliente": false,
      "usuarioId": "laura@laboratorio.com",
      "fecha": "2026-10-08T14:30:00.000Z"
    },
    {
      "_id": "6650a1b2c3d4e5f607182971",
      "muestraId": "6650a1b2c3d4e5f607182960",
      "tipoEvento": "cambio_estado",
      "estadoAnterior": "en_proceso",
      "estadoNuevo": "en_analisis",
      "descripcion": "",
      "visibleCliente": true,
      "usuarioId": "laura@laboratorio.com",
      "fecha": "2026-10-08T17:50:00.000Z"
    }
  ]
}
```

### POST `/api/interno/muestras/:id/observaciones` → 201

**Body `observacionSchema`:** `descripcion` (≥1, **obligatoria**) · `visibleCliente` (boolean, default `false`).

```json
{ "ok": true, "mensaje": "Observación registrada" }
```

### PUT `/api/interno/muestras/:id/corregir` → 200

**Body `correccionSchema`** (todos opcionales): `nombreMuestra`, `descripcion`, `verificacionFisica`, `fechaEstimadaEntrega`, `fechaLimiteConservacion`, `descripcionCorreccion`.

```json
{
  "ok": true,
  "mensaje": "Corrección registrada",
  "muestra": { "_id": "6650a1b2c3d4e5f607182960", "nombreMuestra": "Agua potable red hídrica", "descripcion": "Toma en obra — muestra corregida" }
}
```

### POST `/api/interno/muestras/:id/iniciar` → 200

```json
{
  "ok": true,
  "mensaje": "Proceso iniciado",
  "muestra": { "_id": "6650a1b2c3d4e5f607182960", "fechaInicio": "2026-10-08T17:45:00.000Z" }
}
```

- **400** `"No se puede iniciar: la solicitud requiere pago y no está confirmado"`.

### POST `/api/interno/muestras/:id/cerrar` → 200

```json
{
  "ok": true,
  "mensaje": "Muestra cerrada",
  "muestra": {
    "_id": "6650a1b2c3d4e5f607182960",
    "estado": "cerrada",
    "fechaCierre": "2026-10-13T16:00:00.000Z",
    "fechaLimiteConservacion": "2026-10-24T00:00:00.000Z",
    "pendienteDisposicion": false
  }
}
```

- **400** `"La muestra no tiene parámetros seleccionados"` · **400** `"No se puede cerrar: hay parámetros sin resultado validado"`.
- `fechaLimiteConservacion` = hoy + **7 días hábiles** (sin sábados, domingos ni festivos).

### PATCH `/api/interno/muestras/:id/fecha-estimada` → 200

**Body `fechaSchema`:** `fechaNueva` (string ≥1, **obligatoria**) · `motivo` (string ≥1, **obligatorio**; motivo **interno**, solo auditoría) · `motivoPublico` (string ≤500, opcional; es lo único que verá el cliente en la API pública).

```json
{
  "ok": true,
  "mensaje": "Fecha estimada actualizada",
  "muestra": { "_id": "6650a1b2c3d4e5f607182960", "fechaEstimadaEntrega": "2026-10-16T00:00:00.000Z" }
}
```

### GET `/api/interno/muestras/:id/cambios-fecha` → 200

```json
{
  "ok": true,
  "cambios": [
    {
      "_id": "6650a1b2c3d4e5f607182980",
      "muestraId": "6650a1b2c3d4e5f607182960",
      "fechaAnterior": "2026-10-13T00:00:00.000Z",
      "fechaNueva": "2026-10-16T00:00:00.000Z",
      "motivo": "Falla en el equipo de titulación",
      "motivoPublico": "Mantenimiento del equipo",
      "usuarioId": "laura@laboratorio.com",
      "fechaCambio": "2026-10-09T10:15:00.000Z"
    }
  ]
}
```

> El historial **interno** sí incluye `motivo`; la [API pública](#21-api-pública) solo muestra `motivoPublico`.

---

## 14. Análisis (resultados)

Módulo `analisisMuestras`: un registro por **muestra + parámetro + ejecución**.

| Método | Ruta | Rol requerido | Validación zod | Descripción |
|--------|------|---------------|----------------|-------------|
| POST | `/api/interno/analisis` | admin, encargado | `registrarSchema` (zod local) | Registra un resultado. |
| POST | `/api/interno/analisis/:id/repetir` | admin, encargado | `repetirSchema` (zod local) | Nueva ejecución del mismo parámetro. |
| POST | `/api/interno/analisis/:id/validar` | admin, encargado | — | Valida el resultado. |
| GET | `/api/interno/analisis/muestra/:muestraId` | admin, encargado, usuario | — | Análisis de una muestra. |

**Body POST `/`:**

| Campo | Tipo | Obligatorio |
|-------|------|-------------|
| `muestraId` | string (ObjectId) | **Sí** |
| `parametroId` | string (ObjectId) | **Sí** |
| `valor` | número | No |
| `resultado` | string | No |
| `unidad` | string | No (default: la del parámetro) |

**POST 201:**

```json
{
  "ok": true,
  "mensaje": "Resultado registrado",
  "analisis": {
    "_id": "6660a1b2c3d4e5f607182990",
    "muestraId": "6650a1b2c3d4e5f607182960",
    "parametroId": "6620f1e2d3c4b5a697889900",
    "numeroEjecucion": 1,
    "tipo": "inicial",
    "motivoRepeticion": "",
    "estado": "completado",
    "resultado": "",
    "valor": 7.2,
    "unidad": "pH",
    "fechaInicio": "2026-10-08T18:05:00.000Z",
    "fechaFinalizacion": "2026-10-08T18:05:00.000Z",
    "realizadoPor": "laura@laboratorio.com",
    "validadoPor": null,
    "fechaValidacion": null,
    "createdAt": "2026-10-08T18:05:00.000Z",
    "updatedAt": "2026-10-08T18:05:00.000Z"
  }
}
```

**Body POST `/:id/repetir`:** `motivoRepeticion` (**obligatorio** ≥1) · `valor`, `resultado`, `unidad` (opcionales).

```json
{
  "ok": true,
  "mensaje": "Repetición registrada",
  "analisis": {
    "_id": "6660a1b2c3d4e5f607182995",
    "muestraId": "6650a1b2c3d4e5f607182960",
    "parametroId": "6620f1e2d3c4b5a697889900",
    "numeroEjecucion": 2,
    "tipo": "repeticion",
    "motivoRepeticion": "Lectura fuera de rango",
    "estado": "completado",
    "resultado": "",
    "valor": 7.4,
    "unidad": "pH"
  }
}
```

**POST `/:id/validar` 200:**

```json
{
  "ok": true,
  "mensaje": "Resultado validado",
  "analisis": {
    "_id": "6660a1b2c3d4e5f607182990",
    "estado": "validado",
    "validadoPor": "carlos@laboratorio.com",
    "fechaValidacion": "2026-10-08T18:30:00.000Z"
  }
}
```

**GET `/muestra/:muestraId` 200:**

```json
{
  "ok": true,
  "analisis": [
    {
      "_id": "6660a1b2c3d4e5f607182990",
      "muestraId": "6650a1b2c3d4e5f607182960",
      "parametroId": { "_id": "6620f1e2d3c4b5a697889900", "nombre": "pH", "unidad": "pH" },
      "numeroEjecucion": 1,
      "tipo": "inicial",
      "estado": "validado",
      "valor": 7.2,
      "unidad": "pH",
      "realizadoPor": "laura@laboratorio.com",
      "validadoPor": "carlos@laboratorio.com",
      "fechaValidacion": "2026-10-08T18:30:00.000Z"
    }
  ]
}
```

Errores: **404** `"Muestra no encontrada"` / `"Parámetro no encontrado"` / `"Análisis no encontrado"` · **400** `"El motivo de repetición es obligatorio"`.

---

## 15. Incidencias

| Método | Ruta | Rol requerido | Validación zod | Descripción |
|--------|------|---------------|----------------|-------------|
| GET | `/api/interno/incidencias` | admin, encargado, usuario | — | Listado (filtros `estado`, `muestraId`). |
| GET | `/api/interno/incidencias/:id` | admin, encargado, usuario | — | Detalle completo. |
| GET | `/api/interno/incidencias/:id/publica` | admin, encargado, usuario | — | Vista segura (sin observaciones internas). |
| POST | `/api/interno/incidencias` | admin, encargado | `crearIncidenciaSchema` | Crea incidencia. |
| PUT | `/api/interno/incidencias/:id` | admin, encargado | `actualizarIncidenciaSchema` | Actualiza campos. |
| PATCH | `/api/interno/incidencias/:id/aprobar` | admin, encargado | — | Aprueba (solo si requiere decisión). |
| PATCH | `/api/interno/incidencias/:id/cerrar` | admin, encargado | `cerrarSchema` | Cierra. |
| DELETE | `/api/interno/incidencias/:id` | **Permiso `eliminar`** (admin siempre) | — | Borrado **lógico**. |
| POST | `/api/interno/incidencias/:id/respuestas` | admin, encargado, usuario | — (multer) | Respuesta con hasta 3 adjuntos. |
| GET | `/api/interno/incidencias/:id/respuestas` | admin, encargado, usuario | — | Respuestas de la incidencia. |
| GET | `/api/interno/incidencias/respuestas/:rid/archivos/:index` | admin, encargado, usuario | — | Descarga de un adjunto. |

> `DELETE` **no** lleva `requireRole`, solo `requirePermiso('eliminar')`: cualquier rol autenticado con ese permiso (o `admin`) puede borrar.

**Body POST `crearIncidenciaSchema`:**

| Campo | Tipo | Obligatorio |
|-------|------|-------------|
| `muestraId` | string (ObjectId) | **Sí** |
| `tipo` | `informativa \| demora \| requiere_accion_cliente` | **Sí** |
| `titulo` | string (≥1) | **Sí** |
| `descripcion` | string | No |
| `observacionesInternas` | string | No (nunca sale a la API pública) |
| `visibleCliente` | boolean | No (default: `true` salvo para `informativa`) |
| `requiereRespuesta` | boolean | No (se fuerza a `true` si `tipo = requiere_accion_cliente`) |
| `nuevaFechaEstimada` | string | **Sí si `tipo = demora`** |
| `motivo` | string | **Sí si `tipo = demora`** |

> Una incidencia **nunca** cambia el estado de la muestra automáticamente (RF-072). Solo `tipo = demora` actualiza la `fechaEstimadaEntrega` (vía historial de cambios de fecha).

**Body PUT `actualizarIncidenciaSchema`** (todos opcionales): `titulo`, `descripcion`, `observacionesInternas`, `visibleCliente`, `estado` (`abierta|en_revision|esperando_cliente|aprobada|cerrada`).

**Body PATCH `cerrar`:** `{ "motivo": "..." }` — opcional, **obligatorio** si la incidencia está en `esperando_cliente`.

**POST 201:**

```json
{
  "ok": true,
  "mensaje": "Incidencia creada",
  "incidencia": {
    "_id": "6670a1b2c3d4e5f607182a00",
    "muestraId": "6650a1b2c3d4e5f607182960",
    "tipo": "demora",
    "titulo": "Retraso por falla del equipo",
    "descripcion": "El espectrofotómetro está en mantenimiento.",
    "observacionesInternas": "Proveedor llegó el 09/10",
    "visibleCliente": true,
    "requiereRespuesta": false,
    "estado": "abierta",
    "nuevaFechaEstimada": "2026-10-16T00:00:00.000Z",
    "motivo": "Mantenimiento correctivo del equipo",
    "creadaPor": "laura@laboratorio.com",
    "revisadaPor": null,
    "fechaCreacion": "2026-10-08T19:00:00.000Z",
    "fechaCierre": null,
    "acciones": [
      { "tipo": "creada", "usuario": "laura@laboratorio.com", "fecha": "2026-10-08T19:00:00.000Z", "comentario": "Retraso por falla del equipo" },
      { "tipo": "demora_fecha", "usuario": "laura@laboratorio.com", "fecha": "2026-10-08T19:00:01.000Z", "comentario": "Mantenimiento correctivo del equipo" }
    ]
  }
}
```

**GET `/?estado=&muestraId=` 200:**

```json
{
  "ok": true,
  "incidencias": [
    {
      "_id": "6670a1b2c3d4e5f607182a00",
      "muestraId": "6650a1b2c3d4e5f607182960",
      "tipo": "requiere_accion_cliente",
      "titulo": "Confirmación de datos de contacto",
      "descripcion": "Necesitamos un teléfono de contacto en obra.",
      "visibleCliente": true,
      "requiereRespuesta": true,
      "estado": "esperando_cliente",
      "fechaCreacion": "2026-10-08T19:10:00.000Z"
    }
  ]
}
```

**GET `/:id` 200:** `{ "ok": true, "incidencia": { ... } }` (incluye `observacionesInternas`, `creadaPor`, `revisadaPor`).

**GET `/:id/publica` 200** (misma incidencia **sin** `observacionesInternas`, `creadaPor`, `revisadaPor`):

```json
{
  "ok": true,
  "incidencia": {
    "_id": "6670a1b2c3d4e5f607182a00",
    "tipo": "demora",
    "titulo": "Retraso por falla del equipo",
    "descripcion": "El espectrofotómetro está en mantenimiento.",
    "visibleCliente": true,
    "estado": "abierta",
    "acciones": [
      { "tipo": "creada", "fecha": "2026-10-08T19:00:00.000Z", "comentario": "Retraso por falla del equipo" }
    ]
  }
}
```

**PUT 200:** `{ "ok": true, "mensaje": "Incidencia actualizada", "incidencia": { ...} }`
**PATCH `/aprobar` 200:**

```json
{ "ok": true, "mensaje": "Incidencia aprobada", "incidencia": { "_id": "6670a1b2c3d4e5f607182a00", "estado": "aprobada", "revisadaPor": "carlos@laboratorio.com" } }
```

**PATCH `/cerrar` 200:**

```json
{ "ok": true, "mensaje": "Incidencia cerrada", "incidencia": { "_id": "6670a1b2c3d4e5f607182a00", "estado": "cerrada", "fechaCierre": "2026-10-09T14:00:00.000Z" } }
```

**DELETE 200:**

```json
{ "ok": true, "mensaje": "Incidencia eliminada (borrado lógico)" }
```

**POST `/:id/respuestas` 201** — `multipart/form-data`:

| Campo | Tipo | Obligatorio |
|-------|------|-------------|
| `mensaje` | texto | No (queda `""`) |
| `tipoUsuario` | `cliente \| interno` | No (default `interno`) |
| `archivos` | hasta **3** archivos, `application/pdf`, `image/jpeg`, `image/png`, máx. `MAX_FILE_MB` (5 MB) | No |

```json
{
  "ok": true,
  "mensaje": "Respuesta registrada",
  "respuesta": {
    "_id": "6670a1b2c3d4e5f607182a10",
    "incidenciaId": "6670a1b2c3d4e5f607182a00",
    "tipoUsuario": "interno",
    "usuarioId": "laura@laboratorio.com",
    "mensaje": "Adjunto el acta de mantenimiento.",
    "archivos": [
      { "nombre": "acta-mantenimiento.pdf", "tipoMime": "application/pdf", "tamano": 48213 }
    ],
    "fecha": "2026-10-09T09:30:00.000Z"
  }
}
```

- `contenido` (Buffer) es `select:false` y **no** viaja en el listado.
- Si `tipoUsuario = "cliente"`, la incidencia pasa a `en_revision`.
- Errores: **400** `"Tipo de archivo no permitido. Solo PDF, JPG y PNG."` · **400** `"El archivo supera el límite de 5 MB"` · **400** `"Máximo 3 archivos por respuesta"` · **404** `"Incidencia no encontrada"`.

**GET `/:id/respuestas` 200:**

```json
{
  "ok": true,
  "respuestas": [
    {
      "_id": "6670a1b2c3d4e5f607182a10",
      "incidenciaId": "6670a1b2c3d4e5f607182a00",
      "tipoUsuario": "cliente",
      "usuarioId": null,
      "mensaje": "El contacto en obra es el ing. Rueda, 310 555 0000.",
      "archivos": [
        { "nombre": "contacto.png", "tipoMime": "image/png", "tamano": 120480 }
      ],
      "fecha": "2026-10-09T15:00:00.000Z"
    }
  ]
}
```

**GET `/respuestas/:rid/archivos/:index` 200:** binario con `Content-Type` original y `Content-Disposition: attachment; filename="..."`. **404** `"Respuesta no encontrada"` / `"Archivo no encontrado"`.

Otros errores: **400** `"La incidencia de demora exige nuevaFechaEstimada y motivo"` · **400** `"Solo se pueden aprobar incidencias que requieren decisión"` · **400** `"Para cerrar una incidencia esperando al cliente debes indicar un motivo"` · **404** `"Incidencia no encontrada"`.

---

## 16. Notificaciones

| Método | Ruta | Rol requerido | Validación zod | Descripción |
|--------|------|---------------|----------------|-------------|
| GET | `/api/interno/notificaciones` | admin, encargado, usuario | `listarNotificacionesSchema` (sobre `query`) | Listado con filtros. |
| GET | `/api/interno/notificaciones/:id` | admin, encargado, usuario | — | Detalle. |
| POST | `/api/interno/notificaciones/:id/reintentar` | admin, encargado | — | Reintenta un envío fallido (máx. 3). |

**Query del listado:** `muestra` o `muestraId` (ObjectId) · `estado` (`pendiente|enviada|fallida`) · `tipo` (`cambio_etapa|incidencia|cambio_fecha|resultados_disponibles|conservacion|otro`).

**GET 200:**

```json
{
  "ok": true,
  "notificaciones": [
    {
      "_id": "6680a1b2c3d4e5f607182a20",
      "muestraId": "6650a1b2c3d4e5f607182960",
      "clienteId": "6601b2c3d4e5f60718293a4b",
      "tipo": "cambio_etapa",
      "asunto": "Tu muestra 0042-2026 cambió de estado",
      "mensaje": "La muestra \"Agua potable red hídrica\" pasó de \"en proceso\" a \"en análisis\".\nUsa tu código de seguimiento para consultar el detalle en la consulta pública.",
      "correoDestino": "contacto@constructoraandina.co",
      "medio": "correo",
      "estado": "enviada",
      "intentos": 1,
      "errorUltimoIntento": null,
      "fechaProgramada": "2026-10-08T17:50:00.000Z",
      "fechaEnvio": "2026-10-08T17:50:05.000Z",
      "createdAt": "2026-10-08T17:50:00.000Z"
    }
  ]
}
```

**GET `/:id` 200:** `{ "ok": true, "notificacion": { ... } }`

**POST `/:id/reintentar` 200 (éxito):**

```json
{
  "ok": true,
  "mensaje": "Notificación reenviada correctamente",
  "notificacion": { "_id": "6680a1b2c3d4e5f607182a25", "estado": "enviada", "intentos": 2, "errorUltimoIntento": null, "fechaEnvio": "2026-10-09T10:00:00.000Z" }
}
```

**POST `/:id/reintentar` 200 (sigue fallando):**

```json
{
  "ok": true,
  "mensaje": "Reintento registrado (2 de 3): Fallo en la conexión SMTP.",
  "notificacion": { "_id": "6680a1b2c3d4e5f607182a25", "estado": "fallida", "intentos": 2, "errorUltimoIntento": "Fallo en la conexión SMTP." }
}
```

Errores: **404** `"Notificación no encontrada"` · **400** `"Solo se pueden reintentar notificaciones fallidas"` · **400** `"Se alcanzó el límite de 3 intentos de envío"` · **400** `"Datos inválidos"` (query inválida) · **400** `"El identificador de muestra no es válido"`.

---

## 17. Disposiciones

| Método | Ruta | Rol requerido | Validación zod | Descripción |
|--------|------|---------------|----------------|-------------|
| GET | `/api/interno/disposiciones` | admin, encargado, usuario | `listarDisposicionesSchema` (sobre `query`) | Listado (muestra poblada). |
| GET | `/api/interno/disposiciones/:id` | admin, encargado, usuario | — | Detalle. |
| POST | `/api/interno/disposiciones` | admin, encargado | `crearDisposicionSchema` | Registra devolución/desecho. |

**Query del listado:** `muestra` o `muestraId` · `tipo` (`devolucion|desecho`).

**Body POST:**

| Campo | Tipo | Obligatorio |
|-------|------|-------------|
| `muestraId` | string (ObjectId) | **Sí** |
| `tipo` | `devolucion \| desecho` | **Sí** |
| `motivo` | string (≥3) | **Sí** |
| `observacion` | string | No |
| `fechaSalida` | ISO datetime | No (default: ahora) |
| `notificacionCliente` | boolean | No (default `false`) |

**POST 201:**

```json
{
  "ok": true,
  "mensaje": "Disposición registrada",
  "disposicion": {
    "_id": "6690a1b2c3d4e5f607182a30",
    "muestraId": "6650a1b2c3d4e5f607182965",
    "tipo": "devolucion",
    "motivo": "Retiro solicitado por el cliente",
    "observacion": "Se entregó en contenedor sellado",
    "fechaSalida": "2026-10-09T11:00:00.000Z",
    "notificacionCliente": true,
    "realizadaPor": "laura@laboratorio.com",
    "fechaCreacion": "2026-10-09T11:00:00.000Z"
  },
  "muestra": {
    "_id": "6650a1b2c3d4e5f607182965",
    "codigo": "0038-2026",
    "estado": "devuelta",
    "pendienteDisposicion": false
  }
}
```

- `tipo: "desecho"` deja la muestra en `estado: "desechada"`.
- **Una sola disposición activa por muestra** (índice único).

**GET 200:**

```json
{
  "ok": true,
  "disposiciones": [
    {
      "_id": "6690a1b2c3d4e5f607182a30",
      "muestraId": { "_id": "6650a1b2c3d4e5f607182965", "codigo": "0038-2026", "nombreMuestra": "Suelo agrícola", "estado": "devuelta" },
      "tipo": "devolucion",
      "motivo": "Retiro solicitado por el cliente",
      "fechaSalida": "2026-10-09T11:00:00.000Z",
      "notificacionCliente": true,
      "realizadaPor": "laura@laboratorio.com"
    }
  ]
}
```

**GET `/:id` 200:** `{ "ok": true, "disposicion": { ... } }`

Errores: **404** `"Muestra no encontrada"` · **400** `"La muestra ya tiene una disposición registrada"` · **400** `"Solo se puede registrar una disposición sobre muestras cerradas o rechazadas (estado actual: en_analisis)"` · **400** `'El tipo de disposición debe ser "devolucion" o "desecho"'` · **404** `"Disposición no encontrada"` · **400** `"El identificador de muestra no es válido"`.

---

## 18. Informes

| Método | Ruta | Rol requerido | Validación zod | Descripción |
|--------|------|---------------|----------------|-------------|
| GET | `/api/interno/informes` | admin, encargado, usuario | `listarInformesSchema` (sobre `query`) | Listado (sin el PDF). |
| POST | `/api/interno/informes/generar` | admin, encargado | `generarInformeSchema` | Genera el PDF del informe. |
| GET | `/api/interno/informes/:id/descargar` | admin, encargado, usuario | — | Descarga el PDF. |
| POST | `/api/interno/informes/:id/regenerar` | admin, encargado | — | Nueva versión (conserva la anterior). |
| POST | `/api/interno/informes/:id/disponible` | admin, encargado | — | Marca disponible y dispara la encuesta. |
| POST | `/api/interno/informes/:id/enviar` | admin, encargado | — (body opcional) | Envía el informe al cliente. |

**Query del listado:** `muestraId` o `muestra` · `estado` (`borrador|generado|disponible|enviado`).
**Body de `generar`:** `{ "muestraId": "<ObjectId>" }` — obligatorio.
**Body opcional de `enviar`:** `{ "conAdjunto": false }` → solo enlace público en lugar de PDF adjunto (default `true`; **no** tiene validación zod en la ruta).

**POST `/generar` 201:**

```json
{
  "ok": true,
  "mensaje": "Informe 0001-2026 generado",
  "informe": {
    "_id": "66a0a1b2c3d4e5f607182a40",
    "muestraId": "6650a1b2c3d4e5f607182960",
    "numeroInforme": "0001-2026",
    "estado": "generado",
    "version": 1,
    "regeneradoDe": null,
    "generadoPor": "carlos@laboratorio.com",
    "fechaGeneracion": "2026-10-13T16:30:00.000Z",
    "fechaDisponibilidad": null,
    "createdAt": "2026-10-13T16:30:00.000Z"
  }
}
```

> El campo `archivo` (PDF Buffer) es `select:false` y **nunca** aparece en el JSON.

**GET 200:**

```json
{
  "ok": true,
  "informes": [
    {
      "_id": "66a0a1b2c3d4e5f607182a40",
      "muestraId": "6650a1b2c3d4e5f607182960",
      "numeroInforme": "0001-2026",
      "estado": "disponible",
      "version": 1,
      "generadoPor": "carlos@laboratorio.com",
      "fechaGeneracion": "2026-10-13T16:30:00.000Z",
      "fechaDisponibilidad": "2026-10-13T17:00:00.000Z"
    }
  ]
}
```

**GET `/:id/descargar` 200:** binario `application/pdf` con `Content-Disposition: attachment; filename="0001-2026.pdf"`.

**POST `/:id/regenerar` 201:**

```json
{
  "ok": true,
  "mensaje": "Informe regenerado como versión 2 (se conserva 0001-2026)",
  "informe": {
    "_id": "66a0a1b2c3d4e5f607182a45",
    "muestraId": "6650a1b2c3d4e5f607182960",
    "numeroInforme": "0002-2026",
    "estado": "generado",
    "version": 2,
    "regeneradoDe": "66a0a1b2c3d4e5f607182a40",
    "fechaGeneracion": "2026-10-14T09:00:00.000Z"
  },
  "historial": [
    { "numeroInforme": "0001-2026", "version": 1, "estado": "disponible", "fechaGeneracion": "2026-10-13T16:30:00.000Z" },
    { "numeroInforme": "0002-2026", "version": 2, "estado": "generado", "fechaGeneracion": "2026-10-14T09:00:00.000Z" }
  ]
}
```

**POST `/:id/disponible` 200:**

```json
{
  "ok": true,
  "mensaje": "Informe 0002-2026 disponible",
  "informe": { "_id": "66a0a1b2c3d4e5f607182a45", "numeroInforme": "0002-2026", "estado": "disponible", "fechaDisponibilidad": "2026-10-14T09:20:00.000Z" }
}
```

**POST `/:id/enviar` 200:**

```json
{
  "ok": true,
  "mensaje": "Informe 0002-2026 enviado al cliente",
  "informe": { "_id": "66a0a1b2c3d4e5f607182a45", "numeroInforme": "0002-2026", "estado": "enviado", "version": 2 },
  "notificacion": {
    "_id": "66a0a1b2c3d4e5f607182a50",
    "tipo": "resultados_disponibles",
    "asunto": "Resultados disponibles — informe 0002-2026",
    "estado": "enviada",
    "intentos": 1,
    "correoDestino": "contacto@constructoraandina.co"
  }
}
```

Errores: **400** `"Identificador de muestra no válido"` / `"Identificador de informe no válido"` · **404** `"Muestra no encontrada"` · **400** `"La muestra no tiene análisis registrados: no se puede generar el informe"` · **400** `"La muestra tiene 1 resultado(s) sin validar (pH). El informe solo se genera con todos los resultados validados."` · **400** `"El informe ya está en estado \"disponible\""` · **400** `"El informe está en borrador: no se puede enviar"` · **400** `"El cliente no tiene correo registrado"` · **502** `"No fue posible enviar el informe al cliente: ..."` · **404** `"El archivo del informe no está disponible"` · **413** (PDF > `MAX_FILE_MB`) · **404** `"Informe no encontrado"`.

---

## 19. Encuestas

Uso **interno** (solo lectura). Las respuestas del cliente se hacen por la [API pública](#21-api-pública).

| Método | Ruta | Rol requerido | Validación zod | Descripción |
|--------|------|---------------|----------------|-------------|
| GET | `/api/interno/encuestas/promedio` | admin, encargado, usuario | — | Promedio general y por pregunta. |
| GET | `/api/interno/encuestas` | admin, encargado, usuario | — | Listado (filtros `muestraId`, `estado`). |

**GET `/promedio?muestraId=` 200:**

```json
{
  "ok": true,
  "resumen": {
    "cantidadEncuestasRespondidas": 12,
    "cantidadRespuestas": 48,
    "promedio": 4.58,
    "porPregunta": [
      { "pregunta": "¿Cómo calificas la atención recibida por el laboratorio?", "cantidad": 12, "promedio": 4.75 },
      { "pregunta": "¿Qué tan claro y completo te pareció el informe entregado?", "cantidad": 12, "promedio": 4.5 },
      { "pregunta": "¿Cumplimos con los tiempos de entrega estimados?", "cantidad": 12, "promedio": 4.33 },
      { "pregunta": "¿Recomendarías nuestro laboratorio a otras personas?", "cantidad": 12, "promedio": 4.67 }
    ]
  }
}
```

**GET 200 (listado):**

```json
{
  "ok": true,
  "encuestas": [
    {
      "_id": "66b0a1b2c3d4e5f607182a60",
      "muestraId": { "_id": "6650a1b2c3d4e5f607182960", "codigo": "0042-2026", "nombreMuestra": "Agua potable red hídrica" },
      "clienteId": { "_id": "6601b2c3d4e5f60718293a4b", "nombre": "Constructora Andina S.A.S.", "email": "contacto@constructoraandina.co" },
      "token": "3f8a91c2d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef",
      "preguntas": [
        "¿Cómo calificas la atención recibida por el laboratorio?",
        "¿Qué tan claro y completo te pareció el informe entregado?",
        "¿Cumplimos con los tiempos de entrega estimados?",
        "¿Recomendarías nuestro laboratorio a otras personas?"
      ],
      "respuestas": [
        { "pregunta": "¿Cómo calificas la atención recibida por el laboratorio?", "calificacion": 5, "comentario": "Muy buena atención" }
      ],
      "estado": "respondida",
      "fechaEnvio": "2026-10-13T17:05:00.000Z",
      "fechaRespuesta": "2026-10-14T08:10:00.000Z"
    }
  ]
}
```

> El `token` (48 caracteres hex aleatorios) da acceso público; en el listado interno sí se muestra.

---

## 20. Facturas

| Método | Ruta | Rol requerido | Validación zod | Descripción |
|--------|------|---------------|----------------|-------------|
| GET | `/api/interno/facturas` | admin, encargado, usuario | `listarFacturasSchema` (sobre `query`) | Listado (solicitud y pago poblados). |
| POST | `/api/interno/facturas/generar` | admin, encargado | `generarFacturaSchema` | Emite la factura (Factus sandbox o simulada). |
| GET | `/api/interno/facturas/:id` | admin, encargado, usuario | — | Detalle. |
| GET | `/api/interno/facturas/:id/consultar` | admin, encargado, usuario | — | Consulta en el proveedor. |
| POST | `/api/interno/facturas/:id/estado` | admin, encargado | `cambiarEstadoFacturaSchema` | Cambia estado con motivo (historial). |
| POST | `/api/interno/facturas/:id/reintentar` | admin, encargado | — | Reintenta una factura en `error`. |
| POST | `/api/interno/facturas/:id/enviar` | admin, encargado | — | Envía la factura al cliente por correo. |

**Query del listado:** `solicitudId` o `solicitud` · `estado` (`pendiente|generada|enviada|anulada|error`).

**Body `generarFacturaSchema`:**

| Campo | Tipo | Obligatorio |
|-------|------|-------------|
| `solicitudId` | string (ObjectId) | **Sí** |
| `pagoId` | string (ObjectId) | No |

**Body `cambiarEstadoFacturaSchema`:** `estado` (enum de facturas, **obligatorio**) · `motivo` (≥3, **obligatorio**).

**Body `enviar`:** sin cuerpo. `POST /:id/reintentar` sin cuerpo.

**POST `/generar` 201:**

```json
{
  "ok": true,
  "mensaje": "Factura 0001-2026 generada",
  "factura": {
    "_id": "66c0a1b2c3d4e5f607182a70",
    "solicitudId": "6610a1b2c3d4e5f607182930",
    "pagoId": "6640a1b2c3d4e5f607182950",
    "numero": "0001-2026",
    "valorTotal": 54000,
    "estado": "generada",
    "documento": {
      "simulado": true,
      "advertencia": "DOCUMENTO SIMULADO — SIN VALIDEZ ANTE LA DIAN",
      "nota": "Se generó en MODO SIMULADO porque no hay credenciales de Factus (FACTUS_BASE_URL, FACTUS_CLIENT_ID, FACTUS_CLIENT_SECRET).",
      "proveedor": "Factus (modo simulado)",
      "numero": "0001-2026",
      "fechaEmision": "2026-10-14T10:00:00.000Z",
      "moneda": "COP",
      "valorTotal": 54000
    },
    "generadaPor": "carlos@laboratorio.com",
    "fechaGeneracion": "2026-10-14T10:00:00.000Z",
    "historialEstados": [
      { "estado": "pendiente", "usuario": "carlos@laboratorio.com", "fecha": "2026-10-14T09:59:59.000Z", "motivo": "Creación de la factura" },
      { "estado": "generada", "usuario": "carlos@laboratorio.com", "fecha": "2026-10-14T10:00:00.000Z", "motivo": "Generada en modo simulado (sin proveedor)" }
    ]
  }
}
```

**GET 200 (listado):**

```json
{
  "ok": true,
  "facturas": [
    {
      "_id": "66c0a1b2c3d4e5f607182a70",
      "solicitudId": { "_id": "6610a1b2c3d4e5f607182930", "estado": "pagada", "tipoCliente": "externo", "descripcion": "Análisis de aguas para obra" },
      "pagoId": { "_id": "6640a1b2c3d4e5f607182950", "referencia": "PAY-1767900000000-A1B2C3D4", "monto": 54000, "estado": "confirmado" },
      "numero": "0001-2026",
      "valorTotal": 54000,
      "estado": "enviada",
      "fechaGeneracion": "2026-10-14T10:00:00.000Z"
    }
  ]
}
```

**GET `/:id` 200:** `{ "ok": true, "factura": { ... } }`

**GET `/:id/consultar` 200:**

```json
{
  "ok": true,
  "factura": { "_id": "66c0a1b2c3d4e5f607182a70", "numero": "0001-2026", "estado": "generada" },
  "consulta": {
    "simulado": true,
    "numero": "0001-2026",
    "valorTotal": 54000,
    "consultadoEn": "2026-10-14T11:00:00.000Z",
    "nota": "Consulta local: el modo simulado no consulta ningún proveedor externo."
  },
  "modo": "simulado"
}
```

**POST `/:id/estado` 200:**

```json
{
  "ok": true,
  "mensaje": "Estado actualizado a \"anulada\"",
  "factura": {
    "_id": "66c0a1b2c3d4e5f607182a70",
    "numero": "0001-2026",
    "estado": "anulada",
    "historialEstados": [
      { "estado": "generada", "usuario": "carlos@laboratorio.com", "fecha": "2026-10-14T10:00:00.000Z", "motivo": "Generada en modo simulado (sin proveedor)" },
      { "estado": "anulada", "usuario": "carlos@laboratorio.com", "fecha": "2026-10-15T08:30:00.000Z", "motivo": "Factura emitida por error" }
    ]
  }
}
```

**POST `/:id/reintentar` 200:**

```json
{
  "ok": true,
  "mensaje": "Factura 0001-2026 generada en el reintento",
  "factura": { "_id": "66c0a1b2c3d4e5f607182a70", "numero": "0001-2026", "estado": "generada" }
}
```

**POST `/:id/enviar` 200:**

```json
{
  "ok": true,
  "mensaje": "Factura 0001-2026 enviada al cliente",
  "factura": { "_id": "66c0a1b2c3d4e5f607182a70", "numero": "0001-2026", "estado": "enviada" },
  "notificacion": {
    "_id": "66c0a1b2c3d4e5f607182a75",
    "tipo": "otro",
    "asunto": "Factura 0001-2026 — laboratorio de análisis",
    "estado": "enviada",
    "correoDestino": "contacto@constructoraandina.co"
  }
}
```

Errores: **400** `"Identificador de solicitud no válido"` / `"Identificador de pago no válido"` / `"Identificador de factura no válido"` · **404** `"La solicitud no existe"` · **404** `"No se encontró un pago para esta solicitud"` · **400** `"Solo se puede facturar un pago confirmado: el pago de esta solicitud está en estado \"pendiente\""` · **400** `"La solicitud ya tiene la factura 0001-2026 en estado \"generada\". Usa el reintento si está en error o anúlala antes de generar otra."` · **400** `"Está prohibido enviar información a la DIAN: usa solo SANDBOX o el modo simulado"` / `"La URL de Factus corresponde al entorno de PRODUCCIÓN y está bloqueada..."` · **502** fallo del proveedor, con `detalles: { "facturaId": "...", "numero": "0001-2026", "reintentable": true }` · **400** `"No se puede volver al estado \"pendiente\": una factura ya emitida no se reinicia"` · **400** `"La factura ya está en estado \"anulada\""` · **400** `"Solo se pueden reintentar facturas en estado \"error\" (estado actual: generada)"` · **400** `"La factura debe estar \"generada\" para enviarse (estado actual: pendiente)"` · **502** `"No fue posible enviar la factura por correo: ..."` · **404** `"Factura no encontrada"` · **404** `"Factus (sandbox) no tiene registrada la factura 0001-2026"`.

---

## 21. API pública

**Base:** `/api/publico` · **Sin login.**

| Método | Ruta | Rol requerido | Validación zod | Descripción |
|--------|------|---------------|----------------|-------------|
| GET | `/api/publico/seguimiento/:codigoSeguimiento` | Ninguno | — | Consulta pública de seguimiento. |
| GET | `/api/publico/seguimiento/:codigoSeguimiento/informe` | Ninguno | — | Descarga del PDF del informe. |
| GET | `/api/publico/encuestas/:token` | Ninguno | — | Ver encuesta de satisfacción. |
| POST | `/api/publico/encuestas/:token` | Ninguno | `responderEncuestaSchema` | Responder la encuesta (una sola vez). |
| POST | `/api/publico/seguimiento/:codigoSeguimiento/incidencias/:incidenciaId/respuesta` | Ninguno | `responderIncidenciaSchema` (tras multer) | Respuesta del cliente a una incidencia. |

### Rate limit (RF-084 / RNF-013)

Dos límites **independientes**, ambos por IP:

- **Consultas (`GET`): 30 por minuto** (`windowMs: 60 000`, `limit: 30`, `skip: req.method === 'POST'`).
- **Publicaciones (`POST`): 10 cada 15 minutos** (`windowMs: 15 × 60 000`, `limit: 10`, `skip: req.method !== 'POST'`). Cubre la respuesta a una incidencia y la respuesta a la encuesta; no consume la cuota de consultas ni viceversa.
- Encabezados `RateLimit` (draft-7), sin `X-RateLimit` antiguo.
- Al superarlo:

```json
HTTP 429
{
  "ok": false,
  "mensaje": "Demasiadas consultas desde esta dirección IP. Intenta de nuevo en unos minutos."
}
```

En los `POST` el mensaje es `"Demasiadas publicaciones desde esta dirección IP. Intenta de nuevo en unos minutos."`.

### 405 de la superficie pública (RNF-005)

Un middleware final en `publico.routes.js` responde:

- **`GET` desconocido** → `404` `{ "ok": false, "mensaje": "Ruta pública no encontrada: GET /api/publico/xyz" }`.
- **Cualquier otro método** (`PUT`, `PATCH`, `DELETE`, `POST` no contemplado) → `405`:

```json
HTTP 405
{
  "ok": false,
  "mensaje": "Método DELETE no permitido en la API pública (solo lectura)"
}
```

### GET `/api/publico/seguimiento/:codigoSeguimiento`

Usa el **`codigoSeguimiento`** aleatorio (nunca el `codigo` `0042-2026`).

```json
{
  "ok": true,
  "seguimiento": {
    "codigoSeguimiento": "9f2c7d1e5a4b8c3d6e1f0a2b4c6d8e0f",
    "codigo": "0042-2026",
    "nombreMuestra": "Agua potable red hídrica",
    "estado": "en_analisis",
    "fechaRecepcion": "2026-10-08T14:30:00.000Z",
    "fechaEstimadaEntrega": "2026-10-13T00:00:00.000Z",
    "historial": [
      { "fecha": "2026-10-08T14:30:00.000Z", "hora": "14:30:00", "tipo": "recepcion", "descripcion": "Muestra recibida: Agua potable red hídrica", "estado": null },
      { "fecha": "2026-10-08T17:50:00.000Z", "hora": "17:50:00", "tipo": "cambio_estado", "descripcion": "", "estado": "en_analisis" }
    ],
    "cambiosFecha": [
      { "fechaAnterior": "2026-10-13T00:00:00.000Z", "fechaNueva": "2026-10-16T00:00:00.000Z", "motivoPublico": "Falla en el equipo de titulación", "fechaCambio": "2026-10-09T10:15:00.000Z" }
    ],
    "incidencias": [
      {
        "id": "6670a1b2c3d4e5f607182a00",
        "tipo": "requiere_accion_cliente",
        "titulo": "Confirmación de datos de contacto",
        "descripcion": "Necesitamos un teléfono de contacto en obra.",
        "estado": "esperando_cliente",
        "requiereRespuesta": true,
        "puedeResponder": true,
        "fechaCreacion": "2026-10-08T19:10:00.000Z",
        "nuevaFechaEstimada": null,
        "motivo": "",
        "fechaCierre": null
      }
    ],
    "informe": { "disponible": true, "estado": "disponible", "fecha": "2026-10-13T17:00:00.000Z" },
    "facturacion": { "existe": true, "estado": "enviada", "numero": "0001-2026", "fecha": "2026-10-14T10:00:00.000Z" },
    "tiempoConsultaMs": 7
  }
}
```

**Seguridad (RNF-004):** lista blanca de campos — jamás salen `_id` internos, `usuarioId`, `observacionesInternas`, auditorías, ubicación física ni datos de otros clientes. Solo eventos con `visibleCliente: true`. En `cambiosFecha` **solo** sale `motivoPublico`: el `motivo` interno del cambio de fecha **nunca** se expone (si no hay motivo público, el campo viene como cadena vacía `""`).

**Errores:** **404** `"No se encontró ninguna muestra con ese código de seguimiento. Verifica el código e inténtalo de nuevo."` — mismo mensaje para código inexistente, muestra borrada lógicamente y `id` inválido (no se puede sondear la BD). **429** por rate limit.

### GET `/api/publico/seguimiento/:codigoSeguimiento/informe`

- **200:** PDF (`application/pdf`, `attachment; filename="0002-2026.pdf"`). Solo informes en estado `disponible` o `enviado`.
- **404:** `"El informe de esta muestra aún no está disponible para descarga"` (o `"El informe aún no está disponible. Intenta más tarde."`).
- **404:** código de seguimiento inválido (mismo mensaje genérico).

### GET `/api/publico/encuestas/:token`

```json
{
  "ok": true,
  "encuesta": {
    "estado": "pendiente",
    "respondida": false,
    "preguntas": [
      "¿Cómo calificas la atención recibida por el laboratorio?",
      "¿Qué tan claro y completo te pareció el informe entregado?",
      "¿Cumplimos con los tiempos de entrega estimados?",
      "¿Recomendarías nuestro laboratorio a otras personas?"
    ],
    "fechaEnvio": "2026-10-13T17:05:00.000Z",
    "fechaRespuesta": null,
    "respuestas": []
  }
}
```

- **404:** `"Encuesta no encontrada. El enlace no es válido o ya caducó."`

### POST `/api/publico/encuestas/:token`

**Body `responderEncuestaSchema`:**

| Campo | Tipo | Obligatorio |
|-------|------|-------------|
| `respuestas` | array (1 a 20) | **Sí** |
| `respuestas[].pregunta` | string (≥1) | **Sí** |
| `respuestas[].calificacion` | entero 1–5 | **Sí** |
| `respuestas[].comentario` | string ≤ 500 | No |

```json
POST /api/publico/encuestas/3f8a91c2...bcdef

{
  "respuestas": [
    { "pregunta": "¿Cómo calificas la atención recibida por el laboratorio?", "calificacion": 5, "comentario": "Excelente" },
    { "pregunta": "¿Qué tan claro y completo te pareció el informe entregado?", "calificacion": 4, "comentario": "" },
    { "pregunta": "¿Cumplimos con los tiempos de entrega estimados?", "calificacion": 4, "comentario": "" },
    { "pregunta": "¿Recomendarías nuestro laboratorio a otras personas?", "calificacion": 5, "comentario": "Sí" }
  ]
}
```

**201:**

```json
{
  "ok": true,
  "mensaje": "Gracias, tu respuesta fue registrada.",
  "encuesta": {
    "estado": "respondida",
    "respondida": true,
    "preguntas": [
      "¿Cómo calificas la atención recibida por el laboratorio?",
      "¿Qué tan claro y completo te pareció el informe entregado?",
      "¿Cumplimos con los tiempos de entrega estimados?",
      "¿Recomendarías nuestro laboratorio a otras personas?"
    ],
    "fechaEnvio": "2026-10-13T17:05:00.000Z",
    "fechaRespuesta": "2026-10-14T08:10:00.000Z",
    "respuestas": [
      { "pregunta": "¿Cómo calificas la atención recibida por el laboratorio?", "calificacion": 5, "comentario": "Excelente" },
      { "pregunta": "¿Qué tan claro y completo te pareció el informe entregado?", "calificacion": 4, "comentario": "" },
      { "pregunta": "¿Cumplimos con los tiempos de entrega estimados?", "calificacion": 4, "comentario": "" },
      { "pregunta": "¿Recomendarías nuestro laboratorio a otras personas?", "calificacion": 5, "comentario": "Sí" }
    ]
  }
}
```

Errores: **409** `"Esta encuesta ya fue respondida. Gracias por tu participación."` · **404** `"Encuesta no encontrada. El enlace no es válido o ya caducó."` · **400** `"Datos inválidos"` con `detalles` (calificación fuera de 1–5, sin respuestas, etc.).

### POST `/api/publico/seguimiento/:codigoSeguimiento/incidencias/:incidenciaId/respuesta`

`multipart/form-data`: **multer** primero (archivos) y después **zod**.

| Campo | Tipo | Obligatorio |
|-------|------|-------------|
| `mensaje` | texto, 3–2000 | **Sí** |
| `archivos` | hasta 3, PDF/JPG/PNG, máx. `MAX_FILE_MB` | No |

**201:**

```json
{
  "ok": true,
  "mensaje": "Respuesta registrada. El laboratorio la revisará próximamente.",
  "respuesta": {
    "fecha": "2026-10-09T15:00:00.000Z",
    "archivos": [ { "nombre": "contacto.png", "tamano": 120480 } ],
    "incidencia": { "id": "6670a1b2c3d4e5f607182a00", "titulo": "Confirmación de datos de contacto", "estado": "esperando_cliente" }
  }
}
```

> Al registrar la respuesta del cliente, la incidencia pasa a `estado: "en_revision"`.

Errores: **404** (mismo mensaje genérico) si el código no existe, el `incidenciaId` no es válido o la incidencia no pertenece a esa muestra · **404** `"La incidencia no está disponible para el cliente"` (no es `visibleCliente`) · **400** `"La incidencia no está esperando respuesta del cliente"` · **400** `"Datos inválidos"` (mensaje < 3 o > 2000) · **400** por tipo/tamaño/cantidad de archivos · **429** si se superan los **10 POST cada 15 minutos** por IP (límite propio de publicaciones).

---

## 22. Usuarios

Gestión de los usuarios del sistema interno. **Exclusiva del rol `admin`**: cada ruta aplica `requireRole('admin')`; cualquier otro rol recibe **403** `"No tienes permisos para esta acción"`.

| Método | Ruta | Rol requerido | Validación zod | Descripción |
|--------|------|---------------|----------------|-------------|
| GET | `/api/interno/usuarios` | admin | — | Listado (sin `password`, más recientes primero). |
| GET | `/api/interno/usuarios/:id` | admin | — | Detalle de un usuario (sin `password`). |
| POST | `/api/interno/usuarios` | admin | `crearUsuarioSchema` | Crea un usuario interno. |
| PUT | `/api/interno/usuarios/:id` | admin | `actualizarUsuarioSchema` | Actualiza rol y/o permisos. |
| PATCH | `/api/interno/usuarios/:id/estado` | admin | `estadoUsuarioSchema` | Activa o desactiva la cuenta. |
| DELETE | `/api/interno/usuarios/:id` | admin | — | Borrado **lógico**. |

**Body POST `crearUsuarioSchema`:**

| Campo | Tipo | Obligatorio |
|-------|------|-------------|
| `nombre` | string (1–120) | **Sí** |
| `email` | string (correo, **único**) | **Sí** |
| `password` | string (**mínimo 8** caracteres) | **Sí** |
| `rol` | `admin \| encargado \| usuario` | **Sí** |
| `permisos.editar` | boolean | No (default `false`) |
| `permisos.eliminar` | boolean | No (default `false`) |

**Body PUT `actualizarUsuarioSchema`:** `rol` (enum) y/o `permisos` `{ editar, eliminar }`; al menos uno de los dos (si no → 400 `"Datos inválidos"`).

**Body PATCH `/:id/estado`:** `{ "activo": true }` (activar) o `{ "activo": false }` (desactivar; la cuenta desactivada ya **no puede iniciar sesión** → 401 `"Credenciales inválidas"`).

**POST 201:**

```json
{
  "ok": true,
  "mensaje": "Usuario creado",
  "usuario": {
    "_id": "66d0a1b2c3d4e5f607182a80",
    "nombre": "Laura Encargada",
    "email": "laura@laboratorio.com",
    "rol": "encargado",
    "activo": true,
    "permisos": { "editar": true, "eliminar": false },
    "eliminado": false,
    "createdAt": "2026-10-08T15:40:00.000Z",
    "updatedAt": "2026-10-08T15:40:00.000Z"
  }
}
```

- El `password` **jamás** aparece en ninguna respuesta: el campo es `select: false` y además se elimina de la lista blanca antes de responder. El hash se hace con bcrypt en el `pre('save')`.

**GET 200 (listado):** `{ "ok": true, "usuarios": [ { "_id": "...", "nombre": "...", "email": "...", "rol": "...", "activo": true, "permisos": { ... } } ] }`
**GET 200 (uno):** `{ "ok": true, "usuario": { ... } }`
**PUT 200:** `{ "ok": true, "mensaje": "Usuario actualizado", "usuario": { ... } }`
**PATCH `/:id/estado` 200:** `{ "ok": true, "mensaje": "Usuario desactivado (ya no puede iniciar sesión)", "usuario": { ... } }`
**DELETE 200:** `{ "ok": true, "mensaje": "Usuario eliminado (borrado lógico)" }`

**Reglas de autoprotección del admin** (aplican comparando el `:id` con el usuario del token):

| Acción sobre uno mismo | Respuesta |
|---|---|
| `PUT /:id` cambiando el rol propio | **400** `"No puedes modificar tu propio rol; pide a otro administrador que lo haga"` |
| `PATCH /:id/estado` con `activo: false` | **400** `"No puedes desactivar tu propia cuenta de administrador"` |
| `DELETE /:id` | **400** `"No puedes eliminar tu propia cuenta de administrador"` |

Otros errores: **400** `"Ya existe un usuario con ese email"` (o `"...(aunque esté eliminado); usa otro correo"`) · **400** `"Datos inválidos"` con `detalles` (contraseña < 8, rol fuera del enum, `PUT` sin `rol` ni `permisos`) · **400** `"Identificador de usuario no válido"` · **404** `"Usuario no encontrado"`.

**Auditoría:** cada `crear`, `actualizar`, `activar`, `desactivar` y `eliminar_logico` registra antes/después en la colección `auditorias` (`entidad: "usuarios"`), con el email del administrador responsable.

---

## 23. Auditorías

Consulta de la colección `auditorias` (**append-only**): **solo lectura** y **solo `admin`** (`requireRole('admin')`). No existe ninguna ruta de escritura y el modelo bloquea `findOneAndUpdate` y `deleteOne`.

| Método | Ruta | Rol requerido | Validación zod | Descripción |
|--------|------|---------------|----------------|-------------|
| GET | `/api/interno/auditorias` | admin | `listarAuditoriasSchema` (dentro del controller, sobre `query`) | Listado paginado con filtros. |

**Query (todas opcionales):**

| Filtro | Significado |
|---|---|
| `coleccion` | Filtra por el campo `entidad` del registro (por ejemplo `muestras`, `clientes`, `usuarios`). |
| `documentoId` | Filtra por el campo `entidadId` (id del documento afectado). |
| `usuarioId` | Filtra por el campo `usuario` (email o id de quien hizo el cambio). |
| `desde` / `hasta` | Rango de fechas (`createdAt`); se aceptan fechas ISO. `desde` debe ser ≤ `hasta`. |
| `pagina` | Página (entero ≥ 1, default `1`). |
| `limite` | Tamaño de página (entero 1–100, default `20`). |

Ejemplo: `GET /api/interno/auditorias?coleccion=muestras&usuarioId=laura@laboratorio.com&desde=2026-10-01&hasta=2026-10-31&pagina=1&limite=20`

**GET 200:**

```json
{
  "ok": true,
  "auditorias": [
    {
      "_id": "66e0a1b2c3d4e5f607182a90",
      "entidad": "usuarios",
      "entidadId": "66d0a1b2c3d4e5f607182a80",
      "accion": "crear",
      "antes": null,
      "despues": { "nombre": "Laura Encargada", "email": "laura@laboratorio.com", "rol": "encargado", "activo": true },
      "usuario": "admin@sena.edu.co",
      "ip": "::ffff:127.0.0.1",
      "createdAt": "2026-10-08T15:40:00.000Z"
    }
  ],
  "paginacion": { "pagina": 1, "limite": 20, "total": 395, "paginas": 20 }
}
```

- Orden: `createdAt` descendente (lo más reciente primero).
- Errores: **403** sin rol `admin` · **400** `"Datos inválidos"` con `detalles` (`pagina`/`limite` fuera de rango, fechas inválidas o `desde > hasta`).

---

## 24. Verificación de conteo

Conteo de definiciones `router.<método>(` por archivo de rutas (los archivos `secuencias`, `eventosTrazabilidad` y `cambiosFecha` solo contienen un comentario: **0** rutas):

| Archivo | Rutas |
|---------|-------|
| `modules/auth/auth.routes.js` | 3 |
| `modules/usuarios/usuarios.routes.js` | 6 |
| `modules/clientes/clientes.routes.js` | 5 |
| `modules/solicitudes/solicitudes.routes.js` | 5 |
| `modules/parametrosAnalisis/parametrosAnalisis.routes.js` | 5 |
| `modules/cotizaciones/cotizaciones.routes.js` | 6 |
| `modules/pagos/pagos.routes.js` | 3 |
| `modules/muestras/muestras.routes.js` | 20 |
| `modules/analisisMuestras/analisisMuestras.routes.js` | 4 |
| `modules/incidencias/incidencias.routes.js` | 11 |
| `modules/notificaciones/notificaciones.routes.js` | 3 |
| `modules/disposiciones/disposiciones.routes.js` | 3 |
| `modules/informes/informes.routes.js` | 6 |
| `modules/encuestas/encuestas.routes.js` | 2 |
| `modules/facturas/facturas.routes.js` | 7 |
| `modules/auditorias/auditorias.routes.js` | 1 |
| `modules/publico/publico.routes.js` | 5 |
| **Total** | **95** |

Documentados en este archivo: **95** (uno por cada `router.<método>` definido, sin contar el middleware `router.use` final del **405** de la superficie pública) **+ 1** endpoint de salud (`app.get('/api/health')` en `src/app.js`, no es `router.<método>`).

Suma por secciones: 1 (salud) + 3 + 6 + 5 + 5 + 5 + 6 + 3 + 20 + 4 + 11 + 3 + 3 + 6 + 2 + 7 + 1 + 5 = **96** (95 de módulos + salud).

### Notas / puntos ambiguos

1. **`POST /api/interno/cotizaciones/:id/enviar`** devuelve **HTTP 200 con `ok: false`** cuando falla el correo (estado `envio_fallido`); no usa 4xx/5xx.
2. **`DELETE /api/interno/incidencias/:id`** no tiene `requireRole`, solo `requirePermiso('eliminar')` (admin pasa siempre). En cambio **`DELETE /api/interno/muestras/:id`** combina `requireRole('admin','encargado','usuario')` **y** `requirePermiso('eliminar')`.
3. **`POST /api/interno/informes/:id/enviar`** acepta `conAdjunto` en el body pero **no** tiene `validate(...)` en la ruta (existe `enviarInformeSchema` sin usar).
4. **`POST /api/interno/incidencias/:id/respuestas`** tampoco pasa por zod: `mensaje` y `tipoUsuario` se leen directo del `multipart` (el límite real de 3–2000 caracteres solo lo impone el endpoint público).
5. `GET /api/interno/auth/login` no existe: el login es **POST**. `GET/PUT /api/interno/auth/perfil` no exigen rol, solo JWT.
6. `GET /api/interno/muestras/:id/rotulo/descargar` y `GET /api/interno/informes/:id/descargar` devuelven **binario**, no JSON.
7. La superficie pública tiene **dos** rate limits independientes por IP: los `GET` consumen los **30/min de consultas** y los dos `POST` permitidos (respuesta a incidencia y respuesta a encuesta) consumen su límite propio de **10 cada 15 minutos**; ninguno consume la cuota del otro.
8. **`GET /api/interno/auditorias`** valida su query con zod **dentro del controller** (mismo patrón que notificaciones/disposiciones/informes/facturas), porque Express 5 expone `req.query` como solo lectura. Los filtros `coleccion`, `documentoId` y `usuarioId` se mapean a los campos `entidad`, `entidadId` y `usuario` del registro de auditoría.
9. La gestión de usuarios (`/api/interno/usuarios`) es la única superficie con `requireRole('admin')` en **todas** sus rutas; el campo `activo: false` impide iniciar sesión y usar tokens ya emitidos.
