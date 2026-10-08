# Backend — Sistema de Gestión para el Servicio de Análisis de Laboratorio

Proyecto **SENA — ADSO, ficha 3174193**.

## 1. Descripción

API REST que gestiona el ciclo completo del servicio de análisis de laboratorio: desde la solicitud de un cliente hasta la entrega del informe, la factura, la consulta pública del estado de la muestra y la encuesta de satisfacción.

**Propósito:** dar al laboratorio un sistema único donde el personal interno (`admin`, `encargado`, `usuario`) administra clientes, solicitudes, cotizaciones, pagos, muestras, análisis, incidencias, disposiciones, informes, facturas y notificaciones; y donde el cliente final puede consultar, sin iniciar sesión y solo con su código de seguimiento, el estado de su muestra, descargar el informe, responder incidencias y contestar la encuesta.

**Flujo del negocio:**

```
cliente → solicitud → cotización → pago → recepción de muestra → análisis
        → resultados → cierre → informe → factura → consulta pública → encuesta
```

**Stack (RNF-001):** Node.js 20+ con **ES modules**, **Express 5**, **Mongoose 9**, **MongoDB** (Atlas M0 o instancia local), **JWT**, **zod**, **Nodemailer**, **multer** y **pdfkit**.

## 2. Requisitos previos

| Requisito | Detalle |
|---|---|
| **Node.js 20 o superior | Se usa `node --watch` (arranque en observación) y `fetch`/ES modules nativos |
| **npm | Viene con Node.js |
| **MongoDB | Instancia local (`mongod`) o clúster **Atlas M0** gratuito |
| **Cuenta Gmail con contraseña de aplicación | Para enviar correos con Nodemailer (RNF-019). Se crea en *Gmail → Seguridad → Contraseñas de aplicaciones* |
| Credenciales de Factus (opcional | Solo si se quiere probar el módulo de facturación en sandbox; sin ellas el sistema funciona en **modo simulado** |

## 3. Instalación

```bash
# 1. Entrar a la carpeta del backend
cd backend

# 2. Instalar dependencias
npm install

# 3. Crear el archivo de configuración local
copy .env.example .env

# 4. Editar .env con tus valores reales (URI de MongoDB, JWT_SECRET, correo, etc.)

# 5. Sembrar el admin inicial y el catálogo de parámetros de análisis
npm run seed

# 6. Arrancar en modo desarrollo (reinicia solo al guardar cambios)
npm run dev
```

El servidor queda en `http://localhost:3000`. Comprobación rápida:

```bash
curl http://localhost:3000/api/health
```

```json
{ "ok": true, "mensaje": "API funcionando", "baseDatos": "conectada", "uptime": 1.23, "fecha": "2026-01-01T00:00:00.000Z" }
```

> Si la base de datos no conecta, el servidor **igual arranca** y `/api/health` informa `"baseDatos": "desconectada"`.

### Notas del `seed`

- `npm run seed` lee `ADMIN_NOMBRE`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` del `.env`; si falta el email o la contraseña, se detiene con un mensaje claro.
- Si el admin ya existe, **no lo duplica**.
- También siembra un catálogo inicial de parámetros de análisis (pH, turbidez, coliformes, nitratos, DBO5).

## 4. Variables de entorno

Todas viven en `.env` (copiado de `.env.example`) y se validan con zod en `src/config/env.js`; si falta algo obligatorio, el proceso falla antes de arrancar y lista el problema en consola.

| Variable | Propósito | Obligatoria |
|---|---|---|
| `PORT` | Puerto del servidor HTTP (por defecto `3000`) | No (por defecto `3000`) |
| `MONGODB_URI` | Cadena de conexión a MongoDB (Atlas o local) | **Sí** |
| `JWT_SECRET` | Secreto para firmar los tokens JWT (**mínimo 32 caracteres**, largo y aleatorio) | **Sí** |
| `JWT_EXPIRES_IN` | Vigencia del token (por defecto `8h`) | No (por defecto `8h`) |
| `TRUST_PROXY` | Saltos de proxy inverso que Express confía para leer la IP real (`1` en Render/Heroku/nginx; vacío = desactivado). Controla `app.set('trust proxy', ...)` y por tanto el rate limit por IP | No |
| `MAIL_HOST` | Servidor SMTP (por defecto `smtp.gmail.com`) | No* |
| `MAIL_PORT` | Puerto SMTP (por defecto `587`; `465` usa conexión segura) | No (por defecto `587`) |
| `MAIL_USER` | Correo de origen | No* |
| `MAIL_APP_PASSWORD` | Contraseña de aplicación de Gmail | No* |
| `MAIL_FROM` | Remetiente visible (por ejemplo `"Laboratorio <correo@gmail.com>"`) | No* |
| `MAX_FILE_MB` | Tamaño máximo de cada adjunto en MB (por defecto `5`) | No (por defecto `5`) |
| `FRONTEND_URL` | URL pública del frontend, para armar enlaces de informe y encuesta | No |
| `FACTUS_BASE_URL` | URL de Factus. Vacía ⇒ **modo simulado**; producción/DIAN ⇒ rechazada | No |
| `FACTUS_CLIENT_ID` | Client ID de Factus (sandbox) | No |
| `FACTUS_CLIENT_SECRET` | Client Secret de Factus (sandbox) | No |
| `ADMIN_NOMBRE` | Nombre del admin creado por `npm run seed` (por defecto `Administrador`) | No |
| `ADMIN_EMAIL` | Email del admin inicial | **Sí para `npm run seed`** |
| `ADMIN_PASSWORD` | Contraseña del admin inicial | **Sí para `npm run seed`** |

\* El envío de correos solo funciona con `MAIL_HOST`, `MAIL_USER` y `MAIL_APP_PASSWORD` definidos. Si quedan vacíos, `src/services/mail.service.js` usa una cuenta de prueba de **Ethereal** e imprime en consola la URL de vista previa de cada correo.

**Aviso de seguridad:** `.env` está en `.gitignore`. **Nunca** subas credenciales reales (URI de MongoDB, `JWT_SECRET`, contraseñas, credenciales de Factus) a Git, a commits ni a chats; solo existen en `.env.example` valores de ejemplo.

## 5. Scripts npm

Definidos en `package.json`:

| Comando | Qué hace |
|---|---|
| `npm run dev` | Arranca el servidor en modo observación con `node --watch src/server.js` (reinicia automáticamente al guardar cambios; no usa nodemon) |
| `npm start` | Arranca el servidor en modo normal: `node src/server.js` |
| `npm run seed` | Siembra el admin inicial y el catálogo de parámetros de análisis: `node scripts/seed.js` |
| `npm test` | **Prueba de humo del flujo completo** (Fase 8): `node tests/smoke.test.js`; arranca su propio servidor en el puerto 3100 si no hay uno, recorre cliente → solicitud → cotización → aceptación → pago → recepción → análisis → resultados → cierre → informe → factura → consulta pública → encuesta y limpia sus datos al terminar (sale con código 1 si algo falla) |
| `npm run backup` | Exporta **todas** las colecciones a JSON (EJSON ligero) en `backups/AAAA-MM-DD_HHmm/` con un `resumen.json` de conteos; omite los Buffer de PDF/adjuntos y registra cuántos bytes dejó fuera (RNF-008): `node scripts/backup.js` |
| `npm run restore -- <carpeta>` | Restaura un respaldo: `node scripts/restore.js backups/AAAA-MM-DD_HHmm`. Solo inserta o reemplaza por `_id` (nunca borra), pide confirmación `SI` y, si hay choques, `SOBRESCRIBIR`; `--sin-confirmacion` para uso no interactivo |
| `npm run indexes` | Revisa los índices de las 19 colecciones: elimina duplicados, crea los faltantes y reporta (30 índices exigidos): `node scripts/revisarIndices.js` (`-- --solo` = solo lectura) |
| `npm run security` | Revisión automatizada de seguridad: auth en `/api/interno`, superficie pública, borrado lógico, middlewares globales y ausencia de stack traces/credenciales (35 comprobaciones): `node scripts/revisarSeguridad.js` |

Scripts auxiliares (se ejecutan con `node`):

```bash
node scripts/probarCorreo.js            # envía un correo de prueba con mail.service
node scripts/verificarFase6.js          # pruebas de humo de la API pública (Fase 6)
node scripts/verificarFase7.js          # pruebas de humo de informes/facturas (Fase 7)
node scripts/limpiarPruebasFase6.js     # borra (lógicamente) los datos "PRUEBA FASE 6"
```

## 6. Estructura de carpetas

```
backend/
├── AGENTS.md                  # reglas obligatorias del proyecto (para agentes de código)
├── README.md                  # este archivo
├── .env.example               # plantilla de variables SIN credenciales reales
├── .env                       # variables reales (en .gitignore, nunca se sube)
├── .gitignore                 # node_modules/, .env, *.log, coverage/, tests/coverage/
├── package.json               # scripts y dependencias (ES modules)
├── package-lock.json
├── backups/                   # respaldos JSON: backups/AAAA-MM-DD_HHmm/ (los crea npm run backup; está en .gitignore)
├── tests/
│   └── smoke.test.js          # prueba de humo del flujo completo (npm test)
├── docs/
│   ├── PLAN_BACKEND_OPENCODE.md   # plan de fases del backend
│   ├── CONVENCIONES.md            # ramas, flujo y convención de commits del equipo
│   ├── CREACION_TABLAS.md         # modelo relacional: 25 tablas, tipos y cardinalidades
│   ├── MODELO_MONGO.md            # modelo final MongoDB: 19 colecciones como se persisten en Atlas
│   └── api.md                     # documentación de todos los endpoints (96 rutas)
├── scripts/
│   ├── seed.js                # admin inicial + catálogo de parámetros de análisis
│   ├── backup.js              # exportación JSON de todas las colecciones (npm run backup)
│   ├── restore.js             # restauración de un respaldo con confirmación (npm run restore)
│   ├── revisarIndices.js      # índice faltantes/duplicados (npm run indexes)
│   ├── revisarSeguridad.js    # auditoría de seguridad (npm run security)
│   ├── probarCorreo.js        # prueba de envío de correos
│   ├── verificarFase6.js      # verificación del flujo de la API pública
│   ├── verificarFase7.js      # verificación de informes, encuestas y facturas
│   └── limpiarPruebasFase6.js # limpieza de datos de prueba de la Fase 6
└── src/
    ├── server.js              # arranca: conecta la BD y levanta Express
    ├── app.js                 # middlewares globales (helmet, cors, morgan) y montaje de rutas
    ├── config/
    │   ├── env.js             # lee y valida variables de entorno con zod
    │   ├── db.js              # conexión a MongoDB con Mongoose
    │   └── constants.js       # roles, estados, tipos, festivos, preguntas de encuesta
    ├── middlewares/
    │   ├── auth.js            # verifica JWT (Authorization: Bearer <token>)
    │   ├── requireRole.js     # requireRole(roles) y requirePermiso('editar'|'eliminar')
    │   ├── validate.js        # valida body/params con zod
    │   ├── audit.js           # registrarAuditoria(...) con antes/después
    │   ├── upload.js          # multer en memoria con límite MAX_FILE_MB (PDF/JPG/PNG)
    │   ├── notFound.js        # 404 en JSON
    │   └── errorHandler.js    # { ok:false, mensaje, detalles? } sin stack traces
    ├── utils/
    │   ├── AppError.js
    │   ├── asyncHandler.js
    │   ├── softDelete.plugin.js   # borrado lógico + filtro automático en find*
    │   └── diasHabiles.js         # cálculo de días hábiles (7 días de conservación)
    ├── services/              # integraciones externas, sin lógica de rutas
    │   ├── mail.service.js        # Nodemailer + Gmail (o Ethereal en pruebas)
    │   ├── pdf.service.js         # informes y rótulos en PDF (pdfkit)
    │   ├── pagoSimulado.service.js# pagos simulados, sin pasarela (RNF-018)
    │   ├── factus.service.js      # Factus solo sandbox/simulado, nunca DIAN
    │   └── trazabilidad.service.js# crea eventosTrazabilidad y actualiza el estado
    ├── modules/               # un módulo por colección (o grupo de colecciones)
    │   ├── auth/                      # login y perfil propio
    │   ├── usuarios/                  # gestión de usuarios (solo admin)
    │   ├── clientes/
    │   ├── solicitudes/
    │   ├── cotizaciones/
    │   ├── pagos/
    │   ├── parametrosAnalisis/
    │   ├── secuencias/                # consecutivo-año de las muestras
    │   ├── muestras/
    │   ├── analisisMuestras/          # resultados por parámetro
    │   ├── eventosTrazabilidad/
    │   ├── cambiosFecha/
    │   ├── incidencias/               # incluye respuestasIncidencias
    │   ├── disposiciones/             # devolución / desecho
    │   ├── informes/
    │   ├── encuestas/
    │   ├── facturas/
    │   ├── notificaciones/
    │   ├── auditorias/                # append-only; consulta paginada solo admin
    │   └── publico/                   # consulta por código, solo lectura (sin modelo propio)
    │   # Cada módulo: *.model.js, *.service.js, *.controller.js, *.routes.js, *.schema.js
    └── routes/
        ├── index.js             # monta /api/interno y /api/publico
        ├── interno.routes.js    # /api/interno/**  → JWT + roles
        └── publico.routes.js    # /api/publico/**  → sin login, rate limit, solo lectura
```

## 7. Arquitectura y reglas obligatorias

Reglas tomadas de `AGENTS.md`; no se incumplen:

1. **Capas:** `ruta → controller → service → model`. Los controllers **nunca** hablan con Mongoose directamente; la lógica vive en los services y el acceso a datos en los models.
2. **Dos superficies:**
   - `/api/interno/**`: exige **JWT** (`Authorization: Bearer <token>`) y rol `admin | encargado | usuario`, con `requireRole()` y `requirePermiso()`.
   - `/api/publico/**`: **sin login**, solo lectura por `codigoSeguimiento` (más el POST de respuesta a incidencia y el de encuesta). Nunca expone observaciones internas ni otros campos internos; cualquier método distinto de GET/POST permitido responde `405` en JSON.
3. **Borrado solo lógico:** campos `eliminado`, `eliminadoPor`, `fechaEliminacion` vía `softDelete.plugin.js`. Prohibido `deleteOne` / `deleteMany` / `findByIdAndDelete`.
4. **Auditorías append-only:** toda modificación de clientes, solicitudes, muestras y demás registra `antes`/`después` en la colección `auditorias`; nunca se editan ni borran.
5. **Trazabilidad:** todo cambio de estado de una muestra crea un evento en `eventosTrazabilidad` con usuario y fecha/hora (vía `trazabilidad.service.js`).
6. **Las incidencias nunca cambian el estado de la muestra** por sí solas (RF-072).
7. **Doble validación:** zod en la ruta (`validate`) y `required`/`enum` en el esquema Mongoose.
8. **Errores siempre en JSON:** `{ ok:false, mensaje:"texto claro en español", detalles? }`. Sin páginas de error y **sin stack traces** al cliente (`errorHandler.js`).
9. **Dos códigos distintos:** `codigo` de muestra = consecutivo-año (`0042-2026`) generado de forma atómica con `findOneAndUpdate` + `$inc` sobre `secuencias`; `codigoSeguimiento` es **otro valor**, aleatorio e impredecible (índice único).
10. **Pagos simulados:** sin pasarela y sin datos de tarjeta (`pagoSimulado.service.js`).
11. **Factus solo sandbox/simulado:** nunca se envía nada a la DIAN; si la URL apunta a producción se rechaza con error claro.
12. **Adjuntos y PDF en la base de datos,** con límite `MAX_FILE_MB` (máximo 3 archivos, solo PDF/JPG/PNG); los que lo superan se rechazan con mensaje claro.
13. **Correos por Nodemailer** con la cuenta leída de variables de entorno.
14. **Sin credenciales en el código ni en commits:** solo `.env` (ignorado) y `.env.example`.
15. **Comentarios y mensajes al usuario en español.**

## 8. Flujo del sistema

### Roles

| Rol | Qué hace |
|---|---|
| `admin` | Acceso total: usuarios, catálogos, borrados, auditorías; siempre puede (`requirePermiso` lo salta) |
| `encargado` | Gestión operativa: cotizaciones, pagos, recepción/aceptación/rechazo de muestras, análisis, validación, cierre, incidencias, disposiciones, informes y facturas |
| `usuario` | Consulta interna y edición de su perfil; edita/elimina solo si tiene los permisos `editar`/`eliminar` |
| cliente público | Sin cuenta: consulta con `codigoSeguimiento`, descarga el informe, responde incidencias y la encuesta |

### Pasada del flujo

1. **Cliente → solicitud.** Un usuario interno registra el cliente y crea la **solicitud** (`tipoCliente` interno/externo, prioridad, atención inmediata con motivo). *Lo hace: admin o encargado (usuario consulta).*
2. **Cotización.** Se arma la cotización con ítems, subtotal, total y número consecutivo; se envía por correo (`mail.service`) y el cliente la acepta o rechaza. *Lo hace: admin o encargado.*
3. **Pago.** Para clientes **externos** el pago es obligatorio; se genera una referencia impredecible (`PAY-...`) y se confirma con el pago **simulado**. Los internos no pagan. *Lo hace: admin o encargado.*
4. **Recepción de muestra.** Al recibir la muestra se le asigna su `codigo` consecutivo-año y su `codigoSeguimiento` (distintos), se verifica físicamente, se avisa si la cantidad es menor a 300 (advertencia, no bloqueo) y se **acepta** (pasa a `ingresada`) o se **rechaza** con motivo obligatorio (`rechazada`). Se imprimen el rótulo en PDF y se ubica en el inventario. *Lo hace: admin o encargado.*
5. **Análisis.** Se seleccionan los parámetros de análisis y, si corresponde, el inicio queda **bloqueado hasta confirmar el pago**. El estado avanza `en_proceso` → `en_analisis`. *Lo hace: admin o encargado.*
6. **Resultados.** Se registran resultados por parámetro en `analisisMuestras`, con validación, repetición (con motivo) y corrección auditada; estado `resultados_validados`. Cada cambio deja evento de trazabilidad y registro en auditoría. *Lo hace: admin o encargado.*
7. **Cierre.** Se cierra el análisis (`cerrada`) y se calcula la fecha estimada; los cambios de fecha quedan en `cambiosFecha` (anterior, nueva, motivo interno, motivo público y usuario). Lo único que ve el cliente en la API pública es el **motivo público**; el motivo interno jamás sale. *Lo hace: admin o encargado.*
8. **Informe.** Se genera el informe en **PDF** dentro de la base de datos, se marca disponible y se envía por correo. *Lo hace: admin o encargado; el cliente lo descarga en `/api/publico/seguimiento/:codigo/informe`.*
9. **Factura.** Se genera con **Factus en sandbox** (o en modo simulado si no hay credenciales), con historial de estados y consulta pública limitada; jamás se envía a la DIAN. *Lo hace: admin o encargado.*
10. **Consulta pública.** El cliente entra a `/api/publico/seguimiento/:codigoSeguimiento` (sin login) y ve estado, eventos visibles (`visibleCliente=true`), demoras/nueva fecha, disponibilidad del informe y facturación pública; también puede responder una incidencia con adjuntos. Máximo 30 consultas por minuto por IP. *Lo hace: cliente público.*
11. **Encuesta.** Con un token único, el cliente responde la encuesta de satisfacción (respuesta única). *Lo hace: cliente público.*
12. **Disposición final.** Cumplidos los **7 días hábiles** de conservación tras el cierre, la muestra se **devuelve** o se **desecha** (`devuelta` / `desechada`) con motivo y fecha de salida, avisando al cliente. *Lo hace: admin o encargado.*
13. **Incidencias (transversales).** Informan demoras o piden acciones al cliente; **nunca** cambian el estado de la muestra por sí solas; pueden quedar `en_almacen` las muestras en espera.

### Estados de la muestra

Definidos en `src/config/constants.js` (`ESTADOS_MUESTRA`):

| Estado | Significado |
|---|---|
| `ingresada` | Muestra recibida y aceptada en el laboratorio |
| `en_proceso` | Preparación/tratamiento en curso |
| `en_analisis` | Análisis en curso |
| `resultados_validados` | Resultados cargados y validados |
| `cerrada` | Proceso finalizado; inicia la conservación de 7 días hábiles |
| `rechazada` | Rechazada en la recepción (motivo obligatorio) |
| `en_almacen` | Guardada en espera de una acción o disposición |
| `devuelta` | Devuelta al cliente |
| `desechada` | Descartada por el laboratorio |

También en `constants.js`: `ROLES` (`admin`, `encargado`, `usuario`), `TIPOS_FISICOS`, `TIPOS_CLIENTE`, `DIAS_CONSERVACION = 7`, `FESTIVOS_COLOMBIA` (lista editable) y `PREGUNTAS_ENCUESTA`.

## 9. Base de datos y respaldos

- Se usa **MongoDB Atlas M0 (gratis, 512 MB)** o una instancia local.
- ⚠️ **Atlas M0 no tiene respaldos automáticos**: por eso existe `npm run backup`, que exporta las 19 colecciones a JSON (EJSON ligero, con `{$oid}` y `{$date}`) dentro de `backups/AAAA-MM-DD_HHmm/`, junto con un `resumen.json` que indica cuántos documentos tiene cada colección y qué campos `Buffer` (PDF, rótulos, adjuntos) se omitieron por tamaño.
- **Restaurar:** `npm run restore -- backups/AAAA-MM-DD_HHmm`. Inserta o reemplaza documento por documento según `_id` y **nunca borra**: si encuentra `_id` repetidos pide `SOBRESCRIBIR`, y sin conflictos basta con `SI` (`--sin-confirmacion` para automatizar). El orden inverso al de la exportación evita choques de claves foráneas.
- **`.gitignore`** ya contiene `node_modules/`, `.env`, `*.log`, `coverage/`, `tests/coverage/` y **`backups/`** (los JSON contienen datos de clientes y muestras, así que nunca se versionan).
- La base local de desarrollo se llama `laboratorio` en la plantilla de `MONGODB_URI`.

## 10. Pruebas

```bash
npm test          # prueba de humo del flujo completo (Fase 8)
```

`tests/smoke.test.js` arranca su propio servidor en el puerto `3100` (si ya hay uno en esa base, lo aprovecha), entra con el admin y recorre **todo el ciclo de vida**:

cliente → solicitud → cotización → aceptación → pago simulado → recepción bloqueada sin pago → pago confirmado → ingreso de la muestra → código y códigoSeguimiento → parámetros → inicio/validación de análisis → resultados → cierre (7 días hábiles) → informe → informe disponible → factura simulada → consulta pública (`< 2 s`, sin fugas de campos internos) → encuesta y respuesta única.

- Los datos de prueba llevan la marca `PRUEBA HUMO <timestamp>` y **se borran al terminar**, incluso si el flujo falla a mitad (DELETE de la API + marcado lógico de informes, encuestas, notificaciones, facturas, pagos, cotizaciones y del usuario encargado creado en la prueba).
- Además del flujo, cubre las reglas nuevas: creación de un usuario **encargado** por el admin (sin exponer el hash), login con ese encargado y verificación de que **no** puede crear ni listar usuarios (**403**), auditorías accesibles solo para admin, y que en la consulta pública el cambio de fecha muestra **solo `motivoPublico`** (el motivo interno no aparece en ninguna parte de la respuesta).
- Sale con código `0` si las comprobaciones pasan y `1` en caso contrario.
- Verificaciones puntuales de fases anteriores (servidor arriba): `node scripts/verificarFase6.js`, `node scripts/verificarFase7.js`, `node scripts/probarCorreo.js`. Si quedaron datos huérfanos: `node scripts/limpiarPruebasFase6.js`.
- Revisar índices: `npm run indexes` · Revisar seguridad: `npm run security`.
- Ambos scripts de fase aceptan `BASE` (por ejemplo `BASE=http://localhost:3001 node scripts/verificarFase7.js`).

## 11. Seguridad

- **JWT** firmado con `JWT_SECRET`; se envía como `Authorization: Bearer <token>` y se verifica en `src/middlewares/auth.js` (vigencia con `JWT_EXPIRES_IN`). Todas las rutas de `/api/interno/**` pasan por un guardia global (`router.use(auth)` en `src/routes/interno.routes.js`); solo el login queda exento.
- **Autorización** por rol (`requireRole`) y por permiso (`requirePermiso('editar'|'eliminar')`); `admin` siempre puede.
- **helmet** en todas las respuestas (`src/app.js`).
- **cors** restringido a `FRONTEND_URL` (si no está definido se deshabilita el CORS).
- **Rate limit**: general de 600 peticiones / 15 min por IP sobre `/api`, 20 intentos / 15 min en el login (fuerza bruta), 30 consultas / min en `/api/publico/**` y, además, un límite **propio de los POST públicos**: 10 publicaciones / 15 min por IP (respuesta a incidencias y encuestas), siempre con respuesta `429` en JSON.
- **Proxy inverso**: si el servidor va detrás de un proxy (Render, Heroku, nginx), define `TRUST_PROXY=1` en `.env` para que Express lea la IP real y el rate limit por IP siga funcionando; sin esa variable no se confía en ningún proxy.
- **Gestión de usuarios y auditorías**: `/api/interno/usuarios` (crear, listar, ver, actualizar rol/permisos, activar/desactivar y borrado lógico) y `/api/interno/auditorias` (consulta paginada con filtros) son **exclusivas del rol admin**; un administrador no puede desactivarse, eliminarse ni quitarse el rol, y el hash del password nunca se devuelve.
- **API pública**: solo `GET`/`POST` (cualquier otro método responde `405`) y sin operaciones de borrado.
- **Límite de carga**: `express.json({ limit: '10mb' })` y multer con `MAX_FILE_MB` (PDF/JPG/PNG, máximo 3 archivos).
- **Sin credenciales en el código**: todo en `.env`, que está en `.gitignore`; `.env.example` solo lleva valores de ejemplo.
- **Errores sin fugas**: respuestas JSON con mensaje en español y nunca stack traces (`errorHandler.js`).
- **Borrado lógico + auditoría**: nada se borra físicamente y toda modificación queda registrada (`auditorias`, append-only).
- **Contraseñas** hasheadas con bcrypt; la API pública jamás expone observaciones internas ni campos sensibles.
- **Verificación repetible**: `npm run security` ejecuta 35 comprobaciones automáticas sobre estas reglas y sale con código distinto de `0` si algo falla.

## 12. Trabajo en equipo (ramas y commits)

El equipo trabaja con **tres ramas** y **Convención de Commits** (mensajes en español, formato `tipo(alcance): asunto`):

| Rama | Uso |
|---|---|
| `master` | Producción: lo que está desplegado y en funcionamiento. Solo avanza con un PR aprobado desde `QA`. |
| `QA` | Pruebas e integración (entorno de staging). Recibe PRs desde `developer`. |
| `developer` | Desarrollo diario; todo nace acá (idealmente en `feature/<nombre>` o `fix/<nombre>`). |

Flujo: `feature/*` → **developer** → **QA** (probar) → **master** (producción). Arreglos urgentes: `hotfix/*` desde `master`, y luego se propagan a `QA` y `developer`.

La guía completa (formato de commits con ejemplos, aprobaciones, versionado `vX.Y.Z`, entornos y despliegue) está en [`docs/CONVENCIONES.md`](docs/CONVENCIONES.md).

## 13. Documentación relacionada

- [`docs/CONVENCIONES.md`](docs/CONVENCIONES.md) — ramas, flujo de trabajo, convención de commits, versionado y entornos.
- [`docs/CREACION_TABLAS.md`](docs/CREACION_TABLAS.md) — modelo de datos: creación de las 25 tablas, tipos de datos, relaciones y cardinalidades.
- [`docs/MODELO_MONGO.md`](docs/MODELO_MONGO.md) — modelo final de MongoDB Atlas: las 19 colecciones con tipos, índices, restricciones y documento de ejemplo (ciclo de vida: activar/desactivar y borrado lógico, nunca borrado físico).
- [`docs/PLAN_BACKEND_OPENCODE.md`](docs/PLAN_BACKEND_OPENCODE.md) — plan completo: decisiones, estructura, fases 0–9 y prompts por fase.
- `docs/api.md` — documentación de todos los endpoints (módulo por módulo, con método, ruta, rol requerido, cuerpo y respuesta).
- [`AGENTS.md`](AGENTS.md) — reglas obligatorias de desarrollo del proyecto.
