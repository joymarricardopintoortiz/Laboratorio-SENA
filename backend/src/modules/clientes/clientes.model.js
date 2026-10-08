// Modelo Mongoose de clientes con borrado lógico (RNF-015).
import mongoose from 'mongoose';
import { softDeletePlugin } from '../../utils/softDelete.plugin.js';

const clienteSchema = new mongoose.Schema(
  {
    // Longitudes según docs/CREACION_TABLAS.md.
    nombre: { type: String, required: true, trim: true, maxlength: 120 },
    tipoDocumento: { type: String, enum: ['CC', 'NIT', 'CE', 'TI'], default: 'CC' },
    numeroDocumento: { type: String, required: true, unique: true, trim: true, maxlength: 20 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 150 },
    telefono: { type: String, default: '', maxlength: 20 },
    direccion: { type: String, default: '', maxlength: 200 },
    tipoCliente: { type: String, enum: ['interno', 'externo'], required: true },
  },
  { timestamps: true }
);

clienteSchema.plugin(softDeletePlugin);

export const Cliente = mongoose.model('Cliente', clienteSchema);
