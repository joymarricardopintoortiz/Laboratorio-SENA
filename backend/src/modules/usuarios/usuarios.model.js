// Modelo de usuarios del sistema interno.
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES } from '../../config/constants.js';
import { softDeletePlugin } from '../../utils/softDelete.plugin.js';

const usuarioSchema = new mongoose.Schema(
  {
    // Longitudes según docs/CREACION_TABLAS.md: nombre VARCHAR(120), email VARCHAR(150).
    nombre: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 150 },
    password: { type: String, required: true, select: false },
    rol: { type: String, enum: ROLES, required: true },
    // Cuenta activa: una cuenta desactivada no puede iniciar sesión (los
    // documentos antiguos sin el campo se consideran activos).
    activo: { type: Boolean, default: true },
    permisos: {
      editar: { type: Boolean, default: false },
      eliminar: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

usuarioSchema.plugin(softDeletePlugin);

// Hash de contraseña antes de guardar si cambió.
usuarioSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

usuarioSchema.methods.compararPassword = function (plano) {
  return bcrypt.compare(plano, this.password);
};

export const Usuario = mongoose.model('Usuario', usuarioSchema);
