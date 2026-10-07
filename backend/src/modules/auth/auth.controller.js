// Controladores HTTP de auth (no usan Mongoose directamente).
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as authService from './auth.service.js';

export const login = asyncHandler(async (req, res) => {
  const resultado = await authService.login(req.body);
  res.json({ ok: true, mensaje: 'Inicio de sesión exitoso', ...resultado });
});

export const perfil = asyncHandler(async (req, res) => {
  const usuario = await authService.obtenerPerfil(req.usuario._id);
  res.json({ ok: true, usuario });
});

export const actualizarPerfil = asyncHandler(async (req, res) => {
  const usuario = await authService.actualizarPerfil(req.usuario._id, req.body);
  res.json({ ok: true, mensaje: 'Perfil actualizado', usuario });
});
