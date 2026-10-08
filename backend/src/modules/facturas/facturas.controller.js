// Controladores HTTP de facturas (sin Mongoose directo).
import { isValidObjectId } from 'mongoose';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import * as service from './facturas.service.js';
import { listarFacturasSchema } from './facturas.schema.js';

const usuarioId = (req) => req.usuario?.email || req.usuario?._id || null;

function parsear(esquema, datos) {
  const resultado = esquema.safeParse(datos);
  if (!resultado.success) {
    throw new AppError('Datos inválidos', 400, resultado.error.issues.map((i) => ({
      campo: i.path.join('.'),
      mensaje: i.message,
    })));
  }
  return resultado.data;
}

function idValido(id, mensaje = 'Identificador no válido') {
  if (!isValidObjectId(id)) throw new AppError(mensaje, 400);
}

export const listar = asyncHandler(async (req, res) => {
  const datos = parsear(listarFacturasSchema, req.query);
  const solicitud = datos.solicitudId || datos.solicitud;
  if (solicitud) idValido(solicitud, 'El identificador de solicitud no es válido');

  const filtro = {};
  if (solicitud) filtro.solicitudId = solicitud;
  if (datos.estado) filtro.estado = datos.estado;

  res.json({ ok: true, facturas: await service.listar(filtro) });
});

export const obtener = asyncHandler(async (req, res) => {
  idValido(req.params.id, 'Identificador de factura no válido');
  res.json({ ok: true, factura: await service.obtener(req.params.id) });
});

export const generar = asyncHandler(async (req, res) => {
  idValido(req.body.solicitudId, 'Identificador de solicitud no válido');
  if (req.body.pagoId) idValido(req.body.pagoId, 'Identificador de pago no válido');
  const factura = await service.generar(req.body, usuarioId(req));
  res.status(201).json({ ok: true, mensaje: `Factura ${factura.numero} generada`, factura });
});

export const consultar = asyncHandler(async (req, res) => {
  idValido(req.params.id, 'Identificador de factura no válido');
  const resultado = await service.consultar(req.params.id, usuarioId(req));
  res.json({ ok: true, ...resultado });
});

export const cambiarEstado = asyncHandler(async (req, res) => {
  idValido(req.params.id, 'Identificador de factura no válido');
  const factura = await service.cambiarEstado(req.params.id, req.body, usuarioId(req));
  res.json({ ok: true, mensaje: `Estado actualizado a "${factura.estado}"`, factura });
});

export const reintentar = asyncHandler(async (req, res) => {
  idValido(req.params.id, 'Identificador de factura no válido');
  const factura = await service.reintentar(req.params.id, usuarioId(req));
  res.json({ ok: true, mensaje: `Factura ${factura.numero} generada en el reintento`, factura });
});

export const enviar = asyncHandler(async (req, res) => {
  idValido(req.params.id, 'Identificador de factura no válido');
  const { factura, notificacion } = await service.enviar(req.params.id, usuarioId(req));
  res.json({ ok: true, mensaje: `Factura ${factura.numero} enviada al cliente`, factura, notificacion });
});
