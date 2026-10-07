// Lógica de autenticación y perfil propio.
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { Usuario } from '../usuarios/usuarios.model.js';

export async function login({ email, password }) {
  const usuario = await Usuario.findOne({ email }).select('+password');
  if (!usuario || usuario.eliminado) {
    throw new AppError('Credenciales inválidas', 401);
  }
  const ok = await usuario.compararPassword(password);
  if (!ok) throw new AppError('Credenciales inválidas', 401);

  const token = jwt.sign({ id: usuario._id, rol: usuario.rol }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });

  return {
    token,
    usuario: { id: usuario._id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, permisos: usuario.permisos },
  };
}

export async function obtenerPerfil(usuarioId) {
  const usuario = await Usuario.findById(usuarioId);
  if (!usuario) throw new AppError('Usuario no encontrado', 404);
  return usuario;
}

export async function actualizarPerfil(usuarioId, datos) {
  const usuario = await Usuario.findById(usuarioId);
  if (!usuario) throw new AppError('Usuario no encontrado', 404);
  if (datos.nombre) usuario.nombre = datos.nombre;
  if (datos.password) usuario.password = datos.password; // el pre-save lo hashea
  await usuario.save();
  return usuario;
}
