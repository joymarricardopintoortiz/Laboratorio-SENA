// Historial de cambios de fecha estimada (solo fecha, sin hora).
import mongoose from 'mongoose';

const cambioFechaSchema = new mongoose.Schema(
  {
    muestraId: { type: mongoose.Schema.Types.ObjectId, ref: 'Muestra', required: true, index: true },
    fechaAnterior: { type: Date, default: null },
    fechaNueva: { type: Date, required: true },
    // Motivo interno: NUNCA se expone en la API pública. VARCHAR(500) según CREACION_TABLAS.md.
    motivo: { type: String, required: true, maxlength: 500 },
    // Motivo aprobado para el cliente: es lo único que sale en /api/publico/seguimiento.
    motivoPublico: { type: String, default: '', maxlength: 500 },
    usuarioId: { type: String, required: true, maxlength: 150 },
    fechaCambio: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const CambioFecha = mongoose.model('CambioFecha', cambioFechaSchema);
