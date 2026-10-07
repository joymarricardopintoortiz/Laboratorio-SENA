// Controladores HTTP de incidencias.
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as service from './incidencias.service.js';

const usuarioId = (req) => req.usuario?.email || req.usuario?._id || null;

export const listar = asyncHandler(async (req, res) => {
  const filtro = {};
  if (req.query.estado) filtro.estado = req.query.estado;
  if (req.query.muestraId) filtro.muestraId = req.query.muestraId;
  res.json({ ok: true, incidencias: await service.listar(filtro) });
});

export const obtener = asyncHandler(async (req, res) => {
  res.json({ ok: true, incidencia: await service.obtener(req.params.id) });
});

export const vistaPublica = asyncHandler(async (req, res) => {
  const i = await service.obtener(req.params.id);
  res.json({ ok: true, incidencia: service.vistaPublica(i) });
});

export const crear = asyncHandler(async (req, res) => {
  const incidencia = await service.crear(req.body, usuarioId(req));
  res.status(201).json({ ok: true, mensaje: 'Incidencia creada', incidencia });
});

export const actualizar = asyncHandler(async (req, res) => {
  const incidencia = await service.actualizar(req.params.id, req.body, usuarioId(req));
  res.json({ ok: true, mensaje: 'Incidencia actualizada', incidencia });
});

export const aprobar = asyncHandler(async (req, res) => {
  const incidencia = await service.aprobar(req.params.id, usuarioId(req));
  res.json({ ok: true, mensaje: 'Incidencia aprobada', incidencia });
});

export const cerrar = asyncHandler(async (req, res) => {
  const incidencia = await service.cerrar(req.params.id, req.body.motivo, usuarioId(req));
  res.json({ ok: true, mensaje: 'Incidencia cerrada', incidencia });
});

export const eliminar = asyncHandler(async (req, res) => {
  await service.eliminar(req.params.id, usuarioId(req));
  res.json({ ok: true, mensaje: 'Incidencia eliminada (borrado lógico)' });
});
