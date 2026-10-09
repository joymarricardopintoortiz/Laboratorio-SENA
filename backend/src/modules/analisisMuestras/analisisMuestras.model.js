// Modelo de análisis de muestras (resultados por parámetro y ejecución).
import mongoose from 'mongoose';

const analisisSchema = new mongoose.Schema(
  {
    muestraId: { type: mongoose.Schema.Types.ObjectId, ref: 'Muestra', required: true, index: true },
    parametroId: { type: mongoose.Schema.Types.ObjectId, ref: 'ParametroAnalisis', required: true },
    numeroEjecucion: { type: Number, required: true },
    tipo: { type: String, enum: ['inicial', 'repeticion'], required: true },
    motivoRepeticion: { type: String, default: '', maxlength: 300 },
    estado: { type: String, enum: ['en_curso', 'completado', 'validado'], default: 'completado' },
    resultado: { type: String, default: '', maxlength: 200 },
    valor: { type: Number, default: null },
    unidad: { type: String, default: '', maxlength: 20 },
    fechaInicio: { type: Date, default: Date.now },
    fechaFinalizacion: { type: Date, default: Date.now },
    realizadoPor: { type: String, default: null, maxlength: 150 },
    validadoPor: { type: String, default: null, maxlength: 150 },
    fechaValidacion: { type: Date, default: null },
  },
  { timestamps: true }
);

// Índice único exigido por docs/CREACION_TABLAS.md: a lo sumo 1 fila por
// (muestra, parámetro, número de ejecución).
analisisSchema.index({ muestraId: 1, parametroId: 1, numeroEjecucion: 1 }, { unique: true });

export const AnalisisMuestra = mongoose.model('AnalisisMuestra', analisisSchema);
