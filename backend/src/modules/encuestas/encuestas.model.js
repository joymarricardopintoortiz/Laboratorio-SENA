// Modelo de encuestas de satisfacción (RF-099 a RF-102).
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { softDeletePlugin } from '../../utils/softDelete.plugin.js';
import { PREGUNTAS_ENCUESTA } from '../../config/constants.js';

const respuestaSchema = new mongoose.Schema(
  {
    pregunta: { type: String, required: true, trim: true },
    calificacion: { type: Number, required: true, min: 1, max: 5 },
    comentario: { type: String, default: '', maxlength: 500 },
  },
  { _id: false }
);

const encuestaSchema = new mongoose.Schema(
  {
    muestraId: { type: mongoose.Schema.Types.ObjectId, ref: 'Muestra', required: true },
    clienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente', required: true },
    // Token aleatorio e impredecible: da acceso público a la encuesta.
    token: { type: String, required: true, unique: true, maxlength: 48 },
    preguntas: { type: [String], default: () => [...PREGUNTAS_ENCUESTA] },
    respuestas: { type: [respuestaSchema], default: [] },
    estado: { type: String, enum: ['pendiente', 'respondida'], default: 'pendiente' },
    fechaEnvio: { type: Date, default: null },
    fechaRespuesta: { type: Date, default: null },
  },
  { timestamps: true }
);

// Índices: {muestraId:1} y token único.
encuestaSchema.index({ muestraId: 1 });
// Listado interno de encuestas por estado con fecha.
encuestaSchema.index({ estado: 1, createdAt: -1 });

encuestaSchema.plugin(softDeletePlugin);

export const Encuesta = mongoose.model('Encuesta', encuestaSchema);

// 24 bytes aleatorios => 48 caracteres hexadecimales, sin relación con la muestra.
export const generarTokenEncuesta = () => crypto.randomBytes(24).toString('hex');
