// Modelo de eventos de trazabilidad (visibleCliente para API pública).
import mongoose from 'mongoose';

const eventoSchema = new mongoose.Schema(
  {
    muestraId: { type: mongoose.Schema.Types.ObjectId, ref: 'Muestra', required: true, index: true },
    tipoEvento: {
      type: String,
      enum: ['recepcion', 'ingreso', 'cambio_estado', 'observacion', 'correccion', 'inicio', 'cambio_fecha', 'resultado', 'repeticion', 'validacion', 'cierre', 'rotulo', 'ubicacion', 'rechazo', 'notificacion'],
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

// Índices para la consulta pública: eventos de una muestra visibles al cliente.
eventoSchema.index({ muestraId: 1, visibleCliente: 1, fecha: 1 });

export const EventoTrazabilidad = mongoose.model('EventoTrazabilidad', eventoSchema);
