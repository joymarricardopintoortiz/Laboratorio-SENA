// Controladores HTTP de analisisMuestras.
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as service from './analisisMuestras.service.js';

const usuarioId = (req) => req.usuario?.email || req.usuario?._id || null;

export const registrar = asyncHandler(async (req, res) => {
  const analisis = await service.registrar(req.body, usuarioId(req));
  res.status(201).json({ ok: true, mensaje: 'Resultado registrado', analisis });
});

export const repetir = asyncHandler(async (req, res) => {
  const analisis = await service.repetir(req.params.id, req.body, usuarioId(req));
  res.status(201).json({ ok: true, mensaje: 'Repetición registrada', analisis });
});

export const validar = asyncHandler(async (req, res) => {
  const analisis = await service.validar(req.params.id, usuarioId(req));
  res.json({ ok: true, mensaje: 'Resultado validado', analisis });
});

export const porMuestra = asyncHandler(async (req, res) => {
  res.json({ ok: true, analisis: await service.porMuestra(req.params.muestraId) });
});
