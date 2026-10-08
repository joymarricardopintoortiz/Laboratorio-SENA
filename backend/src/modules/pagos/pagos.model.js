// Modelo de pagos simulados con borrado lógico.
import mongoose from 'mongoose';
import { softDeletePlugin } from '../../utils/softDelete.plugin.js';

const pagoSchema = new mongoose.Schema(
  {
    cotizacion: { type: mongoose.Schema.Types.ObjectId, ref: 'Cotizacion', required: true },
    solicitud: { type: mongoose.Schema.Types.ObjectId, ref: 'Solicitud', required: true },
    referencia: { type: String, required: true, unique: true },
    monto: { type: Number, required: true, min: 0 },
    metodo: { type: String, default: 'simulado' },
    estado: { type: String, enum: ['pendiente', 'confirmado', 'fallido'], default: 'pendiente' },
    fechaConfirmacion: { type: Date, default: null },
  },
  { timestamps: true }
);

// Índices para las consultas frecuentes: pagos de una solicitud o cotización
// y listado por estado con fecha.
pagoSchema.index({ solicitud: 1 });
pagoSchema.index({ cotizacion: 1 });
pagoSchema.index({ estado: 1, createdAt: -1 });

pagoSchema.plugin(softDeletePlugin);

export const Pago = mongoose.model('Pago', pagoSchema);
