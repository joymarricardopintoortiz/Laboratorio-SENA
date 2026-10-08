// Modelo de disposición final de la muestra (RF-086 a RF-093).
// Solo muestras cerradas o rechazadas, y UNA disposición por muestra.
import mongoose from 'mongoose';
import { softDeletePlugin } from '../../utils/softDelete.plugin.js';

export const TIPOS_DISPOSICION = ['devolucion', 'desecho'];

const disposicionSchema = new mongoose.Schema(
  {
    muestraId: { type: mongoose.Schema.Types.ObjectId, ref: 'Muestra', required: true },
    tipo: { type: String, enum: TIPOS_DISPOSICION, required: true },
    motivo: { type: String, required: true, trim: true },
    observacion: { type: String, default: '' },
    fechaSalida: { type: Date, default: Date.now },
    notificacionCliente: { type: Boolean, default: false },
    realizadaPor: { type: String, default: null },
    fechaCreacion: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Índice {muestraId:1} que además garantiza "una muestra no puede tener dos
// disposiciones" (las eliminadas lógicamente no cuentan).
disposicionSchema.index(
  { muestraId: 1 },
  { unique: true, name: 'muestraId_activa_unico', partialFilterExpression: { eliminado: false } }
);

disposicionSchema.plugin(softDeletePlugin);

export const Disposicion = mongoose.model('Disposicion', disposicionSchema);
