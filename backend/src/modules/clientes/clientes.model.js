// Modelo Mongoose de clientes con borrado lógico (RNF-015).
import mongoose from 'mongoose';
import { softDeletePlugin } from '../../utils/softDelete.plugin.js';

const clienteSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    tipoDocumento: { type: String, enum: ['CC', 'NIT', 'CE', 'TI'], default: 'CC' },
    numeroDocumento: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    telefono: { type: String, default: '' },
    direccion: { type: String, default: '' },
    tipoCliente: { type: String, enum: ['interno', 'externo'], required: true },
  },
  { timestamps: true }
);

clienteSchema.plugin(softDeletePlugin);

export const Cliente = mongoose.model('Cliente', clienteSchema);
