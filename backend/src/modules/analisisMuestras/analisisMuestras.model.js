// Modelo de análisis de muestras (resultados por parámetro y ejecución).
import mongoose from 'mongoose';

const analisisSchema = new mongoose.Schema(
  {
    muestraId: { type: mongoose.Schema.Types.ObjectId, ref: 'Muestra', required: true, index: true },
    parametroId: { type: mongoose.Schema.Types.ObjectId, ref: 'ParametroAnalisis', required: true },
    numeroEjecucion: { type: Number, required: true },
    tipo: { type: String, enum: ['inicial', 'repeticion'], required: true },
    motivoRepeticion: { type: String, default: '' },
    estado: { type: String, enum: ['en_curso', 'completado', 'validado'], default: 'completado' },
    resultado: { type: String, default: '' },
    valor: { type: Number, default: null },
    unidad: { type: String, default: '' },
    fechaInicio: { type: Date, default: Date.now },
    fechaFinalizacion: { type: Date, default: Date.now },
    realizadoPor: { type: String, default: null },
    validadoPor: { type: String, default: null },
    fechaValidacion: { type: Date, default: null },
  },
  { timestamps: true }
);

export const AnalisisMuestra = mongoose.model('AnalisisMuestra', analisisSchema);
