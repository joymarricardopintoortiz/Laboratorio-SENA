# Plan del Backend: Sistema de Gestión para el Servicio de Análisis de Laboratorio

Stack (RNF-001): Node.js + Express + Mongoose + MongoDB Atlas (M0 gratuito).
Base: ERS (112 RF, 19 RNF), documento de análisis y modelo MongoDB.
Modelo de datos final (fase 9): [`docs/CREACION_TABLAS.md`](CREACION_TABLAS.md) (relacional, 25 tablas con tipos y cardinalidades) y [`docs/MODELO_MONGO.md`](MODELO_MONGO.md) (MongoDB: las 19 colecciones como se persisten realmente en Atlas). El código está alineado campo por campo con ambos documentos.

---

## 1. Decisiones ya tomadas (salen de los documentos)

| Tema | Decisión | Origen |
|---|---|---|
| Roles | `admin`, `encargado`, `usuario` (el usuario solo edita su perfil) | Análisis, sección 8 |
| Código de muestra vs. seguimiento | **Dos códigos distintos**: `codigo` (0042-2026) y `codigoSeguimiento` (token aleatorio) | Análisis |
| Comunicación | Correo electrónico; en pruebas Gmail (Nodemailer + contraseña de aplicación) | RNF-019 |
| Pagos | Simulados, sin pasarela y sin datos de tarjetas | RNF-018 |
| Facturación | Factus en pruebas, **sin enviar nada a la DIAN** | RNF-017 |
| Adjuntos y PDF | Dentro de la BD (GridFS o límite de tamaño), sin servicios externos | RNF-016 |
| Borrado | Solo lógico (`eliminado`, `eliminadoPor`, `fechaEliminacion`) | RNF-015 |
| Errores | Siempre JSON con mensaje claro, sin páginas de error | RNF-014 |
| Fecha estimada | Solo fecha, no hora (días hábiles solo para la conservación de 7 días) | Análisis |
| Atlas | M0 gratis (512 MB, sin respaldos automáticos) | RNF-016 |
| Modelo de datos | 25 tablas documentadas (`CREACION_TABLAS.md`) persistidas como 19 colecciones (`MODELO_MONGO.md`), con longitudes, enums e índices alineados en el código | Fase 9 |
| Ciclo de vida de usuarios | CRUD exclusivo del admin; cuentas con `activo` (suspenso reversible) y borrado lógico; nadie se autoelimina ni se auto-desactiva; el password jamás sale en respuestas ni auditorías | RF-049, RF-050, fase 9 |
| Motivos y trazabilidad al cliente | `motivo` interno jamás se expone; el cliente solo ve `motivoPublico` (cambios de fecha) y eventos con `visibleCliente` | RF-082, RNF-004, fase 9 |

## 2. Cosas que había que corregir en el modelo (✅ RESUELTO — fase 9)

Comparé el modelo MongoDB (imagen 1) con el modelo relacional (imagen 2) y con los RF. Faltaban o chocaban estas cosas:

1. **No hay colección `facturas`** en el modelo Mongo, pero el Módulo 10 (RF-099 a RF-106) la necesita. Está en el diagrama relacional.
2. **No hay campos de borrado lógico** en el modelo Mongo (RNF-015). En el diagrama relacional existen `ELIMINADO`, `ELIMINADO_POR`, `FECHA_ELIMINACION` en clientes, solicitudes y muestras. Hay que llevarlos a Mongo.
3. **`muestras` no tiene `codigoSeguimiento`**, y RF-075 lo exige. Hay que agregarlo con índice único.
4. **Faltan `fechaLimiteConservacion` y `rotuloImpreso`** en `muestras` (RF-092 y RF-032). Están en el diagrama relacional.
5. **Lista de estados de la muestra**: RF-041 solo define 3, pero el flujo necesita más. Usaré por defecto: `ingresada`, `en_proceso`, `en_analisis`, `resultados_validados`, `cerrada`, `rechazada`, `en_almacen`, `devuelta`, `desechada`. Si el equipo prefiere otra lista, se cambia en `constants.js` y listo.
6. **Encuesta (RF-098)**: no está definido si se responde por enlace público. Por defecto: sí, con un `token` único por encuesta.
7. En `usuarios`, `permisos` es un objeto. Conviene dejarlo como `{ editar: Boolean, eliminar: Boolean }`.

**Estado final:** las 7 correcciones quedaron implementadas (colección `facturas` creada en la fase 7; borrado lógico con `eliminado`/`eliminadoPor`/`fechaEliminacion` en 14 colecciones; `codigoSeguimiento` con índice único; `fechaLimiteConservacion` y `rotuloImpreso`; los 9 estados de la muestra en `constants.js`; encuesta pública por `token` único; y `permisos` como objeto). Además, la fase 9 fijó el modelo completo en `docs/CREACION_TABLAS.md` y `docs/MODELO_MONGO.md` y alineó el código campo por campo: longitudes (`maxlength` en Mongoose + `.max()` en zod), enums, índices nuevos (análisis único por ejecución; notificaciones por cliente), `motivoPublico`, campo `activo` y límite de 3 intentos de notificación.

## 3. Estructura de carpetas

```
backend/
├── AGENTS.md                  # instrucciones permanentes para OpenCode (sección 6)
├── .env.example               # sin credenciales reales
├── .gitignore                 # incluye .env
├── package.json
├── scripts/
│   ├── seed.js                # admin inicial + catálogo parametrosAnalisis
│   └── backup.js              # exportación JSON de todas las colecciones (RNF-008)
├── tests/
├── docs/
│   ├── PLAN_BACKEND_OPENCODE.md   # este plan
│   ├── CONVENCIONES.md            # ramas, flujo y convención de commits del equipo
│   ├── CREACION_TABLAS.md         # modelo relacional de referencia (25 tablas)
│   ├── MODELO_MONGO.md            # modelo final MongoDB (19 colecciones, documento de ejemplo)
│   └── api.md                     # documentación de los 96 endpoints
└── src/
    ├── server.js              # arranca: conecta BD y levanta Express
    ├── app.js                 # middlewares globales y montaje de rutas
    ├── config/
    │   ├── env.js             # lee y valida variables de entorno
    │   ├── db.js              # conexión a Atlas con Mongoose
    │   └── constants.js       # roles, estados, tipos (una sola fuente)
    ├── middlewares/
    │   ├── auth.js            # verifica JWT
    │   ├── requireRole.js     # autorización por rol/permisos (RF-049, RF-050)
    │   ├── validate.js        # valida body/params con zod (RNF-009)
    │   ├── audit.js           # registra antes/después en auditorias (RNF-006)
    │   ├── upload.js          # multer con límite de tamaño (RNF-016)
    │   ├── notFound.js
    │   └── errorHandler.js    # respuestas JSON uniformes (RNF-014)
    ├── utils/
    │   ├── AppError.js
    │   ├── asyncHandler.js
    │   ├── softDelete.plugin.js   # plugin Mongoose: eliminado + filtro automático
    │   └── diasHabiles.js         # cálculo de 7 días hábiles (RF-092)
    ├── services/              # integraciones, sin lógica de rutas
    │   ├── mail.service.js        # Nodemailer + Gmail (RNF-019)
    │   ├── pdf.service.js         # informes y rótulos en PDF
    │   ├── pagoSimulado.service.js# RNF-018
    │   ├── factus.service.js      # sandbox, sin DIAN (RNF-017)
    │   └── trazabilidad.service.js# crea eventos + actualiza ultimoEvento
    ├── modules/               # un módulo por colección o grupo
    │   ├── auth/              # login, perfil propio
    │   ├── usuarios/
    │   ├── clientes/
    │   ├── solicitudes/
    │   ├── cotizaciones/
    │   ├── pagos/
    │   ├── parametrosAnalisis/
    │   ├── secuencias/
    │   ├── muestras/
    │   ├── analisisMuestras/
    │   ├── eventosTrazabilidad/
    │   ├── cambiosFecha/
    │   ├── incidencias/       # incluye respuestasIncidencias
    │   ├── disposiciones/
    │   ├── informes/
    │   ├── encuestas/
    │   ├── facturas/
    │   ├── notificaciones/
    │   ├── auditorias/
    │   └── publico/           # consulta por código, solo lectura
    │   (cada carpeta: *.model.js, *.schema.js, *.service.js, *.controller.js, *.routes.js)
    └── routes/
        ├── index.js
        ├── interno.routes.js  # /api/interno/*  → auth + roles
        └── publico.routes.js  # /api/publico/*  → sin auth, solo GET y POST de respuesta
```

Reglas de arquitectura:

- Las rutas **nunca** hablan con Mongoose directamente: ruta → controller → service → model.
- `/api/interno/**` exige JWT. `/api/publico/**` no exige login pero **solo devuelve campos públicos** (RF-082, RNF-004).
- El historial público es de solo lectura (RF-083, RNF-005): en `/api/publico` no existen PUT/DELETE.
- Todo cambio de estado de la muestra pasa por `trazabilidad.service` para que siempre se cree el evento (RF-043 a RF-046).
- Una incidencia **nunca** cambia el estado de la muestra por sí sola (RF-072).

## 4. Atlas: pasos manuales (esto no lo puede hacer OpenCode)

Requiere sus credenciales, así que lo hace una persona del equipo:

1. En cloud.mongodb.com crear el proyecto y un clúster **M0 (Free)**.
2. *Database Access*: crear un usuario con contraseña (rol `readWriteAnyDatabase` o solo sobre la base `laboratorio`).
3. *Network Access*: agregar la IP de cada integrante (o `0.0.0.0/0` solo en desarrollo).
4. *Connect → Drivers*: copiar la cadena de conexión.
5. Copiar `.env.example` a `.env` y pegar la cadena ahí. **No pegarla en el chat, en los prompts ni en Git.**

```env
PORT=3000
MONGODB_URI=mongodb+srv://USUARIO:CLAVE@CLUSTER.mongodb.net/laboratorio?retryWrites=true&w=majority
JWT_SECRET=cambiar_por_un_valor_largo_y_aleatorio_de_32_o_mas_caracteres   # mínimo 32 caracteres (valida env.js)
JWT_EXPIRES_IN=8h
TRUST_PROXY=                      # "1" detrás de proxy inverso (Render, nginx) para leer la IP real
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=correo_de_pruebas@gmail.com
MAIL_APP_PASSWORD=contraseña_de_aplicacion_de_gmail
MAIL_FROM="Laboratorio <correo_de_pruebas@gmail.com>"
MAX_FILE_MB=5
FRONTEND_URL=http://localhost:5173
FACTUS_BASE_URL=
FACTUS_CLIENT_ID=
FACTUS_CLIENT_SECRET=
ADMIN_NOMBRE=Administrador
ADMIN_EMAIL=admin@sena.edu.co
ADMIN_PASSWORD=cambiar
```

## 5. Fases

| Fase | Contenido | RF / RNF principales | Entregable verificable |
|---|---|---|---|
| **0** | Proyecto Node, Express, estructura, `.env`, conexión a Atlas, `GET /api/health` | RNF-001, RNF-002 | `/api/health` responde y confirma conexión a Atlas |
| **1** | Base transversal: `AppError`, `errorHandler`, `validate`, plugin soft delete, JWT, `requireRole`, `auditorias`, seed del admin | RNF-003, 006, 009, 014, 015 | Login funciona; ruta protegida rechaza sin token con mensaje claro |
| **2** | Módulo 1: usuarios (perfil propio), clientes, solicitudes, `parametrosAnalisis`, cotizaciones (con envío por correo), pagos simulados | RF-001 a RF-014, RNF-018, 019 | Flujo cliente → solicitud → cotización → aceptación → pago simulado |
| **3** | Módulos 2 y 3: `secuencias`, `muestras` (recepción, advertencia <300 g/ml, aceptar/rechazar, códigos, parámetros, rótulo PDF, inventario, ubicación) | RF-015 a RF-039 | Muestra aceptada obtiene `0001-2026` y `codigoSeguimiento` distintos; código consecutivo atómico |
| **4** | Módulos 4 y 5: `eventosTrazabilidad`, estados, resultados (`analisisMuestras`), validación, repetición, cierre, fechas y `cambiosFecha`, bloqueo si no hay pago | RF-040 a RF-062 | Cada cambio genera evento y auditoría; inicio bloqueado sin pago confirmado |
| **5** | Módulo 6: `incidencias` y `respuestasIncidencias`, adjuntos con límite de tamaño | RF-063 a RF-074, RNF-016 | Incidencia de demora actualiza fecha y notifica, sin cambiar el estado |
| **6** | Módulos 7 y 11: API pública por código y `notificaciones` (correo, reintentos) | RF-075 a RF-085, RF-107 a RF-112, RNF-004, 005, 013 | Consulta pública < 2 s, sin campos internos |
| **7** | Módulos 8, 9 y 10: `disposiciones` (7 días hábiles), `informes` PDF, `encuestas`, `facturas` con Factus sandbox | RF-086 a RF-106, RNF-017 | PDF generado y enviado; factura sin llamar a la DIAN |
| **8** | Respaldo, índices finales, pruebas, documentación de la API | RNF-008, 013 | `npm run backup` exporta todo; README completo |
| **9** | Ajustes finales del modelo de datos y gestión de usuarios: CRUD de usuarios exclusivo del admin (crear, listar, ver, actualizar rol/permisos, activar/desactivar y eliminar lógico — nadie se autoelimina ni se auto-desactiva, el hash nunca se devuelve); campo `activo` (cuenta suspendida sin borrar: bloquea login y token); `motivoPublico` en `cambiosFecha` (el `motivo` interno jamás llega al cliente); rate limit propio en `POST /api/publico` (10 cada 15 min por IP, distinto al de consultas); `GET /api/interno/auditorias` (solo admin, filtros y paginación); `JWT_SECRET` mínimo 32 caracteres y `TRUST_PROXY`; y alineación campo por campo con `docs/CREACION_TABLAS.md` y `docs/MODELO_MONGO.md` (longitudes `maxlength`/zod, enums e índices) | RF-049, RF-050, RF-082, RF-112, RNF-004, 005, 006, 015 | 53 pruebas de humo + 35 de seguridad en verde; 96 rutas; `docs/MODELO_MONGO.md` documenta la forma final de los datos |

Regla de trabajo: al terminar cada fase, probar, hacer commit y mostrarle el resultado al equipo antes de seguir. Así se evita lo de "ahí nos muestran cómo va quedando" a ciegas.

## 6. `AGENTS.md` (copiar en la raíz de `backend/`)

```markdown
# Proyecto: Sistema de Gestión para el Servicio de Análisis de Laboratorio (SENA, ADSO, ficha 3174193)

## Stack
Node.js (ES modules), Express, Mongoose, MongoDB Atlas M0, JWT, zod, Nodemailer, multer.

## Reglas obligatorias
- Arquitectura: route -> controller -> service -> model. Los controllers no usan Mongoose.
- Dos superficies: /api/interno/** (JWT + roles admin|encargado|usuario) y /api/publico/** (sin login, solo lectura por código de seguimiento, jamás exponer observaciones internas).
- Borrado SOLO lógico (eliminado, eliminadoPor, fechaEliminacion). Nunca deleteOne/deleteMany/findByIdAndDelete.
- Toda modificación a datos de muestras/clientes/solicitudes registra antes/después en auditorias (append-only).
- Todo cambio de estado de una muestra crea un eventosTrazabilidad con usuario y fecha/hora.
- Una incidencia nunca cambia el estado de la muestra automáticamente.
- Validar con zod en la ruta Y con required/enum en el esquema Mongoose.
- Errores siempre en JSON: { ok:false, mensaje:"texto claro en español", detalles? }. Sin páginas de error ni stack traces al cliente.
- codigo de muestra = consecutivo-año (0042-2026) generado con findOneAndUpdate + $inc sobre secuencias. codigoSeguimiento es OTRO valor, aleatorio e impredecible.
- Pagos simulados (sin pasarela, sin datos de tarjeta). Factus solo en sandbox, nunca enviar datos a la DIAN.
- Adjuntos y PDF se guardan en la base de datos con límite de MAX_FILE_MB; rechazar los que lo superen con mensaje claro.
- Correos por Nodemailer/Gmail; la cuenta se lee de variables de entorno.
- Nunca escribir credenciales en el código ni en commits. Usar .env (en .gitignore) y .env.example.
- Comentarios y mensajes al usuario en español; nombres de colecciones y campos como en docs/modelo.

## Flujo de trabajo
- Trabajar UNA fase a la vez, según PLAN_BACKEND_OPENCODE.md.
- Al terminar cada fase: ejecutar el servidor, probar los endpoints, resumir qué quedó hecho y qué falta, y esperar confirmación.
```

## 7. Prompts para OpenCode (uno por fase)

Primero: `cd backend`, abrir OpenCode, colocar `AGENTS.md` y este plan en la carpeta (o en `docs/`), y pegar:

### Fase 0
```
Lee AGENTS.md y PLAN_BACKEND_OPENCODE.md. Ejecuta SOLO la Fase 0:
1. Inicializa el proyecto Node con ES modules e instala express, mongoose, dotenv, cors, helmet, morgan, zod, jsonwebtoken, bcryptjs, nodemailer, multer.
2. Crea la estructura de carpetas de la sección 3 (carpetas y archivos base vacíos con comentario de propósito).
3. Implementa config/env.js (valida variables), config/db.js (conexión a Atlas con Mongoose y manejo de error claro), app.js, server.js.
4. Crea .env.example, .gitignore (con .env) y GET /api/health que informe el estado de la conexión a la base.
5. Ejecuta el servidor y verifica /api/health. No hagas más fases.
```

### Fase 1
```
Ejecuta SOLO la Fase 1: AppError, asyncHandler, errorHandler y notFound (respuestas JSON con mensaje claro en español), middleware validate con zod, plugin softDelete para Mongoose (campos eliminado, eliminadoPor, fechaEliminacion y filtro automático en find), colección auditorias append-only con middleware audit, módulo auth (login con bcrypt + JWT, GET/PUT perfil propio), middleware auth y requireRole (admin, encargado, usuario; permisos.editar y permisos.eliminar), modelo usuarios y scripts/seed.js que cree el admin inicial leyendo sus datos del .env. Prueba login, ruta protegida sin token y con token.
```

### Fase 2
```
Ejecuta SOLO la Fase 2 (Módulo 1, RF-001 a RF-014). Modelos y CRUD con soft delete y auditoría para clientes, solicitudes (tipoCliente interno/externo, prioridad, atención inmediata con motivo), parametrosAnalisis (catálogo administrable por admin/encargado), cotizaciones (items, subtotal, total, numero consecutivo, envío por correo con mail.service, aceptación) y pagos con pagoSimulado.service (generar referencia, confirmar pago simulado). Agrega los campos que falten según la sección 2 del plan. Solicitudes externas requieren pago; internas no. Prueba el flujo completo con requests de ejemplo.
```

### Fase 3
```
Ejecuta SOLO la Fase 3 (RF-015 a RF-039): colección secuencias y generación atómica del código consecutivo-año; modelo muestras con codigo y codigoSeguimiento (ambos únicos, distintos), tipoFisico sólido/líquido con unidad g/ml, advertencia (no bloqueo) si cantidad < 300, verificación física, aceptar/rechazar con motivo obligatorio, selección de parámetros, rótulo en PDF (pdf.service), ingreso al inventario, ubicación, listado de inventario, consulta por orden de llegada y por código. Índices según el análisis (sección 6.5). Prueba que dos muestras simultáneas no repitan consecutivo.
```

### Fase 4
```
Ejecuta SOLO la Fase 4 (RF-040 a RF-062): trazabilidad.service que cree eventosTrazabilidad (visibleCliente) y actualice el estado de la muestra; estados definidos en constants.js; resultados por parámetro en analisisMuestras con validación, repetición con motivo y cierre; fecha de inicio bloqueada si corresponde pago y no está confirmado; fecha estimada con cambiosFecha (anterior, nueva, motivo, usuario). Cada corrección debe quedar en auditorias.
```

### Fase 5
```
Ejecuta SOLO la Fase 5 (RF-063 a RF-074, RNF-016): incidencias (informativa, demora, requiere_accion_cliente) con descripción, visibilidad al cliente, aprobación, cierre y respuestasIncidencias con adjuntos (multer con límite MAX_FILE_MB, guardado en la base de datos). Una incidencia de demora actualiza la fecha estimada vía cambiosFecha pero NO cambia el estado de la muestra.
```

### Fase 6
```
Ejecuta SOLO la Fase 6 (RF-075 a RF-085, RF-107 a RF-112): API pública /api/publico/seguimiento/:codigoSeguimiento (solo GET; devuelve estado actual, eventos con visibleCliente=true, demoras/nueva fecha, disponibilidad del informe y facturación pública; nunca campos internos) y POST de respuesta a incidencia. Módulo notificaciones: crear, enviar por correo, estado enviada/fallida y reintento. Dispara notificaciones en cambio de etapa, incidencia, cambio de fecha y resultados disponibles. Verifica tiempo de respuesta < 2 s y que no se filtren campos internos.
```

### Fase 7
```
Ejecuta SOLO la Fase 7 (RF-086 a RF-106, RNF-017): disposiciones (devolución o desecho, motivo, fecha de salida, conservación de 7 días hábiles con utils/diasHabiles y aviso al cliente), informes (generación y PDF guardado en la base, disponibilidad y envío por correo), encuestas (token único, respuesta pública), facturas con factus.service en modo sandbox: NO enviar nada a la DIAN, historial de cambios de estado y consulta pública limitada.
```

### Fase 8
```
Ejecuta SOLO la Fase 8: scripts/backup.js que exporte todas las colecciones a JSON con fecha (RNF-008), revisión de índices, pruebas de los flujos principales, docs/api.md con todos los endpoints y README con instalación y variables de entorno.
```

### Fase 9 (ejecutada)
```
Ejecuta SOLO la Fase 9 (ajustes finales del modelo de datos y gestión de usuarios):
1. Módulo usuarios (solo admin): crear con email único y password >= 8 (hash bcrypt, jamás devuelto), listar, ver, actualizar rol/permisos, activar/desactivar y eliminar LÓGICO; un admin no puede desactivarse, eliminarse ni quitarse el rol a sí mismo.
2. Campo activo en usuarios: una cuenta desactivada no inicia sesión (401) y su token deja de valer (401).
3. cambiosFecha: agregar motivoPublico; /api/publico/seguimiento devuelve solo motivoPublico (cadena vacía si no existe) y NUNCA el motivo interno (ni en trazabilidad ni en correos).
4. Rate limit propio para POST /api/publico (10 peticiones cada 15 minutos por IP), distinto del de consultas.
5. GET /api/interno/auditorias (solo admin): filtros coleccion/documentoId/usuarioId/rango de fechas, paginado, solo lectura.
6. env.js: JWT_SECRET con mínimo 32 caracteres y TRUST_PROXY opcional (app.set('trust proxy', 1)).
7. Alinea modelos Mongoose y schemas zod campo por campo con docs/CREACION_TABLAS.md y docs/MODELO_MONGO.md: longitudes maxlength/.max(), enums idénticos, índices (análisis unico por ejecución; notificaciones por clienteId) y max 3 intentos de notificación.
8. Verifica con npm test (53) y npm run security (35); actualiza docs/api.md, README.md y el plan.
```

## 8. Qué pueden y no pueden hacer solos con OpenCode

- Puede hacer solo: el código, la estructura, el servidor, los esquemas y las pruebas locales.
- Necesita a una persona: crear el clúster y el usuario en Atlas, pegar la cadena de conexión en `.env`, crear la contraseña de aplicación de Gmail y las credenciales de Factus sandbox.
- Si OpenCode falla al conectar con Atlas, lo más común es que la IP no esté en *Network Access* o que la contraseña del usuario tenga caracteres especiales sin codificar en la URI.