// Modelo de respuestas a incidencias con adjuntos (RNF-016).
import mongoose from 'mongoose';
import { softDeletePlugin } from '../../utils/softDelete.plugin.js';

const archivoSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true },
    tipoMime: { type: String, required: true },
    tamano: { type: Number, required: true },
    contenido: { type: Buffer, required: true, select: false }, // no viaja en cada consulta
  },
  { _id: false }
);

const respuestaSchema = new mongoose.Schema(
  {
    incidenciaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Incidencia', required: true, index: true },
    tipoUsuario: { type: String, enum: ['cliente', 'interno'], required: true },
    usuarioId: { type: String, default: null },
    mensaje: { type: String, default: '' },
    archivos: { type: [archivoSchema], default: [] },
    fecha: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

respuestaSchema.plugin(softDeletePlugin);

export const RespuestaIncidencia = mongoose.model('RespuestaIncidencia', respuestaSchema);
