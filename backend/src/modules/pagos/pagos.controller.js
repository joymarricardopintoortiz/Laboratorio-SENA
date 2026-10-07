// Controladores HTTP de pagos.
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as service from './pagos.service.js';

const usuarioId = (req) => req.usuario?.email || req.usuario?._id || null;

export const listar = asyncHandler(async (req, res) => {
  res.json({ ok: true, pagos: await service.listar() });
});

export const crear = asyncHandler(async (req, res) => {
  const pago = await service.crear(req.body, usuarioId(req));
  res.status(201).json({ ok: true, mensaje: 'Pago simulado generado', pago });
});

export const confirmar = asyncHandler(async (req, res) => {
  const pago = await service.confirmar(req.params.referencia, usuarioId(req));
  res.json({ ok: true, mensaje: 'Pago confirmado (simulado)', pago });
});
