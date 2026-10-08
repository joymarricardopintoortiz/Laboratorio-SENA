// Verifica el JWT del encabezado Authorization: Bearer <token>.
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { Usuario } from '../modules/usuarios/usuarios.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const auth = asyncHandler(async (req, res, next) => {
  // Idempotente: si el guardia de /api/interno ya autenticó, no se repite.
  if (req.usuario) return next();

  const header = req.headers.authorization || '';
  const [tipo, token] = header.split(' ');

  if (tipo !== 'Bearer' || !token) {
    throw new AppError('No se proporcionó un token de autenticación', 401);
  }

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw new AppError('Token inválido o expirado', 401);
  }

  const usuario = await Usuario.findById(payload.id);
  if (!usuario || usuario.eliminado || usuario.activo === false) {
    throw new AppError('El usuario del token ya no existe o está inactivo', 401);
  }

  req.usuario = usuario;
  next();
});
