// Modelo de notificaciones al cliente (RF-107 a RF-112) con borrado lógico.
import mongoose from 'mongoose';
import { softDeletePlugin } from '../../utils/softDelete.plugin.js';

// Tipos de notificación (una sola fuente de verdad para el enum de Mongoose y zod).
export const TIPOS_NOTIFICACION = [
  'cambio_etapa',
  'incidencia',
  'cambio_fecha',
  'resultados_disponibles',
  'conservacion',
  'otro',
];

export const ESTADOS_NOTIFICACION = ['pendiente', 'enviada', 'fallida'];

// RF-112: máximo 3 intentos de envío por notificación.
export const MAX_INTENTOS = 3;

const notificacionSchema = new mongoose.Schema(
  {
    muestraId: { type: mongoose.Schema.Types.ObjectId, ref: 'Muestra', default: null },
    clienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente', default: null },
    tipo: { type: String, enum: TIPOS_NOTIFICACION, required: true },
    asunto: { type: String, required: true, trim: true, maxlength: 200 },
    mensaje: { type: String, required: true },
    correoDestino: { type: String, default: null, maxlength: 150 }, // correo del cliente (puede faltar)
    medio: { type: String, enum: ['correo'], default: 'correo' },
    estado: { type: String, enum: ESTADOS_NOTIFICACION, default: 'pendiente' },
    // RF-112: nunca más de 3 intentos de envío.
    intentos: { type: Number, default: 0, min: 0, max: 3 },
    errorUltimoIntento: { type: String, default: null, maxlength: 300 },
    fechaProgramada: { type: Date, default: Date.now },
    fechaEnvio: { type: Date, default: null },
  },
  { timestamps: true }
);

// Índices para el listado interno con filtros y la consulta por muestra.
notificacionSchema.index({ estado: 1, tipo: 1 });
notificacionSchema.index({ muestraId: 1, estado: 1 });
notificacionSchema.index({ muestraId: 1, createdAt: -1 });
// Índice documentado en CREACION_TABLAS.md: notificaciones de un cliente.
notificacionSchema.index({ clienteId: 1 });

notificacionSchema.plugin(softDeletePlugin);

export const Notificacion = mongoose.model('Notificacion', notificacionSchema);
