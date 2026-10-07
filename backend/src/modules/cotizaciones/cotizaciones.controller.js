// Controladores HTTP de cotizaciones.
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as service from './cotizaciones.service.js';

const usuarioId = (req) => req.usuario?.email || req.usuario?._id || null;

export const listar = asyncHandler(async (req, res) => {
  res.json({ ok: true, cotizaciones: await service.listar() });
});

export const obtener = asyncHandler(async (req, res) => {
  res.json({ ok: true, cotizacion: await service.obtener(req.params.id) });
});

export const crear = asyncHandler(async (req, res) => {
  const cotizacion = await service.crear(req.body, usuarioId(req));
  res.status(201).json({ ok: true, mensaje: 'Cotización creada', cotizacion });
});

export const enviar = asyncHandler(async (req, res) => {
  const cotizacion = await service.enviar(req.params.id, usuarioId(req));
  if (cotizacion.estado === 'envio_fallido') {
    return res.status(200).json({
      ok: false,
      mensaje: `No se pudo enviar la cotización por correo: ${cotizacion.errorCorreo}. La cotización quedó marcada como envío fallido.`,
      cotizacion,
    });
  }
  res.json({ ok: true, mensaje: 'Cotización enviada por correo', cotizacion });
});

export const aceptar = asyncHandler(async (req, res) => {
  const cotizacion = await service.aceptar(req.params.id, usuarioId(req));
  res.json({ ok: true, mensaje: 'Cotización aceptada', cotizacion });
});

export const rechazar = asyncHandler(async (req, res) => {
  const cotizacion = await service.rechazar(req.params.id, usuarioId(req));
  res.json({ ok: true, mensaje: 'Cotización rechazada', cotizacion });
});
