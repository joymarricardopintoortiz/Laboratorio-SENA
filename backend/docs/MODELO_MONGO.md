# Modelo final de MongoDB — base `laboratorio` (Atlas M0)

Documento gemelo de [`CREACION_TABLAS.md`](CREACION_TABLAS.md): mientras ese describe el **modelo relacional de referencia** (25 tablas MySQL con tipos y cardinalidades), este describe **cómo quedan los datos realmente en MongoDB Atlas** (19 colecciones), con los tipos de Mongoose, las restricciones y un documento de ejemplo por colección.

> **Regla de oro del proyecto**: un registro **nunca se borra físicamente**. Los usuarios (y todos los registros transaccionales) se **desactivan/activan** (`activo`) o se **eliminan lógicamente** (`eliminado`), y toda acción queda registrada para siempre en `auditorias`.

---

## 0. Equivalencia: 25 tablas → 19 colecciones

| Tabla relacional | Destino en MongoDB |
|---|---|
| 19 tablas principales | 19 colecciones (una por una) |
| `cotizacion_items` | subdocumentos `cotizaciones.items[]` |
| `muestra_parametros` | arreglo `muestras.parametrosSeleccionados[]` (tabla puente N:M) |
| `incidencia_acciones` | subdocumentos `incidencias.acciones[]` |
| `respuesta_archivos` | subdocumentos `respuestasIncidencias.archivos[]` |
| `encuesta_respuestas` | subdocumentos `encuestas.respuestas[]` |
| `factura_historial` | subdocumentos `facturas.historialEstados[]` |

**Tipos Mongoose → lógicos:** `String`→texto (VARCHAR con `maxlength`) · `Number`→número (INT/DECIMAL) · `Boolean`→sí/no · `Date`→fecha (ISODate) · `Buffer`→binario (PDF, `select:false`) · `ObjectId`→llave foránea · `Mixed`→JSON libre.

**Borrado lógico** (plugin `softDelete`, en **14** colecciones): `eliminado` (Boolean, default `false`), `eliminadoPor` (String/Id), `fechaEliminacion` (Date). Lo llevan: usuarios, clientes, solicitudes, parametrosAnalisis, cotizaciones, pagos, muestras, incidencias, respuestasIncidencias, disposiciones, informes, encuestas, facturas y notificaciones. **No** lo llevan (historial permanente): secuencias, analisisMuestras, eventosTrazabilidad, cambiosFecha y auditorias.

**Longitudes (`maxlength` + `.max()` en zod)** e **índices** aplicados en la fase 9; todos los ENUM coinciden con `src/config/constants.js` y con los modelos.

---

## 1. `usuarios` — sistema interno (gestión solo admin)

```json
{
  "_id": ObjectId("681a…u1"),
  "nombre": "Ana Pérez",
  "email": "ana.perez@sena.edu.co",          // UNIQUE, max 150
  "password": "$2a$10$R8k…",                 // solo hash bcrypt (select:false), nunca el plano
  "rol": "usuario",                          // admin | encargado | usuario
  "activo": true,                            // false = cuenta suspendida (no entra ni usa token)
  "permisos": { "editar": false, "eliminar": false },
  "eliminado": false, "eliminadoPor": null, "fechaEliminacion": null,
  "createdAt": ISODate("2026-10-01T14:00:00Z"),
  "updatedAt": ISODate("2026-10-01T14:00:00Z")
}
```

| Campo | Tipo | Restricciones |
|---|---|---|
| nombre | String | required, trim, **max 120** |
| email | String | required, **unique**, lowercase, **max 150** |
| password | String | required, **select:false** (hash bcrypt de 60) |
| rol | String | enum `admin\|encargado\|usuario` |
| activo | Boolean | default `true` |
| permisos.editar / .eliminar | Boolean | default `false` |
| + borrado lógico y timestamps | | |

**Estados de un usuario:** activo (`activo:true`) · suspendido (`activo:false`: login → 401, token → 401) · retirado (`eliminado:true`: oculto de listados, el email sigue ocupado). Un admin **no** puede desactivarse, eliminarse ni quitarse el rol a sí mismo. **Índice:** `email` UNIQUE.

---

## 2. `clientes`

```json
{
  "_id": ObjectId("681a…c1"),
  "nombre": "Empresa Agua S.A.S.", "tipoDocumento": "NIT",
  "numeroDocumento": "900123456",             // UNIQUE, max 20
  "email": "contacto@agua.com", "telefono": "3001234567", "direccion": "Cra 1 # 23-45",
  "tipoCliente": "externo",
  "eliminado": false, "eliminadoPor": null, "fechaEliminacion": null, "createdAt": …, "updatedAt": …
}
```

| Campo | Tipo | Restricciones |
|---|---|---|
| nombre | String | required, trim, **max 120** |
| tipoDocumento | String | enum `CC\|NIT\|CE\|TI`, default `CC` |
| numeroDocumento | String | required, **unique**, **max 20** |
| email | String | required, lowercase, **max 150** |
| telefono | String | **max 20** · direccion **max 200** |
| tipoCliente | String | enum `interno\|externo` |

**Índices:** `numeroDocumento` UNIQUE.

---

## 3. `solicitudes`

```json
{
  "_id": ObjectId("681a…s1"),
  "cliente": ObjectId("681a…c1"),
  "tipoCliente": "externo",
  "descripcion": "Análisis de agua para consumo humano",
  "prioridad": "media", "atencionInmediata": false, "motivoAtencionInmediata": "",
  "estado": "aceptada",
  "requierePago": true,
  "eliminado": false, … , "createdAt": …, "updatedAt": …
}
```

| Campo | Tipo | Restricciones |
|---|---|---|
| cliente | ObjectId → Cliente | required |
| tipoCliente | String | enum `interno\|externo` |
| descripcion | String | sin límite (TEXT) |
| prioridad | String | enum `baja\|media\|alta`, default `media` |
| atencionInmediata / motivoAtencionInmediata | Boolean / String | motivo obligatorio si inmediata, **max 300** |
| estado | String | enum `pendiente\|cotizada\|aceptada\|pagada\|rechazada` |
| requierePago | Boolean | default según `tipoCliente` (externo → true) |

**Índices:** `{estado, createdAt:-1}`, `{cliente}`.

---

## 4. `parametrosAnalisis`

```json
{
  "_id": ObjectId("681a…p1"),
  "nombre": "pH", "descripcion": "Potencial de hidrógeno",
  "precio": 35000, "unidad": "pH",
  "activo": true,
  "eliminado": false, … , "createdAt": …, "updatedAt": …
}
```

| Campo | Tipo | Restricciones |
|---|---|---|
| nombre | String | required, **unique**, **max 100** |
| precio | Number | required, min 0 |
| unidad | String | **max 20** |
| activo | Boolean | default `true` (deshabilitado sin borrar del catálogo) |

**Índice:** `nombre` UNIQUE.

---

## 5. `secuencias` — consecutivos atómicos

```json
{ "_id": "muestras-2026", "secuencia": 28 }
{ "_id": "cotizaciones",   "secuencia": 11 }
```

| Campo | Tipo | Restricciones |
|---|---|---|
| _id | String | PK, **max 30** |
| secuencia | Number | default 0 (`findOneAndUpdate` + `$inc`) |

*Sin borrado lógico.*

---

## 6. `cotizaciones` — con `items[]` embebidos

```json
{
  "_id": ObjectId("681a…q1"),
  "solicitud": ObjectId("681a…s1"),
  "numero": 11,                                // UNIQUE (consecutivo)
  "items": [
    { "parametro": ObjectId("681a…p1"), "descripcion": "pH", "cantidad": 1,
      "precioUnitario": 35000, "subtotal": 35000 }
  ],
  "subtotal": 35000, "total": 35000,
  "estado": "aceptada",
  "enviadaPorCorreo": true, "errorCorreo": "",
  "eliminado": false, … , "createdAt": …, "updatedAt": …
}
```

| Campo | Tipo | Restricciones |
|---|---|---|
| solicitud | ObjectId | required |
| numero | Number | UNIQUE |
| items[] | subdocumentos | `parametro` (ObjectId), `descripcion` (**max 200**), `cantidad` (min 1), `precioUnitario` y `subtotal` (min 0) |
| estado | String | enum `borrador\|enviada\|envio_fallido\|aceptada\|rechazada` |
| errorCorreo | String | **max 300** |

**Índices:** `numero` UNIQUE, `{solicitud}`, `{estado, createdAt:-1}`.

---

## 7. `pagos` — simulados (sin pasarela)

```json
{
  "_id": ObjectId("681a…g1"),
  "cotizacion": ObjectId("681a…q1"), "solicitud": ObjectId("681a…s1"),
  "referencia": "PAY-2026-0011-A1B2C3",        // UNIQUE, max 30
  "monto": 35000, "metodo": "simulado",
  "estado": "confirmado",
  "fechaConfirmacion": ISODate("2026-10-05T16:20:00Z"),
  "eliminado": false, … , "createdAt": …, "updatedAt": …
}
```

| Campo | Tipo | Restricciones |
|---|---|---|
| referencia | String | required, **unique**, **max 30** |
| monto | Number | required, min 0 |
| metodo | String | default `simulado`, **max 20** |
| estado | String | enum `pendiente\|confirmado\|fallido` |

**Índices:** `referencia` UNIQUE, `{cotizacion}`, `{solicitud}`, `{estado, createdAt:-1}`.

---

## 8. `muestras` — el corazón del sistema

```json
{
  "_id": ObjectId("681a…m1"),
  "solicitudId": ObjectId("681a…s1"), "clienteId": ObjectId("681a…c1"),
  "nombreMuestra": "Agua potabilizada", "descripcion": "Tomada en tanque de almacenamiento",
  "tipoFisico": "liquido", "cantidad": 500, "unidad": "ml",
  "verificacionFisica": true,
  "estadoRecepcion": "aceptada", "motivoRechazo": "",
  "codigo": "0028-2026",                                  // UNIQUE sparse, max 9
  "codigoSeguimiento": "699bee3da748984c668309ba2678c728", // UNIQUE sparse, max 32, aleatorio
  "estado": "cerrada",
  "parametrosSeleccionados": [ObjectId("681a…p1")],
  "rotuloImpreso": true, "rotuloPdf": BinData(0, "JVBERi0…"),
  "ubicacionActual": { "clasificacion": "en_analisis", "ubicacion": "Estante B-3",
                       "actualizadoEn": ISODate("2026-10-06T10:00:00Z") },
  "fechaRecepcion": ISODate("2026-10-05T09:00:00Z"),
  "fechaInicio": ISODate("2026-10-05T11:00:00Z"),
  "fechaEstimadaEntrega": ISODate("2026-10-09T17:00:00Z"),
  "fechaCierre": ISODate("2026-10-08T15:00:00Z"),
  "fechaLimiteConservacion": ISODate("2026-10-20T05:00:00Z"),
  "pendienteDisposicion": true,
  "ultimoEvento": { "tipo": "cierre", "fecha": ISODate("2026-10-08T15:00:00Z") },
  "eliminado": false, … , "createdAt": …, "updatedAt": …
}
```

| Campo | Tipo | Restricciones |
|---|---|---|
| solicitudId / clienteId | ObjectId | required |
| nombreMuestra | String | required, **max 150** |
| tipoFisico / cantidad / unidad | enum / Number / String | `solido\|liquido`; min 0; **max 2** (`g`\|`ml`) |
| estadoRecepcion / motivoRechazo | enum / String | `pendiente\|aceptada\|rechazada`; **max 300** |
| codigo / codigoSeguimiento | String | **max 9** / **max 32**, únicos (sparse), `null` hasta aceptar |
| estado | String | enum de 9 valores: `ingresada\|en_proceso\|en_analisis\|resultados_validados\|cerrada\|rechazada\|en_almacen\|devuelta\|desechada` |
| parametrosSeleccionados[] | [ObjectId] | = tabla puente N:M con parametrosAnalisis |
| rotuloPdf | Buffer | `select:false` |
| ubicacionActual | subdoc | clasificación enum + ubicación (**max 150**) |
| pendienteDisposicion | Boolean | RF-091 |
| ultimoEvento | subdoc | caché del último evento (**max 30**) |

**Índices:** `codigo` UNIQUE sparse, `codigoSeguimiento` UNIQUE sparse, `{estado, fechaRecepcion:-1}`, `{solicitudId}`, `{clienteId}`, `{pendienteDisposicion, fechaLimiteConservacion}`.

---

## 9. `analisisMuestras`

```json
{
  "_id": ObjectId("681a…a1"),
  "muestraId": ObjectId("681a…m1"), "parametroId": ObjectId("681a…p1"),
  "numeroEjecucion": 1, "tipo": "inicial", "motivoRepeticion": "",
  "estado": "validado", "resultado": "7.2", "valor": 7.2, "unidad": "pH",
  "fechaInicio": …, "fechaFinalizacion": …, "fechaValidacion": …,
  "realizadoPor": "encargado@sena.edu.co", "validadoPor": "admin@sena.edu.co",
  "createdAt": …, "updatedAt": …
}
```

| Campo | Tipo | Restricciones |
|---|---|---|
| numeroEjecucion | Number | default 1 (1 = inicial) |
| tipo | String | enum `inicial\|repeticion` |
| motivoRepeticion / resultado / unidad | String | **max 300 / 200 / 20** |
| estado | String | enum `en_curso\|completado\|validado` |
| realizadoPor / validadoPor | String | **max 150** (email) |

**Índice único:** `{muestraId, parametroId, numeroEjecucion}` — a lo sumo 1 fila por ejecución. *Sin borrado lógico.*

---

## 10. `eventosTrazabilidad` — historial permanente (append-only)

```json
{
  "_id": ObjectId("681a…e1"),
  "muestraId": ObjectId("681a…m1"),
  "tipoEvento": "cambio_estado",
  "estadoAnterior": "en_analisis", "estadoNuevo": "resultados_validados",
  "descripcion": "Resultados validados por el encargado",
  "ubicacion": "", "visibleCliente": true,
  "usuarioId": "encargado@sena.edu.co",
  "fecha": ISODate("2026-10-08T14:30:00Z"), "createdAt": …, "updatedAt": …
}
```

| Campo | Tipo | Restricciones |
|---|---|---|
| tipoEvento | String | enum de 15 valores: `recepcion\|ingreso\|cambio_estado\|observacion\|correccion\|inicio\|cambio_fecha\|resultado\|repeticion\|validacion\|cierre\|rotulo\|ubicacion\|rechazo\|notificacion` |
| estadoAnterior / estadoNuevo | String | **max 30** |
| ubicacion / usuarioId | String | **max 150** |
| visibleCliente | Boolean | default `false` (API pública) |

**Índices:** `{muestraId, visibleCliente, fecha}`, `{muestraId, fecha}`. *Sin borrado lógico.*

---

## 11. `cambiosFecha`

```json
{
  "_id": ObjectId("681a…f1"),
  "muestraId": ObjectId("681a…m1"),
  "fechaAnterior": ISODate("2026-10-09T17:00:00Z"),
  "fechaNueva": ISODate("2026-10-13T17:00:00Z"),
  "motivo": "Falla del equipo de titulación (interno)",
  "motivoPublico": "Nueva fecha por mantenimiento del equipo",
  "usuarioId": "admin@sena.edu.co",
  "fechaCambio": ISODate("2026-10-07T08:15:00Z"), "createdAt": …, "updatedAt": …
}
```

| Campo | Tipo | Restricciones |
|---|---|---|
| motivo | String | required, **max 500** — **interno, jamás se expone** |
| motivoPublico | String | **max 500** — lo único que ve el cliente en `/api/publico` |
| usuarioId | String | required, **max 150** |

**Índice:** `{muestraId}`. *Sin borrado lógico.*

---

## 12. `incidencias` — con `acciones[]` embebidos

```json
{
  "_id": ObjectId("681a…i1"),
  "muestraId": ObjectId("681a…m1"),
  "tipo": "demora", "titulo": "Retraso en entrega de resultados",
  "descripcion": "Se requiere recalibración del equipo",
  "observacionesInternas": "Equipo en calibración — NO mostrar al cliente",
  "visibleCliente": true, "requiereRespuesta": false,
  "estado": "esperando_cliente",
  "nuevaFechaEstimada": ISODate("2026-10-13T17:00:00Z"),
  "motivo": "Mantenimiento mayor del espectrofotómetro",
  "creadaPor": "admin@sena.edu.co", "revisadaPor": null,
  "fechaCreacion": ISODate("2026-10-07T08:20:00Z"), "fechaCierre": null,
  "acciones": [
    { "tipo": "creada",       "usuario": "admin@sena.edu.co", "fecha": ISODate("2026-10-07T08:20:00Z"), "comentario": "" },
    { "tipo": "demora_fecha", "usuario": "admin@sena.edu.co", "fecha": ISODate("2026-10-07T08:21:00Z"), "comentario": "Nueva fecha notificada" }
  ],
  "eliminado": false, … , "createdAt": …, "updatedAt": …
}
```

| Campo | Tipo | Restricciones |
|---|---|---|
| tipo | String | enum `informativa\|demora\|requiere_accion_cliente` |
| titulo / motivo | String | **max 200 / 500** |
| observacionesInternas | String | **nunca visible al cliente** |
| estado | String | enum `abierta\|en_revision\|esperando_cliente\|aprobada\|cerrada` |
| creadaPor / revisadaPor | String | **max 150** |
| acciones[] | subdocumentos | `tipo` (**max 30**), `usuario` (**max 150**), `fecha`, `comentario` |

**Índices:** `{muestraId, estado}`, `{muestraId, visibleCliente, fechaCreacion}`, `{estado, fechaCreacion:-1}`.

---

## 13. `respuestasIncidencias` — con `archivos[]` embebidos

```json
{
  "_id": ObjectId("681a…r1"),
  "incidenciaId": ObjectId("681a…i1"),
  "tipoUsuario": "cliente", "usuarioId": null,
  "mensaje": "Entendido, gracias por avisar",
  "archivos": [
    { "nombre": "soporte.pdf", "tipoMime": "application/pdf",
      "tamano": 182344, "contenido": BinData(0, "JVBERi0xLjQ…") }
  ],
  "fecha": ISODate("2026-10-07T10:00:00Z"),
  "eliminado": false, … , "createdAt": …, "updatedAt": …
}
```

| Campo | Tipo | Restricciones |
|---|---|---|
| tipoUsuario | String | enum `cliente\|interno` |
| archivos[] | subdocumentos (máx. 3) | `nombre` (**max 200**), `tipoMime` (**max 100**, PDF/JPG/PNG), `tamano` (tope `MAX_FILE_MB`), `contenido` (**Buffer, select:false**) |

**Índice:** `{incidenciaId}`.

---

## 14. `disposiciones` — 1:1 con la muestra

```json
{
  "_id": ObjectId("681a…d1"),
  "muestraId": ObjectId("681a…m1"),
  "tipo": "devolucion", "motivo": "Cliente solicita retiro de la muestra", "observacion": "",
  "fechaSalida": ISODate("2026-10-21T09:00:00Z"), "notificacionCliente": true,
  "realizadaPor": "encargado@sena.edu.co",
  "fechaCreacion": ISODate("2026-10-20T16:00:00Z"), "updatedAt": …,
  "eliminado": false, "eliminadoPor": null, "fechaEliminacion": null
}
```

| Campo | Tipo | Restricciones |
|---|---|---|
| muestraId | ObjectId | required, **índice único parcial** `{eliminado:false}` → una sola disposición activa por muestra |
| tipo | String | enum `devolucion\|desecho` |
| motivo | String | required, **max 500** |
| realizadaPor | String | **max 150** |

---

## 15. `informes` — versionados con autorreferencia

```json
{
  "_id": ObjectId("681a…n1"),
  "muestraId": ObjectId("681a…m1"),
  "numeroInforme": "0012-2026",                 // UNIQUE, max 9
  "estado": "enviado",
  "archivo": BinData(0, "JVBERi0…"),            // PDF (select:false)
  "version": 2, "regeneradoDe": ObjectId("681a…n0"),
  "generadoPor": "encargado@sena.edu.co",
  "fechaGeneracion": ISODate("2026-10-08T14:00:00Z"),
  "fechaDisponibilidad": ISODate("2026-10-08T15:00:00Z"),
  "eliminado": false, … , "createdAt": …, "updatedAt": …
}
```

| Campo | Tipo | Restricciones |
|---|---|---|
| numeroInforme | String | required, **unique**, **max 9** (`0001-2026`) |
| estado | String | enum `borrador\|generado\|disponible\|enviado` |
| archivo | Buffer | required, **select:false** |
| regeneradoDe | ObjectId → Informe | versión anterior (historial) |
| generadoPor | String | **max 150** |

**Índices:** `numeroInforme` UNIQUE, `{muestraId, version:-1}`, `{estado, fechaGeneracion:-1}`.

---

## 16. `encuestas` — acceso público por token

```json
{
  "_id": ObjectId("681a…c2"),
  "muestraId": ObjectId("681a…m1"), "clienteId": ObjectId("681a…c1"),
  "token": "890170fb16abd913338375da85d636a319bddf0e8aa7eaf0",
  "preguntas": [ "¿Cómo calificas la atención recibida por el laboratorio?",
                 "¿Qué tan claro y completo te pareció el informe entregado?",
                 "¿Cumplimos con los tiempos de entrega estimados?",
                 "¿Recomendarías nuestro laboratorio a otras personas?" ],
  "respuestas": [
    { "pregunta": "¿Cómo calificas la atención recibida por el laboratorio?", "calificacion": 5, "comentario": "Muy buena" }
  ],
  "estado": "respondida",
  "fechaEnvio": ISODate("2026-10-08T15:00:00Z"), "fechaRespuesta": ISODate("2026-10-08T18:30:00Z"),
  "eliminado": false, … , "createdAt": …, "updatedAt": …
}
```

| Campo | Tipo | Restricciones |
|---|---|---|
| token | String | required, **unique**, **max 48** (24 bytes aleatorios en hex) |
| respuestas[] | subdocumentos | `calificacion` Number **1–5**, `comentario` **max 500**; respuesta única |
| estado | String | enum `pendiente\|respondida` |

**Índices:** `token` UNIQUE, `{muestraId}`, `{estado, createdAt:-1}`.

---

## 17. `facturas` — con `historialEstados[]` embebidos

```json
{
  "_id": ObjectId("681a…b1"),
  "solicitudId": ObjectId("681a…s1"), "pagoId": ObjectId("681a…g1"),
  "numero": "0009-2026",                        // UNIQUE, max 9
  "valorTotal": 35000,
  "estado": "enviada",
  "documento": { "id": "f_123", "number": "0009-2026", "status": "available" },
  "generadaPor": "admin@sena.edu.co",
  "fechaGeneracion": ISODate("2026-10-06T11:00:00Z"),
  "historialEstados": [
    { "estado": "pendiente", "usuario": null,                "fecha": ISODate("2026-10-06T10:55:00Z"), "motivo": "" },
    { "estado": "generada",  "usuario": "admin@sena.edu.co", "fecha": ISODate("2026-10-06T11:00:00Z"), "motivo": "Factura simulada (Factus sandbox)" },
    { "estado": "enviada",   "usuario": "admin@sena.edu.co", "fecha": ISODate("2026-10-06T11:05:00Z"), "motivo": "Enviada al correo del cliente" }
  ],
  "eliminado": false, … , "createdAt": …, "updatedAt": …
}
```

| Campo | Tipo | Restricciones |
|---|---|---|
| numero | String | required, **unique**, **max 9** |
| valorTotal | Number | required, min 0 |
| estado | String | enum `pendiente\|generada\|enviada\|anulada\|error` |
| documento | Mixed | JSON de Factus sandbox — **nunca en la API pública** |
| historialEstados[] | subdocumentos | `usuario` **max 150** |

**Índices:** `numero` UNIQUE, `{solicitudId}`, `{pagoId}`, `{estado, fechaGeneracion:-1}`.

---

## 18. `notificaciones` — correos con reintentos

```json
{
  "_id": ObjectId("681a…x1"),
  "muestraId": ObjectId("681a…m1"), "clienteId": ObjectId("681a…c1"),
  "tipo": "resultados_disponibles",
  "asunto": "Resultados disponibles — informe 0012-2026",
  "mensaje": "El informe de su muestra ya está disponible…",
  "correoDestino": "contacto@agua.com", "medio": "correo",
  "estado": "enviada", "intentos": 1, "errorUltimoIntento": null,
  "fechaProgramada": ISODate("2026-10-08T15:00:00Z"), "fechaEnvio": ISODate("2026-10-08T15:00:05Z"),
  "eliminado": false, … , "createdAt": …, "updatedAt": …
}
```

| Campo | Tipo | Restricciones |
|---|---|---|
| tipo | String | enum `cambio_etapa\|incidencia\|cambio_fecha\|resultados_disponibles\|conservacion\|otro` |
| asunto / correoDestino / errorUltimoIntento | String | **max 200 / 150 / 300** |
| estado | String | enum `pendiente\|enviada\|fallida` |
| intentos | Number | min 0, **max 3** (RF-112) |

**Índices:** `{estado, tipo}`, `{muestraId, estado}`, `{muestraId, createdAt:-1}`, `{clienteId}`.

---

## 19. `auditorias` — bitácora permanente (append-only)

```json
{
  "_id": ObjectId("681a…z1"),
  "entidad": "usuarios", "entidadId": "681a…u1",
  "accion": "desactivar",
  "antes":   { "activo": true,  "rol": "usuario", … },
  "despues": { "activo": false, "rol": "usuario", … },
  "usuario": "admin@sena.edu.co",
  "ip": "::ffff:192.168.1.10",
  "createdAt": ISODate("2026-10-09T15:30:00Z")
}
```

| Campo | Tipo | Restricciones |
|---|---|---|
| entidad / entidadId | String | **max 50 / 30** |
| accion | String | **max 30** (`crear`, `actualizar`, `activar`, `desactivar`, `eliminar_logico`…) |
| antes / despues | Mixed | JSON completo **sin password** |
| usuario / ip | String | **max 150 / 45** |

**Índices:** `{entidad, entidadId, createdAt:-1}`, `{createdAt:-1}` · Hooks `pre('findOneAndUpdate')` y `pre('deleteOne')` **bloquean** cualquier modificación o borrado.

---

## Resumen final

| Colección | Borrado lógico | `activo` | Nota |
|---|---|---|---|
| usuarios, clientes, solicitudes, parametrosAnalisis, cotizaciones, pagos, muestras, incidencias, respuestasIncidencias, disposiciones, informes, encuestas, facturas, notificaciones | ✅ (14) | usuarios y parametrosAnalisis | registro marcado, nunca borrado |
| secuencias, analisisMuestras, eventosTrazabilidad, cambiosFecha, auditorias | ❌ (5) | — | historial permanente |

**Ciclo de vida de un registro** (regla del RNF-015 y de `AGENTS.md`):

1. **Crear** → documento nuevo + registro en `auditorias` (`accion: "crear"`).
2. **Modificar** → campos nuevos + `auditorias` con `antes`/`despues`.
3. **Desactivar/activar** (usuarios y parámetros) → solo cambia `activo` + `auditorias` (`activar`/`desactivar`).
4. **Eliminar** → solo cambian `eliminado`, `eliminadoPor` y `fechaEliminacion` + `auditorias` (`eliminar_logico`).
5. **Nunca** `deleteOne`/`deleteMany`/`findByIdAndDelete` en `src/` (lo verifica `npm run security`). La única excepción es la limpieza de datos `PRUEBA HUMO` de las pruebas automáticas, fuera del código de producción.

Verificado con `npm test` (53/53) y `npm run security` (35/35) — el backend envía exactamente esta estructura a MongoDB Atlas.
