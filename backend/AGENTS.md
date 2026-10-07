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
- Comentarios y mensajes al usuario en español.

## Flujo de trabajo
- Trabajar UNA fase a la vez, según docs/PLAN_BACKEND_OPENCODE.md.
- Al terminar cada fase: ejecutar el servidor, probar los endpoints, resumir qué quedó hecho y qué falta, y esperar confirmación.