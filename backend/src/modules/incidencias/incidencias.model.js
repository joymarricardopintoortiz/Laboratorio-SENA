// Modelo de incidencias con borrado lógico y arreglo de acciones (RF-063 a RF-074).
import mongoose from 'mongoose';
import { softDeletePlugin } from '../../utils/softDelete.plugin.js';

const accionSchema = new mongoose.Schema(
  {
    tipo: { type: String, required: true }, // creada, demora_fecha, respuesta_cliente, aprobada, cerrada, observacion
    usuario: { type: String, default: null },
    fecha: { type: Date, default: Date.now },
    comentario: { type: String, default: '' },
  },
  { _id: false }
);

const incidenciaSchema = new mongoose.Schema(
  {
    muestraId: { type: mongoose.Schema.Types.ObjectId, ref: 'Muestra', required: true },
    tipo: { type: String, enum: ['informativa', 'demora', 'requiere_accion_cliente'], required: true },
    titulo: { type: String, required: true, trim: true },
    descripcion: { type: String, default: '' },
    observacionesInternas: { type: String, default: '' }, // NUNCA visibles al cliente
    visibleCliente: { type: Boolean, default: false },
    requiereRespuesta: { type: Boolean, default: false },
    estado: { type: String, enum: ['abierta', 'en_revision', 'esperando_cliente', 'aprobada', 'cerrada'], default: 'abierta' },
    nuevaFechaEstimada: { type: Date, default: null }, // solo para demora
    motivo: { type: String, default: '' }, // motivo de demora / cierre
    creadaPor: { type: String, default: null },
    revisadaPor: { type: String, default: null },
    fechaCreacion: { type: Date, default: Date.now },
    fechaCierre: { type: Date, default: null },
    acciones: { type: [accionSchema], default: [] },
  },
  { timestamps: true }
);

incidenciaSchema.index({ muestraId: 1, estado: 1 });
// Consulta pública: incidencias de la muestra visibles al cliente.
incidenciaSchema.index({ muestraId: 1, visibleCliente: 1, fechaCreacion: 1 });
// Listado interno de incidencias por estado con fecha de creación.
incidenciaSchema.index({ estado: 1, fechaCreacion: -1 });

incidenciaSchema.plugin(softDeletePlugin);

export const Incidencia = mongoose.model('Incidencia', incidenciaSchema);
