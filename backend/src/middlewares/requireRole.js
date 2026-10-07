// Autorización por rol y permisos.
// Uso: requireRole('admin', 'encargado') o requirePermiso('editar')
import { AppError } from '../utils/AppError.js';

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.usuario) return next(new AppError('No autenticado', 401));
  if (!roles.includes(req.usuario.rol)) {
    return next(new AppError('No tienes permisos para esta acción', 403));
  }
  next();
};

export const requirePermiso = (permiso) => (req, res, next) => {
  if (!req.usuario) return next(new AppError('No autenticado', 401));
  if (req.usuario.rol === 'admin') return next(); // admin siempre puede
  if (!req.usuario.permisos?.[permiso]) {
    return next(new AppError(`No tienes el permiso de ${permiso}`, 403));
  }
  next();
};
