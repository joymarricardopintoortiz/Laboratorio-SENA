// Controladores HTTP de clientes (sin Mongoose directo).
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as service from './clientes.service.js';

const usuarioId = (req) => req.usuario?.email || req.usuario?._id || null;

export const listar = asyncHandler(async (req, res) => {
  res.json({ ok: true, clientes: await service.listar() });
});

export const obtener = asyncHandler(async (req, res) => {
  res.json({ ok: true, cliente: await service.obtener(req.params.id) });
});

export const crear = asyncHandler(async (req, res) => {
  const cliente = await service.crear(req.body, usuarioId(req));
  res.status(201).json({ ok: true, mensaje: 'Cliente creado', cliente });
});

export const actualizar = asyncHandler(async (req, res) => {
  const cliente = await service.actualizar(req.params.id, req.body, usuarioId(req));
  res.json({ ok: true, mensaje: 'Cliente actualizado', cliente });
});

export const eliminar = asyncHandler(async (req, res) => {
  await service.eliminar(req.params.id, usuarioId(req));
  res.json({ ok: true, mensaje: 'Cliente eliminado (borrado lógico)' });
});
