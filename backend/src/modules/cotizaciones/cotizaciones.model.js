// Modelo de cotizaciones con borrado lógico (RNF-015).
import mongoose from 'mongoose';
import { softDeletePlugin } from '../../utils/softDelete.plugin.js';

const itemSchema = new mongoose.Schema(
  {
    parametro: { type: mongoose.Schema.Types.ObjectId, ref: 'ParametroAnalisis', required: true },
    descripcion: { type: String, default: '', maxlength: 200 },
    cantidad: { type: Number, required: true, min: 1 },
    precioUnitario: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const cotizacionSchema = new mongoose.Schema(
  {
    solicitud: { type: mongoose.Schema.Types.ObjectId, ref: 'Solicitud', required: true },
    numero: { type: Number, unique: true }, // consecutivo
    items: { type: [itemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    estado: {
      type: String,
      enum: ['borrador', 'enviada', 'envio_fallido', 'aceptada', 'rechazada'],
      default: 'borrador',
    },
    enviadaPorCorreo: { type: Boolean, default: false },
    errorCorreo: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: true }
);

// Índices para las consultas frecuentes: cotizaciones de una solicitud
// y listado por estado con fecha.
cotizacionSchema.index({ solicitud: 1 });
cotizacionSchema.index({ estado: 1, createdAt: -1 });

cotizacionSchema.plugin(softDeletePlugin);

export const Cotizacion = mongoose.model('Cotizacion', cotizacionSchema);
