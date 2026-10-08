// Modelo de solicitudes de análisis con borrado lógico (RNF-015).
import mongoose from 'mongoose';
import { softDeletePlugin } from '../../utils/softDelete.plugin.js';

const solicitudSchema = new mongoose.Schema(
  {
    cliente: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente', required: true },
    tipoCliente: { type: String, enum: ['interno', 'externo'], required: true },
    descripcion: { type: String, default: '' },
    prioridad: { type: String, enum: ['baja', 'media', 'alta'], default: 'media' },
    atencionInmediata: { type: Boolean, default: false },
    motivoAtencionInmediata: { type: String, default: '' }, // obligatorio si atención inmediata
    estado: {
      type: String,
      enum: ['pendiente', 'cotizada', 'aceptada', 'pagada', 'rechazada'],
      default: 'pendiente',
    },
    requierePago: { type: Boolean, default: function () { return this.tipoCliente === 'externo'; } },
  },
  { timestamps: true }
);

// Índices para las consultas frecuentes: listados por estado con fecha y por cliente.
solicitudSchema.index({ estado: 1, createdAt: -1 });
solicitudSchema.index({ cliente: 1 });

solicitudSchema.plugin(softDeletePlugin);

export const Solicitud = mongoose.model('Solicitud', solicitudSchema);
