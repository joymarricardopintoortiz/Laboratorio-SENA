// Catálogo de parámetros de análisis (administrable por admin/encargado).
import mongoose from 'mongoose';
import { softDeletePlugin } from '../../utils/softDelete.plugin.js';

const parametroSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, unique: true, trim: true },
    descripcion: { type: String, default: '' },
    precio: { type: Number, required: true, min: 0 },
    unidad: { type: String, default: '' },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

parametroSchema.plugin(softDeletePlugin);

export const ParametroAnalisis = mongoose.model('ParametroAnalisis', parametroSchema);
