// Historial de cambios de fecha estimada (solo fecha, sin hora).
import mongoose from 'mongoose';

const cambioFechaSchema = new mongoose.Schema(
  {
    muestraId: { type: mongoose.Schema.Types.ObjectId, ref: 'Muestra', required: true, index: true },
    fechaAnterior: { type: Date, default: null },
    fechaNueva: { type: Date, required: true },
    motivo: { type: String, required: true },
    usuarioId: { type: String, required: true },
    fechaCambio: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const CambioFecha = mongoose.model('CambioFecha', cambioFechaSchema);
