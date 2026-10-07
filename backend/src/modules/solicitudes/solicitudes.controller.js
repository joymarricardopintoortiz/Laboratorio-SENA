// Controladores HTTP de solicitudes.
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as service from './solicitudes.service.js';

const usuarioId = (req) => req.usuario?.email || req.usuario?._id || null;

export const listar = asyncHandler(async (req, res) => {
  res.json({ ok: true, solicitudes: await service.listar() });
});

export const obtener = asyncHandler(async (req, res) => {
  res.json({ ok: true, solicitud: await service.obtener(req.params.id) });
});

export const crear = asyncHandler(async (req, res) => {
  const solicitud = await service.crear(req.body, usuarioId(req));
  res.status(201).json({ ok: true, mensaje: 'Solicitud creada', solicitud });
});

export const actualizar = asyncHandler(async (req, res) => {
  const solicitud = await service.actualizar(req.params.id, req.body, usuarioId(req));
  res.json({ ok: true, mensaje: 'Solicitud actualizada', solicitud });
});

export const eliminar = asyncHandler(async (req, res) => {
  await service.eliminar(req.params.id, usuarioId(req));
  res.json({ ok: true, mensaje: 'Solicitud eliminada (borrado lógico)' });
});
