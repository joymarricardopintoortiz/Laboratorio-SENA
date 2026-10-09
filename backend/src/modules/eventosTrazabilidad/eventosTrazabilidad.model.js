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
    estadoAnterior: { type: String, default: null, maxlength: 30 },
    estadoNuevo: { type: String, default: null, maxlength: 30 },
    descripcion: { type: String, default: '' },
    ubicacion: { type: String, default: '', maxlength: 150 },
    visibleCliente: { type: Boolean, default: false },
    usuarioId: { type: String, default: null, maxlength: 150 },
    fecha: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Índices para la consulta pública: eventos de una muestra visibles al cliente.
eventoSchema.index({ muestraId: 1, visibleCliente: 1, fecha: 1 });
// Historial interno de la muestra: todos los eventos ordenados por fecha.
eventoSchema.index({ muestraId: 1, fecha: 1 });

export const EventoTrazabilidad = mongoose.model('EventoTrazabilidad', eventoSchema);
