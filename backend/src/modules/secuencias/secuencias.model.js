// Colección de secuencias para consecutivos atómicos (0001-2026, cotizaciones...).
import mongoose from 'mongoose';

const secuenciaSchema = new mongoose.Schema({
  _id: { type: String, required: true, maxlength: 30 }, // ej: 'cotizaciones', 'muestras-2026'
  secuencia: { type: Number, default: 0 },
});

export const Secuencia = mongoose.model('Secuencia', secuenciaSchema);
