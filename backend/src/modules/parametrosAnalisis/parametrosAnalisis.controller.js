// Controladores HTTP de parametrosAnalisis.
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as service from './parametrosAnalisis.service.js';

const usuarioId = (req) => req.usuario?.email || req.usuario?._id || null;

export const listar = asyncHandler(async (req, res) => {
  res.json({ ok: true, parametros: await service.listar() });
});

export const obtener = asyncHandler(async (req, res) => {
  res.json({ ok: true, parametro: await service.obtener(req.params.id) });
});

export const crear = asyncHandler(async (req, res) => {
  const parametro = await service.crear(req.body, usuarioId(req));
  res.status(201).json({ ok: true, mensaje: 'Parámetro creado', parametro });
});

export const actualizar = asyncHandler(async (req, res) => {
  const parametro = await service.actualizar(req.params.id, req.body, usuarioId(req));
  res.json({ ok: true, mensaje: 'Parámetro actualizado', parametro });
});

export const eliminar = asyncHandler(async (req, res) => {
  await service.eliminar(req.params.id, usuarioId(req));
  res.json({ ok: true, mensaje: 'Parámetro eliminado (borrado lógico)' });
});
