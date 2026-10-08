// Catálogo de parámetros de análisis (administrable por admin/encargado).
import mongoose from 'mongoose';
import { softDeletePlugin } from '../../utils/softDelete.plugin.js';

const parametroSchema = new mongoose.Schema(
  {
    // Longitudes según docs/CREACION_TABLAS.md: nombre VARCHAR(100), unidad VARCHAR(20).
    nombre: { type: String, required: true, unique: true, trim: true, maxlength: 100 },
    descripcion: { type: String, default: '' },
    precio: { type: Number, required: true, min: 0 },
    unidad: { type: String, default: '', maxlength: 20 },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

parametroSchema.plugin(softDeletePlugin);

export const ParametroAnalisis = mongoose.model('ParametroAnalisis', parametroSchema);
