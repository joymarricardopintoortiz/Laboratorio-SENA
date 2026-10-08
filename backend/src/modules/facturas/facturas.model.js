// Modelo de facturas (colección nueva en la Fase 7 — RF-113 a RF-119).
// El documento del proveedor (JSON) NUNCA se expone en la API pública.
import mongoose from 'mongoose';
import { softDeletePlugin } from '../../utils/softDelete.plugin.js';

export const ESTADOS_FACTURA = ['pendiente', 'generada', 'enviada', 'anulada', 'error'];

const historialEstadoSchema = new mongoose.Schema(
  {
    estado: { type: String, enum: ESTADOS_FACTURA, required: true },
    usuario: { type: String, default: null },
    fecha: { type: Date, default: Date.now },
    motivo: { type: String, default: '' },
  },
  { _id: false }
);

const facturaSchema = new mongoose.Schema(
  {
    solicitudId: { type: mongoose.Schema.Types.ObjectId, ref: 'Solicitud', required: true },
    pagoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pago', required: true },
    numero: { type: String, required: true, unique: true }, // 0001-2026
    valorTotal: { type: Number, required: true, min: 0 },
    estado: { type: String, enum: ESTADOS_FACTURA, default: 'pendiente' },
    // Respuesta del proveedor (Factus sandbox o simulado). select:false en consultas públicas.
    documento: { type: mongoose.Schema.Types.Mixed, default: null },
    generadaPor: { type: String, default: null },
    fechaGeneracion: { type: Date, default: null },
    historialEstados: { type: [historialEstadoSchema], default: [] },
  },
  { timestamps: true }
);

// Índices exigidos: {solicitudId:1} y número único.
facturaSchema.index({ solicitudId: 1 });
facturaSchema.index({ pagoId: 1 });

facturaSchema.plugin(softDeletePlugin);

export const Factura = mongoose.model('Factura', facturaSchema);
