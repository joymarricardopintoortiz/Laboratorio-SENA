# Creación de tablas, relaciones y cardinalidades

Guía de referencia del modelo de datos del **Sistema de Gestión para el Servicio de Análisis de Laboratorio** (SENA — ADSO, ficha 3174193).

- **25 tablas**: 19 principales (una por colección del modelo MongoDB real del backend) + 6 auxiliares (ítems, puentes N:M y bitácoras embebidas).
- El backend real usa **MongoDB Atlas** con Mongoose; este documento describe la **especificación relacional equivalente** (MySQL 8) con tipos, restricciones, llaves foráneas y cardinalidades — útil para la documentación, el diagrama ER y las pruebas académicas.
- Cada tabla refleja las reglas del proyecto (`AGENTS.md` y `docs/PLAN_BACKEND_OPENCODE.md`): borrado solo lógico, auditorías *append-only*, trazabilidad completa y nunca exponer datos internos al cliente.

---

## 1. Índice de tablas

| # | Tabla | Tipo | Para qué sirve |
|---|---|---|---|
| 1 | `usuarios` | principal | Usuarios del sistema interno (admin, encargado, usuario) |
| 2 | `auditorias` | principal | Registro *append-only* antes/después de cada cambio |
| 3 | `secuencias` | auxiliar técnica | Contadores atómicos (`0042-2026`) |
| 4 | `clientes` | principal | Clientes internos y externos |
| 5 | `solicitudes` | principal | Solicitudes de análisis |
| 6 | `parametros_analisis` | principal | Catálogo de análisis (pH, turbidez…) |
| 7 | `cotizaciones` | principal | Cotizaciones con totales |
| 8 | `cotizacion_items` | auxiliar | Ítems de la cotización (N:M enriquecida) |
| 9 | `pagos` | principal | Pagos **simulados** (sin pasarela) |
| 10 | `muestras` | principal | Muestras y su ciclo de vida |
| 11 | `muestra_parametros` | auxiliar (puente) | N:M muestra ↔ parámetro |
| 12 | `analisis_muestras` | principal | Resultados por parámetro y ejecución |
| 13 | `eventos_trazabilidad` | principal | Historial de eventos de cada muestra |
| 14 | `cambios_fecha` | principal | Historial de cambios de fecha estimada |
| 15 | `incidencias` | principal | Demoras, informativas, acciones al cliente |
| 16 | `incidencia_acciones` | auxiliar | Bitácora de acciones de la incidencia |
| 17 | `respuestas_incidencias` | principal | Respuestas cliente/interno |
| 18 | `respuesta_archivos` | auxiliar | Adjuntos (PDF/JPG/PNG en la BD) |
| 19 | `disposiciones` | principal | Devolución o desecho final |
| 20 | `informes` | principal | Informes PDF versionados |
| 21 | `encuestas` | principal | Encuesta de satisfacción por token |
| 22 | `encuesta_respuestas` | auxiliar | Respuestas (calificación 1–5) |
| 23 | `facturas` | principal | Facturas (Factus sandbox o simuladas) |
| 24 | `factura_historial` | auxiliar | Cambios de estado de la factura |
| 25 | `notificaciones` | principal | Correos al cliente (máx. 3 intentos) |

---

## 2. Script de creación completo

```sql
-- ============================================================
-- Sistema de Gestión para el Servicio de Análisis de Laboratorio
-- Script de creación de la base de datos relacional (MySQL 8)
-- 25 tablas: 19 principales + 6 auxiliares
-- ============================================================

CREATE DATABASE IF NOT EXISTS laboratorio
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE laboratorio;

-- ============================================================
-- 1. USUARIOS
-- Relación: 1 usuario genera N auditorías (referencia por email/id, sin FK)
-- ============================================================
CREATE TABLE usuarios (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre             VARCHAR(120) NOT NULL,
  email              VARCHAR(150) NOT NULL UNIQUE,
  password           VARCHAR(60)  NOT NULL,          -- hash bcrypt, nunca texto plano
  rol                ENUM('admin','encargado','usuario') NOT NULL,
  activo             BOOLEAN NOT NULL DEFAULT TRUE,  -- cuenta desactivada no entra
  permiso_editar     BOOLEAN NOT NULL DEFAULT FALSE,
  permiso_eliminar   BOOLEAN NOT NULL DEFAULT FALSE,
  eliminado          BOOLEAN NOT NULL DEFAULT FALSE, -- borrado lógico (RNF-015)
  eliminado_por      VARCHAR(150) NULL,
  fecha_eliminacion  DATETIME NULL,
  fecha_creacion     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================
-- 2. AUDITORÍAS (solo inserción; append-only, sin borrado ni edición)
-- Relación: N auditorías : 1 usuario (referencia)
-- ============================================================
CREATE TABLE auditorias (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  entidad        VARCHAR(50)  NOT NULL,   -- ej: 'muestras', 'clientes'
  entidad_id     VARCHAR(30)  NULL,       -- id del documento auditado
  accion         VARCHAR(30)  NOT NULL,   -- crear, actualizar, eliminar_logico...
  antes          JSON         NULL,       -- estado previo
  despues        JSON         NULL,       -- estado nuevo
  usuario        VARCHAR(150) NULL,       -- email o id de quien actuó
  ip             VARCHAR(45)  NULL,       -- IPv4/IPv6
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 3. SECUENCIAS (auxiliar técnico para consecutivos atómicos)
-- ============================================================
CREATE TABLE secuencias (
  nombre    VARCHAR(30) PRIMARY KEY,   -- ej: 'cotizaciones', 'muestras-2026'
  secuencia INT NOT NULL DEFAULT 0
);

-- ============================================================
-- 4. CLIENTES
-- Relación: 1 cliente tiene N solicitudes, N muestras, N encuestas, N notificaciones
-- ============================================================
CREATE TABLE clientes (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre              VARCHAR(120) NOT NULL,
  tipo_documento      ENUM('CC','NIT','CE','TI') NOT NULL DEFAULT 'CC',
  numero_documento    VARCHAR(20)  NOT NULL UNIQUE,
  email               VARCHAR(150) NOT NULL,
  telefono            VARCHAR(20)  NOT NULL DEFAULT '',
  direccion           VARCHAR(200) NOT NULL DEFAULT '',
  tipo_cliente        ENUM('interno','externo') NOT NULL,
  eliminado           BOOLEAN NOT NULL DEFAULT FALSE,
  eliminado_por       VARCHAR(150) NULL,
  fecha_eliminacion   DATETIME NULL,
  fecha_creacion      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================
-- 5. SOLICITUDES
-- Relación: N solicitudes : 1 cliente
-- Relación: 1 solicitud tiene N cotizaciones, N pagos, N muestras, N facturas
-- ============================================================
CREATE TABLE solicitudes (
  id                        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id                INT UNSIGNED NOT NULL,
  tipo_cliente              ENUM('interno','externo') NOT NULL,
  descripcion               TEXT NOT NULL,
  prioridad                 ENUM('baja','media','alta') NOT NULL DEFAULT 'media',
  atencion_inmediata        BOOLEAN NOT NULL DEFAULT FALSE,
  motivo_atencion_inmediata VARCHAR(300) NOT NULL DEFAULT '', -- obligatorio si inmediata
  estado                    ENUM('pendiente','cotizada','aceptada','pagada','rechazada')
                              NOT NULL DEFAULT 'pendiente',
  requiere_pago             BOOLEAN NOT NULL DEFAULT FALSE,
  eliminado                 BOOLEAN NOT NULL DEFAULT FALSE,
  eliminado_por             VARCHAR(150) NULL,
  fecha_eliminacion         DATETIME NULL,
  fecha_creacion            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion       DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_solicitudes_estado_fecha (estado, fecha_creacion),
  INDEX idx_solicitudes_cliente (cliente_id),
  CONSTRAINT fk_solicitudes_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

-- ============================================================
-- 6. PARÁMETROS DE ANÁLISIS
-- Relación: 1 parámetro participa en N ítems de cotización, N análisis y N muestras (N:M)
-- ============================================================
CREATE TABLE parametros_analisis (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre             VARCHAR(100) NOT NULL UNIQUE,
  descripcion        TEXT NOT NULL,
  precio             DECIMAL(12,2) NOT NULL CHECK (precio >= 0),
  unidad             VARCHAR(20) NOT NULL DEFAULT '',
  activo             BOOLEAN NOT NULL DEFAULT TRUE,
  eliminado          BOOLEAN NOT NULL DEFAULT FALSE,
  eliminado_por      VARCHAR(150) NULL,
  fecha_eliminacion  DATETIME NULL,
  fecha_creacion     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================
-- 7. COTIZACIONES
-- Relación: N cotizaciones : 1 solicitud
-- Relación: 1 cotización tiene N ítems y N pagos
-- ============================================================
CREATE TABLE cotizaciones (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  solicitud_id       INT UNSIGNED NOT NULL,
  numero             INT UNSIGNED NOT NULL UNIQUE,   -- consecutivo
  subtotal           DECIMAL(12,2) NOT NULL CHECK (subtotal >= 0),
  total              DECIMAL(12,2) NOT NULL CHECK (total >= 0),
  estado             ENUM('borrador','enviada','envio_fallido','aceptada','rechazada')
                       NOT NULL DEFAULT 'borrador',
  enviada_por_correo BOOLEAN NOT NULL DEFAULT FALSE,
  error_correo       VARCHAR(300) NOT NULL DEFAULT '',
  eliminado          BOOLEAN NOT NULL DEFAULT FALSE,
  eliminado_por      VARCHAR(150) NULL,
  fecha_eliminacion  DATETIME NULL,
  fecha_creacion     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cotizaciones_solicitud (solicitud_id),
  CONSTRAINT fk_cotizaciones_solicitud FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id)
);

-- ============================================================
-- 8. COTIZACIÓN ÍTEMS (auxiliar: N:M enriquecida cotización ↔ parámetro)
-- ============================================================
CREATE TABLE cotizacion_items (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cotizacion_id   INT UNSIGNED NOT NULL,
  parametro_id    INT UNSIGNED NOT NULL,
  descripcion     VARCHAR(200) NOT NULL DEFAULT '',
  cantidad        INT UNSIGNED NOT NULL CHECK (cantidad >= 1),
  precio_unitario DECIMAL(12,2) NOT NULL CHECK (precio_unitario >= 0),
  subtotal        DECIMAL(12,2) NOT NULL CHECK (subtotal >= 0),
  CONSTRAINT fk_items_cotizacion FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id),
  CONSTRAINT fk_items_parametro  FOREIGN KEY (parametro_id)  REFERENCES parametros_analisis(id)
);

-- ============================================================
-- 9. PAGOS (simulados, sin pasarela, sin datos de tarjeta)
-- Relación: N pagos : 1 cotización  y  N pagos : 1 solicitud
-- Relación: 1 pago origina N facturas
-- ============================================================
CREATE TABLE pagos (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cotizacion_id      INT UNSIGNED NOT NULL,
  solicitud_id       INT UNSIGNED NOT NULL,
  referencia         CHAR(30) NOT NULL UNIQUE,         -- ej: PAY-2026-0001-A1B2C3
  monto              DECIMAL(12,2) NOT NULL CHECK (monto >= 0),
  metodo             VARCHAR(20) NOT NULL DEFAULT 'simulado',
  estado             ENUM('pendiente','confirmado','fallido') NOT NULL DEFAULT 'pendiente',
  fecha_confirmacion DATETIME NULL,
  eliminado          BOOLEAN NOT NULL DEFAULT FALSE,
  eliminado_por      VARCHAR(150) NULL,
  fecha_eliminacion  DATETIME NULL,
  fecha_creacion     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pagos_solicitud (solicitud_id),
  INDEX idx_pagos_cotizacion (cotizacion_id),
  INDEX idx_pagos_estado_fecha (estado, fecha_creacion),
  CONSTRAINT fk_pagos_cotizacion FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id),
  CONSTRAINT fk_pagos_solicitud  FOREIGN KEY (solicitud_id)  REFERENCES solicitudes(id)
);

-- ============================================================
-- 10. MUESTRAS
-- Relación: N muestras : 1 solicitud  y  N muestras : 1 cliente
-- Relación: 1 muestra tiene N análisis, eventos, cambios de fecha,
--           incidencias, informes, notificaciones y a lo sumo 1 disposición
-- Relación: N:M muestras ↔ parámetros (tabla puente muestra_parametros)
-- ============================================================
CREATE TABLE muestras (
  id                        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  solicitud_id              INT UNSIGNED NOT NULL,
  cliente_id                INT UNSIGNED NOT NULL,
  nombre_muestra            VARCHAR(150) NOT NULL,
  descripcion               TEXT NOT NULL,
  tipo_fisico               ENUM('solido','liquido') NOT NULL,
  cantidad                  DECIMAL(10,2) NOT NULL CHECK (cantidad >= 0),
  unidad                    CHAR(2) NOT NULL,                -- 'g' | 'ml'
  verificacion_fisica       BOOLEAN NOT NULL DEFAULT FALSE,
  estado_recepcion          ENUM('pendiente','aceptada','rechazada') NOT NULL DEFAULT 'pendiente',
  motivo_rechazo            VARCHAR(300) NOT NULL DEFAULT '',
  codigo                    CHAR(9) UNIQUE NULL,             -- '0042-2026'
  codigo_seguimiento        CHAR(32) UNIQUE NULL,            -- aleatorio e impredecible
  estado                    ENUM('ingresada','en_proceso','en_analisis','resultados_validados',
                                 'cerrada','rechazada','en_almacen','devuelta','desechada')
                              NOT NULL DEFAULT 'ingresada',
  rotulo_impreso            BOOLEAN NOT NULL DEFAULT FALSE,
  rotulo_pdf                LONGBLOB NULL,                   -- PDF del rótulo
  ubicacion_clasificacion   ENUM('ingresada','en_proceso','en_analisis') NULL,
  ubicacion                 VARCHAR(150) NOT NULL DEFAULT '',
  ubicacion_actualizado_en  DATETIME NULL,
  fecha_recepcion           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_inicio              DATETIME NULL,
  fecha_estimada_entrega    DATETIME NULL,
  fecha_cierre              DATETIME NULL,
  fecha_limite_conservacion DATETIME NULL,                   -- cierre + 7 días hábiles
  pendiente_disposicion     BOOLEAN NOT NULL DEFAULT FALSE,
  ultimo_evento_tipo        VARCHAR(30) NULL,                -- caché del último evento
  ultimo_evento_fecha       DATETIME NULL,
  eliminado                 BOOLEAN NOT NULL DEFAULT FALSE,
  eliminado_por             VARCHAR(150) NULL,
  fecha_eliminacion         DATETIME NULL,
  fecha_creacion            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion       DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_muestras_solicitud (solicitud_id),
  INDEX idx_muestras_cliente (cliente_id),
  INDEX idx_muestras_estado_fecha (estado, fecha_recepcion),
  INDEX idx_muestras_disposicion (pendiente_disposicion),
  CONSTRAINT fk_muestras_solicitud FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id),
  CONSTRAINT fk_muestras_cliente   FOREIGN KEY (cliente_id)   REFERENCES clientes(id)
);

-- ============================================================
-- 11. MUESTRA PARÁMETROS (auxiliar: N:M muestra ↔ parámetro)
-- ============================================================
CREATE TABLE muestra_parametros (
  muestra_id    INT UNSIGNED NOT NULL,
  parametro_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (muestra_id, parametro_id),
  CONSTRAINT fk_mp_muestra   FOREIGN KEY (muestra_id)   REFERENCES muestras(id),
  CONSTRAINT fk_mp_parametro FOREIGN KEY (parametro_id) REFERENCES parametros_analisis(id)
);

-- ============================================================
-- 12. ANÁLISIS DE MUESTRAS
-- Relación: N análisis : 1 muestra  y  N análisis : 1 parámetro
-- Regla: a lo sumo 1 fila por (muestra, parámetro, número de ejecución)
-- ============================================================
CREATE TABLE analisis_muestras (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  muestra_id         INT UNSIGNED NOT NULL,
  parametro_id       INT UNSIGNED NOT NULL,
  numero_ejecucion   INT UNSIGNED NOT NULL DEFAULT 1,     -- 1 = inicial
  tipo               ENUM('inicial','repeticion') NOT NULL,
  motivo_repeticion  VARCHAR(300) NOT NULL DEFAULT '',
  estado             ENUM('en_curso','completado','validado') NOT NULL DEFAULT 'completado',
  resultado          VARCHAR(200) NOT NULL DEFAULT '',
  valor              DECIMAL(12,4) NULL,
  unidad             VARCHAR(20) NOT NULL DEFAULT '',
  fecha_inicio       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_finalizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_validacion   DATETIME NULL,
  realizado_por      VARCHAR(150) NULL,                  -- email del encargado
  validado_por       VARCHAR(150) NULL,
  UNIQUE KEY uq_analisis_ejecucion (muestra_id, parametro_id, numero_ejecucion),
  INDEX idx_analisis_muestra (muestra_id),
  CONSTRAINT fk_analisis_muestra   FOREIGN KEY (muestra_id)   REFERENCES muestras(id),
  CONSTRAINT fk_analisis_parametro FOREIGN KEY (parametro_id) REFERENCES parametros_analisis(id)
);

-- ============================================================
-- 13. EVENTOS DE TRAZABILIDAD (solo inserción; el historial no se borra)
-- Relación: N eventos : 1 muestra
-- ============================================================
CREATE TABLE eventos_trazabilidad (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  muestra_id      INT UNSIGNED NOT NULL,
  tipo_evento     ENUM('recepcion','ingreso','cambio_estado','observacion','correccion',
                       'inicio','cambio_fecha','resultado','repeticion','validacion',
                       'cierre','rotulo','ubicacion','rechazo','notificacion') NOT NULL,
  estado_anterior VARCHAR(30) NULL,
  estado_nuevo    VARCHAR(30) NULL,
  descripcion     TEXT NOT NULL,
  ubicacion       VARCHAR(150) NOT NULL DEFAULT '',
  visible_cliente BOOLEAN NOT NULL DEFAULT FALSE,
  usuario_id      VARCHAR(150) NULL,
  fecha           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_eventos_muestra (muestra_id),
  INDEX idx_eventos_visibles (muestra_id, visible_cliente, fecha),
  CONSTRAINT fk_eventos_muestra FOREIGN KEY (muestra_id) REFERENCES muestras(id)
);

-- ============================================================
-- 14. CAMBIOS DE FECHA (historial; el motivo es interno, nunca público)
-- Relación: N cambios : 1 muestra
-- ============================================================
CREATE TABLE cambios_fecha (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  muestra_id     INT UNSIGNED NOT NULL,
  fecha_anterior DATETIME NULL,
  fecha_nueva    DATETIME NOT NULL,
  motivo         VARCHAR(500) NOT NULL,                -- INTERNO (nunca se expone)
  motivo_publico VARCHAR(500) NOT NULL DEFAULT '',     -- lo único que ve el cliente
  usuario_id     VARCHAR(150) NOT NULL,
  fecha_cambio   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cambios_muestra (muestra_id),
  CONSTRAINT fk_cambios_muestra FOREIGN KEY (muestra_id) REFERENCES muestras(id)
);

-- ============================================================
-- 15. INCIDENCIAS
-- Relación: N incidencias : 1 muestra; 1 incidencia tiene N acciones y N respuestas
-- Regla: una incidencia NUNCA cambia el estado de la muestra automáticamente
-- ============================================================
CREATE TABLE incidencias (
  id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  muestra_id             INT UNSIGNED NOT NULL,
  tipo                   ENUM('informativa','demora','requiere_accion_cliente') NOT NULL,
  titulo                 VARCHAR(200) NOT NULL,
  descripcion            TEXT NOT NULL,
  observaciones_internas TEXT NOT NULL,                -- NUNCA visible al cliente
  visible_cliente        BOOLEAN NOT NULL DEFAULT FALSE,
  requiere_respuesta     BOOLEAN NOT NULL DEFAULT FALSE,
  estado                 ENUM('abierta','en_revision','esperando_cliente','aprobada','cerrada')
                           NOT NULL DEFAULT 'abierta',
  nueva_fecha_estimada   DATETIME NULL,                -- solo tipo 'demora'
  motivo                 VARCHAR(500) NOT NULL DEFAULT '',
  creada_por             VARCHAR(150) NULL,
  revisada_por           VARCHAR(150) NULL,
  fecha_creacion         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_cierre           DATETIME NULL,
  eliminado              BOOLEAN NOT NULL DEFAULT FALSE,
  eliminado_por          VARCHAR(150) NULL,
  fecha_eliminacion      DATETIME NULL,
  INDEX idx_incidencias_muestra (muestra_id),
  CONSTRAINT fk_incidencias_muestra FOREIGN KEY (muestra_id) REFERENCES muestras(id)
);

-- ============================================================
-- 16. INCIDENCIA ACCIONES (auxiliar: bitácora de la incidencia)
-- ============================================================
CREATE TABLE incidencia_acciones (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  incidencia_id INT UNSIGNED NOT NULL,
  tipo          VARCHAR(30) NOT NULL,   -- creada, demora_fecha, respuesta_cliente, aprobada, cerrada, observacion
  usuario       VARCHAR(150) NULL,
  fecha         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  comentario    TEXT NOT NULL,
  CONSTRAINT fk_acciones_incidencia FOREIGN KEY (incidencia_id) REFERENCES incidencias(id)
);

-- ============================================================
-- 17. RESPUESTAS A INCIDENCIAS
-- Relación: N respuestas : 1 incidencia; 1 respuesta tiene N archivos
-- ============================================================
CREATE TABLE respuestas_incidencias (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  incidencia_id     INT UNSIGNED NOT NULL,
  tipo_usuario      ENUM('cliente','interno') NOT NULL,
  usuario_id        VARCHAR(150) NULL,
  mensaje           TEXT NOT NULL,
  fecha             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  eliminado         BOOLEAN NOT NULL DEFAULT FALSE,
  eliminado_por     VARCHAR(150) NULL,
  fecha_eliminacion DATETIME NULL,
  fecha_creacion    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_respuestas_incidencia (incidencia_id),
  CONSTRAINT fk_respuestas_incidencia FOREIGN KEY (incidencia_id) REFERENCES incidencias(id)
);

-- ============================================================
-- 18. RESPUESTA ARCHIVOS (auxiliar: adjuntos, máx. 3 por respuesta)
-- ============================================================
CREATE TABLE respuesta_archivos (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  respuesta_id INT UNSIGNED NOT NULL,
  nombre       VARCHAR(200) NOT NULL,
  tipo_mime    VARCHAR(100) NOT NULL,      -- application/pdf, image/jpeg...
  tamano       INT UNSIGNED NOT NULL,      -- bytes, tope MAX_FILE_MB
  contenido    LONGBLOB NOT NULL,          -- el archivo dentro de la BD
  CONSTRAINT fk_archivos_respuesta FOREIGN KEY (respuesta_id) REFERENCES respuestas_incidencias(id)
);

-- ============================================================
-- 19. DISPOSICIONES
-- Relación: 1:1 con muestra (UNIQUE) — una sola disposición activa por muestra
-- ============================================================
CREATE TABLE disposiciones (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  muestra_id           INT UNSIGNED NOT NULL UNIQUE,  -- garantiza 1:1
  tipo                 ENUM('devolucion','desecho') NOT NULL,
  motivo               VARCHAR(500) NOT NULL,
  observacion          TEXT NOT NULL,
  fecha_salida         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notificacion_cliente BOOLEAN NOT NULL DEFAULT FALSE,
  realizada_por        VARCHAR(150) NULL,
  fecha_creacion       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion  DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_disposicion_muestra FOREIGN KEY (muestra_id) REFERENCES muestras(id)
);

-- ============================================================
-- 20. INFORMES
-- Relación: N informes : 1 muestra (versiones); autorreferencia regenerado_de
-- ============================================================
CREATE TABLE informes (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  muestra_id           INT UNSIGNED NOT NULL,
  numero_informe       CHAR(9) NOT NULL UNIQUE,        -- '0001-2026'
  estado               ENUM('borrador','generado','disponible','enviado') NOT NULL DEFAULT 'borrador',
  archivo              LONGBLOB NOT NULL,              -- PDF del informe
  version              INT UNSIGNED NOT NULL DEFAULT 1,
  regenerado_de        INT UNSIGNED NULL,              -- versión anterior
  generado_por         VARCHAR(150) NULL,
  fecha_generacion     DATETIME NULL,
  fecha_disponibilidad DATETIME NULL,
  eliminado            BOOLEAN NOT NULL DEFAULT FALSE,
  eliminado_por        VARCHAR(150) NULL,
  fecha_eliminacion    DATETIME NULL,
  fecha_creacion       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion  DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_informes_muestra (muestra_id),
  CONSTRAINT fk_informes_muestra FOREIGN KEY (muestra_id) REFERENCES muestras(id),
  CONSTRAINT fk_informes_version FOREIGN KEY (regenerado_de) REFERENCES informes(id)
);

-- ============================================================
-- 21. ENCUESTAS (acceso público por token impredecible)
-- Relación: 1 encuesta : 1 muestra (una por muestra); N encuestas : 1 cliente
-- ============================================================
CREATE TABLE encuestas (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  muestra_id        INT UNSIGNED NOT NULL,
  cliente_id        INT UNSIGNED NOT NULL,
  token             CHAR(48) NOT NULL UNIQUE,           -- hex impredecible
  estado            ENUM('pendiente','respondida') NOT NULL DEFAULT 'pendiente',
  fecha_envio       DATETIME NULL,
  fecha_respuesta   DATETIME NULL,
  eliminado         BOOLEAN NOT NULL DEFAULT FALSE,
  eliminado_por     VARCHAR(150) NULL,
  fecha_eliminacion DATETIME NULL,
  fecha_creacion    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_encuestas_muestra (muestra_id),
  CONSTRAINT fk_encuestas_muestra FOREIGN KEY (muestra_id) REFERENCES muestras(id),
  CONSTRAINT fk_encuestas_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

-- ============================================================
-- 22. ENCUESTA RESPUESTAS (auxiliar: 4 preguntas fijas, calificación 1–5)
-- ============================================================
CREATE TABLE encuesta_respuestas (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  encuesta_id  INT UNSIGNED NOT NULL,
  pregunta     TEXT NOT NULL,
  calificacion TINYINT UNSIGNED NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
  comentario   VARCHAR(500) NOT NULL DEFAULT '',
  CONSTRAINT fk_enc_respuesta_encuesta FOREIGN KEY (encuesta_id) REFERENCES encuestas(id)
);

-- ============================================================
-- 23. FACTURAS
-- Relación: N facturas : 1 solicitud y N facturas : 1 pago; 1 factura tiene N estados en historial
-- ============================================================
CREATE TABLE facturas (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  solicitud_id       INT UNSIGNED NOT NULL,
  pago_id            INT UNSIGNED NOT NULL,
  numero             CHAR(9) NOT NULL UNIQUE,          -- '0001-2026'
  valor_total        DECIMAL(12,2) NOT NULL CHECK (valor_total >= 0),
  estado             ENUM('pendiente','generada','enviada','anulada','error') NOT NULL DEFAULT 'pendiente',
  documento          JSON NULL,                        -- respuesta de Factus (nunca pública)
  generado_por       VARCHAR(150) NULL,
  fecha_generacion   DATETIME NULL,
  eliminado          BOOLEAN NOT NULL DEFAULT FALSE,
  eliminado_por      VARCHAR(150) NULL,
  fecha_eliminacion  DATETIME NULL,
  fecha_creacion     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_facturas_solicitud (solicitud_id),
  INDEX idx_facturas_pago (pago_id),
  CONSTRAINT fk_facturas_solicitud FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id),
  CONSTRAINT fk_facturas_pago      FOREIGN KEY (pago_id)      REFERENCES pagos(id)
);

-- ============================================================
-- 24. FACTURA HISTORIAL (auxiliar: cambios de estado de la factura)
-- ============================================================
CREATE TABLE factura_historial (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  factura_id  INT UNSIGNED NOT NULL,
  estado      ENUM('pendiente','generada','enviada','anulada','error') NOT NULL,
  usuario     VARCHAR(150) NULL,
  fecha       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  motivo      TEXT NOT NULL,
  CONSTRAINT fk_hist_factura FOREIGN KEY (factura_id) REFERENCES facturas(id)
);

-- ============================================================
-- 25. NOTIFICACIONES
-- Relación: N notificaciones : 1 muestra (opcional) y : 1 cliente (opcional)
-- Regla: máximo 3 intentos de envío por notificación (RF-112)
-- ============================================================
CREATE TABLE notificaciones (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  muestra_id           INT UNSIGNED NULL,
  cliente_id           INT UNSIGNED NULL,
  tipo                 ENUM('cambio_etapa','incidencia','cambio_fecha',
                            'resultados_disponibles','conservacion','otro') NOT NULL,
  asunto               VARCHAR(200) NOT NULL,
  mensaje              TEXT NOT NULL,
  correo_destino       VARCHAR(150) NULL,
  medio                ENUM('correo') NOT NULL DEFAULT 'correo',
  estado               ENUM('pendiente','enviada','fallida') NOT NULL DEFAULT 'pendiente',
  intentos             TINYINT UNSIGNED NOT NULL DEFAULT 0,   -- máx. 3
  error_ultimo_intento VARCHAR(300) NULL,
  reintentable         BOOLEAN NOT NULL DEFAULT TRUE,  -- FALSE = destino inválido, ya no se reintenta
  proxima_tentativa    DATETIME NULL,                  -- reenvío automático (límite diario de correos)
  fecha_programada     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_envio          DATETIME NULL,
  eliminado            BOOLEAN NOT NULL DEFAULT FALSE,
  eliminado_por        VARCHAR(150) NULL,
  fecha_eliminacion    DATETIME NULL,
  fecha_creacion       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion  DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_notif_muestra (muestra_id),
  INDEX idx_notif_cliente (cliente_id),
  INDEX idx_notif_cola (estado, proxima_tentativa),    -- cola de reenvío diaria
  CONSTRAINT fk_notif_muestra FOREIGN KEY (muestra_id) REFERENCES muestras(id),
  CONSTRAINT fk_notif_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);
```

---

## 3. Relaciones y cardinalidades (resumen)

| Padre | Hijo | Cardinalidad | Llave que la materializa |
|---|---|---|---|
| `clientes` | `solicitudes` | **1 : N** | `solicitudes.cliente_id` |
| `solicitudes` | `cotizaciones` | **1 : N** | `cotizaciones.solicitud_id` |
| `cotizaciones` | `cotizacion_items` | **1 : N** | `cotizacion_items.cotizacion_id` |
| `parametros_analisis` | `cotizacion_items` | **1 : N** | `cotizacion_items.parametro_id` |
| `cotizaciones` | `pagos` | **1 : N** | `pagos.cotizacion_id` |
| `solicitudes` | `pagos` | **1 : N** | `pagos.solicitud_id` |
| `solicitudes` | `muestras` | **1 : N** | `muestras.solicitud_id` |
| `clientes` | `muestras` | **1 : N** | `muestras.cliente_id` |
| `muestras` | `parametros_analisis` | **N : M** | tabla puente `muestra_parametros` |
| `muestras` | `analisis_muestras` | **1 : N** | `analisis_muestras.muestra_id` |
| `parametros_analisis` | `analisis_muestras` | **1 : N** | `analisis_muestras.parametro_id` |
| `muestras` | `eventos_trazabilidad` | **1 : N** | `eventos_trazabilidad.muestra_id` |
| `muestras` | `cambios_fecha` | **1 : N** | `cambios_fecha.muestra_id` |
| `muestras` | `incidencias` | **1 : N** | `incidencias.muestra_id` |
| `incidencias` | `incidencia_acciones` | **1 : N** | `incidencia_acciones.incidencia_id` |
| `incidencias` | `respuestas_incidencias` | **1 : N** | `respuestas_incidencias.incidencia_id` |
| `respuestas_incidencias` | `respuesta_archivos` | **1 : N** | `respuesta_archivos.respuesta_id` |
| `muestras` | `disposiciones` | **1 : 1** | `disposiciones.muestra_id UNIQUE` |
| `muestras` | `informes` | **1 : N** (versiones) | `informes.muestra_id` |
| `informes` | `informes` | **autorreferencia** | `informes.regenerado_de` |
| `muestras` | `encuestas` | **1 : 1** (una por muestra) | `encuestas.muestra_id` |
| `clientes` | `encuestas` | **1 : N** | `encuestas.cliente_id` |
| `encuestas` | `encuesta_respuestas` | **1 : N** | `encuesta_respuestas.encuesta_id` |
| `solicitudes` | `facturas` | **1 : N** | `facturas.solicitud_id` |
| `pagos` | `facturas` | **1 : N** | `facturas.pago_id` |
| `facturas` | `factura_historial` | **1 : N** | `factura_historial.factura_id` |
| `muestras` | `notificaciones` | **1 : N** (opcional) | `notificaciones.muestra_id` |
| `clientes` | `notificaciones` | **1 : N** (opcional) | `notificaciones.cliente_id` |
| `usuarios` | `auditorias` | **1 : N** (por email/id, sin FK) | `auditorias.usuario` |

### Notas clave del guion

- Todas las tablas transaccionales llevan el trío de **borrado lógico** (`eliminado`, `eliminado_por`, `fecha_eliminacion`); no lo llevan `secuencias`, `eventos_trazabilidad`, `cambios_fecha`, `analisis_muestras` y `auditorias` (por diseño: su historial nunca se borra).
- `auditorias` y `eventos_trazabilidad` son de **solo inserción** (append-only).
- El dinero es siempre `DECIMAL(12,2)`; los PDF y binarios van en `LONGBLOB`; los códigos con formato `0001-2026` usan `CHAR(9)`.
- El `password` de `usuarios` guarda **solo el hash bcrypt** (`VARCHAR(60)`); jamás texto plano.
- `cambios_fecha.motivo` e `incidencias.observaciones_internas` **nunca** se exponen en la API pública; el cliente solo ve `motivo_publico`.
- En MongoDB real, la llave primaria de cada documento es el `_id` (ObjectId de 24 caracteres); las FK de esta guía corresponden a esos ObjectId en la implementación con Mongoose.
