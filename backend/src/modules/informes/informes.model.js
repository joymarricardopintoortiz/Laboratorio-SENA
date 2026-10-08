// Modelo de informes de resultado (RF-094 a RF-098, Fase 7).
// El PDF vive en la base de datos con select:false (nunca sale en listados ni
// en la API pública).
import mongoose from 'mongoose';
import { softDeletePlugin } from '../../utils/softDelete.plugin.js';

export const ESTADOS_INFORME = ['borrador', 'generado', 'disponible', 'enviado'];

const informeSchema = new mongoose.Schema(
  {
    muestraId: { type: mongoose.Schema.Types.ObjectId, ref: 'Muestra', required: true },
    numeroInforme: { type: String, required: true, unique: true, maxlength: 9 }, // 0001-2026
    estado: { type: String, enum: ESTADOS_INFORME, default: 'borrador' },
    // PDF (Buffer). select:false: hay que pedirlo explícitamente con +archivo.
    archivo: { type: Buffer, required: true, select: false },
    // Regenerar crea una versión nueva y conserva la anterior (historial).
    version: { type: Number, default: 1 },
    regeneradoDe: { type: mongoose.Schema.Types.ObjectId, ref: 'Informe', default: null },
    generadoPor: { type: String, default: null, maxlength: 150 },
    fechaGeneracion: { type: Date, default: Date.now },
    fechaDisponibilidad: { type: Date, default: null },
  },
  { timestamps: true }
);

// Índices exigidos.
informeSchema.index({ muestraId: 1, version: -1 });
// Listado interno de informes por estado con fecha de generación.
informeSchema.index({ estado: 1, fechaGeneracion: -1 });

informeSchema.plugin(softDeletePlugin);

export const Informe = mongoose.model('Informe', informeSchema);
