// Modelo de eventos de trazabilidad (visibleCliente para API pública).
import mongoose from 'mongoose';

const eventoSchema = new mongoose.Schema(
  {
    muestraId: { type: mongoose.Schema.Types.ObjectId, ref: 'Muestra', required: true, index: true },
    tipoEvento: {
      type: String,
      enum: ['recepcion', 'ingreso', 'cambio_estado', 'observacion', 'correccion', 'inicio', 'cambio_fecha', 'resultado', 'repeticion', 'validacion', 'cierre', 'rotulo', 'ubicacion', 'rechazo'],
      required: true,
    },
    estadoAnterior: { type: String, default: null },
    estadoNuevo: { type: String, default: null },
    descripcion: { type: String, default: '' },
    ubicacion: { type: String, default: '' },
    visibleCliente: { type: Boolean, default: false },
    usuarioId: { type: String, default: null },
    fecha: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const EventoTrazabilidad = mongoose.model('EventoTrazabilidad', eventoSchema);
